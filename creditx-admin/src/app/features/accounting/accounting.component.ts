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
  selector: 'app-accounting', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Chart of Accounts" subtitle="Manage general ledger accounts">
        <button class="cx-btn cx-btn-primary" (click)="openForm()"><lucide-icon name="plus" [size]="16"></lucide-icon> Add Account</button>
      </cx-page-header>
      <div class="cx-card !p-4">
        <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()" searchPlaceholder="Search accounts..." [hasActions]="true" (query)="onQuery($event)">
          <ng-template #rowActions let-row><button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)"><lucide-icon name="pencil" [size]="14"></lucide-icon></button></ng-template>
        </cx-data-table>
      </div>
    </div>
    <cx-form-dialog [open]="showForm()" [title]="editId ? 'Edit GL Account' : 'Create GL Account'" [saving]="saving()" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="space-y-4">
        <div><label class="cx-label">Account Name *</label><input class="cx-input" [(ngModel)]="form.account_name" /></div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Account Number *</label><input class="cx-input" [(ngModel)]="form.account_number" /></div>
          <div><label class="cx-label">Account Code *</label><input class="cx-input" [(ngModel)]="form.account_code" /></div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Account Type *</label><select class="cx-select" [(ngModel)]="form.account_type"><option value="asset">Asset</option><option value="liability">Liability</option><option value="income">Income</option><option value="expense">Expense</option><option value="equity">Equity</option></select></div>
          <div><label class="cx-label">Ledger Type</label><select class="cx-select" [(ngModel)]="form.ledger_type"><option value="general">General</option><option value="customer">Customer</option></select></div>
        </div>
        <div><label class="cx-label">Description</label><textarea class="cx-input" rows="2" [(ngModel)]="form.description"></textarea></div>
      </div>
    </cx-form-dialog>
  `,
})
export class AccountingComponent implements OnInit {
  columns: TableColumn[] = [{key:'account_name',label:'Account Name'},{key:'account_number',label:'Number'},{key:'account_code',label:'Code'},{key:'account_type',label:'Type'},{key:'ledger_type',label:'Ledger'},{key:'is_active',label:'Active'}];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {}; q: any = {};
  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit() { this.load(); }
  load(p?:any) { this.loading.set(true); this.api.get('/gl-accounts',{...this.q,...p}).subscribe({next:r=>{this.rows.set(r.data||[]);this.pagination.set(r.meta||null);this.loading.set(false);},error:()=>this.loading.set(false)}); }
  onQuery(e:TableQueryEvent) { this.q=e; this.load(e); }
  openForm(row?:any) { if(row){this.editId=row.id;this.form={account_name:row.account_name,account_number:row.account_number,account_code:row.account_code,account_type:row.account_type,ledger_type:row.ledger_type,description:row.description};}else{this.editId=null;this.form={account_name:'',account_number:'',account_code:'',account_type:'asset',ledger_type:'general',description:''};} this.showForm.set(true); }
  saveForm() { this.saving.set(true); (this.editId?this.api.put('/gl-accounts/'+this.editId,this.form):this.api.post('/gl-accounts',this.form)).subscribe({next:r=>{this.saving.set(false);this.toast.success(r.message||'Saved');this.showForm.set(false);this.load(this.q);},error:e=>{this.saving.set(false);this.toast.error(e.error?.message||'Failed');}}); }
}
