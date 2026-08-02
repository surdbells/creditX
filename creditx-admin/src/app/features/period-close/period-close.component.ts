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
 * Period Close admin page — list of months with status (Open/Closed)
 * and actions to close / reopen each.
 *
 * The list is synthesised by the backend from the earliest posted
 * transaction's month up to the current month — so even months that
 * have no AccountingPeriod row yet show up as 'Open' (the default
 * state). Explicit close creates the row and transitions to Closed.
 *
 * Closing posts a closing journal that zeros out income and expense
 * accounts for the period and dumps the net into Retained Earnings.
 * See PeriodCloseService for the accounting mechanics.
 *
 * Reopening reverses the closing journal (audit trail preserved) and
 * flips status back to Open. Used when a post-close discovery
 * requires amending the period.
 *
 * Gated by accounting.close.
 */
const PERIOD_CLOSE_GUIDE: PageGuide = {
  id: 'period-close',
  titleKey: 'Period Close',
  purposeKey: 'Locks a month once its figures are final, so reported numbers cannot move afterwards.',
  descriptionKey:
    'An open period still accepts postings, which means any report from it can change. Closing a '
    + 'period refuses further entries dated into it, fixing the figures that have been reported. It '
    + 'is the control that makes a monthly number mean something — and reopening one is deliberately '
    + 'a privileged, recorded act.',
  actionKeys: [
    'Close a month once its figures are final',
    'Reopen a closed month when a genuine correction is required',
    'See which periods are open, closed or locked',
  ],
  workflowKeys: [
    'Month\'s activity posted',
    'Accruals, provisions and reconciliations completed',
    'Period closed here',
    'Statements produced and reported',
  ],
  dependsOnKeys: ['Interest Accrual', 'Provisions', 'Bank Reconciliation'],
  usedByKeys: ['Journal Entries', 'Disbursement', 'Every financial statement'],
  businessRuleKeys: [
    'A closed period refuses new postings dated into it. This is enforced at the point of posting, not merely warned about.',
    'Reopening is recorded — who did it, when and why — because it changes figures that have already been reported.',
    'Close in order. Leaving an old month open while closing a newer one undermines both.',
    'Run accruals and provisions BEFORE closing; they cannot be posted into the period afterwards without reopening it.',
  ],
  tipKeys: [
    'Treat closing as the last step of month-end, not the first. Anything you forgot becomes a reopen.',
    'If a correction is found after close, weigh reopening against posting it in the current month — for small amounts the current month is usually cleaner.',
  ],
  permissionKeys: ['accounting.period.close'],
  faq: [
    { questionKey: 'Someone cannot post and says the period is closed.',
      answerKey: 'That is the control working. Either post into the current period, or reopen deliberately — do not change the date to get around it.' },
  ],
};

@Component({
  selector: 'app-period-close',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, MoneyPipe, PageGuideComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Period Close"
        subtitle="Close or reopen monthly accounting periods"
        eyebrow="Accounting">
        <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="load()" [disabled]="loading()">
          <lucide-icon name="refresh-cw" [size]="14"></lucide-icon>
          <span>{{ loading() ? 'Loading…' : 'Refresh' }}</span>
        </button>
      </cx-page-header>

      <cx-page-guide [guide]="guide"></cx-page-guide>

      <div class="cx-pc-intro">
        <lucide-icon name="info" [size]="16"></lucide-icon>
        <div>
          Closing a period posts a closing journal that zeros out income
          and expense accounts, moving the net to <strong>Retained Earnings</strong>.
          Reopening reverses that journal with full audit trail.
          Before closing, ensure a GL with code <code>RETEARN</code>
          and account type <em>equity</em> exists in the Chart of Accounts.
        </div>
      </div>

      @if (loading()) {
        <div class="cx-pc-loading">
          <lucide-icon name="loader-2" [size]="20" class="cx-pc-spin"></lucide-icon>
          <span>Loading periods…</span>
        </div>
      } @else if (periods().length === 0) {
        <div class="cx-pc-empty">
          <lucide-icon name="calendar" [size]="32"></lucide-icon>
          <div>No periods to show yet — post some transactions first.</div>
        </div>
      } @else {
        <div class="cx-pc-table-wrap">
          <table class="cx-pc-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Status</th>
                <th class="cx-pc-right">Net Income Posted</th>
                <th>Closed At</th>
                <th>Notes</th>
                <th class="cx-pc-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (p of periods(); track p.label) {
                <tr>
                  <td class="cx-pc-label">{{ formatMonth(p.label) }}</td>
                  <td>
                    <span class="cx-pc-badge"
                          [attr.data-status]="p.status">
                      {{ p.status === 'closed' ? 'Closed' : 'Open' }}
                    </span>
                  </td>
                  <td class="cx-pc-right tabular-nums">
                    @if (p.net_income_posted != null) {
                      @if (+p.net_income_posted >= 0) {
                        {{ p.net_income_posted | money:2 }}
                      } @else {
                        ({{ (-p.net_income_posted) | money:2 }})
                      }
                    } @else {
                      —
                    }
                  </td>
                  <td>
                    @if (p.closed_at) {
                      <div class="cx-pc-closed-at">{{ p.closed_at }}</div>
                    } @else {
                      <span class="cx-pc-muted">—</span>
                    }
                  </td>
                  <td class="cx-pc-notes">{{ p.notes || '—' }}</td>
                  <td class="cx-pc-right">
                    @if (p.status === 'open') {
                      <button class="cx-btn cx-btn-primary cx-btn-sm"
                              (click)="openCloseDialog(p)"
                              [disabled]="busy()">
                        <lucide-icon name="lock" [size]="12"></lucide-icon>
                        <span>Close</span>
                      </button>
                    } @else {
                      <button class="cx-btn cx-btn-outline cx-btn-sm"
                              (click)="openReopenDialog(p)"
                              [disabled]="busy()">
                        <lucide-icon name="refresh-cw" [size]="12"></lucide-icon>
                        <span>Reopen</span>
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

    <!-- Close confirmation dialog -->
    @if (closeDialog()) {
      <div class="cx-pc-backdrop" (click)="closeDialogVisible.set(false)"></div>
      <div class="cx-pc-modal" role="dialog">
        <div class="cx-pc-modal-head">
          <lucide-icon name="lock" [size]="22"></lucide-icon>
          <div>
            <div class="cx-pc-modal-eyebrow">Close Period</div>
            <h2 class="cx-pc-modal-title">Close {{ formatMonth(closeDialog()?.label || '') }}?</h2>
            <div class="cx-pc-modal-sub">
              This will post a closing journal and freeze the period.
              Future back-dated postings to this month will be blocked.
            </div>
          </div>
        </div>
        <div class="cx-pc-modal-body">
          <label>Notes (optional)
            <textarea class="cx-input" rows="2" [(ngModel)]="closeNotes"
                      placeholder="Anything noteworthy about this close…"></textarea>
          </label>
        </div>
        <div class="cx-pc-modal-actions">
          <button class="cx-btn cx-btn-ghost" (click)="closeDialogVisible.set(false)" [disabled]="busy()">
            Cancel
          </button>
          <button class="cx-btn cx-btn-primary" (click)="submitClose()" [disabled]="busy()">
            @if (busy()) { <span>Closing…</span> }
            @else {
              <lucide-icon name="lock" [size]="14"></lucide-icon>
              <span>Close Period</span>
            }
          </button>
        </div>
      </div>
    }

    <!-- Reopen confirmation dialog -->
    @if (reopenDialog()) {
      <div class="cx-pc-backdrop" (click)="reopenDialogVisible.set(false)"></div>
      <div class="cx-pc-modal" role="dialog">
        <div class="cx-pc-modal-head">
          <lucide-icon name="refresh-cw" [size]="22"></lucide-icon>
          <div>
            <div class="cx-pc-modal-eyebrow">Reopen Period</div>
            <h2 class="cx-pc-modal-title">Reopen {{ formatMonth(reopenDialog()?.label || '') }}?</h2>
            <div class="cx-pc-modal-sub">
              This will reverse the closing journal and flip the period
              back to Open. The reversal creates full audit-trail
              entries — the original closing entries remain visible
              with matching reversal entries.
            </div>
          </div>
        </div>
        <div class="cx-pc-modal-body">
          <label>Reason (recommended)
            <textarea class="cx-input" rows="2" [(ngModel)]="reopenReason"
                      placeholder="Why this period needs to be reopened…"></textarea>
          </label>
        </div>
        <div class="cx-pc-modal-actions">
          <button class="cx-btn cx-btn-ghost" (click)="reopenDialogVisible.set(false)" [disabled]="busy()">
            Cancel
          </button>
          <button class="cx-btn cx-btn-danger" (click)="submitReopen()" [disabled]="busy()">
            @if (busy()) { <span>Reopening…</span> }
            @else {
              <lucide-icon name="refresh-cw" [size]="14"></lucide-icon>
              <span>Reopen Period</span>
            }
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    .cx-pc-intro {
      display: flex; gap: 10px; align-items: flex-start;
      padding: 12px 16px;
      background: rgba(59, 130, 246, 0.06);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
      font-size: 12px;
      color: var(--cx-text-secondary);
      line-height: 1.5;
    }
    .cx-pc-intro code {
      padding: 1px 6px;
      background: var(--cx-surface-2);
      border-radius: 3px;
      font-size: 11px;
    }

    .cx-pc-table-wrap {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      overflow-x: auto;
    }
    .cx-pc-table { width: 100%; border-collapse: collapse; }
    .cx-pc-table th {
      background: var(--cx-surface-2);
      padding: 10px 16px;
      text-align: left;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--cx-text-muted);
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-pc-table td {
      padding: 12px 16px;
      border-bottom: 1px solid var(--cx-border);
      font-size: 13px;
      color: var(--cx-text);
    }
    .cx-pc-table tbody tr:last-child td { border-bottom: none; }
    .cx-pc-right { text-align: right; }
    .cx-pc-label { font-weight: 600; font-size: 14px; }
    .cx-pc-closed-at {
      font-size: 11px;
      color: var(--cx-text-secondary);
    }
    .cx-pc-notes {
      max-width: 260px;
      color: var(--cx-text-secondary);
      font-size: 12px;
    }
    .cx-pc-muted { color: var(--cx-text-muted); }

    .cx-pc-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
    }
    .cx-pc-badge[data-status="open"] {
      background: rgba(22, 163, 74, 0.12);
      color: var(--cx-success, #16a34a);
    }
    .cx-pc-badge[data-status="closed"] {
      background: rgba(107, 114, 128, 0.15);
      color: var(--cx-text-muted);
    }

    /* Modal */
    .cx-pc-backdrop {
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.5);
      z-index: 100;
      backdrop-filter: blur(4px);
    }
    .cx-pc-modal {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: min(500px, calc(100vw - 32px));
      background: var(--cx-surface);
      border-radius: var(--cx-radius-xl, 16px);
      box-shadow: 0 32px 80px rgba(0, 0, 0, 0.25);
      z-index: 101;
      overflow: hidden;
    }
    .cx-pc-modal-head {
      display: flex; gap: 14px;
      padding: 20px 24px;
    }
    .cx-pc-modal-head lucide-icon {
      margin-top: 2px;
      color: var(--cx-primary-600);
    }
    .cx-pc-modal-eyebrow {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-pc-modal-title {
      margin: 4px 0 6px;
      font-size: 18px; font-weight: 600;
      color: var(--cx-text);
    }
    .cx-pc-modal-sub {
      font-size: 13px;
      color: var(--cx-text-secondary);
      line-height: 1.5;
    }
    .cx-pc-modal-body { padding: 0 24px 16px; }
    .cx-pc-modal-body label {
      display: block;
      font-size: 12px;
      color: var(--cx-text-secondary);
      font-weight: 500;
      margin-bottom: 4px;
    }
    .cx-pc-modal-body textarea {
      width: 100%;
      padding: 8px 12px;
      font-family: inherit;
      font-size: 13px;
    }
    .cx-pc-modal-actions {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 12px 24px 20px;
      border-top: 1px solid var(--cx-border);
    }

    .cx-pc-loading, .cx-pc-empty {
      display: flex; align-items: center; justify-content: center;
      gap: 10px; padding: 48px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      color: var(--cx-text-secondary);
      font-size: 13px;
    }
    .cx-pc-empty { flex-direction: column; }
    .cx-pc-spin { animation: cx-pc-spin 1s linear infinite; }
    @keyframes cx-pc-spin { to { transform: rotate(360deg); } }
  `],
})
export class PeriodCloseComponent implements OnInit {
  readonly guide = PERIOD_CLOSE_GUIDE;

  periods = signal<any[]>([]);
  loading = signal(true);
  busy = signal(false);

  closeDialogVisible = signal(false);
  reopenDialogVisible = signal(false);
  activePeriod = signal<any>(null);
  closeNotes = '';
  reopenReason = '';

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() { this.load(); }

  closeDialog() {
    return this.closeDialogVisible() ? this.activePeriod() : null;
  }

  reopenDialog() {
    return this.reopenDialogVisible() ? this.activePeriod() : null;
  }

  load() {
    this.loading.set(true);
    this.api.get('/accounting/periods').subscribe({
      next: r => {
        this.periods.set(r.data?.periods || []);
        this.loading.set(false);
      },
      error: e => {
        this.loading.set(false);
        this.toast.error(e.error?.message || 'Failed to load periods');
      },
    });
  }

  /**
   * Format 'YYYY-MM' as 'Month YYYY' for display.
   */
  formatMonth(label: string): string {
    if (!label) return '';
    const [y, m] = label.split('-');
    if (!y || !m) return label;
    const d = new Date(parseInt(y), parseInt(m) - 1, 1);
    return d.toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  openCloseDialog(p: any) {
    this.activePeriod.set(p);
    this.closeNotes = '';
    this.closeDialogVisible.set(true);
  }

  openReopenDialog(p: any) {
    this.activePeriod.set(p);
    this.reopenReason = '';
    this.reopenDialogVisible.set(true);
  }

  submitClose() {
    const p = this.activePeriod();
    if (!p) return;
    this.busy.set(true);
    this.api.post('/accounting/periods/close', {
      year: p.year,
      month: p.month,
      notes: this.closeNotes,
    }).subscribe({
      next: r => {
        this.busy.set(false);
        this.closeDialogVisible.set(false);
        this.toast.success(r.message || 'Period closed');
        this.load();
      },
      error: e => {
        this.busy.set(false);
        this.toast.error(e.error?.message || 'Close failed');
      },
    });
  }

  submitReopen() {
    const p = this.activePeriod();
    if (!p || !p.id) return;
    this.busy.set(true);
    this.api.post(`/accounting/periods/${p.id}/reopen`, {
      reason: this.reopenReason,
    }).subscribe({
      next: r => {
        this.busy.set(false);
        this.reopenDialogVisible.set(false);
        this.toast.success(r.message || 'Period reopened');
        this.load();
      },
      error: e => {
        this.busy.set(false);
        this.toast.error(e.error?.message || 'Reopen failed');
      },
    });
  }
}
