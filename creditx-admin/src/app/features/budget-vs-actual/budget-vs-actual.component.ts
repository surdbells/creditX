import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { SearchableSelectDirective } from '../../shared/directives/searchable-select.directive';
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import { PageGuide } from '../../shared/guide/page-guide.model';

/**
 * Budget vs Actual report.
 *
 * Compares budgeted amounts (set via /budgets) against actual posted
 * activity for a given month. Shows income and expense sections
 * separately with per-account variance and variance percentage.
 *
 * Variance semantics:
 *   - Income section:  positive variance = GOOD (exceeded target)
 *   - Expense section: positive variance = BAD (overspent)
 *
 * Unbudgeted accounts (activity without a budget line) render with
 * 'Unbudgeted' instead of a variance percentage.
 *
 * Gated by accounting.view.
 */
const BUDGET_VS_ACTUAL_GUIDE: PageGuide = {
  id: 'budget-vs-actual',
  titleKey: 'Budget vs Actual',
  purposeKey: 'Compares what was budgeted against what was actually posted, and shows the variance.',
  descriptionKey:
    'This is where a budget earns its keep. Actuals come from the ledger, so the comparison is only '
    + 'as meaningful as the postings behind it — a variance is often a coding error rather than a '
    + 'performance problem, and it is worth checking which before acting.',
  actionKeys: [
    'Compare a period against its budget',
    'Find the accounts with the largest variances',
    'Drill from a variance into the postings behind it',
  ],
  dependsOnKeys: ['Budgets', 'Journal Entries'],
  businessRuleKeys: [
    'Actuals are read from posted journals, so an unposted or mis-coded entry shows as a variance.',
    'An account with no budget shows its full actual as a variance — that is missing data, not overspend.',
    'Comparing an open period is provisional; entries can still land in it.',
  ],
  tipKeys: [
    'Investigate the largest variances by value, not by percentage. A 400% variance on a trivial account rarely matters.',
    'Check the coding before concluding anything — a cost posted to the wrong account creates two variances, not one.',
  ],
  permissionKeys: ['accounting.view'],
};

@Component({
  selector: 'app-budget-vs-actual',
  standalone: true,
  imports: [SearchableSelectDirective, CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, MoneyPipe, PageGuideComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Budget vs Actual"
        subtitle="Compare budgeted targets against actual posted activity"
        eyebrow="Financial Reports">
        <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="load()" [disabled]="loading()">
          <lucide-icon name="refresh-cw" [size]="14"></lucide-icon>
          <span>{{ loading() ? 'Loading…' : 'Refresh' }}</span>
        </button>
        <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="exportCsv()" [disabled]="!data()">
          <lucide-icon name="download" [size]="14"></lucide-icon>
          <span>Export CSV</span>
        </button>
      </cx-page-header>

      <cx-page-guide [guide]="guide"></cx-page-guide>

      <div class="cx-bv-controls">
        <label>
          <span>Year</span>
          <input type="number" class="cx-input" min="2000" max="2099"
                 [(ngModel)]="year" (change)="load()" style="width:100px" />
        </label>
        <label>
          <span>Month</span>
          <select class="cx-input" [(ngModel)]="month" (change)="load()">
            @for (m of months; track m.value) {
              <option [value]="m.value">{{ m.label }}</option>
            }
          </select>
        </label>
      </div>

      @if (loading()) {
        <div class="cx-bv-loading">
          <lucide-icon name="loader-2" [size]="20" class="cx-bv-spin"></lucide-icon>
          <span>Computing variance…</span>
        </div>
      } @else if (data(); as d) {
        <!-- Summary strip -->
        <div class="cx-bv-summary">
          <div class="cx-bv-sum-cell">
            <div class="cx-bv-sum-label">Budgeted Net Income</div>
            <div class="cx-bv-sum-value tabular-nums">
              @if (+d.summary.net_budget_income >= 0) {
                {{ d.summary.net_budget_income | money:2 }}
              } @else {
                ({{ (-d.summary.net_budget_income) | money:2 }})
              }
            </div>
          </div>
          <div class="cx-bv-sum-cell">
            <div class="cx-bv-sum-label">Actual Net Income</div>
            <div class="cx-bv-sum-value tabular-nums">
              @if (+d.summary.net_actual_income >= 0) {
                {{ d.summary.net_actual_income | money:2 }}
              } @else {
                ({{ (-d.summary.net_actual_income) | money:2 }})
              }
            </div>
          </div>
          <div class="cx-bv-sum-cell">
            <div class="cx-bv-sum-label">Net Variance</div>
            <div class="cx-bv-sum-value tabular-nums"
                 [class.cx-bv-good]="+d.summary.net_variance >= 0"
                 [class.cx-bv-bad]="+d.summary.net_variance < 0">
              @if (+d.summary.net_variance >= 0) {
                +{{ d.summary.net_variance | money:2 }}
              } @else {
                −{{ (-d.summary.net_variance) | money:2 }}
              }
            </div>
          </div>
          <div class="cx-bv-sum-cell" style="align-self:center; margin-left:auto">
            <div class="cx-bv-period">{{ d.period_label }}</div>
          </div>
        </div>

        <!-- Income section -->
        <div class="cx-bv-section">
          <div class="cx-bv-section-head">
            <h3>Revenue</h3>
            <div class="cx-bv-section-totals">
              <span>Budget: <strong class="tabular-nums">{{ d.income.totals.budget | money }}</strong></span>
              <span>Actual: <strong class="tabular-nums">{{ d.income.totals.actual | money }}</strong></span>
              <span [class.cx-bv-good]="+d.income.totals.variance >= 0" [class.cx-bv-bad]="+d.income.totals.variance < 0">
                Variance: <strong class="tabular-nums">
                  @if (+d.income.totals.variance >= 0) { +{{ d.income.totals.variance | money }} }
                  @else { −{{ (-d.income.totals.variance) | money }} }
                </strong>
                @if (d.income.totals.variance_pct != null) {
                  ({{ d.income.totals.variance_pct > 0 ? '+' : '' }}{{ d.income.totals.variance_pct | number:'1.1-1' }}%)
                }
              </span>
            </div>
          </div>
          @if (d.income.rows.length === 0) {
            <div class="cx-bv-empty">No income accounts with budget or activity.</div>
          } @else {
            <table class="cx-bv-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th class="cx-bv-right">Budget</th>
                  <th class="cx-bv-right">Actual</th>
                  <th class="cx-bv-right">Variance</th>
                  <th class="cx-bv-right">%</th>
                </tr>
              </thead>
              <tbody>
                @for (r of d.income.rows; track r.gl_id) {
                  <tr>
                    <td>
                      <span class="cx-bv-code">{{ r.gl_code }}</span>
                      <span>{{ r.gl_name }}</span>
                      @if (!r.has_budget) {
                        <span class="cx-bv-unbudgeted">Unbudgeted</span>
                      }
                    </td>
                    <td class="cx-bv-right tabular-nums">{{ r.budget | money:2 }}</td>
                    <td class="cx-bv-right tabular-nums">{{ r.actual | money:2 }}</td>
                    <td class="cx-bv-right tabular-nums"
                        [class.cx-bv-good]="+r.variance >= 0"
                        [class.cx-bv-bad]="+r.variance < 0">
                      @if (+r.variance >= 0) { +{{ r.variance | money:2 }} }
                      @else { −{{ (-r.variance) | money:2 }} }
                    </td>
                    <td class="cx-bv-right tabular-nums">
                      @if (r.variance_pct != null) {
                        <span [class.cx-bv-good]="r.variance_pct >= 0" [class.cx-bv-bad]="r.variance_pct < 0">
                          {{ r.variance_pct > 0 ? '+' : '' }}{{ r.variance_pct | number:'1.1-1' }}%
                        </span>
                      } @else { <span class="cx-bv-muted">—</span> }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>

        <!-- Expense section -->
        <div class="cx-bv-section">
          <div class="cx-bv-section-head cx-bv-section-expense">
            <h3>Expenses</h3>
            <div class="cx-bv-section-totals">
              <span>Budget: <strong class="tabular-nums">{{ d.expense.totals.budget | money }}</strong></span>
              <span>Actual: <strong class="tabular-nums">{{ d.expense.totals.actual | money }}</strong></span>
              <!-- For expense: positive variance = overspent = BAD -->
              <span [class.cx-bv-bad]="+d.expense.totals.variance > 0" [class.cx-bv-good]="+d.expense.totals.variance <= 0">
                Variance: <strong class="tabular-nums">
                  @if (+d.expense.totals.variance >= 0) { +{{ d.expense.totals.variance | money }} }
                  @else { −{{ (-d.expense.totals.variance) | money }} }
                </strong>
                @if (d.expense.totals.variance_pct != null) {
                  ({{ d.expense.totals.variance_pct > 0 ? '+' : '' }}{{ d.expense.totals.variance_pct | number:'1.1-1' }}%)
                }
              </span>
            </div>
          </div>
          @if (d.expense.rows.length === 0) {
            <div class="cx-bv-empty">No expense accounts with budget or activity.</div>
          } @else {
            <table class="cx-bv-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th class="cx-bv-right">Budget</th>
                  <th class="cx-bv-right">Actual</th>
                  <th class="cx-bv-right">Variance</th>
                  <th class="cx-bv-right">%</th>
                </tr>
              </thead>
              <tbody>
                @for (r of d.expense.rows; track r.gl_id) {
                  <tr>
                    <td>
                      <span class="cx-bv-code">{{ r.gl_code }}</span>
                      <span>{{ r.gl_name }}</span>
                      @if (!r.has_budget) {
                        <span class="cx-bv-unbudgeted">Unbudgeted</span>
                      }
                    </td>
                    <td class="cx-bv-right tabular-nums">{{ r.budget | money:2 }}</td>
                    <td class="cx-bv-right tabular-nums">{{ r.actual | money:2 }}</td>
                    <!-- Expense: positive variance is overspending, colour inverted -->
                    <td class="cx-bv-right tabular-nums"
                        [class.cx-bv-bad]="+r.variance > 0"
                        [class.cx-bv-good]="+r.variance <= 0">
                      @if (+r.variance >= 0) { +{{ r.variance | money:2 }} }
                      @else { −{{ (-r.variance) | money:2 }} }
                    </td>
                    <td class="cx-bv-right tabular-nums">
                      @if (r.variance_pct != null) {
                        <span [class.cx-bv-bad]="r.variance_pct > 0" [class.cx-bv-good]="r.variance_pct <= 0">
                          {{ r.variance_pct > 0 ? '+' : '' }}{{ r.variance_pct | number:'1.1-1' }}%
                        </span>
                      } @else { <span class="cx-bv-muted">—</span> }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>

        <div class="cx-bv-footer">
          Generated {{ generatedAt() }} ·
          <a [href]="'/budgets?year=' + year + '&month=' + month" style="color:inherit;text-decoration:underline">
            Edit budgets for this period
          </a>
        </div>
      }
    </div>
  `,
  styles: [`
    .cx-bv-controls {
      display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap;
      padding: 14px 16px;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
    }
    .cx-bv-controls label {
      display: flex; flex-direction: column; gap: 4px;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-bv-controls input, .cx-bv-controls select {
      font-size: 13px; padding: 6px 10px;
    }

    .cx-bv-summary {
      display: flex; gap: 20px; flex-wrap: wrap;
      padding: 14px 18px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
    }
    .cx-bv-sum-cell { display: flex; flex-direction: column; gap: 2px; }
    .cx-bv-sum-label {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-bv-sum-value {
      font-size: 18px; font-weight: 600;
      color: var(--cx-text);
    }
    .cx-bv-period {
      font-size: 15px; font-weight: 600;
      color: var(--cx-text-secondary);
    }

    .cx-bv-section {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      overflow: hidden;
      margin-bottom: 14px;
    }
    .cx-bv-section-head {
      display: flex; justify-content: space-between; align-items: center;
      gap: 14px; flex-wrap: wrap;
      padding: 12px 16px;
      background: rgba(22, 163, 74, 0.06);
      border-bottom: 1px solid rgba(22, 163, 74, 0.25);
    }
    .cx-bv-section-head h3 {
      margin: 0;
      font-size: 12px; font-weight: 700;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: #15803d;
    }
    .cx-bv-section-expense {
      background: rgba(234, 88, 12, 0.06);
      border-bottom-color: rgba(234, 88, 12, 0.25);
    }
    .cx-bv-section-expense h3 { color: #c2410c; }
    .cx-bv-section-totals {
      display: flex; gap: 16px; flex-wrap: wrap;
      font-size: 12px;
      color: var(--cx-text-secondary);
    }
    .cx-bv-section-totals strong { color: var(--cx-text); font-weight: 600; }

    .cx-bv-table { width: 100%; border-collapse: collapse; }
    .cx-bv-table th {
      background: var(--cx-surface-2);
      padding: 10px 16px;
      text-align: left;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--cx-text-muted);
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-bv-table td {
      padding: 10px 16px;
      border-bottom: 1px solid var(--cx-border);
      font-size: 13px;
      color: var(--cx-text);
    }
    .cx-bv-table tbody tr:last-child td { border-bottom: none; }
    .cx-bv-right { text-align: right; }
    .cx-bv-code {
      display: inline-block;
      padding: 1px 6px;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: 4px;
      font-size: 11px; font-weight: 600;
      color: var(--cx-text-secondary);
      margin-right: 8px;
    }
    .cx-bv-unbudgeted {
      display: inline-block;
      padding: 1px 6px;
      background: rgba(234, 179, 8, 0.15);
      color: #a16207;
      border-radius: 999px;
      font-size: 10px; font-weight: 600;
      margin-left: 6px;
    }
    .cx-bv-good { color: var(--cx-success, #16a34a); }
    .cx-bv-bad { color: var(--cx-danger, #dc2626); }
    .cx-bv-muted { color: var(--cx-text-muted); }

    .cx-bv-empty {
      padding: 24px;
      text-align: center;
      color: var(--cx-text-muted);
      font-style: italic;
      font-size: 13px;
    }
    .cx-bv-footer {
      font-size: 11px;
      color: var(--cx-text-muted);
      padding: 4px 2px;
    }
    .cx-bv-loading {
      display: flex; align-items: center; justify-content: center;
      gap: 10px;
      padding: 48px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      color: var(--cx-text-secondary);
      font-size: 13px;
    }
    .cx-bv-spin { animation: cx-bv-spin 1s linear infinite; }
    @keyframes cx-bv-spin { to { transform: rotate(360deg); } }
  `],
})
export class BudgetVsActualComponent implements OnInit {
  readonly guide = BUDGET_VS_ACTUAL_GUIDE;

  data = signal<any>(null);
  loading = signal(true);
  year: number = new Date().getFullYear();
  month: string = String(new Date().getMonth() + 1).padStart(2, '0');

  months = [
    { value: '01', label: 'January' },   { value: '02', label: 'February' },
    { value: '03', label: 'March' },     { value: '04', label: 'April' },
    { value: '05', label: 'May' },       { value: '06', label: 'June' },
    { value: '07', label: 'July' },      { value: '08', label: 'August' },
    { value: '09', label: 'September' }, { value: '10', label: 'October' },
    { value: '11', label: 'November' },  { value: '12', label: 'December' },
  ];

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.get('/reports/budget-vs-actual', {
      year: String(this.year), month: this.month,
    }).subscribe({
      next: r => { this.data.set(r.data); this.loading.set(false); },
      error: e => {
        this.loading.set(false);
        this.toast.error(e.error?.message || 'Failed to load budget vs actual');
      },
    });
  }

  generatedAt(): string {
    const ts = this.data()?.generated_at;
    if (!ts) return '—';
    try { return new Date(ts).toLocaleString(); } catch { return ts; }
  }

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
    rows.push(escape(`Budget vs Actual — ${d.period_label}`));
    rows.push('');
    rows.push(['Section', 'Account Code', 'Account Name', 'Budget', 'Actual', 'Variance', 'Variance %', 'Has Budget'].join(','));

    for (const r of d.income.rows) {
      rows.push(['Revenue', r.gl_code, r.gl_name, r.budget, r.actual, r.variance,
        r.variance_pct != null ? r.variance_pct + '%' : 'Unbudgeted',
        r.has_budget ? 'Yes' : 'No'].map(escape).join(','));
    }
    rows.push(['Revenue', '', 'Total Revenue', d.income.totals.budget, d.income.totals.actual,
      d.income.totals.variance, d.income.totals.variance_pct != null ? d.income.totals.variance_pct + '%' : '', ''].map(escape).join(','));
    rows.push('');

    for (const r of d.expense.rows) {
      rows.push(['Expense', r.gl_code, r.gl_name, r.budget, r.actual, r.variance,
        r.variance_pct != null ? r.variance_pct + '%' : 'Unbudgeted',
        r.has_budget ? 'Yes' : 'No'].map(escape).join(','));
    }
    rows.push(['Expense', '', 'Total Expenses', d.expense.totals.budget, d.expense.totals.actual,
      d.expense.totals.variance, d.expense.totals.variance_pct != null ? d.expense.totals.variance_pct + '%' : '', ''].map(escape).join(','));
    rows.push('');

    rows.push(['Summary', '', 'Budgeted Net Income', '', '', d.summary.net_budget_income, '', ''].map(escape).join(','));
    rows.push(['Summary', '', 'Actual Net Income', '', '', d.summary.net_actual_income, '', ''].map(escape).join(','));
    rows.push(['Summary', '', 'Net Variance', '', '', d.summary.net_variance, '', ''].map(escape).join(','));

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-vs-actual-${this.year}-${this.month}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.toast.success('Exported budget vs actual');
  }
}
