import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { SettingsService } from '../../core/services/settings.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

interface Col { key: string; label: string; money?: boolean; }

/**
 * Monthly Loan Summary Report — pick year, month and status, click Generate.
 * Mirrors the legacy MONTHLY LOAN SUMMARY RECORD columns. Table scrolls inside
 * its own container; rows can be exported to CSV.
 */
@Component({
  selector: 'app-monthly-loan-summary',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Monthly Loan Summary" subtitle="Loans captured/disbursed in a month" eyebrow="Reports"></cx-page-header>

      <div class="cx-mls-filters">
        <div>
          <label class="cx-label">Year</label>
          <select class="cx-select" [(ngModel)]="filters.year">
            @for (y of years; track y) { <option [ngValue]="y">{{ y }}</option> }
          </select>
        </div>
        <div>
          <label class="cx-label">Month</label>
          <select class="cx-select" [(ngModel)]="filters.month">
            @for (m of months; track m.v) { <option [ngValue]="m.v">{{ m.n }}</option> }
          </select>
        </div>
        <div>
          <label class="cx-label">Status</label>
          <select class="cx-select" [(ngModel)]="filters.status">
            <option value="all">All statuses</option>
            @for (s of statuses; track s) { <option [value]="s">{{ s | titlecase }}</option> }
          </select>
        </div>
        <div class="cx-mls-actions">
          <button class="cx-btn cx-btn-primary" (click)="generate()" [disabled]="loading()">
            {{ loading() ? 'Generating…' : 'Generate' }}
          </button>
          <button class="cx-btn cx-btn-secondary" (click)="exportCsv()" [disabled]="!rows().length">
            <lucide-icon name="download" [size]="14"></lucide-icon>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      @if (generated()) {
        <div class="cx-mls-meta">{{ rows().length }} record(s) for {{ monthName() }} {{ filters.year }}</div>
        @if (rows().length) {
          <div class="cx-mls-table-scroll">
            <table class="cx-mls-table">
              <thead>
                <tr>@for (c of columns; track c.key) { <th [class.cx-mls-num]="c.money">{{ c.label }}</th> }</tr>
              </thead>
              <tbody>
                @for (r of rows(); track $index) {
                  <tr>
                    @for (c of columns; track c.key) {
                      <td [class.cx-mls-num]="c.money">{{ c.money ? fmtMoney(r[c.key]) : (r[c.key] ?? '—') }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="cx-mls-empty">No loans found for the selected period.</div>
        }
      }
    </div>
  `,
  styles: [`
    .cx-mls-filters { display: grid; grid-template-columns: repeat(3, minmax(140px, 220px)) 1fr; gap: 14px; align-items: end;
      background: var(--cx-surface); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-xl, 12px); padding: 16px; }
    @media (max-width: 800px) { .cx-mls-filters { grid-template-columns: 1fr 1fr; } }
    .cx-mls-actions { display: flex; gap: 10px; justify-content: flex-end; align-items: end; }
    .cx-mls-meta { margin: 16px 0 8px; font-size: 13px; color: var(--cx-text-secondary); }
    .cx-mls-table-scroll { overflow-x: auto; border: 1px solid var(--cx-border); border-radius: var(--cx-radius-md); background: var(--cx-surface); }
    .cx-mls-table { border-collapse: collapse; font-size: 12px; white-space: nowrap; min-width: 100%; }
    .cx-mls-table th { position: sticky; top: 0; background: var(--cx-bg); text-align: left; padding: 9px 12px; font-weight: 600;
      border-bottom: 1px solid var(--cx-border); text-transform: uppercase; font-size: 11px; letter-spacing: 0.02em; color: var(--cx-text-secondary); }
    .cx-mls-table td { padding: 8px 12px; border-bottom: 1px solid var(--cx-border-subtle, var(--cx-border)); color: var(--cx-text); }
    .cx-mls-table tbody tr:hover, .cx-mls-table tbody tr:hover { background: var(--cx-hover, rgba(0,0,0,0.02)); }
    .cx-mls-num { text-align: right; font-variant-numeric: tabular-nums; }
    .cx-mls-empty { margin-top: 16px; padding: 32px; text-align: center; color: var(--cx-text-muted); border: 1px dashed var(--cx-border); border-radius: var(--cx-radius-md); }
  `],
})
export class MonthlyLoanSummaryComponent {
  private readonly nowYear = new Date().getFullYear();
  years = Array.from({ length: 6 }, (_, i) => this.nowYear - i);
  months = [
    { v: 1, n: 'January' }, { v: 2, n: 'February' }, { v: 3, n: 'March' }, { v: 4, n: 'April' },
    { v: 5, n: 'May' }, { v: 6, n: 'June' }, { v: 7, n: 'July' }, { v: 8, n: 'August' },
    { v: 9, n: 'September' }, { v: 10, n: 'October' }, { v: 11, n: 'November' }, { v: 12, n: 'December' },
  ];
  statuses = ['captured', 'submitted', 'under_review', 'approved', 'rejected', 'disbursed', 'active', 'overdue', 'closed', 'written_off', 'restructured', 'cancelled'];

  columns: Col[] = [
    { key: 'date', label: 'Date' },
    { key: 'staff_id', label: 'Staff ID' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'location', label: 'Location' },
    { key: 'payment_amount', label: 'Payment Amount', money: true },
    { key: 'payment_due_date', label: 'Payment Due Date' },
    { key: 'main_bank_name', label: 'Main Bank Name' },
    { key: 'main_bank_num', label: 'Main Bank Num' },
    { key: 'command', label: 'Command' },
    { key: 'employer', label: 'Employer' },
    { key: 'main_number', label: 'Main Number' },
    { key: 'tenure', label: 'Tenure' },
    { key: 'loan_type', label: 'Loan Type' },
    { key: 'dsa', label: 'DSA' },
    { key: 'net_disbursed', label: '(₦) Net Disbursed', money: true },
    { key: 'gl_amount', label: '(₦) GL Amount', money: true },
    { key: 'topup_bal', label: '(₦) Topup Bal', money: true },
    { key: 'as_source', label: 'A.S. Source' },
    { key: 'alt_bank', label: 'Alt Bank' },
    { key: 'alt_acct_number', label: 'Alt Acct Number' },
    { key: 'alt_phone_number', label: 'Alt Phone Number' },
    { key: 'nok_phone', label: 'NOK Phone Number' },
    { key: 'nok_full_name', label: 'NOK Full Name' },
    { key: 'status', label: 'Status' },
  ];

  filters: any = { year: this.nowYear, month: new Date().getMonth() + 1, status: 'all' };
  rows = signal<any[]>([]);
  loading = signal(false);
  generated = signal(false);

  constructor(private api: ApiService, private toast: ToastService, public settings: SettingsService) {}

  monthName(): string { return this.months.find(m => m.v === +this.filters.month)?.n || ''; }

  fmtMoney(v: any): string {
    if (v === null || v === undefined || v === '') return '—';
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (isNaN(n)) return '—';
    return n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  generate(): void {
    this.loading.set(true);
    this.api.get('/reports/monthly-loan-summary', {
      year: this.filters.year, month: this.filters.month, status: this.filters.status,
    }).subscribe({
      next: r => { this.loading.set(false); this.rows.set(r.data?.rows || []); this.generated.set(true); },
      error: e => { this.loading.set(false); this.toast.error(e.error?.message || 'Failed to generate report'); },
    });
  }

  exportCsv(): void {
    const esc = (v: any) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = this.columns.map(c => esc(c.label)).join(',');
    const lines = this.rows().map(row => this.columns.map(c => esc(row[c.key])).join(','));
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monthly-loan-summary-${this.filters.year}-${String(this.filters.month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
