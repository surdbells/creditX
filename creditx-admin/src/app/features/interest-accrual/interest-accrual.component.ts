import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

/**
 * Loan Interest Accrual — preview and post the monthly accrual-basis
 * recognition of loan interest income for a period (YYYY-MM).
 *
 * Preview is read-only (what WOULD post). Run posts one balanced journal:
 *   DR Interest Receivable  CR Interest Income      (performing loans)
 *   DR Interest Receivable  CR Interest in Suspense (NPLs, suspended)
 *
 * Gated by accounting.provision (a month-end accounting activity).
 */
@Component({
  selector: 'app-interest-accrual',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, MoneyPipe],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Loan Interest Accrual"
        subtitle="Recognise loan interest income on an accrual basis, one month at a time"
        eyebrow="Accounting"></cx-page-header>

      <div class="cx-ia-controls">
        <div class="cx-ia-control-group">
          <label class="cx-ia-label">Period</label>
          <input type="month" class="cx-input cx-ia-period" [(ngModel)]="period" />
        </div>
        <div class="cx-ia-actions">
          <button class="cx-btn cx-btn-outline" (click)="preview()" [disabled]="loading()">
            <lucide-icon name="search" [size]="14"></lucide-icon>
            <span>{{ loading() ? 'Loading…' : 'Preview' }}</span>
          </button>
          @if (auth.hasPermission('accounting.provision')) {
            <button class="cx-btn cx-btn-primary" (click)="run()"
                    [disabled]="running() || !previewed() || (result()?.summary?.loan_count || 0) === 0">
              <lucide-icon name="play" [size]="14"></lucide-icon>
              <span>{{ running() ? 'Posting…' : 'Run & Post' }}</span>
            </button>
          }
        </div>
      </div>

      @if (previewed() && result(); as r) {
        <div class="cx-ia-summary">
          <div class="cx-ia-summary-cell">
            <div class="cx-ia-summary-label">Loans</div>
            <div class="cx-ia-summary-value tabular-nums">{{ r.summary.loan_count }}</div>
          </div>
          <div class="cx-ia-summary-cell">
            <div class="cx-ia-summary-label">Income to Recognise</div>
            <div class="cx-ia-summary-value tabular-nums cx-ia-income">{{ r.summary.total_income | money:2 }}</div>
          </div>
          <div class="cx-ia-summary-cell">
            <div class="cx-ia-summary-label">Suspended (NPL)</div>
            <div class="cx-ia-summary-value tabular-nums cx-ia-susp">{{ r.summary.total_suspended | money:2 }}</div>
          </div>
          <div class="cx-ia-summary-cell">
            <div class="cx-ia-summary-label">Reclassified (NPL)</div>
            <div class="cx-ia-summary-value tabular-nums cx-ia-susp">{{ r.summary.total_reclassified | money:2 }}</div>
          </div>
          <div class="cx-ia-summary-cell">
            <div class="cx-ia-summary-label">Posting Date</div>
            <div class="cx-ia-summary-value">{{ r.posting_date }}</div>
          </div>
        </div>

        <div class="cx-ia-table-wrap">
          <table class="cx-ia-table">
            <thead>
              <tr>
                <th>Application</th>
                <th>Classification</th>
                <th class="cx-ia-right">Days Overdue</th>
                <th class="cx-ia-right">Interest</th>
                <th>Treatment</th>
              </tr>
            </thead>
            <tbody>
              @if ((r.lines || []).length === 0) {
                <tr><td colspan="5" class="cx-ia-state">No loans accrue interest for this period.</td></tr>
              } @else {
                @for (l of r.lines; track l.loan_id) {
                  <tr>
                    <td class="tabular-nums">{{ l.application_id }}</td>
                    <td>{{ classLabel(l.classification) }}</td>
                    <td class="cx-ia-right tabular-nums">{{ l.days_overdue }}</td>
                    <td class="cx-ia-right tabular-nums">{{ l.interest_accrued | money:2 }}</td>
                    <td>
                      @if (l.suspended) {
                        <span class="cx-ia-badge cx-ia-badge-susp">Suspended</span>
                      } @else {
                        <span class="cx-ia-badge cx-ia-badge-inc">Income</span>
                      }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="cx-ia-empty">
          <lucide-icon name="trending-up" [size]="28"></lucide-icon>
          <span>Choose a period and click Preview to see the accrual.</span>
        </div>
      }

      <!-- Recent runs -->
      @if (runs().length) {
        <h3 class="cx-ia-runs-title">Recent Runs</h3>
        <div class="cx-ia-table-wrap">
          <table class="cx-ia-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Status</th>
                <th class="cx-ia-right">Loans</th>
                <th class="cx-ia-right">Income</th>
                <th class="cx-ia-right">Suspended</th>
                <th>Posted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (run of runs(); track run.id) {
                <tr>
                  <td class="tabular-nums">{{ run.period }}</td>
                  <td>
                    <span class="cx-ia-badge" [class.cx-ia-badge-inc]="run.status === 'posted'" [class.cx-ia-badge-rev]="run.status === 'reversed'">
                      {{ run.status }}
                    </span>
                  </td>
                  <td class="cx-ia-right tabular-nums">{{ run.loan_count }}</td>
                  <td class="cx-ia-right tabular-nums">{{ run.total_income_accrued | money:2 }}</td>
                  <td class="cx-ia-right tabular-nums">{{ run.total_suspended | money:2 }}</td>
                  <td class="tabular-nums">{{ run.posting_date }}</td>
                  <td class="cx-ia-right">
                    @if (run.status === 'posted' && auth.hasPermission('accounting.provision')) {
                      <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="reverse(run)" [disabled]="reversingId() === run.id">
                        <lucide-icon name="undo-2" [size]="13"></lucide-icon>
                        <span>{{ reversingId() === run.id ? 'Reversing…' : 'Reverse' }}</span>
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .cx-ia-controls {
      display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap;
      padding: 14px 16px; margin-bottom: 14px;
      background: var(--cx-surface-2, #f5f5f4);
      border: 1px solid var(--cx-border); border-radius: var(--cx-radius-xl, 12px);
    }
    .cx-ia-control-group { display: flex; flex-direction: column; gap: 4px; }
    .cx-ia-label {
      font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--cx-text-muted);
    }
    .cx-ia-period { font-size: 13px; padding: 6px 10px; }
    .cx-ia-actions { display: flex; gap: 8px; margin-left: auto; }

    .cx-ia-summary {
      display: grid; grid-template-columns: repeat(5, 1fr);
      gap: 10px; padding: 12px 16px; margin-bottom: 14px;
      background: var(--cx-surface); border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
    }
    .cx-ia-summary-cell { display: flex; flex-direction: column; gap: 2px; }
    .cx-ia-summary-label {
      font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--cx-text-muted);
    }
    .cx-ia-summary-value { font-size: 16px; font-weight: 600; color: var(--cx-text); }
    .cx-ia-income { color: #166534; }
    .cx-ia-susp { color: #b45309; }

    .cx-ia-table-wrap {
      background: var(--cx-surface); border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl, 12px); overflow: hidden; margin-bottom: 14px;
    }
    .cx-ia-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .cx-ia-table th {
      text-align: left; padding: 10px 14px; background: var(--cx-surface-2);
      font-size: 10px; font-weight: 600; letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--cx-text-muted);
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-ia-table th.cx-ia-right { text-align: right; }
    .cx-ia-table td { padding: 10px 14px; border-bottom: 1px solid var(--cx-border-subtle); }
    .cx-ia-table td.cx-ia-right { text-align: right; }
    .cx-ia-table tbody tr:last-child td { border-bottom: none; }
    .cx-ia-state { padding: 32px; text-align: center; color: var(--cx-text-muted); }

    .cx-ia-badge {
      display: inline-block; padding: 2px 8px; border-radius: 999px;
      font-size: 11px; font-weight: 600; text-transform: capitalize;
      background: var(--cx-surface-2); color: var(--cx-text-muted);
    }
    .cx-ia-badge-inc { background: #f0fdf4; color: #166534; }
    .cx-ia-badge-susp { background: #fffbeb; color: #b45309; }
    .cx-ia-badge-rev { background: #fef2f2; color: #991b1b; }

    .cx-ia-runs-title {
      font-size: 13px; font-weight: 600; color: var(--cx-text);
      margin: 18px 0 8px;
    }
    .cx-ia-empty {
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      padding: 56px 16px; color: var(--cx-text-muted); font-size: 13px;
      background: var(--cx-surface); border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl, 12px); margin-bottom: 14px;
    }
    .cx-ia-empty lucide-icon { opacity: 0.3; }
  `],
})
export class InterestAccrualComponent {
  period = new Date().toISOString().slice(0, 7);
  loading = signal(false);
  running = signal(false);
  previewed = signal(false);
  result = signal<any>(null);
  runs = signal<any[]>([]);
  reversingId = signal<string | null>(null);

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {
    this.loadRuns();
  }

  classLabel(v: string): string {
    return { performing: 'Performing', substandard: 'Substandard', doubtful: 'Doubtful', lost: 'Lost' }[v] ?? v;
  }

  private splitPeriod(): { year: string; month: string } {
    const [year, month] = (this.period || '').split('-');
    return { year, month };
  }

  loadRuns() {
    this.api.get('/accounting/interest-accrual/runs', { limit: 12 }).subscribe({
      next: r => this.runs.set(r.data?.runs || []),
      error: () => {},
    });
  }

  preview() {
    if (!this.period) { this.toast.error('Choose a period'); return; }
    this.loading.set(true);
    this.api.get('/reports/interest-accrual/preview', this.splitPeriod()).subscribe({
      next: r => { this.result.set(r.data); this.previewed.set(true); this.loading.set(false); },
      error: e => { this.loading.set(false); this.toast.error(e.error?.message || 'Preview failed'); },
    });
  }

  run() {
    const count = this.result()?.summary?.loan_count || 0;
    if (!confirm(`Post interest accrual for ${this.period}? This will create a journal for ${count} loan(s).`)) return;
    this.running.set(true);
    this.api.post('/accounting/interest-accrual/runs', this.splitPeriod()).subscribe({
      next: r => {
        this.running.set(false);
        this.toast.success(r.message || 'Interest accrued');
        this.loadRuns();
        this.preview();
      },
      error: e => { this.running.set(false); this.toast.error(e.error?.message || 'Run failed'); },
    });
  }

  reverse(run: any) {
    const reason = prompt(`Reverse the ${run.period} accrual? Optionally enter a reason:`);
    if (reason === null) return;
    this.reversingId.set(run.id);
    this.api.post(`/accounting/interest-accrual/runs/${run.id}/reverse`, { reason }).subscribe({
      next: r => { this.reversingId.set(null); this.toast.success(r.message || 'Reversed'); this.loadRuns(); },
      error: e => { this.reversingId.set(null); this.toast.error(e.error?.message || 'Reverse failed'); },
    });
  }
}
