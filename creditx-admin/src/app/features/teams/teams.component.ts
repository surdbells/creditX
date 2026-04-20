import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { SearchableSelectComponent, SelectOption } from '../../shared/components/searchable-select/searchable-select.component';
@Component({
  selector: 'app-teams', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent, SearchableSelectComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Teams"
        subtitle="Organize staff into functional teams within departments"
        eyebrow="Organization">
        <button class="cx-btn cx-btn-primary" (click)="openForm()">
          <lucide-icon name="plus" [size]="14"></lucide-icon>
          <span>Add Team</span>
        </button>
      </cx-page-header>
      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()" searchPlaceholder="Search teams..." [hasActions]="true" (query)="onQuery($event)">
        <ng-template #rowActions let-row>
          <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)" title="Edit">
            <lucide-icon name="pencil" [size]="14"></lucide-icon>
          </button>
        </ng-template>
      </cx-data-table>
    </div>
    <cx-form-dialog
      [open]="showForm()"
      [title]="editId ? 'Edit Team' : 'Create Team'"
      [subtitle]="editId ? 'Update team details' : 'Group staff under a shared focus'"
      [saving]="saving()" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="cx-form-stack">
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Name *</label><input class="cx-input" [(ngModel)]="form.name" placeholder="e.g. Disbursements East" /></div>
          <div><label class="cx-label">Code *</label><input class="cx-input" [(ngModel)]="form.code" placeholder="e.g. DISB-E" /></div>
        </div>
        <div><label class="cx-label">Description</label><textarea class="cx-input" rows="2" [(ngModel)]="form.description" placeholder="What this team does..."></textarea></div>
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Department</label>
            <cx-searchable-select [options]="deptOptions()" placeholder="Select department..." [clearable]="true" [(ngModel)]="form.department_id"></cx-searchable-select>
          </div>
          <div>
            <label class="cx-label">Team Lead</label>
            <cx-searchable-select [options]="userOptions()" placeholder="Select lead..." [clearable]="true" [(ngModel)]="form.lead_id"></cx-searchable-select>
          </div>
        </div>
      </div>
    </cx-form-dialog>
  `,
})
export class TeamsComponent implements OnInit {
  columns: TableColumn[] = [{key:'name',label:'Team Name'},{key:'code',label:'Code'},{key:'department_name',label:'Department'},{key:'lead_name',label:'Team Lead'},{key:'is_active',label:'Active'},{key:'created_at',label:'Created',type:'date'}];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {}; q: any = {};
  departments = signal<any[]>([]); users = signal<any[]>([]);
  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  deptOptions(): SelectOption[] { return this.departments().map((d: any) => ({ value: d.id, label: d.name, sublabel: d.code })); }
  userOptions(): SelectOption[] { return this.users().map((u: any) => ({ value: u.id, label: u.full_name, sublabel: u.email })); }
  ngOnInit() { this.load(); this.api.get('/departments',{per_page:100}).subscribe({next:r=>this.departments.set(r.data||[])}); this.api.get('/users',{per_page:200}).subscribe({next:r=>this.users.set(r.data||[])}); }
  load(p?:any) { this.loading.set(true); this.api.get('/teams',{...this.q,...p}).subscribe({next:r=>{this.rows.set(r.data||[]);this.pagination.set(r.meta||null);this.loading.set(false);},error:()=>this.loading.set(false)}); }
  onQuery(e:TableQueryEvent) { this.q=e; this.load(e); }
  openForm(row?:any) { if(row){this.editId=row.id;this.form={name:row.name,code:row.code,description:row.description,department_id:row.department_id||'',lead_id:row.lead_id||''};}else{this.editId=null;this.form={name:'',code:'',description:'',department_id:'',lead_id:''};} this.showForm.set(true); }
  saveForm() { this.saving.set(true); (this.editId?this.api.put('/teams/'+this.editId,this.form):this.api.post('/teams',this.form)).subscribe({next:r=>{this.saving.set(false);this.toast.success(r.message||'Saved');this.showForm.set(false);this.load(this.q);},error:e=>{this.saving.set(false);this.toast.error(e.error?.message||'Failed');}}); }
}
