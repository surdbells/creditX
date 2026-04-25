import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { SettingsService } from '../../core/services/settings.service';

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
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, MoneyPipe],
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
            <div class="cx-glr-summary-label">Total Discrepancy ({{ settings.currencySymbol() }})</div>
            <div class="cx-glr-summary-value tabular-nums"
                 [class.cx-glr-danger]="s.accounts_with_discrepancy > 0">
              {{ s.total_discrepancy_amount | money:2 }}
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
                <th class="cx-glr-right"></th>
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
                    {{ a.parent_balance | money:2 }}
                  </td>
                  <td class="cx-glr-right tabular-nums">
                    {{ a.subledger_balance | money:2 }}
                  </td>
                  <td class="cx-glr-right tabular-nums cx-glr-combined">
                    {{ a.combined_balance | money:2 }}
                  </td>
                  <td class="cx-glr-center">
                    @if (a.has_discrepancy) {
                      <span class="cx-glr-status cx-glr-status-alert">
                        <lucide-icon name="info" [size]="11"></lucide-icon>
                        <span>Orphan {{ a.discrepancy_amount | money:2 }}</span>
                      </span>
                    } @else {
                      <span class="cx-glr-status cx-glr-status-clean">
                        <lucide-icon name="check-circle" [size]="11"></lucide-icon>
                        <span>Clean</span>
                      </span>
                    }
                  </td>
                  <td class="cx-glr-right">
                    @if (a.has_discrepancy) {
                      <button class="cx-btn cx-btn-outline cx-btn-sm"
                              (click)="openOrphanModal(a)">
                        <lucide-icon name="search" [size]="12"></lucide-icon>
                        <span>Inspect</span>
                      </button>
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
              parent GL directly without a sub-ledger. Should be 0 in a
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
              bypassed the sub-ledger. Use <strong>Inspect</strong> to
              see the orphan postings and either reassign each one to a
              customer ledger on the same GL, or drill through via
              Journal Entries for deeper investigation.
            </li>
          </ul>
        </div>
      }
    </div>

    <!-- ═══ Orphan Inspector Modal ═══ -->
    @if (orphanModal()) {
      <div class="cx-glr-backdrop" (click)="orphanModal.set(null)"></div>
      <div class="cx-glr-modal" role="dialog">
        <div class="cx-glr-modal-head">
          <lucide-icon name="search" [size]="22"></lucide-icon>
          <div>
            <div class="cx-glr-modal-eyebrow">Orphan Postings</div>
            <h2 class="cx-glr-modal-title">
              {{ orphanModal()?.gl?.code }} · {{ orphanModal()?.gl?.name }}
            </h2>
            <div class="cx-glr-modal-sub">
              Postings on this GL with no customer ledger linkage. Each
              one can be reassigned to a sub-ledger on the same GL, or
              left alone if it represents a genuine parent-level entry.
            </div>
          </div>
        </div>
        <div class="cx-glr-modal-body">
          @if (orphanLoading()) {
            <div class="cx-glr-modal-loading">
              <lucide-icon name="loader-2" [size]="16" class="cx-glr-spin"></lucide-icon>
              <span>Loading…</span>
            </div>
          } @else if ((orphanModal()?.orphan_postings || []).length === 0) {
            <div class="cx-glr-modal-empty">No orphan postings remain on this GL.</div>
          } @else {
            <table class="cx-glr-modal-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Narration</th>
                  <th class="cx-glr-right">DR</th>
                  <th class="cx-glr-right">CR</th>
                  <th class="cx-glr-right"></th>
                </tr>
              </thead>
              <tbody>
                @for (p of orphanModal()?.orphan_postings || []; track p.id) {
                  <tr>
                    <td class="cx-glr-mono">{{ p.trans_date }}</td>
                    <td class="cx-glr-mono">{{ p.trans_reference || p.trans_callback || '—' }}</td>
                    <td class="cx-glr-narration">{{ p.trans_narration }}</td>
                    <td class="cx-glr-right tabular-nums">
                      @if (p.trans_type === 'DR') { {{ p.trans_amount | money:2 }} } @else { — }
                    </td>
                    <td class="cx-glr-right tabular-nums">
                      @if (p.trans_type === 'CR') { {{ p.trans_amount | money:2 }} } @else { — }
                    </td>
                    <td class="cx-glr-right">
                      <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="openReassign(p)">
                        <lucide-icon name="link" [size]="11"></lucide-icon>
                        <span>Reassign</span>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
        <div class="cx-glr-modal-actions">
          <button class="cx-btn cx-btn-ghost" (click)="orphanModal.set(null)">Close</button>
        </div>
      </div>
    }

    <!-- ═══ Reassign sub-modal ═══ -->
    @if (reassignTarget()) {
      <div class="cx-glr-backdrop cx-glr-backdrop-stack" (click)="reassignTarget.set(null)"></div>
      <div class="cx-glr-modal cx-glr-modal-stack" role="dialog">
        <div class="cx-glr-modal-head">
          <lucide-icon name="link" [size]="22"></lucide-icon>
          <div>
            <div class="cx-glr-modal-eyebrow">Reassign Posting</div>
            <h2 class="cx-glr-modal-title">Pick a destination sub-ledger</h2>
            <div class="cx-glr-modal-sub">
              Moving
              <strong>{{ reassignTarget()?.trans_type }} {{ reassignTarget()?.trans_amount | money:2 }}</strong>
              from the parent GL to a specific customer ledger on the
              same GL. The trial balance does not change — this is a
              linkage fix, not a value change. The narration will be
              suffixed with a reassignment note for audit.
            </div>
          </div>
        </div>
        <div class="cx-glr-modal-body">
          <label class="cx-glr-label">Destination sub-ledger</label>
          <select class="cx-input" [(ngModel)]="reassignLedgerId">
            <option [ngValue]="''">— Select a sub-ledger —</option>
            @for (c of orphanModal()?.candidate_ledgers || []; track c.id) {
              <option [ngValue]="c.id">
                {{ c.account_number }} · {{ c.customer_name || '—' }}{{ c.loan_ref ? ' · ' + c.loan_ref : '' }}
              </option>
            }
          </select>
          @if ((orphanModal()?.candidate_ledgers || []).length === 0) {
            <div class="cx-glr-modal-empty">
              No sub-ledgers exist yet on this GL. Create one by
              disbursing a loan first, or reverse + re-post this
              entry via Journal Entries.
            </div>
          }
        </div>
        <div class="cx-glr-modal-actions">
          <button class="cx-btn cx-btn-ghost" (click)="reassignTarget.set(null)"
                  [disabled]="reassignBusy()">
            Cancel
          </button>
          <button class="cx-btn cx-btn-primary" (click)="submitReassign()"
                  [disabled]="reassignBusy() || !reassignLedgerId">
            @if (reassignBusy()) { <span>Reassigning…</span> }
            @else {
              <lucide-icon name="link" [size]="14"></lucide-icon>
              <span>Reassign</span>
            }
          </button>
        </div>
      </div>
    }
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

    /* ═══ Orphan inspector + reassign modals ═══ */
    .cx-glr-backdrop {
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.5);
      z-index: 100;
      backdrop-filter: blur(4px);
    }
    /* The reassign sub-modal stacks ON TOP of the inspector. Two
       backdrops render — this one sits higher so clicking outside
       closes only the sub-modal, leaving the inspector open. */
    .cx-glr-backdrop-stack { z-index: 102; background: rgba(15, 23, 42, 0.35); }
    .cx-glr-modal {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: min(900px, calc(100vw - 32px));
      max-height: calc(100vh - 48px);
      overflow: hidden;
      display: flex; flex-direction: column;
      background: var(--cx-surface);
      border-radius: var(--cx-radius-xl, 16px);
      box-shadow: 0 32px 80px rgba(0, 0, 0, 0.25);
      z-index: 101;
    }
    .cx-glr-modal-stack { width: min(520px, calc(100vw - 32px)); z-index: 103; }
    .cx-glr-modal-head { display: flex; gap: 14px; padding: 20px 24px; }
    .cx-glr-modal-head lucide-icon { margin-top: 2px; color: var(--cx-primary-600); }
    .cx-glr-modal-eyebrow {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-glr-modal-title {
      margin: 4px 0 6px;
      font-size: 18px; font-weight: 600;
      color: var(--cx-text);
    }
    .cx-glr-modal-sub { font-size: 13px; color: var(--cx-text-secondary); line-height: 1.5; }
    .cx-glr-modal-body {
      padding: 0 24px 16px;
      overflow-y: auto;
      flex: 1;
    }
    .cx-glr-modal-loading {
      display: flex; align-items: center; justify-content: center;
      gap: 10px;
      padding: 32px 16px;
      color: var(--cx-text-secondary);
      font-size: 13px;
    }
    .cx-glr-modal-empty {
      padding: 24px 16px;
      text-align: center;
      color: var(--cx-text-muted);
      font-size: 13px;
      background: var(--cx-surface-2);
      border-radius: var(--cx-radius-md);
    }
    .cx-glr-modal-table {
      width: 100%; border-collapse: collapse;
      font-size: 12px;
    }
    .cx-glr-modal-table th {
      position: sticky; top: 0;
      padding: 8px 10px;
      text-align: left;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--cx-text-muted);
      background: var(--cx-surface);
      border-bottom: 1px solid var(--cx-border);
      white-space: nowrap;
    }
    .cx-glr-modal-table td {
      padding: 8px 10px;
      border-bottom: 1px solid var(--cx-border);
      color: var(--cx-text);
      white-space: nowrap;
    }
    .cx-glr-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
    .cx-glr-narration {
      max-width: 320px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: var(--cx-text-secondary);
    }
    .cx-glr-modal-actions {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 12px 24px 20px;
      border-top: 1px solid var(--cx-border);
    }
    .cx-glr-label {
      display: block;
      margin-bottom: 6px;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-glr-modal-body select {
      width: 100%;
      padding: 8px 10px;
      font-size: 13px;
    }
  `],
})
export class GlReconciliationComponent implements OnInit {
  accounts = signal<any[]>([]);
  summary = signal<any>(null);
  loading = signal(true);

  // ── Orphan inspector modal state ─────────────────────────────
  // orphanModal holds the whole GL's payload (orphan_postings +
  // candidate_ledgers); null when closed. Opening fetches fresh data
  // so operators see the current state, not a stale snapshot.
  orphanModal = signal<any>(null);
  orphanLoading = signal(false);

  // ── Reassign sub-modal state ─────────────────────────────────
  // reassignTarget is the single orphan posting being re-homed;
  // reassignLedgerId is the user's chosen destination sub-ledger.
  reassignTarget = signal<any>(null);
  reassignLedgerId = '';
  reassignBusy = signal(false);

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService, public settings: SettingsService) {}

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
   * Open the inspector for one GL account. Fetches its orphan
   * postings + candidate destination ledgers.
   */
  openOrphanModal(account: any) {
    this.orphanLoading.set(true);
    // Open with a stub so the modal header renders immediately; the
    // body swaps to the real payload when the fetch resolves.
    this.orphanModal.set({ gl: { code: account.code, name: account.name }, orphan_postings: [], candidate_ledgers: [] });
    this.api.get(`/accounting/gl-accounts/${account.id}/orphan-postings`).subscribe({
      next: r => {
        this.orphanModal.set(r.data);
        this.orphanLoading.set(false);
      },
      error: e => {
        this.orphanLoading.set(false);
        this.orphanModal.set(null);
        this.toast.error(e.error?.message || 'Failed to load orphan postings');
      },
    });
  }

  /** Launch the sub-modal to pick a destination sub-ledger. */
  openReassign(posting: any) {
    this.reassignTarget.set(posting);
    this.reassignLedgerId = '';
  }

  submitReassign() {
    const target = this.reassignTarget();
    if (!target || !this.reassignLedgerId) return;
    this.reassignBusy.set(true);
    this.api.post(`/accounting/transactions/${target.id}/reassign-ledger`, {
      customer_ledger_id: this.reassignLedgerId,
    }).subscribe({
      next: r => {
        this.reassignBusy.set(false);
        this.reassignTarget.set(null);
        this.toast.success(r.message || 'Reassigned');
        // Refresh the inspector payload so the reassigned row
        // disappears from the orphan list. Also refresh the main
        // table's summary counts — a reassign may have cleared
        // this GL's discrepancy entirely.
        const current = this.orphanModal();
        if (current?.gl?.id) {
          const stub = { id: current.gl.id, code: current.gl.code, name: current.gl.name };
          this.openOrphanModal(stub);
        }
        this.load();
      },
      error: e => {
        this.reassignBusy.set(false);
        this.toast.error(e.error?.message || 'Reassign failed');
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
