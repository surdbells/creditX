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
  selector: 'app-payments', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent, SearchableSelectComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Payments & Repayments" subtitle="{{ totalRecords | number }} records">
        <div class="flex items-center gap-2">
          <div class="relative">
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="exportOpen = !exportOpen">
              <lucide-icon name="download" [size]="14"></lucide-icon> Export <lucide-icon name="chevron-down" [size]="12"></lucide-icon>
            </button>
            @if (exportOpen) {
              <div class="absolute right-0 top-full mt-1 w-44 bg-[var(--cx-surface)] border border-[var(--cx-border)] rounded-xl shadow-xl z-50 overflow-hidden">
                <button class="w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-[var(--cx-surface-hover)]" (click)="exportData('csv')">Export CSV</button>
                <button class="w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-[var(--cx-surface-hover)]" (click)="exportData('excel')">Export Excel</button>
                <button class="w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-[var(--cx-surface-hover)]" (click)="exportData('pdf')">Export PDF</button>
              </div>
            }
          </div>
          @if (auth.hasPermission('payments.create')) {
            <button class="cx-btn cx-btn-outline" (click)="openBulk()"><lucide-icon name="upload" [size]="14"></lucide-icon> Bulk Upload</button>
            <button class="cx-btn cx-btn-primary" (click)="openRepayment()"><lucide-icon name="plus" [size]="16"></lucide-icon> Post Repayment</button>
          }
        </div>
      </cx-page-header>
      <div class="cx-card !p-4 overflow-hidden">
        <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
          searchPlaceholder="Search payments..." [hasActions]="false" (query)="onQuery($event)">
        </cx-data-table>
      </div>
    </div>

    <!-- Post Individual Repayment -->
    <cx-form-dialog [open]="showRepayment()" title="Post Repayment" [saving]="repSaving()" (close)="showRepayment.set(false)" (save)="saveRepayment()">
      <div class="space-y-4">
        <div><label class="cx-label">Loan *</label>
          <cx-searchable-select [options]="loanOptions()" placeholder="Search loan by App ID..." [(ngModel)]="repForm.loan_id"></cx-searchable-select>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Amount (₦) *</label><input class="cx-input" type="number" [(ngModel)]="repForm.amount" /></div>
          <div><label class="cx-label">Payment Method</label>
            <select class="cx-select" [(ngModel)]="repForm.payment_method">
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="paystack">Paystack</option>
              <option value="deduction">Salary Deduction</option>
            </select>
          </div>
        </div>
        <div><label class="cx-label">Reference</label><input class="cx-input" [(ngModel)]="repForm.reference" placeholder="Transaction reference" /></div>
        <div><label class="cx-label">Payment Date</label><input class="cx-input" type="date" [(ngModel)]="repForm.payment_date" /></div>
        <div><label class="cx-label">Narration</label><textarea class="cx-input" rows="2" [(ngModel)]="repForm.narration"></textarea></div>
      </div>
    </cx-form-dialog>

    <!-- Bulk Upload Dialog -->
    <cx-form-dialog [open]="showBulk()" title="Bulk Repayment Upload" [saving]="bulkSaving()" saveLabel="Upload & Process" (close)="showBulk.set(false)" (save)="processBulk()">
      <div class="space-y-4">
        <div class="p-4 rounded-xl bg-[var(--cx-info-light)] border border-[var(--cx-info)]/20">
          <h4 class="text-xs font-bold text-[var(--cx-info)] mb-1">CSV Format Required</h4>
          <p class="text-[10px] text-[var(--cx-info)]/70">Columns: <strong>loan_application_id, amount, payment_method, reference, payment_date, narration</strong></p>
          <button class="cx-btn cx-btn-sm cx-btn-outline mt-2 !text-[10px]" (click)="downloadTemplate()">
            <lucide-icon name="download" [size]="12"></lucide-icon> Download Template
          </button>
        </div>
        <div>
          <label class="cx-label">Upload CSV File *</label>
          <input type="file" accept=".csv" class="cx-input !py-2" (change)="onBulkFile($event)" #bulkFileInput />
        </div>
        @if (bulkPreview().length) {
          <div>
            <div class="text-xs font-bold text-[var(--cx-text-muted)] mb-1">Preview ({{ bulkPreview().length }} rows)</div>
            <div class="max-h-40 overflow-y-auto rounded-lg border border-[var(--cx-border)]">
              <table class="w-full text-xs">
                <thead><tr class="bg-[var(--cx-surface-hover)]">
                  <th class="px-2 py-1.5 text-left">Loan ID</th><th class="px-2 py-1.5 text-right">Amount</th><th class="px-2 py-1.5">Method</th><th class="px-2 py-1.5">Reference</th>
                </tr></thead>
                <tbody>
                  @for (row of bulkPreview().slice(0, 10); track $index) {
                    <tr class="border-t border-[var(--cx-border)]">
                      <td class="px-2 py-1 font-mono">{{ row.loan_application_id }}</td>
                      <td class="px-2 py-1 text-right">{{ row.amount }}</td>
                      <td class="px-2 py-1">{{ row.payment_method }}</td>
                      <td class="px-2 py-1">{{ row.reference }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (bulkPreview().length > 10) {
              <p class="text-[10px] text-[var(--cx-text-muted)] mt-1">...and {{ bulkPreview().length - 10 }} more rows</p>
            }
          </div>
        }
      </div>
    </cx-form-dialog>
  `,
})
export class PaymentsComponent implements OnInit {
  columns: TableColumn[] = [
    { key: 'reference', label: 'Reference' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'loan_application_id', label: 'Loan' },
    { key: 'amount', label: 'Amount', type: 'currency', align: 'right' },
    { key: 'payment_method', label: 'Method' },
    { key: 'status', label: 'Status' },
    { key: 'created_at', label: 'Date', type: 'date' },
  ];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  totalRecords = 0; exportOpen = false; q: any = {};

  // Individual repayment
  showRepayment = signal(false); repSaving = signal(false);
  repForm: any = { loan_id: '', amount: '', payment_method: 'bank_transfer', reference: '', payment_date: '', narration: '' };
  allLoans = signal<any[]>([]);

  // Bulk upload
  showBulk = signal(false); bulkSaving = signal(false);
  bulkPreview = signal<any[]>([]);
  private bulkData: any[] = [];

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() { this.load(); }

  load(p?: any) { this.loading.set(true); this.api.get('/payments', { ...this.q, ...p }).subscribe({ next: r => { this.rows.set(r.data || []); this.pagination.set(r.meta || null); this.totalRecords = r.meta?.total || 0; this.loading.set(false); }, error: () => this.loading.set(false) }); }
  onQuery(e: TableQueryEvent) { this.q = e; this.load(e); }

  loanOptions(): SelectOption[] { return this.allLoans().map((l: any) => ({ value: l.id, label: l.application_id, sublabel: l.customer_name })); }

  // Individual repayment
  openRepayment() {
    this.repForm = { loan_id: '', amount: '', payment_method: 'bank_transfer', reference: '', payment_date: new Date().toISOString().slice(0, 10), narration: '' };
    this.showRepayment.set(true);
    if (this.allLoans().length === 0) {
      this.api.get('/loans', { per_page: 500, status: 'active,disbursed,overdue' }).subscribe({ next: r => this.allLoans.set(r.data || []) });
    }
  }

  saveRepayment() {
    if (!this.repForm.loan_id || !this.repForm.amount) { this.toast.error('Loan and amount required'); return; }
    this.repSaving.set(true);
    this.api.post('/payments/repayment', this.repForm).subscribe({
      next: r => { this.repSaving.set(false); this.toast.success(r.message || 'Repayment posted'); this.showRepayment.set(false); this.load(this.q); },
      error: e => { this.repSaving.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }

  // Bulk upload
  openBulk() { this.bulkPreview.set([]); this.bulkData = []; this.showBulk.set(true); }

  onBulkFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length < 2) { this.toast.error('CSV must have header + data rows'); return; }
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));
      const data = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row: any = {};
        headers.forEach((h, i) => row[h] = vals[i] || '');
        return row;
      }).filter(r => r.loan_application_id && r.amount);
      this.bulkData = data;
      this.bulkPreview.set(data);
    };
    reader.readAsText(file);
  }

  processBulk() {
    if (this.bulkData.length === 0) { this.toast.error('No valid data to upload'); return; }
    this.bulkSaving.set(true);
    this.api.post('/payments/bulk-upload', { repayments: this.bulkData }).subscribe({
      next: r => { this.bulkSaving.set(false); this.toast.success(r.message || `${this.bulkData.length} repayments processed`); this.showBulk.set(false); this.load(this.q); },
      error: e => { this.bulkSaving.set(false); this.toast.error(e.error?.message || 'Bulk upload failed'); },
    });
  }

  downloadTemplate() {
    const csv = 'loan_application_id,amount,payment_method,reference,payment_date,narration\nLOAN-001,50000,bank_transfer,TXN123,2026-04-18,April payment\nLOAN-002,75000,deduction,SAL-APR,2026-04-18,Salary deduction';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'CreditX_BulkRepayment_Template.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  exportData(format: string) {
    this.exportOpen = false;
    this.api.get('/payments', { per_page: 10000 }).subscribe({
      next: res => {
        const data = res.data || [];
        if (!data.length) { this.toast.error('No data'); return; }
        const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        const fn = `CreditX_Payments_${ts}`;
        const h = ['Reference','Customer','Loan','Amount','Method','Status','Date'];
        if (format === 'csv') {
          const rows = [h.join(','), ...data.map((r: any) => [r.reference, `"${r.customer_name||''}"`, r.loan_application_id, r.amount, r.payment_method, r.status, r.created_at].join(','))];
          this.dl(new Blob([rows.join('\n')], { type: 'text/csv' }), fn + '.csv');
        } else if (format === 'excel') {
          let html = '<html><head><meta charset="UTF-8"></head><body><table border="1"><tr>' + h.map(c => `<th>${c}</th>`).join('') + '</tr>';
          for (const r of data) html += `<tr><td>${r.reference}</td><td>${r.customer_name||''}</td><td>${r.loan_application_id||''}</td><td>${r.amount}</td><td>${r.payment_method||''}</td><td>${r.status}</td><td>${r.created_at}</td></tr>`;
          this.dl(new Blob([html + '</table></body></html>'], { type: 'application/vnd.ms-excel' }), fn + '.xls');
        } else if (format === 'pdf') {
          const w = window.open('', '_blank'); if (!w) return;
          let html = `<html><head><title>Payments</title><style>body{font-family:Arial;margin:20px}h1{color:#0A4F2A;font-size:16px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ddd;padding:6px;font-size:10px}th{background:#0A4F2A;color:white}</style></head><body>`;
          html += `<h1>CreditX — Payment Report</h1><p style="color:#666;font-size:10px">Generated: ${new Date().toLocaleString()} | ${data.length} payments</p><table><tr>` + h.map(c => `<th>${c}</th>`).join('') + '</tr>';
          for (const r of data) html += `<tr><td>${r.reference}</td><td>${r.customer_name||''}</td><td>${r.loan_application_id||''}</td><td>${r.amount}</td><td>${r.payment_method||''}</td><td>${r.status}</td><td>${r.created_at}</td></tr>`;
          w.document.write(html + '</table></body></html>'); w.document.close(); w.onload = () => w.print();
        }
        this.toast.success(`Exported ${data.length} payments`);
      },
    });
  }
  private dl(b: Blob, n: string) { const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = n; a.click(); URL.revokeObjectURL(u); }
}
