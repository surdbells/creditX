import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

/**
 * Aged Receivables — buckets overdue installments by days past due.
 *
 * Installment-level aging (distinct from PAR's loan-level aging).
 * Tells the collections team how much money is stuck in each
 * bucket across the portfolio.
 *
 * Gated by accounting.view.
 */
@Component({
  selector: 'app-aged-receivables',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Aged Receivables"
        subtitle="Outstanding installments bucketed by days past due"
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

      <div class="cx-ar-controls">
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
        <div class="cx-ar-loading">
          <lucide-icon name="loader-2" [size]="20" class="cx-ar-spin"></lucide-icon>
          <span>Loading aged receivables…</span>
        </div>
      } @else if (data(); as d) {
        <!-- Bucket cards: 5-column grid -->
        <div class="cx-ar-buckets">
          <div class="cx-ar-bucket cx-ar-bucket-current">
            <div class="cx-ar-bucket-label">Current (not due)</div>
            <div class="cx-ar-bucket-amount tabular-nums">₦{{ d.buckets.current.amount | number:'1.2-2' }}</div>
            <div class="cx-ar-bucket-count">{{ d.buckets.current.count }} instalments</div>
          </div>
          <div class="cx-ar-bucket cx-ar-bucket-1-30">
            <div class="cx-ar-bucket-label">1–30 days</div>
            <div class="cx-ar-bucket-amount tabular-nums">₦{{ d.buckets.days_1_30.amount | number:'1.2-2' }}</div>
            <div class="cx-ar-bucket-count">{{ d.buckets.days_1_30.count }} instalments</div>
          </div>
          <div class="cx-ar-bucket cx-ar-bucket-31-60">
            <div class="cx-ar-bucket-label">31–60 days</div>
            <div class="cx-ar-bucket-amount tabular-nums">₦{{ d.buckets.days_31_60.amount | number:'1.2-2' }}</div>
            <div class="cx-ar-bucket-count">{{ d.buckets.days_31_60.count }} instalments</div>
          </div>
          <div class="cx-ar-bucket cx-ar-bucket-61-90">
            <div class="cx-ar-bucket-label">61–90 days</div>
            <div class="cx-ar-bucket-amount tabular-nums">₦{{ d.buckets.days_61_90.amount | number:'1.2-2' }}</div>
            <div class="cx-ar-bucket-count">{{ d.buckets.days_61_90.count }} instalments</div>
          </div>
          <div class="cx-ar-bucket cx-ar-bucket-90-plus">
            <div class="cx-ar-bucket-label">90+ days</div>
            <div class="cx-ar-bucket-amount tabular-nums">₦{{ d.buckets.days_90_plus.amount | number:'1.2-2' }}</div>
            <div class="cx-ar-bucket-count">{{ d.buckets.days_90_plus.count }} instalments</div>
          </div>
        </div>

        <!-- Totals strip -->
        <div class="cx-ar-totals">
          <div class="cx-ar-totals-cell">
            <div class="cx-ar-totals-label">Total Outstanding</div>
            <div class="cx-ar-totals-value tabular-nums">₦{{ d.totals.outstanding | number:'1.2-2' }}</div>
          </div>
          <div class="cx-ar-totals-cell">
            <div class="cx-ar-totals-label">Overdue (1+ days)</div>
            <div class="cx-ar-totals-value tabular-nums cx-ar-danger">₦{{ d.totals.overdue | number:'1.2-2' }}</div>
          </div>
          <div class="cx-ar-totals-cell">
            <div class="cx-ar-totals-label">Overdue %</div>
            <div class="cx-ar-totals-value tabular-nums"
                 [class.cx-ar-danger]="d.totals.overdue_pct > 10"
                 [class.cx-ar-warning]="d.totals.overdue_pct > 5 && d.totals.overdue_pct <= 10"
                 [class.cx-ar-success]="d.totals.overdue_pct <= 5">
              {{ d.totals.overdue_pct | number:'1.2-2' }}%
            </div>
          </div>
        </div>

        <!-- Breakdown table -->
        @if (d.breakdown.length > 0) {
          <div class="cx-ar-table-wrap">
            <table class="cx-ar-table">
              <thead>
                <tr>
                  <th>{{ d.group_by === 'product' ? 'Product' : 'Branch' }}</th>
                  <th class="cx-ar-right">Loans</th>
                  <th class="cx-ar-right">Current</th>
                  <th class="cx-ar-right">1–30</th>
                  <th class="cx-ar-right">31–60</th>
                  <th class="cx-ar-right">61–90</th>
                  <th class="cx-ar-right">90+</th>
                  <th class="cx-ar-right">Outstanding</th>
                  <th class="cx-ar-right">Overdue %</th>
                </tr>
              </thead>
              <tbody>
                @for (b of d.breakdown; track b.label) {
                  <tr>
                    <td class="cx-ar-label">{{ b.label }}</td>
                    <td class="cx-ar-right tabular-nums">{{ b.loan_count }}</td>
                    <td class="cx-ar-right tabular-nums cx-ar-muted">₦{{ b.current_amount | number:'1.0-0' }}</td>
                    <td class="cx-ar-right tabular-nums">₦{{ b.days_1_30_amount | number:'1.0-0' }}</td>
                    <td class="cx-ar-right tabular-nums">₦{{ b.days_31_60_amount | number:'1.0-0' }}</td>
                    <td class="cx-ar-right tabular-nums">₦{{ b.days_61_90_amount | number:'1.0-0' }}</td>
                    <td class="cx-ar-right tabular-nums cx-ar-danger">₦{{ b.days_90_plus_amount | number:'1.0-0' }}</td>
                    <td class="cx-ar-right tabular-nums"><strong>₦{{ b.outstanding_amount | number:'1.0-0' }}</strong></td>
                    <td class="cx-ar-right tabular-nums"
                        [class.cx-ar-danger]="b.overdue_pct > 10"
                        [class.cx-ar-warning]="b.overdue_pct > 5 && b.overdue_pct <= 10">
                      {{ b.overdue_pct | number:'1.2-2' }}%
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <div class="cx-ar-footer">Generated {{ generatedAt() }}</div>
      }
    </div>
  `,
  styles: [`
    .cx-ar-controls {
      display: flex;
      gap: 16px;
      padding: 14px 16px;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .cx-ar-controls label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-ar-controls input, .cx-ar-controls select {
      font-size: 13px; padding: 6px 10px;
    }

    .cx-ar-buckets {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
      margin-bottom: 14px;
    }
    @media (max-width: 900px) {
      .cx-ar-buckets { grid-template-columns: repeat(2, 1fr); }
    }
    .cx-ar-bucket {
      padding: 14px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      border-top: 3px solid var(--cx-border);
    }
    .cx-ar-bucket-current { border-top-color: var(--cx-success, #16a34a); }
    .cx-ar-bucket-1-30 { border-top-color: #eab308; }
    .cx-ar-bucket-31-60 { border-top-color: #f59e0b; }
    .cx-ar-bucket-61-90 { border-top-color: #ea580c; }
    .cx-ar-bucket-90-plus { border-top-color: var(--cx-danger, #dc2626); }
    .cx-ar-bucket-label {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
      margin-bottom: 6px;
    }
    .cx-ar-bucket-amount {
      font-size: 16px; font-weight: 600;
      color: var(--cx-text);
      margin-bottom: 2px;
    }
    .cx-ar-bucket-count {
      font-size: 11px;
      color: var(--cx-text-secondary);
    }

    .cx-ar-totals {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      padding: 14px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
    }
    .cx-ar-totals-cell { display: flex; flex-direction: column; gap: 2px; }
    .cx-ar-totals-label {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-ar-totals-value {
      font-size: 18px; font-weight: 600;
      color: var(--cx-text);
    }
    .cx-ar-danger { color: var(--cx-danger, #dc2626); }
    .cx-ar-warning { color: #b45309; }
    .cx-ar-success { color: var(--cx-success, #16a34a); }

    .cx-ar-table-wrap {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      overflow-x: auto;
      margin-bottom: 10px;
    }
    .cx-ar-table { width: 100%; border-collapse: collapse; }
    .cx-ar-table th {
      background: var(--cx-surface-2);
      padding: 10px 12px;
      text-align: left;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--cx-text-muted);
      border-bottom: 1px solid var(--cx-border);
      white-space: nowrap;
    }
    .cx-ar-table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--cx-border);
      font-size: 13px;
      color: var(--cx-text);
      white-space: nowrap;
    }
    .cx-ar-table tbody tr:last-child td { border-bottom: none; }
    .cx-ar-right { text-align: right; }
    .cx-ar-muted { color: var(--cx-text-muted); }
    .cx-ar-label { font-weight: 500; }

    .cx-ar-footer {
      font-size: 11px;
      color: var(--cx-text-muted);
      padding: 4px 2px;
    }
    .cx-ar-loading {
      display: flex; align-items: center; justify-content: center;
      gap: 10px;
      padding: 48px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      color: var(--cx-text-secondary);
      font-size: 13px;
    }
    .cx-ar-spin { animation: cx-ar-spin 1s linear infinite; }
    @keyframes cx-ar-spin { to { transform: rotate(360deg); } }
  `],
})
export class AgedReceivablesComponent implements OnInit {
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
    this.api.get('/reports/aged-receivables', {
      as_of: this.asOf,
      group_by: this.groupBy,
    }).subscribe({
      next: r => {
        this.data.set(r.data);
        this.loading.set(false);
      },
      error: e => {
        this.loading.set(false);
        this.toast.error(e.error?.message || 'Failed to load aged receivables');
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
    rows.push(escape(`Aged Receivables as of ${d.as_of}`));
    rows.push('');
    rows.push(['Bucket', 'Installment Count', 'Amount'].join(','));
    rows.push(['Current', d.buckets.current.count, d.buckets.current.amount].map(escape).join(','));
    rows.push(['1-30 days', d.buckets.days_1_30.count, d.buckets.days_1_30.amount].map(escape).join(','));
    rows.push(['31-60 days', d.buckets.days_31_60.count, d.buckets.days_31_60.amount].map(escape).join(','));
    rows.push(['61-90 days', d.buckets.days_61_90.count, d.buckets.days_61_90.amount].map(escape).join(','));
    rows.push(['90+ days', d.buckets.days_90_plus.count, d.buckets.days_90_plus.amount].map(escape).join(','));
    rows.push('');
    rows.push(['Total Outstanding', '', d.totals.outstanding].map(escape).join(','));
    rows.push(['Total Overdue', '', d.totals.overdue].map(escape).join(','));
    rows.push(['Overdue %', '', d.totals.overdue_pct + '%'].map(escape).join(','));

    if (d.breakdown.length > 0) {
      rows.push('');
      rows.push(`Breakdown by ${d.group_by}`);
      rows.push([
        d.group_by === 'product' ? 'Product' : 'Branch',
        'Loans', 'Current', '1-30', '31-60', '61-90', '90+',
        'Outstanding', 'Overdue %',
      ].join(','));
      for (const b of d.breakdown) {
        rows.push([
          b.label, b.loan_count,
          b.current_amount, b.days_1_30_amount, b.days_31_60_amount,
          b.days_61_90_amount, b.days_90_plus_amount,
          b.outstanding_amount, b.overdue_pct + '%',
        ].map(escape).join(','));
      }
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aged-receivables-${d.as_of}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.toast.success('Exported aged receivables');
  }
}
