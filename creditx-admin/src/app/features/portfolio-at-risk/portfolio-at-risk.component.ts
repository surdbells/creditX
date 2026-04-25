import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

/**
 * Portfolio At Risk (PAR) Report — PAR30/60/90 loan-level metrics.
 *
 * Loan-level aging: a loan counts toward PAR_N if any of its
 * installments is overdue by N+ days. The whole loan's outstanding
 * balance goes into the numerator.
 *
 * Industry-standard (CGAP / CBN) risk management metric. Distinct
 * from Aged Receivables which ages at the installment level.
 *
 * Gated by reports.par.
 */
@Component({
  selector: 'app-portfolio-at-risk',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, MoneyPipe],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Portfolio At Risk"
        subtitle="PAR30/60/90 — industry-standard risk metrics"
        eyebrow="Risk Reports">
        <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="load()" [disabled]="loading()">
          <lucide-icon name="refresh-cw" [size]="14"></lucide-icon>
          <span>{{ loading() ? 'Loading…' : 'Refresh' }}</span>
        </button>
        <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="exportCsv()" [disabled]="!data()">
          <lucide-icon name="download" [size]="14"></lucide-icon>
          <span>Export CSV</span>
        </button>
      </cx-page-header>

      <div class="cx-par-controls">
        <label>
          <span>As of</span>
          <input type="date" class="cx-input" [(ngModel)]="asOf" (change)="load()" />
        </label>
        <label>
          <span>Group by</span>
          <select class="cx-input" [(ngModel)]="groupBy" (change)="load()">
            <option value="total">Total (no breakdown)</option>
            <option value="product">By Product</option>
            <option value="branch">By Branch</option>
          </select>
        </label>
      </div>

      @if (loading()) {
        <div class="cx-par-loading">
          <lucide-icon name="loader-2" [size]="20" class="cx-par-spin"></lucide-icon>
          <span>Computing PAR…</span>
        </div>
      } @else if (data(); as d) {
        <!-- Portfolio summary -->
        <div class="cx-par-summary">
          <div class="cx-par-summary-cell">
            <div class="cx-par-summary-label">Active Loans</div>
            <div class="cx-par-summary-value tabular-nums">{{ d.portfolio.total_loans | number }}</div>
          </div>
          <div class="cx-par-summary-cell">
            <div class="cx-par-summary-label">Total Outstanding</div>
            <div class="cx-par-summary-value tabular-nums">{{ d.portfolio.total_outstanding | money }}</div>
          </div>
        </div>

        <!-- PAR30/60/90 cards -->
        <div class="cx-par-cards">
          <div class="cx-par-card" [attr.data-severity]="severityFor(d.par30.ratio_pct)">
            <div class="cx-par-card-head">
              <div class="cx-par-card-label">PAR30</div>
              <div class="cx-par-card-subtle">≥30 days overdue</div>
            </div>
            <div class="cx-par-card-ratio tabular-nums">{{ d.par30.ratio_pct | number:'1.2-2' }}%</div>
            <div class="cx-par-card-meta">
              <span>{{ d.par30.loans_at_risk }} loan{{ d.par30.loans_at_risk === 1 ? '' : 's' }}</span>
              <span class="tabular-nums">{{ d.par30.outstanding_at_risk | money }}</span>
            </div>
          </div>
          <div class="cx-par-card" [attr.data-severity]="severityFor(d.par60.ratio_pct)">
            <div class="cx-par-card-head">
              <div class="cx-par-card-label">PAR60</div>
              <div class="cx-par-card-subtle">≥60 days overdue</div>
            </div>
            <div class="cx-par-card-ratio tabular-nums">{{ d.par60.ratio_pct | number:'1.2-2' }}%</div>
            <div class="cx-par-card-meta">
              <span>{{ d.par60.loans_at_risk }} loan{{ d.par60.loans_at_risk === 1 ? '' : 's' }}</span>
              <span class="tabular-nums">{{ d.par60.outstanding_at_risk | money }}</span>
            </div>
          </div>
          <div class="cx-par-card" [attr.data-severity]="severityFor(d.par90.ratio_pct)">
            <div class="cx-par-card-head">
              <div class="cx-par-card-label">PAR90</div>
              <div class="cx-par-card-subtle">≥90 days overdue</div>
            </div>
            <div class="cx-par-card-ratio tabular-nums">{{ d.par90.ratio_pct | number:'1.2-2' }}%</div>
            <div class="cx-par-card-meta">
              <span>{{ d.par90.loans_at_risk }} loan{{ d.par90.loans_at_risk === 1 ? '' : 's' }}</span>
              <span class="tabular-nums">{{ d.par90.outstanding_at_risk | money }}</span>
            </div>
          </div>
        </div>

        <!-- Breakdown -->
        @if (d.breakdown.length > 0) {
          <div class="cx-par-table-wrap">
            <table class="cx-par-table">
              <thead>
                <tr>
                  <th>{{ d.group_by === 'product' ? 'Product' : 'Branch' }}</th>
                  <th class="cx-par-right">Loans</th>
                  <th class="cx-par-right">Outstanding</th>
                  <th class="cx-par-right">PAR30</th>
                  <th class="cx-par-right">PAR60</th>
                  <th class="cx-par-right">PAR90</th>
                </tr>
              </thead>
              <tbody>
                @for (b of d.breakdown; track b.label) {
                  <tr>
                    <td class="cx-par-b-label">{{ b.label }}</td>
                    <td class="cx-par-right tabular-nums">{{ b.loan_count }}</td>
                    <td class="cx-par-right tabular-nums">{{ b.outstanding | money }}</td>
                    <td class="cx-par-right tabular-nums" [attr.data-severity]="severityFor(b.par30_pct)">
                      {{ b.par30_pct | number:'1.2-2' }}%
                    </td>
                    <td class="cx-par-right tabular-nums" [attr.data-severity]="severityFor(b.par60_pct)">
                      {{ b.par60_pct | number:'1.2-2' }}%
                    </td>
                    <td class="cx-par-right tabular-nums" [attr.data-severity]="severityFor(b.par90_pct)">
                      {{ b.par90_pct | number:'1.2-2' }}%
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <div class="cx-par-footer">
          Generated {{ generatedAt() }} · PAR = (outstanding on at-risk loans) ÷ (total outstanding)
        </div>
      }
    </div>
  `,
  styles: [`
    .cx-par-controls {
      display: flex; gap: 16px; flex-wrap: wrap;
      padding: 14px 16px;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
    }
    .cx-par-controls label {
      display: flex; flex-direction: column; gap: 4px;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-par-controls input, .cx-par-controls select { font-size: 13px; padding: 6px 10px; }

    .cx-par-summary {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      padding: 12px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
    }
    .cx-par-summary-cell { display: flex; flex-direction: column; gap: 2px; }
    .cx-par-summary-label {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-par-summary-value {
      font-size: 18px; font-weight: 600;
      color: var(--cx-text);
    }

    .cx-par-cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 14px;
    }
    @media (max-width: 720px) {
      .cx-par-cards { grid-template-columns: 1fr; }
    }
    .cx-par-card {
      padding: 18px 20px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-left: 4px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      display: flex; flex-direction: column; gap: 8px;
    }
    .cx-par-card[data-severity="good"] { border-left-color: var(--cx-success, #16a34a); }
    .cx-par-card[data-severity="warn"] { border-left-color: #f59e0b; }
    .cx-par-card[data-severity="alert"] { border-left-color: var(--cx-danger, #dc2626); }
    .cx-par-card-head { display: flex; justify-content: space-between; align-items: center; }
    .cx-par-card-label {
      font-size: 12px; font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--cx-text);
    }
    .cx-par-card-subtle {
      font-size: 10px;
      color: var(--cx-text-muted);
    }
    .cx-par-card-ratio {
      font-size: 28px; font-weight: 600;
      color: var(--cx-text);
    }
    .cx-par-card[data-severity="good"] .cx-par-card-ratio { color: var(--cx-success, #16a34a); }
    .cx-par-card[data-severity="warn"] .cx-par-card-ratio { color: #b45309; }
    .cx-par-card[data-severity="alert"] .cx-par-card-ratio { color: var(--cx-danger, #dc2626); }
    .cx-par-card-meta {
      display: flex; justify-content: space-between;
      font-size: 11px;
      color: var(--cx-text-secondary);
    }

    .cx-par-table-wrap {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      overflow-x: auto;
      margin-bottom: 10px;
    }
    .cx-par-table { width: 100%; border-collapse: collapse; }
    .cx-par-table th {
      background: var(--cx-surface-2);
      padding: 10px 12px;
      text-align: left;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--cx-text-muted);
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-par-table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--cx-border);
      font-size: 13px;
      color: var(--cx-text);
    }
    .cx-par-table tbody tr:last-child td { border-bottom: none; }
    .cx-par-right { text-align: right; }
    .cx-par-b-label { font-weight: 500; }
    .cx-par-table td[data-severity="warn"] { color: #b45309; font-weight: 500; }
    .cx-par-table td[data-severity="alert"] { color: var(--cx-danger, #dc2626); font-weight: 600; }
    .cx-par-table td[data-severity="good"] { color: var(--cx-success, #16a34a); }

    .cx-par-footer {
      font-size: 11px;
      color: var(--cx-text-muted);
      padding: 4px 2px;
    }
    .cx-par-loading {
      display: flex; align-items: center; justify-content: center;
      gap: 10px;
      padding: 48px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      color: var(--cx-text-secondary);
      font-size: 13px;
    }
    .cx-par-spin { animation: cx-par-spin 1s linear infinite; }
    @keyframes cx-par-spin { to { transform: rotate(360deg); } }
  `],
})
export class PortfolioAtRiskComponent implements OnInit {
  data = signal<any>(null);
  loading = signal(true);
  asOf = '';
  groupBy = 'total';

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() {
    this.asOf = new Date().toISOString().slice(0, 10);
    this.load();
  }

  load() {
    if (!this.asOf) return;
    this.loading.set(true);
    this.api.get('/reports/portfolio-at-risk', {
      as_of: this.asOf,
      group_by: this.groupBy,
    }).subscribe({
      next: r => { this.data.set(r.data); this.loading.set(false); },
      error: e => {
        this.loading.set(false);
        this.toast.error(e.error?.message || 'Failed to load PAR');
      },
    });
  }

  /**
   * Map a percentage to a severity tone. Industry ballpark thresholds:
   *   <5%  healthy (good)
   *   5-10% caution (warn)
   *   >10%  alert (alert)
   * Thresholds are conservative — your board/CBN may have stricter ones.
   */
  severityFor(pct: number): 'good' | 'warn' | 'alert' {
    if (pct <= 5) return 'good';
    if (pct <= 10) return 'warn';
    return 'alert';
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
    rows.push(escape(`Portfolio At Risk as of ${d.as_of}`));
    rows.push('');
    rows.push(['Metric', 'Loans at Risk', 'Outstanding at Risk', 'Ratio %'].join(','));
    rows.push(['PAR30', d.par30.loans_at_risk, d.par30.outstanding_at_risk, d.par30.ratio_pct].map(escape).join(','));
    rows.push(['PAR60', d.par60.loans_at_risk, d.par60.outstanding_at_risk, d.par60.ratio_pct].map(escape).join(','));
    rows.push(['PAR90', d.par90.loans_at_risk, d.par90.outstanding_at_risk, d.par90.ratio_pct].map(escape).join(','));
    rows.push('');
    rows.push(['Portfolio Total Loans', d.portfolio.total_loans].map(escape).join(','));
    rows.push(['Portfolio Total Outstanding', d.portfolio.total_outstanding].map(escape).join(','));

    if (d.breakdown.length > 0) {
      rows.push('');
      rows.push(`Breakdown by ${d.group_by}`);
      rows.push([
        d.group_by === 'product' ? 'Product' : 'Branch',
        'Loans', 'Outstanding', 'PAR30 %', 'PAR60 %', 'PAR90 %',
      ].join(','));
      for (const b of d.breakdown) {
        rows.push([
          b.label, b.loan_count, b.outstanding,
          b.par30_pct, b.par60_pct, b.par90_pct,
        ].map(escape).join(','));
      }
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `par-${d.as_of}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.toast.success('Exported PAR report');
  }
}
