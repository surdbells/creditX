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
  selector: 'app-loan-products', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Loan Products" subtitle="Configure loan products and fee structures">
        <button class="cx-btn cx-btn-primary" (click)="openForm()"><lucide-icon name="plus" [size]="16"></lucide-icon> Add Product</button>
      </cx-page-header>
      <div class="cx-card !p-4">
        <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()" searchPlaceholder="Search products..." [hasActions]="true" (query)="onQuery($event)">
          <ng-template #rowActions let-row><button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)"><lucide-icon name="pencil" [size]="14"></lucide-icon></button></ng-template>
        </cx-data-table>
      </div>
    </div>
    <cx-form-dialog [open]="showForm()" [title]="editId ? 'Edit Product' : 'Create Product'" [saving]="saving()" maxWidth="680px" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Name *</label><input class="cx-input" [(ngModel)]="form.name" /></div>
          <div><label class="cx-label">Code *</label><input class="cx-input" [(ngModel)]="form.code" /></div>
        </div>
        <div><label class="cx-label">Description</label><input class="cx-input" [(ngModel)]="form.description" /></div>
        <div class="grid grid-cols-3 gap-4">
          <div><label class="cx-label">Interest Method *</label><select class="cx-select" [(ngModel)]="form.interest_calculation_method"><option value="flat_rate">Flat Rate</option><option value="reducing_balance">Reducing Balance</option><option value="amortized">Amortized (EMI)</option></select></div>
          <div><label class="cx-label">Interest Rate (%) *</label><input class="cx-input" type="number" [(ngModel)]="form.interest_rate" /></div>
          <div><label class="cx-label">Allows Top-up</label><select class="cx-select" [(ngModel)]="form.allows_top_up"><option [ngValue]="true">Yes</option><option [ngValue]="false">No</option></select></div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Min Amount (₦)</label><input class="cx-input" type="number" [(ngModel)]="form.min_amount" /></div>
          <div><label class="cx-label">Max Amount (₦)</label><input class="cx-input" type="number" [(ngModel)]="form.max_amount" /></div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Min Tenure (months)</label><input class="cx-input" type="number" [(ngModel)]="form.min_tenure" /></div>
          <div><label class="cx-label">Max Tenure (months)</label><input class="cx-input" type="number" [(ngModel)]="form.max_tenure" /></div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Max Age (years)</label><input class="cx-input" type="number" [(ngModel)]="form.max_age" /></div>
          <div><label class="cx-label">Max Service Years</label><input class="cx-input" type="number" [(ngModel)]="form.max_years_of_service" /></div>
        </div>
        <!-- Attached Fees -->
        <div class="border-t border-[var(--cx-border)] pt-4 mt-4">
          <div class="flex items-center justify-between mb-2">
            <label class="cx-label !mb-0">Product Fees</label>
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="addFee()"><lucide-icon name="plus" [size]="12"></lucide-icon> Add Fee</button>
          </div>
          @for (fee of fees; track $index; let i = $index) {
            <div class="flex items-end gap-2 mb-2 p-3 rounded-lg bg-[var(--cx-surface-hover)]">
              <div class="flex-1"><label class="cx-label">Fee Type</label><select class="cx-select" [(ngModel)]="fee.fee_type_id"><option value="">Select</option>@for (ft of feeTypes(); track ft.id){<option [value]="ft.id">{{ ft.name }}</option>}</select></div>
              <div class="w-24"><label class="cx-label">Type</label><select class="cx-select" [(ngModel)]="fee.calculation_type"><option value="flat">Flat</option><option value="percentage">%</option></select></div>
              <div class="w-24"><label class="cx-label">Value</label><input class="cx-input" type="number" [(ngModel)]="fee.value" /></div>
              <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon text-red-500 mb-0.5" (click)="fees.splice(i,1)"><lucide-icon name="trash-2" [size]="14"></lucide-icon></button>
            </div>
          }
        </div>
      </div>
    </cx-form-dialog>
  `,
})
export class LoanProductsComponent implements OnInit {
  columns: TableColumn[] = [{key:'name',label:'Product Name'},{key:'code',label:'Code'},{key:'interest_calculation_method',label:'Method'},{key:'interest_rate',label:'Rate'},{key:'min_amount',label:'Min',type:'currency'},{key:'max_amount',label:'Max',type:'currency'},{key:'is_active',label:'Active'}];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {}; fees: any[] = []; q: any = {};
  feeTypes = signal<any[]>([]);
  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit() { this.load(); this.api.get('/fee-types',{per_page:100}).subscribe({next:r=>this.feeTypes.set(r.data||[])}); }
  load(p?:any) { this.loading.set(true); this.api.get('/loan-products',{...this.q,...p}).subscribe({next:r=>{this.rows.set(r.data||[]);this.pagination.set(r.meta||null);this.loading.set(false);},error:()=>this.loading.set(false)}); }
  onQuery(e:TableQueryEvent) { this.q=e; this.load(e); }
  openForm(row?:any) {
    if(row){this.editId=row.id;this.form={name:row.name,code:row.code,description:row.description,interest_calculation_method:row.interest_calculation_method,interest_rate:row.interest_rate,min_amount:row.min_amount,max_amount:row.max_amount,min_tenure:row.min_tenure,max_tenure:row.max_tenure,max_age:row.max_age,max_years_of_service:row.max_years_of_service,allows_top_up:row.allows_top_up};this.fees=(row.fees||[]).map((f:any)=>({fee_type_id:f.fee_type_id,calculation_type:f.calculation_type,value:f.value}));}
    else{this.editId=null;this.form={name:'',code:'',description:'',interest_calculation_method:'flat_rate',interest_rate:'',min_amount:'',max_amount:'',min_tenure:1,max_tenure:24,max_age:60,max_years_of_service:35,allows_top_up:false};this.fees=[];}
    this.showForm.set(true);
  }
  addFee() { this.fees.push({fee_type_id:'',calculation_type:'flat',value:''}); }
  saveForm() { this.saving.set(true); const p={...this.form,fees:this.fees.filter(f=>f.fee_type_id)}; (this.editId?this.api.put('/loan-products/'+this.editId,p):this.api.post('/loan-products',p)).subscribe({next:r=>{this.saving.set(false);this.toast.success(r.message||'Saved');this.showForm.set(false);this.load(this.q);},error:e=>{this.saving.set(false);this.toast.error(e.error?.message||'Failed');}}); }
}
