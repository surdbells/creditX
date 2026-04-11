import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, CreditCard } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';

@Component({
  selector: 'app-payments', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Payment Management" subtitle="View and post loan repayments">
        <button class="cx-btn cx-btn-primary" (click)="openForm()"><lucide-icon name="plus" [size]="16"></lucide-icon> Post Repayment</button>
      </cx-page-header>
      <div class="cx-card !p-4">
        <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
          searchPlaceholder="Search by reference, customer..." [hasActions]="false" (query)="onQuery($event)">
        </cx-data-table>
      </div>
    </div>
    <cx-form-dialog [open]="showForm()" title="Post Repayment" [saving]="saving()" saveLabel="Post Payment" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="space-y-4">
        <div>
          <label class="cx-label">Loan *</label>
          <select class="cx-select" [(ngModel)]="form.loan_id">
            <option value="">— Select Active Loan —</option>
            @for (loan of activeLoans(); track loan.id) { <option [value]="loan.id">{{ loan.application_id }} — {{ loan.customer_name }} (₦{{ loan.amount_requested | number:'1.0-0' }})</option> }
          </select>
        </div>
        <div><label class="cx-label">Amount (₦) *</label><input class="cx-input" type="number" [(ngModel)]="form.amount" placeholder="Enter payment amount" /></div>
        <div>
          <label class="cx-label">Channel *</label>
          <select class="cx-select" [(ngModel)]="form.channel">
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="card">Card</option>
            <option value="ussd">USSD</option>
          </select>
        </div>
        <div><label class="cx-label">Gateway Reference</label><input class="cx-input" [(ngModel)]="form.gateway_reference" placeholder="Optional" /></div>
      </div>
    </cx-form-dialog>
  `,
})
export class PaymentsComponent implements OnInit {
  columns: TableColumn[] = [{key:'reference',label:'Reference'},{key:'customer_name',label:'Customer'},{key:'loan_app_id',label:'Loan'},{key:'amount',label:'Amount',type:'currency'},{key:'channel',label:'Channel'},{key:'status',label:'Status',type:'badge',badgeMap:{pending:{label:'Pending',class:'bg-[var(--cx-warning-light)] text-[var(--cx-warning)]'},success:{label:'Success',class:'bg-[var(--cx-success-light)] text-[var(--cx-success)]'},failed:{label:'Failed',class:'bg-[var(--cx-danger-light)] text-[var(--cx-danger)]'}}},{key:'payment_date',label:'Date',type:'date'}];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  showForm = signal(false); saving = signal(false); form: any = {}; q: any = {};
  activeLoans = signal<any[]>([]);

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() { this.load(); this.api.get('/loans',{per_page:200,status:'active,overdue'}).subscribe({next:r=>this.activeLoans.set(r.data||[])}); }
  load(p?:any) { this.loading.set(true); this.api.get('/payments',{...this.q,...p}).subscribe({next:r=>{this.rows.set(r.data||[]);this.pagination.set(r.meta||null);this.loading.set(false);},error:()=>this.loading.set(false)}); }
  onQuery(e:TableQueryEvent) { this.q=e; this.load(e); }
  openForm() { this.form={loan_id:'',amount:'',channel:'cash',gateway_reference:''}; this.showForm.set(true); }
  saveForm() {
    if(!this.form.loan_id||!this.form.amount){this.toast.error('Loan and amount are required');return;}
    this.saving.set(true);
    this.api.post('/payments/repayment',this.form).subscribe({
      next:r=>{this.saving.set(false);this.toast.success(r.message||'Payment posted');this.showForm.set(false);this.load(this.q);},
      error:e=>{this.saving.set(false);this.toast.error(e.error?.message||'Failed');}
    });
  }
}
