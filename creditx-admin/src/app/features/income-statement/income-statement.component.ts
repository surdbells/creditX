import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import { PageGuide } from '../../shared/guide/page-guide.model';

/**
 * Income Statement (P&L) report.
 *
 * Three sections rendered top-to-bottom:
 *   - Period selector (from/to dates + Month quick buttons)
 *   - Hero: Revenue, Expenses, Net Income
 *   - Detail: every account with activity in the period, grouped
 *     under Revenue and Expenses subheaders
 *
 * Defaults: from = first of current month, to = today. The two
 * 'Last Month' / 'YTD' shortcuts let the finance user jump to
 * common periods without typing dates.
 *
 * Gated by accounting.view at both menu and backend.
 */
const INCOME_STATEMENT_GUIDE: PageGuide = {
  id: 'income-statement',
  titleKey: 'Income Statement',
  purposeKey: 'What was earned and what was spent over a chosen period, and the profit left over.',
  descriptionKey:
    'Where the balance sheet is a snapshot, this covers a stretch of time. Interest and fee income '
    + 'sit at the top, operating costs and loan-loss provisions come off, and what remains is the '
    + 'result for the period. Because income is recognised as it is earned rather than when cash '
    + 'arrives, profit here will not equal cash movement.',
  actionKeys: [
    'Run the result for a month, quarter or year',
    'Compare periods to see what changed',
    'Export for the board or the regulator',
  ],
  dependsOnKeys: ['Journal Entries', 'Interest Accrual', 'Provisions'],
  businessRuleKeys: [
    'Income is recognised when earned, not when received. Accrued interest counts even where the customer has not yet paid.',
    'Provisions are a charge against profit. A rising portfolio at risk reduces the result even with no cash lost yet.',
    'The period must be complete for the figure to be final — an open period can still receive entries.',
    'Profit here will not match cash in the bank. The cash flow statement is what reconciles the two.',
  ],
  tipKeys: [
    'Read this next to Portfolio at Risk. Strong interest income against a rising PAR often means income is being accrued on loans that will not pay.',
    'Compare like periods. A month against a quarter tells you nothing.',
  ],
  permissionKeys: ['reports.financial'],
};

@Component({
  selector: 'app-income-statement',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, MoneyPipe, PageGuideComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Income Statement"
        subtitle="Profit & loss over a selected period"
        eyebrow="Financial Reports">
        <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="load()" [disabled]="loading()">
          <lucide-icon name="refresh-cw" [size]="14"></lucide-icon>
          <span>{{ loading() ? 'Loading…' : 'Refresh' }}</span>
        </button>
        <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="exportCsv()"
                [disabled]="loading() || !data()">
          <lucide-icon name="download" [size]="14"></lucide-icon>
          <span>Export CSV</span>
        </button>
      </cx-page-header>

      <cx-page-guide [guide]="guide"></cx-page-guide>

      <!-- Period selector -->
      <div class="cx-is-period">
        <div class="cx-is-period-row">
          <div class="cx-is-period-dates">
            <label>
              <span>From</span>
              <input type="date" class="cx-input" [(ngModel)]="from" (change)="load()" />
            </label>
            <label>
              <span>To</span>
              <input type="date" class="cx-input" [(ngModel)]="to" (change)="load()" />
            </label>
          </div>
          <div class="cx-is-period-shortcuts">
            <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="shortcut('this-month')">This Month</button>
            <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="shortcut('last-month')">Last Month</button>
            <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="shortcut('ytd')">YTD</button>
            <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="shortcut('last-year')">Last Year</button>
          </div>
        </div>
        @if (data()?.period?.label) {
          <div class="cx-is-period-label">
            Showing: <strong>{{ data()?.period?.label }}</strong>
          </div>
        }
      </div>

      @if (loading()) {
        <div class="cx-is-loading">
          <lucide-icon name="loader-2" [size]="20" class="cx-is-spin"></lucide-icon>
          <span>Computing income statement…</span>
        </div>
      } @else if (data(); as d) {
        <!-- Hero: three big numbers -->
        <div class="cx-is-hero">
          <div class="cx-is-hero-cell cx-is-hero-income">
            <div class="cx-is-hero-label">Total Revenue</div>
            <div class="cx-is-hero-value tabular-nums">{{ d.revenue.total | money:2 }}</div>
            <div class="cx-is-hero-meta">{{ d.revenue.accounts.length }} income account{{ d.revenue.accounts.length === 1 ? '' : 's' }}</div>
          </div>
          <div class="cx-is-hero-arrow">−</div>
          <div class="cx-is-hero-cell cx-is-hero-expense">
            <div class="cx-is-hero-label">Total Expenses</div>
            <div class="cx-is-hero-value tabular-nums">{{ d.expenses.total | money:2 }}</div>
            <div class="cx-is-hero-meta">{{ d.expenses.accounts.length }} expense account{{ d.expenses.accounts.length === 1 ? '' : 's' }}</div>
          </div>
          <div class="cx-is-hero-arrow">=</div>
          <div class="cx-is-hero-cell"
               [class.cx-is-hero-profit]="+d.net_income >= 0"
               [class.cx-is-hero-loss]="+d.net_income < 0">
            <div class="cx-is-hero-label">Net Income</div>
            <div class="cx-is-hero-value tabular-nums">
              @if (+d.net_income >= 0) {
                {{ d.net_income | money:2 }}
              } @else {
                ({{ (-d.net_income) | money:2 }})
              }
            </div>
            <div class="cx-is-hero-meta">
              {{ +d.net_income >= 0 ? 'Profit' : 'Loss' }}
            </div>
          </div>
        </div>

        <!-- Detail table: revenue then expenses -->
        <div class="cx-is-table-wrap">
          <table class="cx-is-table">
            <thead>
              <tr>
                <th>Account</th>
                <th class="cx-is-right">Debits</th>
                <th class="cx-is-right">Credits</th>
                <th class="cx-is-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <!-- Revenue section -->
              <tr class="cx-is-section-row">
                <td colspan="4">Revenue</td>
              </tr>
              @if (d.revenue.accounts.length === 0) {
                <tr>
                  <td colspan="4" class="cx-is-empty-section">No revenue in this period.</td>
                </tr>
              } @else {
                @for (a of d.revenue.accounts; track a.id) {
                  <tr>
                    <td>
                      <span class="cx-is-acct-code">{{ a.code }}</span>
                      <span>{{ a.name }}</span>
                    </td>
                    <td class="cx-is-right tabular-nums cx-is-muted">{{ a.total_dr | money:2 }}</td>
                    <td class="cx-is-right tabular-nums cx-is-muted">{{ a.total_cr | money:2 }}</td>
                    <td class="cx-is-right tabular-nums"><strong>{{ a.balance | money:2 }}</strong></td>
                  </tr>
                }
              }
              <tr class="cx-is-subtotal-row">
                <td colspan="3">Total Revenue</td>
                <td class="cx-is-right tabular-nums cx-is-income">{{ d.revenue.total | money:2 }}</td>
              </tr>

              <!-- Expenses section -->
              <tr class="cx-is-section-row">
                <td colspan="4">Expenses</td>
              </tr>
              @if (d.expenses.accounts.length === 0) {
                <tr>
                  <td colspan="4" class="cx-is-empty-section">No expenses in this period.</td>
                </tr>
              } @else {
                @for (a of d.expenses.accounts; track a.id) {
                  <tr>
                    <td>
                      <span class="cx-is-acct-code">{{ a.code }}</span>
                      <span>{{ a.name }}</span>
                    </td>
                    <td class="cx-is-right tabular-nums cx-is-muted">{{ a.total_dr | money:2 }}</td>
                    <td class="cx-is-right tabular-nums cx-is-muted">{{ a.total_cr | money:2 }}</td>
                    <td class="cx-is-right tabular-nums"><strong>{{ a.balance | money:2 }}</strong></td>
                  </tr>
                }
              }
              <tr class="cx-is-subtotal-row">
                <td colspan="3">Total Expenses</td>
                <td class="cx-is-right tabular-nums cx-is-expense">{{ d.expenses.total | money:2 }}</td>
              </tr>

              <!-- Net Income -->
              <tr class="cx-is-total-row">
                <td colspan="3">Net Income</td>
                <td class="cx-is-right tabular-nums"
                    [class.cx-is-profit]="+d.net_income >= 0"
                    [class.cx-is-loss]="+d.net_income < 0">
                  @if (+d.net_income >= 0) {
                    {{ d.net_income | money:2 }}
                  } @else {
                    ({{ (-d.net_income) | money:2 }})
                  }
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="cx-is-footer">
          Generated {{ generatedAt() }} · balances computed as of end-of-day on each date
        </div>
      }
    </div>
  `,
  styles: [`
    .cx-is-period {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px 16px;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
    }
    .cx-is-period-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
      flex-wrap: wrap;
    }
    .cx-is-period-dates {
      display: flex;
      gap: 12px;
    }
    .cx-is-period-dates label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-is-period-dates input { font-size: 13px; padding: 6px 10px; }
    .cx-is-period-shortcuts { display: flex; gap: 4px; flex-wrap: wrap; }
    .cx-is-period-label {
      font-size: 12px;
      color: var(--cx-text-secondary);
    }
    .cx-is-period-label strong {
      color: var(--cx-text);
      font-weight: 600;
    }

    /* Hero: 3 columns + 2 operators */
    .cx-is-hero {
      display: grid;
      grid-template-columns: 1fr auto 1fr auto 1fr;
      gap: 12px;
      align-items: stretch;
      margin-bottom: 14px;
    }
    @media (max-width: 720px) {
      .cx-is-hero {
        grid-template-columns: 1fr;
      }
      .cx-is-hero-arrow { display: none; }
    }
    .cx-is-hero-cell {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .cx-is-hero-income { border-left: 3px solid var(--cx-success, #16a34a); }
    .cx-is-hero-expense { border-left: 3px solid var(--cx-danger, #dc2626); }
    .cx-is-hero-profit { border-left: 3px solid var(--cx-success, #16a34a); }
    .cx-is-hero-loss { border-left: 3px solid var(--cx-danger, #dc2626); }
    .cx-is-hero-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-is-hero-value {
      font-size: 22px;
      font-weight: 600;
      color: var(--cx-text);
    }
    .cx-is-hero-meta {
      font-size: 11px;
      color: var(--cx-text-secondary);
    }
    .cx-is-hero-arrow {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: 300;
      color: var(--cx-text-muted);
      padding: 0 4px;
    }

    /* Detail table */
    .cx-is-table-wrap {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      overflow: hidden;
      margin-bottom: 10px;
    }
    .cx-is-table { width: 100%; border-collapse: collapse; }
    .cx-is-table th {
      background: var(--cx-surface-2);
      padding: 10px 16px;
      text-align: left;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--cx-text-muted);
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-is-table td {
      padding: 10px 16px;
      border-bottom: 1px solid var(--cx-border);
      font-size: 13px;
      color: var(--cx-text);
    }
    .cx-is-table tbody tr:last-child td { border-bottom: none; }
    .cx-is-right { text-align: right; }
    .cx-is-muted { color: var(--cx-text-muted); font-size: 12px; }
    .cx-is-acct-code {
      display: inline-block;
      padding: 1px 6px;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      color: var(--cx-text-secondary);
      margin-right: 8px;
    }

    .cx-is-section-row td {
      background: var(--cx-surface-2);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cx-text-muted);
      padding: 8px 16px;
    }
    .cx-is-empty-section {
      color: var(--cx-text-muted);
      font-style: italic;
      text-align: center;
      padding: 14px 16px !important;
    }
    .cx-is-subtotal-row td {
      font-weight: 600;
      background: var(--cx-surface-2);
      border-top: 1px solid var(--cx-border);
    }
    .cx-is-total-row td {
      font-weight: 700;
      background: var(--cx-surface);
      border-top: 2px solid var(--cx-text);
      font-size: 14px;
      padding: 12px 16px;
    }
    .cx-is-income { color: var(--cx-success, #16a34a); }
    .cx-is-expense { color: var(--cx-danger, #dc2626); }
    .cx-is-profit { color: var(--cx-success, #16a34a); }
    .cx-is-loss { color: var(--cx-danger, #dc2626); }

    .cx-is-footer {
      font-size: 11px;
      color: var(--cx-text-muted);
      padding: 4px 2px;
    }

    .cx-is-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 48px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      color: var(--cx-text-secondary);
      font-size: 13px;
    }
    .cx-is-spin { animation: cx-is-spin 1s linear infinite; }
    @keyframes cx-is-spin { to { transform: rotate(360deg); } }
  `],
})
export class IncomeStatementComponent implements OnInit {
  readonly guide = INCOME_STATEMENT_GUIDE;

  data = signal<any>(null);
  loading = signal(true);
  from = '';
  to = '';

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() {
    // Default: first of current month → today
    const today = new Date();
    this.to = today.toISOString().slice(0, 10);
    this.from = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString().slice(0, 10);
    this.load();
  }

  load() {
    if (!this.from || !this.to) return;
    this.loading.set(true);
    this.api.get('/reports/income-statement', { from: this.from, to: this.to }).subscribe({
      next: r => {
        this.data.set(r.data);
        this.loading.set(false);
      },
      error: e => {
        this.loading.set(false);
        this.toast.error(e.error?.message || 'Failed to load income statement');
      },
    });
  }

  /**
   * Period shortcuts — sets from/to and reloads. Computed locally to
   * avoid round-trip for date math, which is trivial in JS.
   */
  shortcut(kind: 'this-month' | 'last-month' | 'ytd' | 'last-year') {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    let from: Date, to: Date;
    switch (kind) {
      case 'this-month':
        from = new Date(y, m, 1);
        to = today;
        break;
      case 'last-month':
        from = new Date(y, m - 1, 1);
        to = new Date(y, m, 0); // last day of previous month
        break;
      case 'ytd':
        from = new Date(y, 0, 1);
        to = today;
        break;
      case 'last-year':
        from = new Date(y - 1, 0, 1);
        to = new Date(y - 1, 11, 31);
        break;
    }
    this.from = from.toISOString().slice(0, 10);
    this.to = to.toISOString().slice(0, 10);
    this.load();
  }

  generatedAt(): string {
    const ts = this.data()?.generated_at;
    if (!ts) return '—';
    try { return new Date(ts).toLocaleString(); } catch { return ts; }
  }

  /**
   * CSV export — structured to mirror the on-screen statement:
   *   Header row with period
   *   Revenue section + subtotal
   *   Expense section + subtotal
   *   Net Income grand total
   */
  exportCsv() {
    const d = this.data();
    if (!d) return;

    const escape = (v: any) => {
      if (v == null) return '';
      const s = String(v);
      if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };

    const rows: string[] = [];
    rows.push(escape('Income Statement') + ',' + escape(d.period?.label || ''));
    rows.push(escape(`Period: ${d.period?.from} to ${d.period?.to}`));
    rows.push('');
    rows.push(['Account Code', 'Account Name', 'Debits', 'Credits', 'Balance'].join(','));

    rows.push('Revenue');
    for (const a of d.revenue.accounts) {
      rows.push([a.code, a.name, a.total_dr, a.total_cr, a.balance].map(escape).join(','));
    }
    rows.push(['', 'Total Revenue', '', '', d.revenue.total].map(escape).join(','));
    rows.push('');

    rows.push('Expenses');
    for (const a of d.expenses.accounts) {
      rows.push([a.code, a.name, a.total_dr, a.total_cr, a.balance].map(escape).join(','));
    }
    rows.push(['', 'Total Expenses', '', '', d.expenses.total].map(escape).join(','));
    rows.push('');

    rows.push(['', 'NET INCOME', '', '', d.net_income].map(escape).join(','));

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `income-statement-${d.period?.from}-to-${d.period?.to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.toast.success('Exported income statement');
  }
}
