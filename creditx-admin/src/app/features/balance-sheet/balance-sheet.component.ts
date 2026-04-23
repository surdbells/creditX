import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

/**
 * Balance Sheet — Assets / Liabilities / Equity snapshot as of a
 * specified date, with the fundamental accounting equation check:
 *
 *     Assets = Liabilities + Equity
 *
 * Layout: two columns on desktop — Assets on the left, Liabilities +
 * Equity on the right. On mobile the columns stack vertically. The
 * accounting equation is shown in a strip at the bottom with a
 * 'Balanced' / 'Unbalanced' indicator.
 *
 * Retained Earnings is computed on the fly (cumulative income −
 * expense through as_of) until month-end close (commit AF) adds an
 * explicit closing journal.
 *
 * Gated by accounting.view.
 */
@Component({
  selector: 'app-balance-sheet',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Balance Sheet"
        subtitle="Assets, liabilities, and equity as of a selected date"
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

      <div class="cx-bs-period">
        <label>
          <span>As of</span>
          <input type="date" class="cx-input" [(ngModel)]="asOf" (change)="load()" />
        </label>
        <div class="cx-bs-shortcuts">
          <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="shortcut('today')">Today</button>
          <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="shortcut('end-of-last-month')">End of Last Month</button>
          <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="shortcut('end-of-last-year')">End of Last Year</button>
        </div>
      </div>

      @if (loading()) {
        <div class="cx-bs-loading">
          <lucide-icon name="loader-2" [size]="20" class="cx-bs-spin"></lucide-icon>
          <span>Computing balance sheet…</span>
        </div>
      } @else if (data(); as d) {
        <!-- Two columns: Assets | (Liabilities + Equity) -->
        <div class="cx-bs-grid">
          <!-- Assets column -->
          <div class="cx-bs-col">
            <div class="cx-bs-section-head cx-bs-head-assets">
              <h3>Assets</h3>
              <div class="tabular-nums">₦{{ d.assets.total | number:'1.2-2' }}</div>
            </div>
            @if (d.assets.accounts.length === 0) {
              <div class="cx-bs-empty">No asset accounts with activity.</div>
            } @else {
              <table class="cx-bs-table">
                <tbody>
                  @for (a of d.assets.accounts; track a.id) {
                    <tr>
                      <td>
                        <span class="cx-bs-acct-code">{{ a.code }}</span>
                        <span>{{ a.name }}</span>
                      </td>
                      <td class="cx-bs-right tabular-nums">₦{{ a.balance | number:'1.2-2' }}</td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total Assets</td>
                    <td class="cx-bs-right tabular-nums">₦{{ d.assets.total | number:'1.2-2' }}</td>
                  </tr>
                </tfoot>
              </table>
            }
          </div>

          <!-- Liabilities + Equity column -->
          <div class="cx-bs-col">
            <div class="cx-bs-section-head cx-bs-head-liab">
              <h3>Liabilities</h3>
              <div class="tabular-nums">₦{{ d.liabilities.total | number:'1.2-2' }}</div>
            </div>
            @if (d.liabilities.accounts.length === 0) {
              <div class="cx-bs-empty">No liability accounts with activity.</div>
            } @else {
              <table class="cx-bs-table">
                <tbody>
                  @for (a of d.liabilities.accounts; track a.id) {
                    <tr>
                      <td>
                        <span class="cx-bs-acct-code">{{ a.code }}</span>
                        <span>{{ a.name }}</span>
                      </td>
                      <td class="cx-bs-right tabular-nums">₦{{ a.balance | number:'1.2-2' }}</td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total Liabilities</td>
                    <td class="cx-bs-right tabular-nums">₦{{ d.liabilities.total | number:'1.2-2' }}</td>
                  </tr>
                </tfoot>
              </table>
            }

            <div class="cx-bs-section-head cx-bs-head-equity">
              <h3>Equity</h3>
              <div class="tabular-nums">₦{{ d.equity.total | number:'1.2-2' }}</div>
            </div>
            <table class="cx-bs-table">
              <tbody>
                @for (a of d.equity.accounts; track a.id) {
                  <tr>
                    <td>
                      <span class="cx-bs-acct-code">{{ a.code }}</span>
                      <span>{{ a.name }}</span>
                    </td>
                    <td class="cx-bs-right tabular-nums">₦{{ a.balance | number:'1.2-2' }}</td>
                  </tr>
                }
                <tr class="cx-bs-retained-row">
                  <td>
                    <span>Retained Earnings</span>
                    <span class="cx-bs-retained-hint">(income − expense to date)</span>
                  </td>
                  <td class="cx-bs-right tabular-nums"
                      [class.cx-bs-value-loss]="+d.equity.retained_earnings < 0">
                    @if (+d.equity.retained_earnings >= 0) {
                      ₦{{ d.equity.retained_earnings | number:'1.2-2' }}
                    } @else {
                      (₦{{ (-d.equity.retained_earnings) | number:'1.2-2' }})
                    }
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td>Total Equity</td>
                  <td class="cx-bs-right tabular-nums">₦{{ d.equity.total | number:'1.2-2' }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <!-- Accounting equation check -->
        <div class="cx-bs-equation"
             [class.cx-bs-equation-ok]="d.accounting_equation.is_balanced"
             [class.cx-bs-equation-fail]="!d.accounting_equation.is_balanced">
          <div class="cx-bs-equation-head">
            @if (d.accounting_equation.is_balanced) {
              <lucide-icon name="check-circle" [size]="18"></lucide-icon>
              <span><strong>Balanced.</strong> The accounting equation holds.</span>
            } @else {
              <lucide-icon name="info" [size]="18"></lucide-icon>
              <span><strong>Unbalanced.</strong> Assets do not equal Liabilities + Equity. Run GL Reconciliation to investigate.</span>
            }
          </div>
          <div class="cx-bs-equation-formula">
            <div class="cx-bs-eq-part">
              <div class="cx-bs-eq-label">Assets</div>
              <div class="cx-bs-eq-value tabular-nums">₦{{ d.accounting_equation.assets_total | number:'1.2-2' }}</div>
            </div>
            <div class="cx-bs-eq-op">=</div>
            <div class="cx-bs-eq-part">
              <div class="cx-bs-eq-label">Liabilities + Equity</div>
              <div class="cx-bs-eq-value tabular-nums">₦{{ d.accounting_equation.liabilities_plus_equity | number:'1.2-2' }}</div>
            </div>
            @if (!d.accounting_equation.is_balanced) {
              <div class="cx-bs-eq-op">Δ</div>
              <div class="cx-bs-eq-part">
                <div class="cx-bs-eq-label">Difference</div>
                <div class="cx-bs-eq-value cx-bs-value-loss tabular-nums">₦{{ absDiff() | number:'1.2-2' }}</div>
              </div>
            }
          </div>
        </div>

        <div class="cx-bs-footer">
          Generated {{ generatedAt() }} · balances as of end-of-day on {{ d.as_of }}
        </div>
      }
    </div>
  `,
  styles: [`
    .cx-bs-period {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
      flex-wrap: wrap;
      padding: 14px 16px;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
    }
    .cx-bs-period label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-bs-period input { font-size: 13px; padding: 6px 10px; }
    .cx-bs-shortcuts { display: flex; gap: 4px; flex-wrap: wrap; }

    /* Two-column grid — Assets | (Liab + Equity) */
    .cx-bs-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 14px;
    }
    @media (max-width: 840px) {
      .cx-bs-grid { grid-template-columns: 1fr; }
    }
    .cx-bs-col { display: flex; flex-direction: column; gap: 10px; }

    .cx-bs-section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-radius: var(--cx-radius-md);
      border: 1px solid var(--cx-border);
    }
    .cx-bs-section-head h3 {
      margin: 0;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cx-text);
    }
    .cx-bs-section-head > div {
      font-size: 16px;
      font-weight: 600;
      color: var(--cx-text);
    }
    .cx-bs-head-assets { background: rgba(22, 163, 74, 0.06); border-color: rgba(22, 163, 74, 0.25); }
    .cx-bs-head-assets h3 { color: #15803d; }
    .cx-bs-head-liab { background: rgba(234, 88, 12, 0.06); border-color: rgba(234, 88, 12, 0.25); }
    .cx-bs-head-liab h3 { color: #c2410c; }
    .cx-bs-head-equity { background: rgba(59, 130, 246, 0.06); border-color: rgba(59, 130, 246, 0.25); }
    .cx-bs-head-equity h3 { color: #1d4ed8; }

    .cx-bs-table {
      width: 100%;
      border-collapse: collapse;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      overflow: hidden;
    }
    .cx-bs-table td {
      padding: 10px 16px;
      border-bottom: 1px solid var(--cx-border);
      font-size: 13px;
      color: var(--cx-text);
    }
    .cx-bs-table tbody tr:last-child td { border-bottom: 1px solid var(--cx-border); }
    .cx-bs-right { text-align: right; }
    .cx-bs-acct-code {
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
    .cx-bs-table tfoot td {
      background: var(--cx-surface-2);
      font-weight: 600;
      border-bottom: none;
    }

    .cx-bs-retained-row td { background: rgba(59, 130, 246, 0.04); }
    .cx-bs-retained-hint {
      font-size: 11px;
      color: var(--cx-text-muted);
      margin-left: 6px;
    }
    .cx-bs-value-loss { color: var(--cx-danger, #dc2626); }

    .cx-bs-empty {
      padding: 14px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      text-align: center;
      color: var(--cx-text-muted);
      font-style: italic;
      font-size: 13px;
    }

    /* Accounting equation check */
    .cx-bs-equation {
      padding: 14px 18px;
      border-radius: var(--cx-radius-md);
      margin-bottom: 10px;
    }
    .cx-bs-equation-ok {
      background: rgba(22, 163, 74, 0.08);
      color: #15803d;
    }
    .cx-bs-equation-fail {
      background: rgba(239, 68, 68, 0.08);
      color: var(--cx-danger, #dc2626);
    }
    .cx-bs-equation-head {
      display: flex; align-items: center; gap: 8px;
      font-size: 13px;
      margin-bottom: 10px;
    }
    .cx-bs-equation-formula {
      display: flex;
      gap: 14px;
      align-items: center;
      flex-wrap: wrap;
    }
    .cx-bs-eq-part { display: flex; flex-direction: column; gap: 2px; }
    .cx-bs-eq-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.75;
    }
    .cx-bs-eq-value {
      font-size: 16px;
      font-weight: 600;
    }
    .cx-bs-eq-op {
      font-size: 18px;
      font-weight: 300;
    }

    .cx-bs-footer {
      font-size: 11px;
      color: var(--cx-text-muted);
      padding: 4px 2px;
    }

    .cx-bs-loading {
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
    .cx-bs-spin { animation: cx-bs-spin 1s linear infinite; }
    @keyframes cx-bs-spin { to { transform: rotate(360deg); } }
  `],
})
export class BalanceSheetComponent implements OnInit {
  data = signal<any>(null);
  loading = signal(true);
  asOf = '';

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() {
    this.asOf = new Date().toISOString().slice(0, 10);
    this.load();
  }

  load() {
    if (!this.asOf) return;
    this.loading.set(true);
    this.api.get('/reports/balance-sheet', { as_of: this.asOf }).subscribe({
      next: r => {
        this.data.set(r.data);
        this.loading.set(false);
      },
      error: e => {
        this.loading.set(false);
        this.toast.error(e.error?.message || 'Failed to load balance sheet');
      },
    });
  }

  shortcut(kind: 'today' | 'end-of-last-month' | 'end-of-last-year') {
    const today = new Date();
    let d: Date;
    switch (kind) {
      case 'today':
        d = today;
        break;
      case 'end-of-last-month':
        // Day 0 of current month = last day of previous month
        d = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'end-of-last-year':
        d = new Date(today.getFullYear() - 1, 11, 31);
        break;
    }
    this.asOf = d.toISOString().slice(0, 10);
    this.load();
  }

  generatedAt(): string {
    const ts = this.data()?.generated_at;
    if (!ts) return '—';
    try { return new Date(ts).toLocaleString(); } catch { return ts; }
  }

  /**
   * Absolute difference for display (we show it as a positive
   * number labelled 'Difference' regardless of direction).
   */
  absDiff(): number {
    const diff = this.data()?.accounting_equation?.difference;
    return Math.abs(parseFloat(diff || '0'));
  }

  /**
   * CSV export — Assets on top, then Liabilities, then Equity,
   * then the accounting-equation check.
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
    rows.push(escape('Balance Sheet'));
    rows.push(escape(`As of: ${d.as_of}`));
    rows.push('');
    rows.push(['Account Code', 'Account Name', 'Balance'].join(','));

    rows.push('Assets');
    for (const a of d.assets.accounts) {
      rows.push([a.code, a.name, a.balance].map(escape).join(','));
    }
    rows.push(['', 'Total Assets', d.assets.total].map(escape).join(','));
    rows.push('');

    rows.push('Liabilities');
    for (const a of d.liabilities.accounts) {
      rows.push([a.code, a.name, a.balance].map(escape).join(','));
    }
    rows.push(['', 'Total Liabilities', d.liabilities.total].map(escape).join(','));
    rows.push('');

    rows.push('Equity');
    for (const a of d.equity.accounts) {
      rows.push([a.code, a.name, a.balance].map(escape).join(','));
    }
    rows.push(['', 'Retained Earnings', d.equity.retained_earnings].map(escape).join(','));
    rows.push(['', 'Total Equity', d.equity.total].map(escape).join(','));
    rows.push('');

    rows.push(['', 'Accounting Equation Check'].map(escape).join(','));
    rows.push(['', 'Assets', d.accounting_equation.assets_total].map(escape).join(','));
    rows.push(['', 'Liabilities + Equity', d.accounting_equation.liabilities_plus_equity].map(escape).join(','));
    rows.push(['', 'Difference', d.accounting_equation.difference].map(escape).join(','));
    rows.push(['', 'Balanced?', d.accounting_equation.is_balanced ? 'Yes' : 'No'].map(escape).join(','));

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `balance-sheet-${d.as_of}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.toast.success('Exported balance sheet');
  }
}
