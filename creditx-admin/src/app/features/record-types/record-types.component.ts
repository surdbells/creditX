import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Pencil } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
@Component({
  selector: 'app-record-types', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Record Types" subtitle="Manage government employee record types">
        <button class="cx-btn cx-btn-primary" (click)="openForm()"><lucide-icon name="plus" [size]="16"></lucide-icon> Add Type</button>
      </cx-page-header>
      <div class="cx-card !p-4">
        <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()" searchPlaceholder="Search record types..." [hasActions]="true" (query)="onQuery($event)">
          <ng-template #rowActions let-row><button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)"><lucide-icon name="pencil" [size]="14"></lucide-icon></button></ng-template>
        </cx-data-table>
      </div>
    </div>
    <cx-form-dialog [open]="showForm()" [title]="editId ? 'Edit Record Type' : 'Create Record Type'" [saving]="saving()" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="space-y-4">
        <div><label class="cx-label">Name *</label><input class="cx-input" [(ngModel)]="form.name" placeholder="e.g. IPPIS" /></div>
        <div><label class="cx-label">Code *</label><input class="cx-input" [(ngModel)]="form.code" placeholder="e.g. IPPIS" /></div>
        <div><label class="cx-label">Description</label><textarea class="cx-input" rows="2" [(ngModel)]="form.description"></textarea></div>
      </div>
    </cx-form-dialog>
  `,
})
export class RecordTypesComponent implements OnInit {
  columns: TableColumn[] = [{key:'name',label:'Name'},{key:'code',label:'Code'},{key:'description',label:'Description'},{key:'is_active',label:'Active'},{key:'created_at',label:'Created',type:'date'}];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {}; q: any = {};
  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit() { this.load(); }
  load(p?:any) { this.loading.set(true); this.api.get('/record-types',{...this.q,...p}).subscribe({next:r=>{this.rows.set(r.data||[]);this.pagination.set(r.meta||null);this.loading.set(false);},error:()=>this.loading.set(false)}); }
  onQuery(e:TableQueryEvent) { this.q=e; this.load(e); }
  openForm(row?:any) { if(row){this.editId=row.id;this.form={name:row.name,code:row.code,description:row.description};}else{this.editId=null;this.form={name:'',code:'',description:''};} this.showForm.set(true); }
  saveForm() { this.saving.set(true); (this.editId?this.api.put('/record-types/'+this.editId,this.form):this.api.post('/record-types',this.form)).subscribe({next:r=>{this.saving.set(false);this.toast.success(r.message||'Saved');this.showForm.set(false);this.load(this.q);},error:e=>{this.saving.set(false);this.toast.error(e.error?.message||'Failed');}}); }
}
