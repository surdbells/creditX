import { Component, OnInit, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { SettingsService } from '../../core/services/settings.service';

/**
 * Deposit Account detail + statement. Shows the account header (customer,
 * product, balance, status) and a paginated statement (newest first, with
 * running balance). Deposit / withdraw / close actions post movements via
 * the deposit service, each backed by a balanced journal entry.
 *
 * Gated by deposits.view (read) + deposits.transact (movements).
 */
@Component({
  selector: 'app-deposit-account-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, PageHeaderComponent, FormDialogComponent, MoneyPipe],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        [title]="account()?.account_number || 'Deposit Account'"
        [subtitle]="account()?.customer_name ? account()?.customer_name + ' · ' + account()?.product_name : ''"
        eyebrow="Deposits">
        <a routerLink="/deposit-accounts" class="cx-btn cx-btn-outline cx-btn-sm">
          <lucide-icon name="arrow-left" [size]="14"></lucide-icon>
          <span>Back</span>
        </a>
        @if (account() && account().status === 'active' && auth.hasPermission('deposits.transact')) {
          <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="openMovement('deposit')">
            <lucide-icon name="arrow-down-circle" [size]="14"></lucide-icon>
            <span>Deposit</span>
          </button>
          <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="openMovement('withdraw')">
            <lucide-icon name="arrow-up-circle" [size]="14"></lucide-icon>
            <span>Withdraw</span>
          </button>
        }
      </cx-page-header>

      @if (account()) {
        <!-- Summary cards -->
        <div class="cx-da-summary">
          <div class="cx-da-summary-cell">
            <div class="cx-da-summary-label">Balance</div>
            <div class="cx-da-summary-value tabular-nums">{{ account().balance | money:2 }}</div>
          </div>
          <div class="cx-da-summary-cell">
            <div class="cx-da-summary-label">Status</div>
            <div class="cx-da-summary-value">
              <span class="cx-badge" [ngClass]="statusClass(account().status)">{{ statusLabel(account().status) }}</span>
            </div>
          </div>
          <div class="cx-da-summary-cell">
            <div class="cx-da-summary-label">Product</div>
            <div class="cx-da-summary-value">{{ account().product_code }}</div>
          </div>
          <div class="cx-da-summary-cell">
            <div class="cx-da-summary-label">Opened</div>
            <div class="cx-da-summary-value tabular-nums">{{ account().opened_date }}</div>
          </div>
          <div class="cx-da-summary-cell">
            <div class="cx-da-summary-label">Last Activity</div>
            <div class="cx-da-summary-value tabular-nums">{{ account().last_activity_date || '—' }}</div>
          </div>
        </div>

        @if (account().status === 'active' && auth.hasPermission('deposits.transact')) {
          <div class="cx-da-close-row">
            <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="confirmClose()"
                    [disabled]="closing()">
              <lucide-icon name="x-circle" [size]="14"></lucide-icon>
              <span>{{ closing() ? 'Closing…' : 'Close Account' }}</span>
            </button>
            <span class="cx-da-close-hint">Account must have a zero balance to close.</span>
          </div>
        }
      }

      <!-- Statement -->
      <div class="cx-da-statement">
        <div class="cx-da-statement-head">
          <h3 class="cx-da-statement-title">Statement</h3>
          <div class="cx-da-statement-filters">
            <input type="date" class="cx-input cx-da-filter-input" [(ngModel)]="from" (change)="loadStatement(1)" placeholder="From" />
            <input type="date" class="cx-input cx-da-filter-input" [(ngModel)]="to" (change)="loadStatement(1)" placeholder="To" />
            @if (from || to) {
              <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="from=''; to=''; loadStatement(1)">
                <lucide-icon name="x" [size]="12"></lucide-icon>
              </button>
            }
          </div>
        </div>

        <div class="cx-da-table-wrap">
          <table class="cx-da-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Narration</th>
                <th>Reference</th>
                <th class="cx-da-right">Amount</th>
                <th class="cx-da-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              @if (loading()) {
                <tr><td colspan="6" class="cx-da-state">Loading…</td></tr>
              } @else if (txns().length === 0) {
                <tr><td colspan="6" class="cx-da-state">No transactions for this period.</td></tr>
              } @else {
                @for (t of txns(); track t.id) {
                  <tr>
                    <td class="tabular-nums">{{ t.posting_date }}</td>
                    <td><span class="cx-da-type-badge" [attr.data-type]="t.type">{{ typeLabel(t.type) }}</span></td>
                    <td class="cx-da-narration">{{ t.narration }}</td>
                    <td class="cx-da-ref">{{ t.reference || '—' }}</td>
                    <td class="cx-da-right tabular-nums" [class.cx-da-credit]="isCredit(t.type)" [class.cx-da-debit]="!isCredit(t.type)">
                      {{ isCredit(t.type) ? '+' : '−' }}{{ t.amount | money:2 }}
                    </td>
                    <td class="cx-da-right tabular-nums">{{ t.balance_after | money:2 }}</td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        @if (meta() && meta().total_pages > 1) {
          <div class="cx-da-pagination">
            <span class="cx-da-pagination-info tabular-nums">Page {{ meta().page }} of {{ meta().total_pages }} · {{ meta().total }} lines</span>
            <div class="cx-da-pagination-controls">
              <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" [disabled]="meta().page <= 1" (click)="loadStatement(meta().page - 1)">
                <lucide-icon name="chevron-left" [size]="14"></lucide-icon>
              </button>
              <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" [disabled]="meta().page >= meta().total_pages" (click)="loadStatement(meta().page + 1)">
                <lucide-icon name="chevron-right" [size]="14"></lucide-icon>
              </button>
            </div>
          </div>
        }
      </div>
    </div>

    <!-- Deposit / Withdraw dialog -->
    <cx-form-dialog
      [open]="showMovement()"
      [title]="movementType === 'deposit' ? 'Post Deposit' : 'Post Withdrawal'"
      [subtitle]="account()?.account_number + ' · current balance ' + (account()?.balance | money:2)"
      [saveLabel]="movementType === 'deposit' ? 'Post Deposit' : 'Post Withdrawal'"
      [saving]="posting()" maxWidth="520px" (close)="showMovement.set(false)" (save)="submitMovement()">
      <div class="cx-form-stack">
        <div>
          <label class="cx-label">Amount ({{ settings.currencySymbol() }}) *</label>
          <input class="cx-input" type="number" min="0" step="0.01" [(ngModel)]="movementForm.amount" />
        </div>
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Posting Date</label>
            <input class="cx-input" type="date" [(ngModel)]="movementForm.posting_date" />
          </div>
          <div>
            <label class="cx-label">Reference</label>
            <input class="cx-input" [(ngModel)]="movementForm.reference" placeholder="optional" />
          </div>
        </div>
      </div>
    </cx-form-dialog>
  `,
  styles: [`
    .cx-da-summary {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 10px; padding: 14px 16px; margin-bottom: 14px;
      background: var(--cx-surface); border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl, 12px);
    }
    .cx-da-summary-cell { display: flex; flex-direction: column; gap: 4px; }
    .cx-da-summary-label {
      font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--cx-text-muted);
    }
    .cx-da-summary-value { font-size: 16px; font-weight: 600; color: var(--cx-text); }

    .cx-da-close-row {
      display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
    }
    .cx-da-close-hint { font-size: 12px; color: var(--cx-text-muted); }

    .cx-da-statement {
      background: var(--cx-surface); border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl, 12px); overflow: hidden;
    }
    .cx-da-statement-head {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--cx-border);
      flex-wrap: wrap;
    }
    .cx-da-statement-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--cx-text); }
    .cx-da-statement-filters { display: flex; align-items: center; gap: 8px; }
    .cx-da-filter-input { font-size: 13px; padding: 6px 10px; }

    .cx-da-table-wrap { overflow-x: auto; }
    .cx-da-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .cx-da-table th {
      text-align: left; padding: 10px 14px; background: var(--cx-surface-2);
      font-size: 10px; font-weight: 600; letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--cx-text-muted);
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-da-table th.cx-da-right { text-align: right; }
    .cx-da-table td { padding: 10px 14px; border-bottom: 1px solid var(--cx-border-subtle); }
    .cx-da-table td.cx-da-right { text-align: right; }
    .cx-da-table tbody tr:last-child td { border-bottom: none; }
    .cx-da-narration { color: var(--cx-text-secondary); }
    .cx-da-ref { color: var(--cx-text-muted); font-size: 12px; }
    .cx-da-credit { color: #166534; font-weight: 600; }
    .cx-da-debit { color: #b91c1c; font-weight: 600; }
    .cx-da-state { padding: 32px; text-align: center; color: var(--cx-text-muted); }

    .cx-da-type-badge {
      display: inline-flex; padding: 2px 8px; font-size: 10px; font-weight: 600;
      letter-spacing: 0.04em; border-radius: 4px;
      background: var(--cx-surface-2); color: var(--cx-text-secondary);
      border: 1px solid var(--cx-border);
    }
    .cx-da-type-badge[data-type="DEPOSIT"]    { background: #f0fdf4; color: #166534; border-color: #dcfce7; }
    .cx-da-type-badge[data-type="WITHDRAWAL"] { background: #fef2f2; color: #991b1b; border-color: #fee2e2; }
    .cx-da-type-badge[data-type="INTEREST"]   { background: #eff6ff; color: #1d4ed8; border-color: #dbeafe; }
    .cx-da-type-badge[data-type="CHARGE"]     { background: #fef3c7; color: #92400e; border-color: #fde68a; }
    .cx-da-type-badge[data-type="REVERSAL"]   { background: #fafafa; color: #525252; border-color: #e5e5e5; }

    .cx-da-pagination {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; padding: 12px 16px; border-top: 1px solid var(--cx-border);
    }
    .cx-da-pagination-info { font-size: 12px; color: var(--cx-text-muted); }
    .cx-da-pagination-controls { display: flex; gap: 4px; }
  `],
})
export class DepositAccountDetailComponent implements OnInit {
  @Input() id!: string;

  account = signal<any>(null);
  txns = signal<any[]>([]);
  meta = signal<any>(null);
  loading = signal(true);

  from = '';
  to = '';

  // Movement dialog
  showMovement = signal(false);
  posting = signal(false);
  movementType: 'deposit' | 'withdraw' = 'deposit';
  movementForm: any = {};
  closing = signal(false);

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService, public settings: SettingsService) {}

  ngOnInit() { this.loadStatement(1); }

  statusLabel(s: string): string {
    return { active: 'Active', dormant: 'Dormant', frozen: 'Frozen', closed: 'Closed' }[s] ?? s;
  }
  statusClass(s: string): string {
    return { active: 'cx-badge-success', dormant: 'cx-badge-warning', frozen: 'cx-badge-danger', closed: 'cx-badge-neutral' }[s] ?? 'cx-badge-neutral';
  }
  typeLabel(t: string): string {
    return { DEPOSIT: 'Deposit', WITHDRAWAL: 'Withdrawal', INTEREST: 'Interest', CHARGE: 'Charge', REVERSAL: 'Reversal' }[t] ?? t;
  }
  isCredit(t: string): boolean { return t === 'DEPOSIT' || t === 'INTEREST'; }

  loadStatement(page: number) {
    if (!this.id) return;
    this.loading.set(true);
    const params: any = { page, per_page: this.meta()?.per_page ?? 20 };
    if (this.from) params.from = this.from;
    if (this.to) params.to = this.to;
    this.api.get(`/deposits/accounts/${this.id}/statement`, params).subscribe({
      next: (r: any) => {
        this.txns.set(r.data || []);
        this.account.set(r.account || null);
        this.meta.set(r.meta || null);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.toast.error('Failed to load statement'); },
    });
  }

  openMovement(type: 'deposit' | 'withdraw') {
    this.movementType = type;
    this.movementForm = { amount: '', posting_date: new Date().toISOString().slice(0, 10), reference: '' };
    this.showMovement.set(true);
  }

  submitMovement() {
    const amt = parseFloat(this.movementForm.amount);
    if (!amt || amt <= 0) { this.toast.error('Enter a valid amount'); return; }
    this.posting.set(true);
    const endpoint = this.movementType === 'deposit' ? 'deposit' : 'withdraw';
    this.api.post(`/deposits/accounts/${this.id}/${endpoint}`, {
      amount: this.movementForm.amount,
      posting_date: this.movementForm.posting_date,
      reference: this.movementForm.reference || undefined,
    }).subscribe({
      next: r => { this.posting.set(false); this.toast.success(r.message || 'Posted'); this.showMovement.set(false); this.loadStatement(1); },
      error: e => { this.posting.set(false); this.toast.error(e.error?.message || 'Failed to post'); },
    });
  }

  confirmClose() {
    if (!confirm('Close this deposit account? The balance must be zero.')) return;
    this.closing.set(true);
    this.api.post(`/deposits/accounts/${this.id}/close`, {}).subscribe({
      next: r => { this.closing.set(false); this.toast.success(r.message || 'Account closed'); this.loadStatement(this.meta()?.page ?? 1); },
      error: e => { this.closing.set(false); this.toast.error(e.error?.message || 'Failed to close account'); },
    });
  }
}
