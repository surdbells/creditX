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
  selector: 'app-fee-types', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Fee Types" subtitle="Manage fee type definitions">
        <button class="cx-btn cx-btn-primary" (click)="openForm()"><lucide-icon name="plus" [size]="16"></lucide-icon> Add Fee Type</button>
      </cx-page-header>
      <div class="cx-card !p-4">
        <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()" searchPlaceholder="Search fee types..." [hasActions]="true" (query)="onQuery($event)">
          <ng-template #rowActions let-row><button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)"><lucide-icon name="pencil" [size]="14"></lucide-icon></button></ng-template>
        </cx-data-table>
      </div>
    </div>
    <cx-form-dialog [open]="showForm()" [title]="editId ? 'Edit Fee Type' : 'Create Fee Type'" [saving]="saving()" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="space-y-4">
        <div><label class="cx-label">Name *</label><input class="cx-input" [(ngModel)]="form.name" /></div>
        <div><label class="cx-label">Code *</label><input class="cx-input" [(ngModel)]="form.code" /></div>
        <div><label class="cx-label">Description</label><input class="cx-input" [(ngModel)]="form.description" /></div>
        <div><label class="cx-label">GL Account</label>
          <select class="cx-select" [(ngModel)]="form.gl_account_id"><option value="">— Select GL —</option>
            @for (gl of glAccounts(); track gl.id) { <option [value]="gl.id">{{ gl.account_code }} — {{ gl.account_name }}</option> }
          </select>
        </div>
      </div>
    </cx-form-dialog>
  `,
})
export class FeeTypesComponent implements OnInit {
  columns: TableColumn[] = [{key:'name',label:'Fee Name'},{key:'code',label:'Code'},{key:'description',label:'Description'},{key:'is_active',label:'Active'},{key:'created_at',label:'Created',type:'date'}];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {}; q: any = {};
  glAccounts = signal<any[]>([]);
  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit() { this.load(); this.api.get('/gl-accounts',{per_page:100}).subscribe({next:r=>this.glAccounts.set(r.data||[])}); }
  load(p?:any) { this.loading.set(true); this.api.get('/fee-types',{...this.q,...p}).subscribe({next:r=>{this.rows.set(r.data||[]);this.pagination.set(r.meta||null);this.loading.set(false);},error:()=>this.loading.set(false)}); }
  onQuery(e:TableQueryEvent) { this.q=e; this.load(e); }
  openForm(row?:any) { if(row){this.editId=row.id;this.form={name:row.name,code:row.code,description:row.description,gl_account_id:row.gl_account_id||''};}else{this.editId=null;this.form={name:'',code:'',description:'',gl_account_id:''};} this.showForm.set(true); }
  saveForm() { this.saving.set(true); (this.editId?this.api.put('/fee-types/'+this.editId,this.form):this.api.post('/fee-types',this.form)).subscribe({next:r=>{this.saving.set(false);this.toast.success(r.message||'Saved');this.showForm.set(false);this.load(this.q);},error:e=>{this.saving.set(false);this.toast.error(e.error?.message||'Failed');}}); }
}
