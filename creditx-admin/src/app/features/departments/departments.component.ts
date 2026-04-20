import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { FormDialogComponent } from "../../shared/components/form-dialog/form-dialog.component";
import { SearchableSelectComponent, SelectOption } from "../../shared/components/searchable-select/searchable-select.component";
@Component({
  selector: 'app-departments', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent, SearchableSelectComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Departments"
        subtitle="Manage organizational departments and their heads"
        eyebrow="Organization">
        <button class="cx-btn cx-btn-primary" (click)="openForm()">
          <lucide-icon name="plus" [size]="14"></lucide-icon>
          <span>Add Department</span>
        </button>
      </cx-page-header>
      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()" searchPlaceholder="Search departments..." [hasActions]="true" (query)="onQuery($event)">
        <ng-template #rowActions let-row>
          <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)" title="Edit">
            <lucide-icon name="pencil" [size]="14"></lucide-icon>
          </button>
        </ng-template>
      </cx-data-table>
    </div>
    <cx-form-dialog
      [open]="showForm()"
      [title]="editId ? 'Edit Department' : 'Create Department'"
      [subtitle]="editId ? 'Update department details' : 'Add a new organizational unit'"
      [saving]="saving()" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="cx-form-stack">
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Name *</label><input class="cx-input" [(ngModel)]="form.name" placeholder="e.g. Credit Operations" /></div>
          <div><label class="cx-label">Code *</label><input class="cx-input" [(ngModel)]="form.code" placeholder="e.g. COPS" /></div>
        </div>
        <div><label class="cx-label">Description</label><textarea class="cx-input" rows="2" [(ngModel)]="form.description" placeholder="Short description of what this department does..."></textarea></div>
        <div>
          <label class="cx-label">Department Head</label>
          <cx-searchable-select [options]="userOptions()" placeholder="Select head..." [clearable]="true" [(ngModel)]="form.head_id"></cx-searchable-select>
        </div>
      </div>
    </cx-form-dialog>
  `,
})
export class DepartmentsComponent implements OnInit {
  columns: TableColumn[] = [{key:'name',label:'Department Name'},{key:'code',label:'Code'},{key:'head_name',label:'Head'},{key:'is_active',label:'Active'},{key:'created_at',label:'Created',type:'date'}];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {}; q: any = {};
  users = signal<any[]>([]);
  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  userOptions(): SelectOption[] { return this.users().map((u: any) => ({ value: u.id, label: u.full_name, sublabel: u.email })); }
  ngOnInit() { this.load(); this.api.get('/users',{per_page:200}).subscribe({next:r=>this.users.set(r.data||[])}); }
  load(p?:any) { this.loading.set(true); this.api.get('/departments',{...this.q,...p}).subscribe({next:r=>{this.rows.set(r.data||[]);this.pagination.set(r.meta||null);this.loading.set(false);},error:()=>this.loading.set(false)}); }
  onQuery(e:TableQueryEvent) { this.q=e; this.load(e); }
  openForm(row?:any) { if(row){this.editId=row.id;this.form={name:row.name,code:row.code,description:row.description,head_id:row.head_id||''};}else{this.editId=null;this.form={name:'',code:'',description:'',head_id:''};} this.showForm.set(true); }
  saveForm() { this.saving.set(true); (this.editId?this.api.put('/departments/'+this.editId,this.form):this.api.post('/departments',this.form)).subscribe({next:r=>{this.saving.set(false);this.toast.success(r.message||'Saved');this.showForm.set(false);this.load(this.q);},error:e=>{this.saving.set(false);this.toast.error(e.error?.message||'Failed');}}); }
}
