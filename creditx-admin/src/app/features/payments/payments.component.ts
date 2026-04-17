import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-payments', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, StatusBadgeComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Payments" subtitle="{{ totalRecords | number }} payment records">
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
      </cx-page-header>
      <div class="cx-card !p-0 overflow-hidden">
        <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
          searchPlaceholder="Search payments..." [hasActions]="false" (query)="onQuery($event)">
        </cx-data-table>
      </div>
    </div>
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

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit() { this.load(); }
  load(p?: any) { this.loading.set(true); this.api.get('/payments', { ...this.q, ...p }).subscribe({ next: r => { this.rows.set(r.data || []); this.pagination.set(r.meta || null); this.totalRecords = r.meta?.total || 0; this.loading.set(false); }, error: () => this.loading.set(false) }); }
  onQuery(e: TableQueryEvent) { this.q = e; this.load(e); }

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
