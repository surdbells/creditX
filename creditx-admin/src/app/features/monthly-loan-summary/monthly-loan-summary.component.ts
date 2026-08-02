import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { SettingsService } from '../../core/services/settings.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { SearchableSelectDirective } from '../../shared/directives/searchable-select.directive';
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import { PageGuide } from '../../shared/guide/page-guide.model';

interface Col { key: string; label: string; money?: boolean; }

/**
 * Monthly Loan Summary Report — pick year, month and status, click Generate.
 * Mirrors the legacy MONTHLY LOAN SUMMARY RECORD columns. Table scrolls inside
 * its own container; rows can be exported to CSV.
 */
const MONTHLY_LOAN_SUMMARY_GUIDE: PageGuide = {
  id: 'monthly-loan-summary',
  titleKey: 'Monthly Loan Summary',
  purposeKey: 'What was captured and what was disbursed in a given month.',
  descriptionKey:
    'A month-at-a-glance view of origination: how many applications came in, how many turned into '
    + 'money out, and the gap between the two. That gap is the useful part — it is conversion, and '
    + 'it says more about the pipeline than either figure alone.',
  actionKeys: ['Pick a month and review captures against disbursements', 'Export the summary'],
  dependsOnKeys: ['Loans'],
  businessRuleKeys: [
    'Captured and disbursed are counted on different dates, so a loan can be captured in one month and disbursed in the next. The two columns are not meant to tie.',
    'Applications that were declined or abandoned still count as captured.',
  ],
  tipKeys: [
    'A widening gap between captured and disbursed usually means approvals are slowing, not that demand has fallen.',
  ],
  permissionKeys: ['reports.general_loans'],
};

@Component({
  selector: 'app-monthly-loan-summary',
  standalone: true,
  imports: [SearchableSelectDirective, CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, PageGuideComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Monthly Loan Summary" subtitle="Loans captured/disbursed in a month" eyebrow="Reports"></cx-page-header>

      <cx-page-guide [guide]="guide"></cx-page-guide>

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
        <div>
          <label class="cx-label">From (optional)</label>
          <input type="date" class="cx-select" [(ngModel)]="filters.date_from" />
        </div>
        <div>
          <label class="cx-label">To (optional)</label>
          <input type="date" class="cx-select" [(ngModel)]="filters.date_to" />
        </div>
        <div>
          <label class="cx-label">Branch</label>
          <select class="cx-select" [(ngModel)]="filters.branch_id">
            <option value="">All branches</option>
            @for (b of branches(); track b.id) { <option [value]="b.id">{{ b.name }}</option> }
          </select>
        </div>
        <div>
          <label class="cx-label">Product</label>
          <select class="cx-select" [(ngModel)]="filters.product_id">
            <option value="">All products</option>
            @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
          </select>
        </div>
        <div>
          <label class="cx-label">Agent</label>
          <select class="cx-select" [(ngModel)]="filters.agent_id">
            <option value="">All agents</option>
            @for (a of agents(); track a.id) { <option [value]="a.id">{{ a.name }}</option> }
          </select>
        </div>
        <div>
          <label class="cx-label">Loan Type</label>
          <select class="cx-select" [(ngModel)]="filters.loan_type">
            <option value="">All types</option>
            <option value="new">New</option>
            <option value="top_up">Top-up</option>
          </select>
        </div>
        <div class="cx-mls-actions">
          <button class="cx-btn cx-btn-primary" (click)="generate()" [disabled]="loading()">
            {{ loading() ? 'Generating…' : 'Generate' }}
          </button>
          <button class="cx-btn cx-btn-secondary" (click)="exportExcel()" [disabled]="!rows().length">
            <lucide-icon name="download" [size]="14"></lucide-icon>
            <span>Export Excel</span>
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
    .cx-mls-filters { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 14px; align-items: end;
      background: var(--cx-surface); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-xl, 12px); padding: 16px; }
    /* Actions span their own full-width row so they never overlap the filter fields. */
    .cx-mls-actions { grid-column: 1 / -1; display: flex; gap: 10px; justify-content: flex-end; align-items: end; flex-wrap: wrap; }
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
export class MonthlyLoanSummaryComponent implements OnInit {
  readonly guide = MONTHLY_LOAN_SUMMARY_GUIDE;

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
    { key: 'approval_date', label: 'Approval Date' },
    { key: 'underwriter', label: 'Underwriter' },
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

  filters: any = { year: this.nowYear, month: new Date().getMonth() + 1, status: 'all',
    date_from: '', date_to: '', branch_id: '', product_id: '', agent_id: '', loan_type: '' };
  rows = signal<any[]>([]);
  loading = signal(false);
  generated = signal(false);

  branches = signal<any[]>([]);
  products = signal<any[]>([]);
  agents = signal<{ id: string; name: string }[]>([]);

  constructor(private api: ApiService, private toast: ToastService, public settings: SettingsService) {}

  ngOnInit(): void {
    this.api.get('/locations', { per_page: 200 }).subscribe({ next: r => this.branches.set(r.data || []), error: () => {} });
    this.api.get('/loan-products', { per_page: 200 }).subscribe({ next: r => this.products.set(r.data || []), error: () => {} });
    this.api.get('/users', { per_page: 500, is_agent: true }).subscribe({
      next: r => this.agents.set((r.data || []).map((u: any) => ({ id: u.id, name: u.full_name || u.name }))),
      error: () => {},
    });
  }

  monthName(): string { return this.months.find(m => m.v === +this.filters.month)?.n || ''; }

  /**
   * Monetary display. Zero or null renders as 0.00 (never a dash) so the
   * column stays numeric and Excel can total it after export.
   */
  fmtMoney(v: any): string {
    const n = v === null || v === undefined || v === '' ? 0 : (typeof v === 'number' ? v : parseFloat(v));
    const safe = isNaN(n) ? 0 : n;
    return safe.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Numeric value for exports — money columns become a real number (0 if blank). */
  private moneyNum(v: any): number {
    const n = v === null || v === undefined || v === '' ? 0 : (typeof v === 'number' ? v : parseFloat(v));
    return isNaN(n) ? 0 : n;
  }

  generate(): void {
    this.loading.set(true);
    this.api.get('/reports/monthly-loan-summary', {
      year: this.filters.year, month: this.filters.month, status: this.filters.status,
      date_from: this.filters.date_from || undefined,
      date_to: this.filters.date_to || undefined,
      branch_id: this.filters.branch_id || undefined,
      product_id: this.filters.product_id || undefined,
      agent_id: this.filters.agent_id || undefined,
      loan_type: this.filters.loan_type || undefined,
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
    const lines = this.rows().map(row => this.columns.map(c => c.money ? String(this.moneyNum(row[c.key])) : esc(row[c.key])).join(','));
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monthly-loan-summary-${this.filters.year}-${String(this.filters.month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Export as .xls (HTML table — Excel opens it natively, no library). */
  exportExcel(): void {
    const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const head = '<tr>' + this.columns.map(c => `<th>${esc(c.label)}</th>`).join('') + '</tr>';
    const body = this.rows().map(row => '<tr>' + this.columns.map(c => c.money
      ? `<td style="mso-number-format:'0.00'">${this.moneyNum(row[c.key])}</td>`
      : `<td>${esc(row[c.key])}</td>`).join('') + '</tr>').join('');
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head>`
      + `<body><table border="1">${head}${body}</table></body></html>`;
    const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monthly-loan-summary-${this.filters.year}-${String(this.filters.month).padStart(2, '0')}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
