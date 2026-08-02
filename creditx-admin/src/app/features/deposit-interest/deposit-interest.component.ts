import { Component, signal } from '@angular/core';
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
 * Deposit Interest Run — preview and post the monthly interest accrual for
 * a period (YYYY-MM). Preview is read-only (shows what WOULD post); Run
 * posts one INTEREST movement per eligible account (DR Interest Expense,
 * CR Customer Deposits), each backed by a balanced journal.
 *
 * Gated by deposits.interest.
 */
const DEPOSIT_INTEREST_GUIDE: PageGuide = {
  id: 'deposit-interest',
  titleKey: 'Deposit Interest Run',
  purposeKey: 'Calculates and posts the interest owed to savings customers for a month.',
  descriptionKey:
    'Interest-bearing deposit products earn the customer interest each month. This run computes it '
    + 'per account using the product\'s method, and posts it as an expense to the institution and a '
    + 'credit to the customer. It is the deposit-side mirror of loan interest accrual.',
  actionKeys: [
    'Preview the interest due for a month',
    'Post the run',
    'Review previous runs',
  ],
  workflowKeys: ['Month of balances', 'Preview', 'Post', 'Close the period'],
  dependsOnKeys: ['Deposit Products', 'Deposit Accounts', 'GL Mappings'],
  businessRuleKeys: [
    'Run once per month, before closing that month.',
    'Interest paid to depositors is an expense, and it reduces the result for the period.',
    'Each account is computed on its own product\'s method — a single run can mix methods.',
    'A wrong run is corrected by reversal, not by editing balances.',
  ],
  tipKeys: [
    'Preview before posting, every time. The preview is exactly what will post.',
  ],
  permissionKeys: ['deposits.interest.run'],
};

@Component({
  selector: 'app-deposit-interest',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, MoneyPipe, PageGuideComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Deposit Interest Run"
        subtitle="Preview and post the monthly interest accrual for interest-bearing deposit products"
        eyebrow="Deposits"></cx-page-header>

      <cx-page-guide [guide]="guide"></cx-page-guide>

      <div class="cx-di-controls">
        <div class="cx-di-control-group">
          <label class="cx-di-label">Period</label>
          <input type="month" class="cx-input cx-di-period" [(ngModel)]="period" />
        </div>
        <div class="cx-di-actions">
          <button class="cx-btn cx-btn-outline" (click)="preview()" [disabled]="loading()">
            <lucide-icon name="search" [size]="14"></lucide-icon>
            <span>{{ loading() ? 'Loading…' : 'Preview' }}</span>
          </button>
          @if (auth.hasPermission('deposits.interest')) {
            <button class="cx-btn cx-btn-primary" (click)="run()"
                    [disabled]="running() || !previewed() || (result()?.accounts_eligible || 0) === 0">
              <lucide-icon name="play" [size]="14"></lucide-icon>
              <span>{{ running() ? 'Posting…' : 'Run & Post' }}</span>
            </button>
          }
        </div>
      </div>

      @if (previewed() && result()) {
        <div class="cx-di-summary">
          <div class="cx-di-summary-cell">
            <div class="cx-di-summary-label">Eligible Accounts</div>
            <div class="cx-di-summary-value tabular-nums">{{ result().accounts_eligible }}</div>
          </div>
          <div class="cx-di-summary-cell">
            <div class="cx-di-summary-label">Total Interest</div>
            <div class="cx-di-summary-value tabular-nums">{{ result().total_interest | money:2 }}</div>
          </div>
          <div class="cx-di-summary-cell">
            <div class="cx-di-summary-label">Period</div>
            <div class="cx-di-summary-value">{{ result().period }}</div>
          </div>
        </div>

        <div class="cx-di-table-wrap">
          <table class="cx-di-table">
            <thead>
              <tr>
                <th>Account #</th>
                <th>Customer</th>
                <th>Product</th>
                <th>Method</th>
                <th class="cx-di-right">Current Balance</th>
                <th class="cx-di-right">Interest</th>
              </tr>
            </thead>
            <tbody>
              @if ((result().lines || []).length === 0) {
                <tr><td colspan="6" class="cx-di-state">No accounts accrue interest for this period.</td></tr>
              } @else {
                @for (l of result().lines; track l.account_number) {
                  <tr>
                    <td class="tabular-nums">{{ l.account_number }}</td>
                    <td>{{ l.customer_name }}</td>
                    <td>{{ l.product_code }}</td>
                    <td>{{ methodLabel(l.method) }}</td>
                    <td class="cx-di-right tabular-nums">{{ l.current_balance | money:2 }}</td>
                    <td class="cx-di-right tabular-nums cx-di-interest">{{ l.interest | money:2 }}</td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        @if (posted()) {
          <div class="cx-di-posted">
            <lucide-icon name="check-circle" [size]="16"></lucide-icon>
            <span>Interest posted to {{ posted().accounts_credited }} account(s) on {{ posted().posting_date }} — total {{ posted().total_interest | money:2 }}.</span>
          </div>
        }
      } @else {
        <div class="cx-di-empty">
          <lucide-icon name="percent" [size]="28"></lucide-icon>
          <span>Choose a period and click Preview to see the accrual.</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .cx-di-controls {
      display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap;
      padding: 14px 16px; margin-bottom: 14px;
      background: var(--cx-surface-2, #f5f5f4);
      border: 1px solid var(--cx-border); border-radius: var(--cx-radius-xl, 12px);
    }
    .cx-di-control-group { display: flex; flex-direction: column; gap: 4px; }
    .cx-di-label {
      font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--cx-text-muted);
    }
    .cx-di-period { font-size: 13px; padding: 6px 10px; }
    .cx-di-actions { display: flex; gap: 8px; margin-left: auto; }

    .cx-di-summary {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 10px; padding: 12px 16px; margin-bottom: 14px;
      background: var(--cx-surface); border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
    }
    .cx-di-summary-cell { display: flex; flex-direction: column; gap: 2px; }
    .cx-di-summary-label {
      font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--cx-text-muted);
    }
    .cx-di-summary-value { font-size: 16px; font-weight: 600; color: var(--cx-text); }

    .cx-di-table-wrap {
      background: var(--cx-surface); border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl, 12px); overflow: hidden;
    }
    .cx-di-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .cx-di-table th {
      text-align: left; padding: 10px 14px; background: var(--cx-surface-2);
      font-size: 10px; font-weight: 600; letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--cx-text-muted);
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-di-table th.cx-di-right { text-align: right; }
    .cx-di-table td { padding: 10px 14px; border-bottom: 1px solid var(--cx-border-subtle); }
    .cx-di-table td.cx-di-right { text-align: right; }
    .cx-di-table tbody tr:last-child td { border-bottom: none; }
    .cx-di-interest { color: #166534; font-weight: 600; }
    .cx-di-state { padding: 32px; text-align: center; color: var(--cx-text-muted); }

    .cx-di-posted {
      display: flex; align-items: center; gap: 8px; margin-top: 14px;
      padding: 12px 14px; border-radius: var(--cx-radius-md);
      background: #f0fdf4; color: #166534; border: 1px solid #dcfce7;
      font-size: 13px;
    }
    .cx-di-empty {
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      padding: 56px 16px; color: var(--cx-text-muted); font-size: 13px;
      background: var(--cx-surface); border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl, 12px);
    }
    .cx-di-empty lucide-icon { opacity: 0.3; }
  `],
})
export class DepositInterestComponent {
  readonly guide = DEPOSIT_INTEREST_GUIDE;

  period = new Date().toISOString().slice(0, 7);
  loading = signal(false);
  running = signal(false);
  previewed = signal(false);
  result = signal<any>(null);
  posted = signal<any>(null);

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  methodLabel(v: string): string {
    return { min_balance_monthly: 'Min Balance', daily_balance_monthly: 'Daily Balance' }[v] ?? v;
  }

  preview() {
    if (!this.period) { this.toast.error('Choose a period'); return; }
    this.loading.set(true);
    this.posted.set(null);
    this.api.get('/deposits/interest/preview', { period: this.period }).subscribe({
      next: r => { this.result.set(r.data); this.previewed.set(true); this.loading.set(false); },
      error: e => { this.loading.set(false); this.toast.error(e.error?.message || 'Preview failed'); },
    });
  }

  run() {
    if (!confirm(`Post interest for ${this.period}? This will create journal entries for ${this.result()?.accounts_eligible || 0} account(s).`)) return;
    this.running.set(true);
    this.api.post('/deposits/interest/run', { period: this.period }).subscribe({
      next: r => {
        this.running.set(false);
        this.posted.set(r.data);
        this.toast.success(r.message || 'Interest posted');
        this.preview();
      },
      error: e => { this.running.set(false); this.toast.error(e.error?.message || 'Run failed'); },
    });
  }
}
