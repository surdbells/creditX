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
      <cx-page-header
        title="Payments & Repayments"
        [subtitle]="(totalRecords | number) + ' payment records'"
        eyebrow="Finance">
        <div class="flex items-center gap-2">
          <div class="relative">
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="exportOpen = !exportOpen">
              <lucide-icon name="download" [size]="14"></lucide-icon>
              <span>Export</span>
              <lucide-icon name="chevron-down" [size]="12"></lucide-icon>
            </button>
            @if (exportOpen) {
              <div class="cx-pay-export-menu cx-animate-in">
                <button class="cx-pay-export-option" (click)="exportData('csv')">
                  <lucide-icon name="file-spreadsheet" [size]="14"></lucide-icon>
                  <span>CSV</span>
                </button>
                <button class="cx-pay-export-option" (click)="exportData('excel')">
                  <lucide-icon name="file-spreadsheet" [size]="14"></lucide-icon>
                  <span>Excel</span>
                </button>
                <button class="cx-pay-export-option" (click)="exportData('pdf')">
                  <lucide-icon name="file-text" [size]="14"></lucide-icon>
                  <span>PDF</span>
                </button>
              </div>
            }
          </div>
          @if (auth.hasPermission('payments.create')) {
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="openBulk()">
              <lucide-icon name="upload" [size]="14"></lucide-icon>
              <span>Bulk Upload</span>
            </button>
            <button class="cx-btn cx-btn-primary" (click)="openRepayment()">
              <lucide-icon name="plus" [size]="14"></lucide-icon>
              <span>Post Repayment</span>
            </button>
          }
        </div>
      </cx-page-header>
      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
        searchPlaceholder="Search payments by reference, customer, loan..." [hasActions]="false" (query)="onQuery($event)">
      </cx-data-table>
    </div>

    <!-- Post Individual Repayment -->
    <cx-form-dialog
      [open]="showRepayment()"
      title="Post Repayment"
      subtitle="Record a loan repayment transaction"
      [saving]="repSaving()" (close)="showRepayment.set(false)" (save)="saveRepayment()">
      <div class="cx-form-stack">
        <div>
          <label class="cx-label">Loan *</label>
          <cx-searchable-select [options]="loanOptions()" placeholder="Search loan by App ID..." [(ngModel)]="repForm.loan_id"></cx-searchable-select>
        </div>
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Amount (₦) *</label><input class="cx-input" type="number" [(ngModel)]="repForm.amount" /></div>
          <div>
            <label class="cx-label">Payment Method</label>
            <select class="cx-select" [(ngModel)]="repForm.payment_method">
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="paystack">Paystack</option>
              <option value="deduction">Salary Deduction</option>
            </select>
          </div>
        </div>
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Reference</label><input class="cx-input" [(ngModel)]="repForm.reference" placeholder="Transaction reference" /></div>
          <div><label class="cx-label">Payment Date</label><input class="cx-input" type="date" [(ngModel)]="repForm.payment_date" /></div>
        </div>
        <div><label class="cx-label">Narration</label><textarea class="cx-input" rows="2" [(ngModel)]="repForm.narration" placeholder="Optional notes..."></textarea></div>
      </div>
    </cx-form-dialog>

    <!-- Bulk Upload Dialog -->
    <cx-form-dialog
      [open]="showBulk()"
      title="Bulk Repayment Upload"
      subtitle="Upload a CSV to post multiple repayments at once"
      [saving]="bulkSaving()" saveLabel="Upload & Process" (close)="showBulk.set(false)" (save)="processBulk()">
      <div class="cx-form-stack">
        <div class="cx-pay-bulk-info">
          <div class="cx-pay-bulk-info-head">
            <lucide-icon name="info" [size]="14"></lucide-icon>
            <span>CSV Format</span>
          </div>
          <p class="cx-pay-bulk-info-text">
            Required columns: <strong>loan_application_id</strong>, <strong>amount</strong>,
            <strong>payment_method</strong>, <strong>reference</strong>, <strong>payment_date</strong>, <strong>narration</strong>.
          </p>
          <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="downloadTemplate()">
            <lucide-icon name="download" [size]="12"></lucide-icon>
            <span>Download Template</span>
          </button>
        </div>
        <div>
          <label class="cx-label">Upload CSV File *</label>
          <input type="file" accept=".csv" class="cx-input cx-pay-file-input" (change)="onBulkFile($event)" #bulkFileInput />
        </div>
        @if (bulkPreview().length) {
          <div>
            <div class="cx-pay-preview-title">Preview · <span class="tabular-nums">{{ bulkPreview().length }}</span> rows</div>
            <div class="cx-pay-preview-scroll">
              <table class="cx-pay-preview-table">
                <thead>
                  <tr>
                    <th>Loan ID</th>
                    <th class="cx-pay-right">Amount</th>
                    <th>Method</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of bulkPreview().slice(0, 10); track $index) {
                    <tr>
                      <td class="cx-pay-mono">{{ row.loan_application_id }}</td>
                      <td class="cx-pay-right tabular-nums">{{ row.amount }}</td>
                      <td>{{ row.payment_method }}</td>
                      <td>{{ row.reference }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (bulkPreview().length > 10) {
              <p class="cx-pay-preview-more">…and {{ bulkPreview().length - 10 }} more rows</p>
            }
          </div>
        }
      </div>
    </cx-form-dialog>
  `,
  styles: [`
    .cx-pay-export-menu {
      position: absolute; right: 0; top: calc(100% + 4px);
      z-index: var(--cx-z-dropdown);
      min-width: 180px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-lg);
      box-shadow: var(--cx-shadow-lg);
      padding: 0.35rem;
      display: flex; flex-direction: column;
    }
    .cx-pay-export-option {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.5rem 0.65rem;
      background: transparent; border: none;
      border-radius: var(--cx-radius-sm);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      cursor: pointer;
      text-align: left;
      transition: background var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-pay-export-option:hover { background: var(--cx-surface-hover); }
    .cx-pay-export-option lucide-icon { color: var(--cx-text-muted); }

    .cx-pay-bulk-info {
      padding: 0.85rem 1rem;
      background: var(--cx-info-50);
      border: 1px solid rgba(30, 92, 168, 0.15);
      border-radius: var(--cx-radius-md);
      display: flex; flex-direction: column; gap: 0.5rem;
    }
    .cx-pay-bulk-info-head {
      display: flex; align-items: center; gap: 6px;
      font-size: var(--cx-text-xs); font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.05em;
      color: var(--cx-info);
    }
    .cx-pay-bulk-info-text {
      margin: 0;
      font-size: var(--cx-text-xs);
      color: var(--cx-text-secondary);
      line-height: 1.55;
    }
    .cx-pay-file-input { padding: 0.45rem 0.55rem; }

    .cx-pay-preview-title {
      font-size: var(--cx-text-xs); font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.05em;
      color: var(--cx-text-muted);
      margin-bottom: 0.5rem;
    }
    .cx-pay-preview-scroll {
      max-height: 12rem;
      overflow-y: auto;
      border: 1px solid var(--cx-border-subtle);
      border-radius: var(--cx-radius-md);
    }
    .cx-pay-preview-table { width: 100%; border-collapse: collapse; font-size: var(--cx-text-xs); }
    .cx-pay-preview-table thead {
      background: var(--cx-surface-2);
      position: sticky; top: 0;
    }
    .cx-pay-preview-table th {
      padding: 0.45rem 0.65rem;
      font-weight: 600;
      color: var(--cx-text-muted);
      text-transform: uppercase; letter-spacing: 0.05em;
      text-align: left;
      font-size: 10px;
    }
    .cx-pay-preview-table tbody td {
      padding: 0.4rem 0.65rem;
      border-top: 1px solid var(--cx-border-subtle);
      color: var(--cx-text);
    }
    .cx-pay-right { text-align: right; }
    .cx-pay-mono { font-family: var(--cx-font-mono); color: var(--cx-primary-700); }
    .cx-pay-preview-more {
      margin: 0.35rem 0 0;
      font-size: 10px;
      color: var(--cx-text-muted);
    }
  `],
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
