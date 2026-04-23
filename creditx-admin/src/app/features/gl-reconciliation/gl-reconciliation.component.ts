import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

/**
 * GL Reconciliation Report — double-entry integrity check.
 *
 * For each CUSTOMER-type parent GL, shows:
 *
 *   - Parent-only balance  (direct postings to the parent GL,
 *                           customer_ledger_id IS NULL)
 *   - Sub-ledger balance   (aggregate of all child CustomerLedger
 *                           postings, customer_ledger_id IS NOT NULL)
 *   - Combined balance     (what the trial balance shows)
 *
 * Parent-only balance SHOULD be zero for pure sub-ledger parents —
 * every posting should route through a child ledger. A non-zero
 * parent balance means a journal entry was posted directly to the
 * parent GL without going through a sub-ledger (orphan posting).
 *
 * Distinct from the /reconciliation page (transaction-matching
 * workflow, different concern). This page is a read-only integrity
 * report for the accounting team.
 *
 * Gated by accounting.view.
 */
@Component({
  selector: 'app-gl-reconciliation',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, PageHeaderComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="GL Reconciliation"
        subtitle="Verify parent-GL balances match their sub-ledger aggregates"
        eyebrow="Accounting">
        <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="load()" [disabled]="loading()">
          <lucide-icon name="refresh-cw" [size]="14"></lucide-icon>
          <span>{{ loading() ? 'Refreshing…' : 'Refresh' }}</span>
        </button>
      </cx-page-header>

      <!-- Summary strip -->
      @if (!loading() && summary(); as s) {
        <div class="cx-glr-summary" [class.cx-glr-summary-clean]="s.accounts_with_discrepancy === 0">
          <div class="cx-glr-summary-cell">
            <div class="cx-glr-summary-label">Accounts Checked</div>
            <div class="cx-glr-summary-value tabular-nums">{{ s.accounts_checked }}</div>
          </div>
          <div class="cx-glr-summary-cell">
            <div class="cx-glr-summary-label">With Discrepancy</div>
            <div class="cx-glr-summary-value tabular-nums"
                 [class.cx-glr-danger]="s.accounts_with_discrepancy > 0"
                 [class.cx-glr-success]="s.accounts_with_discrepancy === 0">
              {{ s.accounts_with_discrepancy }}
            </div>
          </div>
          <div class="cx-glr-summary-cell">
            <div class="cx-glr-summary-label">Total Discrepancy (₦)</div>
            <div class="cx-glr-summary-value tabular-nums"
                 [class.cx-glr-danger]="s.accounts_with_discrepancy > 0">
              ₦{{ s.total_discrepancy_amount | number:'1.2-2' }}
            </div>
          </div>
          <div class="cx-glr-summary-cell">
            <div class="cx-glr-summary-label">Generated</div>
            <div class="cx-glr-summary-gen">{{ generatedAt() }}</div>
          </div>
        </div>
      }

      <!-- Status banner -->
      @if (!loading() && summary()?.accounts_with_discrepancy === 0 && (summary()?.accounts_checked ?? 0) > 0) {
        <div class="cx-glr-banner cx-glr-banner-clean">
          <lucide-icon name="check-circle" [size]="18"></lucide-icon>
          <div>
            <strong>All sub-ledgers reconcile cleanly.</strong>
            Every parent GL balance matches its sub-ledger aggregate with no orphan postings.
          </div>
        </div>
      } @else if (!loading() && (summary()?.accounts_with_discrepancy ?? 0) > 0) {
        <div class="cx-glr-banner cx-glr-banner-alert">
          <lucide-icon name="info" [size]="18"></lucide-icon>
          <div>
            <strong>{{ summary()?.accounts_with_discrepancy }} account(s) have orphan postings.</strong>
            A non-zero parent-only balance means a journal entry was posted
            directly to the parent GL without a sub-ledger. Investigate each
            row flagged below via the Journal Entries page filtered by GL.
          </div>
        </div>
      }

      <!-- Accounts table -->
      @if (loading()) {
        <div class="cx-glr-loading">
          <lucide-icon name="loader-2" [size]="20" class="cx-glr-spin"></lucide-icon>
          <span>Running reconciliation…</span>
        </div>
      } @else if (accounts().length === 0) {
        <div class="cx-glr-empty">
          <lucide-icon name="database" [size]="32"></lucide-icon>
          <div>No CUSTOMER-type GL accounts found.</div>
        </div>
      } @else {
        <div class="cx-glr-table-wrap">
          <table class="cx-glr-table">
            <thead>
              <tr>
                <th>Account</th>
                <th class="cx-glr-right">Sub-ledgers</th>
                <th class="cx-glr-right">Parent-only</th>
                <th class="cx-glr-right">Sub-ledger</th>
                <th class="cx-glr-right">Combined</th>
                <th class="cx-glr-center">Status</th>
              </tr>
            </thead>
            <tbody>
              @for (a of accounts(); track a.id) {
                <tr [class.cx-glr-row-alert]="a.has_discrepancy">
                  <td>
                    <div class="cx-glr-acct">
                      <span class="cx-glr-acct-code">{{ a.code }}</span>
                      <span class="cx-glr-acct-name">{{ a.name }}</span>
                    </div>
                    <div class="cx-glr-acct-type">{{ a.account_type }}</div>
                  </td>
                  <td class="cx-glr-right tabular-nums">{{ a.subledger_count }}</td>
                  <td class="cx-glr-right tabular-nums"
                      [class.cx-glr-danger]="a.has_discrepancy">
                    ₦{{ a.parent_balance | number:'1.2-2' }}
                  </td>
                  <td class="cx-glr-right tabular-nums">
                    ₦{{ a.subledger_balance | number:'1.2-2' }}
                  </td>
                  <td class="cx-glr-right tabular-nums cx-glr-combined">
                    ₦{{ a.combined_balance | number:'1.2-2' }}
                  </td>
                  <td class="cx-glr-center">
                    @if (a.has_discrepancy) {
                      <span class="cx-glr-status cx-glr-status-alert">
                        <lucide-icon name="info" [size]="11"></lucide-icon>
                        <span>Orphan ₦{{ a.discrepancy_amount | number:'1.2-2' }}</span>
                      </span>
                    } @else {
                      <span class="cx-glr-status cx-glr-status-clean">
                        <lucide-icon name="check-circle" [size]="11"></lucide-icon>
                        <span>Clean</span>
                      </span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Explanatory footer -->
        <div class="cx-glr-legend">
          <div class="cx-glr-legend-title">How to read this report</div>
          <ul>
            <li>
              <strong>Parent-only balance</strong> — postings that hit the
              parent GL directly without a sub-ledger. Should be ₦0.00 in a
              healthy system.
            </li>
            <li>
              <strong>Sub-ledger balance</strong> — aggregate of every child
              CustomerLedger's balance rolled up. Represents the portfolio
              outstanding on this account.
            </li>
            <li>
              <strong>Combined balance</strong> — what the trial balance
              shows for this GL. Equals parent-only + sub-ledger.
            </li>
            <li>
              A non-zero parent-only balance (orphan) means a journal entry
              bypassed the sub-ledger. Investigate via Journal Entries
              filtered to that GL account.
            </li>
          </ul>
        </div>
      }
    </div>
  `,
  styles: [`
    /* ═══ Summary strip ═══ */
    .cx-glr-summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      padding: 14px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
    }
    .cx-glr-summary-clean { border-color: rgba(22, 163, 74, 0.25); }
    .cx-glr-summary-cell { display: flex; flex-direction: column; gap: 2px; }
    .cx-glr-summary-label {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-glr-summary-value {
      font-size: 18px; font-weight: 600;
      color: var(--cx-text);
    }
    .cx-glr-summary-gen {
      font-size: 11px;
      color: var(--cx-text-secondary);
      margin-top: 4px;
    }
    .cx-glr-danger { color: var(--cx-danger, #dc2626); }
    .cx-glr-success { color: var(--cx-success, #16a34a); }

    /* ═══ Banner ═══ */
    .cx-glr-banner {
      display: flex;
      gap: 12px;
      padding: 14px 18px;
      border-radius: var(--cx-radius-md);
      font-size: 13px;
      line-height: 1.5;
      margin-bottom: 14px;
    }
    .cx-glr-banner strong { display: block; margin-bottom: 2px; }
    .cx-glr-banner-clean {
      background: rgba(22, 163, 74, 0.08);
      color: #15803d;
    }
    .cx-glr-banner-alert {
      background: rgba(245, 158, 11, 0.08);
      color: #b45309;
    }

    /* ═══ Table ═══ */
    .cx-glr-table-wrap {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      overflow: hidden;
      margin-bottom: 14px;
    }
    .cx-glr-table { width: 100%; border-collapse: collapse; }
    .cx-glr-table th {
      background: var(--cx-surface-2);
      padding: 10px 16px;
      text-align: left;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--cx-text-muted);
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-glr-table td {
      padding: 12px 16px;
      border-bottom: 1px solid var(--cx-border);
      font-size: 13px;
      color: var(--cx-text);
      vertical-align: top;
    }
    .cx-glr-table tbody tr:last-child td { border-bottom: none; }
    .cx-glr-table tbody tr:hover { background: var(--cx-surface-2); }
    .cx-glr-right { text-align: right; }
    .cx-glr-center { text-align: center; }
    .cx-glr-row-alert { background: rgba(245, 158, 11, 0.04); }
    .cx-glr-row-alert:hover { background: rgba(245, 158, 11, 0.08); }

    .cx-glr-acct { display: flex; flex-direction: column; gap: 2px; }
    .cx-glr-acct-code {
      display: inline-block;
      padding: 1px 6px;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: 4px;
      font-size: 11px; font-weight: 600;
      color: var(--cx-text-secondary);
      align-self: flex-start;
    }
    .cx-glr-acct-name { font-weight: 500; color: var(--cx-text); }
    .cx-glr-acct-type {
      font-size: 10px;
      color: var(--cx-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 4px;
    }
    .cx-glr-combined { font-weight: 600; }

    .cx-glr-status {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px; font-weight: 600;
    }
    .cx-glr-status-clean {
      background: rgba(22, 163, 74, 0.1);
      color: var(--cx-success, #16a34a);
    }
    .cx-glr-status-alert {
      background: rgba(245, 158, 11, 0.12);
      color: #b45309;
    }

    /* ═══ Legend / empty / loading ═══ */
    .cx-glr-legend {
      padding: 14px 18px;
      background: var(--cx-surface-2);
      border-radius: var(--cx-radius-md);
      font-size: 12px;
      color: var(--cx-text-secondary);
      line-height: 1.6;
    }
    .cx-glr-legend-title {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
      margin-bottom: 8px;
    }
    .cx-glr-legend ul { margin: 0; padding-left: 20px; }
    .cx-glr-legend li { margin-bottom: 4px; }
    .cx-glr-legend strong { color: var(--cx-text); }

    .cx-glr-loading, .cx-glr-empty {
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
    .cx-glr-empty { flex-direction: column; }
    .cx-glr-spin { animation: cx-glr-spin 1s linear infinite; }
    @keyframes cx-glr-spin { to { transform: rotate(360deg); } }
  `],
})
export class GlReconciliationComponent implements OnInit {
  accounts = signal<any[]>([]);
  summary = signal<any>(null);
  loading = signal(true);

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.get('/accounting/gl-reconciliation').subscribe({
      next: r => {
        this.accounts.set(r.data?.accounts ?? []);
        this.summary.set(r.data?.summary ?? null);
        this.loading.set(false);
      },
      error: e => {
        this.loading.set(false);
        this.toast.error(e.error?.message || 'Failed to load reconciliation');
      },
    });
  }

  /**
   * Format the generated_at ISO timestamp into a locale string.
   * Defensive on parse errors — falls back to raw.
   */
  generatedAt(): string {
    const ts = this.summary()?.generated_at;
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      return d.toLocaleString();
    } catch {
      return ts;
    }
  }
}
