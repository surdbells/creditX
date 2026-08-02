import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { SettingsService } from '../../core/services/settings.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import { PageGuide } from '../../shared/guide/page-guide.model';

/**
 * Statement of Cash Flows (IAS 7 indirect method).
 *
 * Three sections rendered top-to-bottom matching the SCF response shape:
 *   - Operating Activities — net income + non-cash adjustments + working
 *     capital changes. The detail rows here are the substantive content
 *     of the report.
 *   - Investing Activities — currently empty with explanatory note
 *     (no PP&E tracking yet). Rendered for completeness per IAS 7.
 *   - Financing Activities — currently empty with explanatory note.
 *
 * Bottom: Net change in cash, opening/closing cash balances, and a
 * reconciliation difference line. The reconciliation IS the audit
 * signal — when non-zero, it means a cash-affecting posting wasn't
 * classified correctly. We surface it visually rather than hide it.
 *
 * Mirrors the IS component's UX: same period selector, same shortcuts,
 * same export pattern. Extends with section sub-tables and the
 * reconciliation footer.
 *
 * Defaults: from = first of current month, to = today. Same as IS.
 *
 * Gated by accounting.view at both menu and backend.
 */
const CASH_FLOW_GUIDE: PageGuide = {
  id: 'cash-flow',
  titleKey: 'Statement of Cash Flows',
  purposeKey: 'Where cash actually came from and went, as distinct from profit.',
  descriptionKey:
    'Profit and cash are not the same thing — interest can be earned without being received, and '
    + 'disbursing loans consumes cash without being an expense. This statement starts from the '
    + 'result for the period and adjusts it back to real money moved, split into operating, '
    + 'investing and financing activity, following the IAS 7 indirect method.',
  actionKeys: [
    'Run the cash flow for a period',
    'See which activity consumed or generated cash',
    'Export for the board or the auditor',
  ],
  dependsOnKeys: ['Income Statement', 'Balance Sheet', 'Journal Entries'],
  businessRuleKeys: [
    'It is derived, not posted — it is a rearrangement of the same journals behind the other statements.',
    'Disbursing loans consumes cash but is not an expense; collecting them generates cash but is not income. That is exactly the gap this statement explains.',
    'Non-cash charges such as provisions and depreciation are added back, because no money left.',
    'The closing cash figure must agree with the bank balances on the balance sheet.',
  ],
  tipKeys: [
    'A profitable institution can still run out of cash by lending faster than it collects. This is the statement that shows it coming.',
  ],
  permissionKeys: ['reports.financial'],
};

@Component({
  selector: 'app-cash-flow',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, MoneyPipe, PageGuideComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Statement of Cash Flows"
        subtitle="IAS 7 indirect method — reconciles net income to actual cash movement"
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

      <!-- Period selector (same shape as IS) -->
      <div class="cx-cf-period">
        <div class="cx-cf-period-row">
          <div class="cx-cf-period-dates">
            <label>
              <span>From</span>
              <input type="date" class="cx-input" [(ngModel)]="from" (change)="load()" />
            </label>
            <label>
              <span>To</span>
              <input type="date" class="cx-input" [(ngModel)]="to" (change)="load()" />
            </label>
          </div>
          <div class="cx-cf-period-shortcuts">
            <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="shortcut('this-month')">This Month</button>
            <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="shortcut('last-month')">Last Month</button>
            <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="shortcut('ytd')">YTD</button>
            <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="shortcut('last-year')">Last Year</button>
          </div>
        </div>
        @if (data()?.period?.label) {
          <div class="cx-cf-period-label">
            Showing: <strong>{{ data()?.period?.label }}</strong>
          </div>
        }
      </div>

      @if (loading()) {
        <div class="cx-cf-loading">
          <lucide-icon name="loader-2" [size]="20" class="cx-cf-spin"></lucide-icon>
          <span>Computing statement of cash flows…</span>
        </div>
      } @else if (data(); as d) {
        <!-- Hero row: net change in cash with reconciliation status -->
        <div class="cx-cf-hero">
          <div class="cx-cf-hero-cell"
               [class.cx-cf-hero-positive]="+d.net_change_in_cash >= 0"
               [class.cx-cf-hero-negative]="+d.net_change_in_cash < 0">
            <div class="cx-cf-hero-label">Net Change in Cash</div>
            <div class="cx-cf-hero-value tabular-nums">
              @if (+d.net_change_in_cash >= 0) {
                {{ d.net_change_in_cash | money:2 }}
              } @else {
                ({{ (-d.net_change_in_cash) | money:2 }})
              }
            </div>
            <div class="cx-cf-hero-meta">{{ +d.net_change_in_cash >= 0 ? 'Cash inflow' : 'Cash outflow' }}</div>
          </div>
          <div class="cx-cf-hero-cell">
            <div class="cx-cf-hero-label">Opening Cash</div>
            <div class="cx-cf-hero-value tabular-nums">{{ d.opening_cash | money:2 }}</div>
            <div class="cx-cf-hero-meta">{{ openingDateLabel() }}</div>
          </div>
          <div class="cx-cf-hero-cell">
            <div class="cx-cf-hero-label">Closing Cash</div>
            <div class="cx-cf-hero-value tabular-nums">{{ d.closing_cash | money:2 }}</div>
            <div class="cx-cf-hero-meta">{{ d.period?.to }}</div>
          </div>
        </div>

        <!-- Reconciliation banner: green if balanced, amber if not -->
        @if (d.is_balanced) {
          <div class="cx-cf-recon cx-cf-recon-ok">
            <lucide-icon name="check-circle" [size]="16"></lucide-icon>
            <span>Reconciled. Computed cash change matches actual BANK GL movement
              (difference: {{ d.reconciliation_difference | money:2 }}).</span>
          </div>
        } @else {
          <div class="cx-cf-recon cx-cf-recon-warn">
            <lucide-icon name="alert-triangle" [size]="16"></lucide-icon>
            <span>
              <strong>Reconciliation difference: {{ d.reconciliation_difference | money:2 }}.</strong>
              The computed net change in cash does not match the actual change in the BANK
              GL balance. This usually means a cash-affecting posting (e.g. a manual journal
              entry to BANK) wasn't classified into one of the sections below. Investigate
              before relying on this report for audit purposes.
            </span>
          </div>
        }

        <!-- Detail table: three sections -->
        <div class="cx-cf-table-wrap">
          <table class="cx-cf-table">
            <thead>
              <tr>
                <th>Line item</th>
                <th class="cx-cf-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <!-- Operating section -->
              <tr class="cx-cf-section-row">
                <td colspan="2">Operating Activities</td>
              </tr>

              <tr>
                <td><strong>Net income</strong></td>
                <td class="cx-cf-right tabular-nums">
                  @if (+d.operating.net_income >= 0) {
                    {{ d.operating.net_income | money:2 }}
                  } @else {
                    ({{ (-d.operating.net_income) | money:2 }})
                  }
                </td>
              </tr>

              <!-- Non-cash adjustments — shown indented under "Adjustments" subhead -->
              @if (d.operating.non_cash_adjustments?.length) {
                <tr class="cx-cf-subhead-row">
                  <td colspan="2">Adjustments for non-cash items</td>
                </tr>
                @for (a of d.operating.non_cash_adjustments; track a.label) {
                  <tr>
                    <td class="cx-cf-indent">
                      <span>{{ a.label }}</span>
                      @if (a.gl_code) {
                        <span class="cx-cf-acct-code">{{ a.gl_code }}</span>
                      }
                      @if (a.note) {
                        <div class="cx-cf-note">{{ a.note }}</div>
                      }
                    </td>
                    <td class="cx-cf-right tabular-nums">
                      @if (+a.amount >= 0) {
                        {{ a.amount | money:2 }}
                      } @else {
                        ({{ (-a.amount) | money:2 }})
                      }
                    </td>
                  </tr>
                }
              }

              <!-- Working capital changes — indented similarly -->
              @if (d.operating.working_capital_changes?.length) {
                <tr class="cx-cf-subhead-row">
                  <td colspan="2">Changes in working capital</td>
                </tr>
                @for (w of d.operating.working_capital_changes; track w.label) {
                  <tr>
                    <td class="cx-cf-indent">
                      <span>{{ w.label }}</span>
                      @if (w.gl_code) {
                        <span class="cx-cf-acct-code">{{ w.gl_code }}</span>
                      }
                      @if (w.note) {
                        <div class="cx-cf-note">{{ w.note }}</div>
                      }
                    </td>
                    <td class="cx-cf-right tabular-nums">
                      @if (+w.amount >= 0) {
                        {{ w.amount | money:2 }}
                      } @else {
                        ({{ (-w.amount) | money:2 }})
                      }
                    </td>
                  </tr>
                }
              }

              <!-- Operating section subtotal -->
              <tr class="cx-cf-subtotal-row">
                <td>Net cash from operating activities</td>
                <td class="cx-cf-right tabular-nums">
                  @if (+d.operating.total >= 0) {
                    <span class="cx-cf-positive">{{ d.operating.total | money:2 }}</span>
                  } @else {
                    <span class="cx-cf-negative">({{ (-d.operating.total) | money:2 }})</span>
                  }
                </td>
              </tr>

              <!-- Investing section -->
              <tr class="cx-cf-section-row">
                <td colspan="2">Investing Activities</td>
              </tr>
              <tr>
                <td colspan="2" class="cx-cf-empty-section">
                  {{ d.investing.note }}
                </td>
              </tr>
              <tr class="cx-cf-subtotal-row">
                <td>Net cash from investing activities</td>
                <td class="cx-cf-right tabular-nums">{{ d.investing.total | money:2 }}</td>
              </tr>

              <!-- Financing section -->
              <tr class="cx-cf-section-row">
                <td colspan="2">Financing Activities</td>
              </tr>
              <tr>
                <td colspan="2" class="cx-cf-empty-section">
                  {{ d.financing.note }}
                </td>
              </tr>
              <tr class="cx-cf-subtotal-row">
                <td>Net cash from financing activities</td>
                <td class="cx-cf-right tabular-nums">{{ d.financing.total | money:2 }}</td>
              </tr>

              <!-- Grand total -->
              <tr class="cx-cf-total-row">
                <td>NET CHANGE IN CASH</td>
                <td class="cx-cf-right tabular-nums"
                    [class.cx-cf-positive]="+d.net_change_in_cash >= 0"
                    [class.cx-cf-negative]="+d.net_change_in_cash < 0">
                  @if (+d.net_change_in_cash >= 0) {
                    {{ d.net_change_in_cash | money:2 }}
                  } @else {
                    ({{ (-d.net_change_in_cash) | money:2 }})
                  }
                </td>
              </tr>
              <tr>
                <td>Cash at beginning of period</td>
                <td class="cx-cf-right tabular-nums cx-cf-muted">{{ d.opening_cash | money:2 }}</td>
              </tr>
              <tr class="cx-cf-total-row">
                <td>Cash at end of period</td>
                <td class="cx-cf-right tabular-nums">{{ d.closing_cash | money:2 }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="cx-cf-footer">
          Generated {{ generatedAt() }} · indirect method per IAS 7 ·
          opening cash balance computed at end of {{ openingDateLabel() }}
        </div>
      }
    </div>
  `,
  styles: [`
    /* Period selector (mirrors IS exactly — copy not import to keep
       components self-contained) */
    .cx-cf-period {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px 16px;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
    }
    .cx-cf-period-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
      flex-wrap: wrap;
    }
    .cx-cf-period-dates { display: flex; gap: 12px; }
    .cx-cf-period-dates label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-cf-period-dates input { font-size: 13px; padding: 6px 10px; }
    .cx-cf-period-shortcuts { display: flex; gap: 4px; flex-wrap: wrap; }
    .cx-cf-period-label { font-size: 12px; color: var(--cx-text-secondary); }
    .cx-cf-period-label strong { color: var(--cx-text); font-weight: 600; }

    /* Hero: 3 cells, no operators (no math relationship between them) */
    .cx-cf-hero {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
      margin-bottom: 14px;
    }
    @media (max-width: 720px) {
      .cx-cf-hero { grid-template-columns: 1fr; }
    }
    .cx-cf-hero-cell {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .cx-cf-hero-positive { border-left: 3px solid var(--cx-success, #16a34a); }
    .cx-cf-hero-negative { border-left: 3px solid var(--cx-danger, #dc2626); }
    .cx-cf-hero-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-cf-hero-value {
      font-size: 22px;
      font-weight: 600;
      color: var(--cx-text);
    }
    .cx-cf-hero-meta { font-size: 11px; color: var(--cx-text-secondary); }

    /* Reconciliation banner */
    .cx-cf-recon {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 16px;
      border-radius: var(--cx-radius-md);
      border: 1px solid var(--cx-border);
      margin-bottom: 14px;
      font-size: 13px;
      line-height: 1.5;
    }
    .cx-cf-recon-ok {
      background: rgba(22, 163, 74, 0.06);
      border-color: rgba(22, 163, 74, 0.3);
      color: var(--cx-text);
    }
    .cx-cf-recon-ok lucide-icon { color: var(--cx-success, #16a34a); flex-shrink: 0; margin-top: 2px; }
    .cx-cf-recon-warn {
      background: rgba(217, 119, 6, 0.08);
      border-color: rgba(217, 119, 6, 0.4);
      color: var(--cx-text);
    }
    .cx-cf-recon-warn lucide-icon { color: var(--cx-warning, #d97706); flex-shrink: 0; margin-top: 2px; }

    /* Detail table */
    .cx-cf-table-wrap {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      overflow: hidden;
      margin-bottom: 10px;
    }
    .cx-cf-table { width: 100%; border-collapse: collapse; }
    .cx-cf-table th {
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
    .cx-cf-table td {
      padding: 10px 16px;
      border-bottom: 1px solid var(--cx-border);
      font-size: 13px;
      color: var(--cx-text);
      vertical-align: top;
    }
    .cx-cf-table tbody tr:last-child td { border-bottom: none; }
    .cx-cf-right { text-align: right; }
    .cx-cf-muted { color: var(--cx-text-muted); }

    .cx-cf-section-row td {
      background: var(--cx-surface-2);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cx-text-muted);
      padding: 8px 16px;
    }
    .cx-cf-subhead-row td {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: var(--cx-text-secondary);
      padding: 6px 16px;
      background: rgba(0,0,0,0.02);
    }
    .cx-cf-indent { padding-left: 32px !important; }
    .cx-cf-empty-section {
      color: var(--cx-text-muted);
      font-style: italic;
      padding: 14px 16px !important;
      font-size: 12px;
      line-height: 1.5;
    }
    .cx-cf-acct-code {
      display: inline-block;
      padding: 1px 6px;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      color: var(--cx-text-secondary);
      margin-left: 8px;
    }
    .cx-cf-note {
      font-size: 11px;
      color: var(--cx-text-muted);
      margin-top: 4px;
      line-height: 1.4;
    }
    .cx-cf-subtotal-row td {
      font-weight: 600;
      background: var(--cx-surface-2);
      border-top: 1px solid var(--cx-border);
    }
    .cx-cf-total-row td {
      font-weight: 700;
      background: var(--cx-surface);
      border-top: 2px solid var(--cx-text);
      font-size: 14px;
      padding: 12px 16px;
    }
    .cx-cf-positive { color: var(--cx-success, #16a34a); }
    .cx-cf-negative { color: var(--cx-danger, #dc2626); }

    .cx-cf-footer {
      font-size: 11px;
      color: var(--cx-text-muted);
      padding: 4px 2px;
    }
    .cx-cf-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 48px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      color: var(--cx-text-muted);
    }
    @keyframes cx-cf-spin { to { transform: rotate(360deg); } }
    .cx-cf-spin { animation: cx-cf-spin 1s linear infinite; }
  `],
})
export class CashFlowComponent implements OnInit {
  readonly guide = CASH_FLOW_GUIDE;

  loading = signal(false);
  data = signal<any>(null);

  // Use ISO date strings (YYYY-MM-DD) directly — matches the backend
  // contract and avoids JS Date timezone surprises.
  from = '';
  to = '';

  constructor(
    private api: ApiService,
    private toast: ToastService,
    public settings: SettingsService,
  ) {}

  ngOnInit() {
    const today = new Date();
    this.to = today.toISOString().slice(0, 10);
    this.from = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString().slice(0, 10);
    this.load();
  }

  load() {
    if (!this.from || !this.to) return;
    this.loading.set(true);
    this.api.get('/reports/statement-of-cash-flows', { from: this.from, to: this.to }).subscribe({
      next: (r: any) => {
        this.data.set(r.data);
        this.loading.set(false);
      },
      error: (e: any) => {
        this.loading.set(false);
        this.toast.error(e.error?.message || 'Failed to load statement of cash flows');
      },
    });
  }

  /**
   * Period shortcuts — same set as IS for consistency. Computed
   * locally to avoid round-trip for trivial date math.
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
   * Label for the opening-cash hero cell. Backend's opening_cash is
   * the BANK balance at (from − 1 day). We compute the label here
   * rather than asking the backend for it; saves a payload field
   * for a derived value.
   */
  openingDateLabel(): string {
    const fromStr = this.data()?.period?.from;
    if (!fromStr) return '—';
    const d = new Date(fromStr);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  /**
   * CSV export — renders the same structure as the on-screen view.
   * Indented rows use leading whitespace in the line-item column to
   * preserve hierarchy when the CSV is opened in Excel.
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
    rows.push(escape('Statement of Cash Flows') + ',' + escape(d.period?.label || ''));
    rows.push(escape(`Period: ${d.period?.from} to ${d.period?.to}`));
    rows.push(escape('Method: Indirect (IAS 7)'));
    rows.push('');
    rows.push(['Line item', 'Amount'].join(','));

    rows.push('Operating Activities');
    rows.push([escape('  Net income'), escape(d.operating.net_income)].join(','));
    if (d.operating.non_cash_adjustments?.length) {
      rows.push('  Adjustments for non-cash items');
      for (const a of d.operating.non_cash_adjustments) {
        rows.push([escape('    ' + a.label), escape(a.amount)].join(','));
      }
    }
    if (d.operating.working_capital_changes?.length) {
      rows.push('  Changes in working capital');
      for (const w of d.operating.working_capital_changes) {
        rows.push([escape('    ' + w.label), escape(w.amount)].join(','));
      }
    }
    rows.push([escape('Net cash from operating activities'), escape(d.operating.total)].join(','));
    rows.push('');

    rows.push('Investing Activities');
    rows.push([escape('  ' + (d.investing.note || 'Not applicable')), ''].join(','));
    rows.push([escape('Net cash from investing activities'), escape(d.investing.total)].join(','));
    rows.push('');

    rows.push('Financing Activities');
    rows.push([escape('  ' + (d.financing.note || 'Not applicable')), ''].join(','));
    rows.push([escape('Net cash from financing activities'), escape(d.financing.total)].join(','));
    rows.push('');

    rows.push([escape('NET CHANGE IN CASH'), escape(d.net_change_in_cash)].join(','));
    rows.push([escape('Cash at beginning of period'), escape(d.opening_cash)].join(','));
    rows.push([escape('Cash at end of period'), escape(d.closing_cash)].join(','));
    rows.push('');
    rows.push([escape('Reconciliation difference'), escape(d.reconciliation_difference)].join(','));
    rows.push([escape('Reconciled?'), escape(d.is_balanced ? 'Yes' : 'No — investigate')].join(','));

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.settings.brandSlug()}_StatementOfCashFlows_${d.period?.from}_to_${d.period?.to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.toast.success('Exported statement of cash flows');
  }
}
