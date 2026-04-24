import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { BulkActionBarComponent } from '../../shared/components/bulk-action-bar/bulk-action-bar.component';

/**
 * Disbursement queue — dedicated page for users with loans.disburse.
 *
 * Mirrors the approval-queue pattern but targets loans in APPROVED
 * status (decision final, funds not yet moved). Each row opens an
 * inline modal with the full calculator preview + settlement GL
 * picker + auto-detected top-up balance, so the finance user can
 * confirm disbursement without leaving the queue.
 *
 * Access is gated at three layers:
 *   1. Menu visibility (layout.component.ts checks loans.disburse)
 *   2. Route (could be added but not strictly required — page is only
 *      reachable through the menu entry which is permission-gated)
 *   3. Backend endpoint (routes.php wraps with RbacMiddleware)
 *
 * Missing middleware means a user could type the URL directly if they
 * knew it, but the backend would refuse the list fetch with 403 and
 * the page would just show an empty state.
 */
@Component({
  selector: 'app-disbursement-queue',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, BulkActionBarComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Disbursement Queue"
        subtitle="Approved loans awaiting fund disbursement"
        eyebrow="Finance"></cx-page-header>

      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()"
                     [pagination]="pagination()"
                     searchPlaceholder="Search by application ID or customer..."
                     [hasActions]="true"
                     [selectable]="true"
                     [selectedIds]="selectedIds()"
                     (selectedIdsChange)="onSelectionChange($event)"
                     trackBy="id"
                     (query)="onQuery($event)">
        <ng-template #rowActions let-row>
          <div class="flex items-center gap-1 justify-end">
            <button class="cx-btn cx-btn-primary cx-btn-sm" (click)="openDisburse(row)" title="Disburse">
              <lucide-icon name="banknote" [size]="14"></lucide-icon>
              <span class="ml-1">Disburse</span>
            </button>
          </div>
        </ng-template>
      </cx-data-table>
    </div>

    <!-- Disbursement modal — full preview + settlement GL + top-up override -->
    @if (modalOpen()) {
      <div class="cx-dq-backdrop" (click)="closeModal()"></div>
      <div class="cx-dq-modal" role="dialog" aria-labelledby="dq-modal-title">
        <div class="cx-dq-modal-head">
          <div>
            <div class="cx-dq-modal-eyebrow">Disbursing</div>
            <h2 id="dq-modal-title" class="cx-dq-modal-title tabular-nums">
              {{ activeRow()?.application_id }}
            </h2>
            <div class="cx-dq-modal-sub">
              {{ activeRow()?.customer_name }} · {{ activeRow()?.product_name }}
            </div>
          </div>
          <button class="cx-dq-modal-close" (click)="closeModal()" aria-label="Close">
            <lucide-icon name="x" [size]="18"></lucide-icon>
          </button>
        </div>

        <div class="cx-dq-modal-body">
          @if (previewLoading()) {
            <div class="cx-dq-loading">
              <lucide-icon name="loader-2" [size]="24" class="cx-dq-spin"></lucide-icon>
              <span>Calculating loan preview...</span>
            </div>
          } @else if (preview(); as p) {
            <!-- Calculator preview — matches agent's loan calculator -->
            <div class="cx-dq-calc" [class.cx-dq-calc-recomputing]="recomputing()">
              <div class="cx-dq-calc-grid">
                <div class="cx-dq-hero cx-dq-hero-primary">
                  <div class="cx-dq-hero-label">Net Disbursed</div>
                  <div class="cx-dq-hero-value tabular-nums">
                    ₦{{ p.calculation?.net_disbursed | number:'1.0-0' }}
                  </div>
                </div>
                <div class="cx-dq-hero cx-dq-hero-gold">
                  <div class="cx-dq-hero-label">Monthly Repayment</div>
                  <div class="cx-dq-hero-value tabular-nums">
                    ₦{{ p.calculation?.mr_principal_interest | number:'1.0-0' }}
                  </div>
                </div>
              </div>
              <div class="cx-dq-rows">
                <div class="cx-dq-row">
                  <span>Gross Loan</span>
                  <span class="tabular-nums">₦{{ p.calculation?.gross_loan | number:'1.2-2' }}</span>
                </div>
                <div class="cx-dq-row">
                  <span>Total Fees</span>
                  <span class="tabular-nums">₦{{ p.calculation?.total_fees | number:'1.2-2' }}</span>
                </div>
                @if (p.calculation?.fee_details?.length) {
                  @for (fee of p.calculation.fee_details; track fee.code) {
                    <div class="cx-dq-row cx-dq-row-sub">
                      <span>↳ {{ fee.name || fee.code }}</span>
                      <span class="tabular-nums">₦{{ fee.amount | number:'1.2-2' }}</span>
                    </div>
                  }
                }
                <div class="cx-dq-row">
                  <span>Monthly Principal</span>
                  <span class="tabular-nums">₦{{ p.calculation?.mr_principal | number:'1.2-2' }}</span>
                </div>
                <div class="cx-dq-row">
                  <span>Monthly Interest</span>
                  <span class="tabular-nums">₦{{ p.calculation?.mr_interest | number:'1.2-2' }}</span>
                </div>
                <div class="cx-dq-row">
                  <span>Tenure</span>
                  <span class="tabular-nums">{{ p.loan?.tenure }} months</span>
                </div>
              </div>
              @if (p.calculation?.schedule_preview?.length) {
                <details class="cx-dq-schedule">
                  <summary>View repayment schedule ({{ p.calculation.schedule_preview.length }} installments)</summary>
                  <div class="cx-dq-schedule-table">
                    <div class="cx-dq-schedule-head">
                      <span>#</span><span>Principal</span><span>Interest</span><span>Total</span>
                    </div>
                    @for (inst of p.calculation.schedule_preview; track $index) {
                      <div class="cx-dq-schedule-row">
                        <span class="tabular-nums">{{ $index + 1 }}</span>
                        <span class="tabular-nums">₦{{ inst.principal | number:'1.2-2' }}</span>
                        <span class="tabular-nums">₦{{ inst.interest | number:'1.2-2' }}</span>
                        <span class="tabular-nums">₦{{ inst.total | number:'1.2-2' }}</span>
                      </div>
                    }
                  </div>
                </details>
              }
            </div>

            <!-- Top-up -->
            <div class="cx-dq-section">
              <label class="cx-label">
                Top-up Balance
                @if (p.top_up?.locked_by_underwriter) {
                  <span class="cx-dq-locked-tag">
                    <lucide-icon name="lock" [size]="11"></lucide-icon>
                    locked by underwriter
                  </span>
                } @else if (recomputing()) {
                  <span class="cx-dq-recomputing-tag">recalculating…</span>
                }
              </label>
              <input type="number" class="cx-input tabular-nums"
                     [(ngModel)]="topUpBalance"
                     (ngModelChange)="onTopUpChange()"
                     [readonly]="p.top_up?.locked_by_underwriter"
                     [class.cx-dq-input-locked]="p.top_up?.locked_by_underwriter"
                     placeholder="0.00" step="0.01" min="0" />
              <div class="cx-dq-hint"
                   [class.cx-dq-hint-info]="p.top_up?.auto_detected || p.top_up?.locked_by_underwriter"
                   [class.cx-dq-hint-muted]="!p.top_up?.auto_detected && !p.top_up?.locked_by_underwriter">
                <lucide-icon [name]="p.top_up?.locked_by_underwriter ? 'lock' : 'info'" [size]="14"></lucide-icon>
                <span>{{ p.top_up?.message }}</span>
              </div>
            </div>

            <!-- Settlement GL -->
            <div class="cx-dq-section">
              <label class="cx-label">Settlement GL Account <span class="cx-dq-required">*</span></label>
              <select class="cx-input" [(ngModel)]="settlementGlId">
                <option value="">— Select settlement account —</option>
                @for (gl of p.settlement_gls; track gl.id) {
                  <option [value]="gl.id">{{ gl.code }} — {{ gl.name }}</option>
                }
              </select>
            </div>

            <!-- Effective date -->
            <div class="cx-dq-section">
              <label class="cx-label">Effective Date</label>
              <input type="date" class="cx-input" [(ngModel)]="effectiveDate" />
            </div>

            <!-- Notes -->
            <div class="cx-dq-section">
              <label class="cx-label">Notes (optional)</label>
              <textarea class="cx-input" rows="2" [(ngModel)]="notes"
                        placeholder="Disbursement notes for the audit log..."></textarea>
            </div>
          }
        </div>

        <div class="cx-dq-modal-actions">
          <button class="cx-btn cx-btn-ghost" (click)="closeModal()" [disabled]="disbursing()">
            Cancel
          </button>
          <button class="cx-btn cx-btn-primary" (click)="confirmDisburse()"
                  [disabled]="disbursing() || !settlementGlId || previewLoading()">
            @if (disbursing()) {
              <span>Disbursing...</span>
            } @else {
              <lucide-icon name="banknote" [size]="14"></lucide-icon>
              <span>Confirm Disbursement</span>
            }
          </button>
        </div>
      </div>
    }

    <!-- Floating bulk action bar — selection-driven -->
    <cx-bulk-action-bar
      [count]="selectedIds().size"
      primaryLabel="Batch Disburse"
      primaryIcon="banknote"
      [busy]="batchSubmitting()"
      (primary)="openBatchModal()"
      (clear)="clearSelection()">
    </cx-bulk-action-bar>

    <!-- Batch disburse modal — collects settlement GL + effective date -->
    @if (batchModalOpen()) {
      <div class="cx-dq-backdrop" (click)="closeBatchModal()"></div>
      <div class="cx-dq-modal" role="dialog" aria-labelledby="batch-title">
        <div class="cx-dq-modal-head">
          <div>
            <div class="cx-dq-modal-eyebrow">Batch Disburse</div>
            <h2 id="batch-title" class="cx-dq-modal-title">
              Disburse <strong class="tabular-nums">{{ selectedIds().size }}</strong> loans
            </h2>
            <div class="cx-dq-modal-sub">
              All loans will be funded from the same settlement GL on the
              same effective date. Top-up balances auto-detect per loan.
            </div>
          </div>
          <button class="cx-dq-modal-close" (click)="closeBatchModal()" aria-label="Close">
            <lucide-icon name="x" [size]="18"></lucide-icon>
          </button>
        </div>

        <div class="cx-dq-modal-body">
          @if (batchGlsLoading()) {
            <div class="cx-dq-loading">
              <lucide-icon name="loader-2" [size]="16" class="cx-dq-spin"></lucide-icon>
              <span>Loading settlement accounts…</span>
            </div>
          } @else {
            <div class="cx-dq-section">
              <label class="cx-label">Settlement GL Account <span class="cx-dq-required">*</span></label>
              <select class="cx-input" [(ngModel)]="batchSettlementGlId">
                <option value="">— Select settlement account —</option>
                @for (gl of batchGls(); track gl.id) {
                  <option [value]="gl.id">{{ gl.code }} — {{ gl.name }}</option>
                }
              </select>
            </div>

            <div class="cx-dq-section">
              <label class="cx-label">Effective Date</label>
              <input type="date" class="cx-input" [(ngModel)]="batchEffectiveDate" />
            </div>

            <div class="cx-dq-section">
              <label class="cx-label">Notes (optional)</label>
              <textarea class="cx-input" rows="2" [(ngModel)]="batchNotes"
                        placeholder="Batch disbursement notes for the audit log..."></textarea>
            </div>
          }
        </div>

        <div class="cx-dq-modal-actions">
          <button class="cx-btn cx-btn-ghost" (click)="closeBatchModal()" [disabled]="batchSubmitting()">
            Cancel
          </button>
          <button class="cx-btn cx-btn-primary"
                  (click)="submitBatch()"
                  [disabled]="batchSubmitting() || !batchSettlementGlId || batchGlsLoading()">
            @if (batchSubmitting()) {
              <span>Disbursing…</span>
            } @else {
              <lucide-icon name="banknote" [size]="14"></lucide-icon>
              <span>Disburse {{ selectedIds().size }} loans</span>
            }
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    /* ═══ Modal ═══ */
    .cx-dq-backdrop {
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.5);
      z-index: 100;
      backdrop-filter: blur(4px);
    }
    .cx-dq-modal {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: min(640px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      background: var(--cx-surface);
      border-radius: var(--cx-radius-xl, 16px);
      box-shadow: 0 32px 80px rgba(0, 0, 0, 0.25);
      display: flex;
      flex-direction: column;
      z-index: 101;
      overflow: hidden;
      animation: cx-dq-modal-in 200ms var(--cx-ease-premium, cubic-bezier(0.4, 0, 0.2, 1));
    }
    @keyframes cx-dq-modal-in {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
      to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
    @media (max-width: 640px) {
      .cx-dq-modal { width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; }
    }

    .cx-dq-modal-head {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 12px; padding: 20px 24px 16px;
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-dq-modal-eyebrow {
      font-size: 11px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-accent-600, var(--cx-primary-600));
    }
    .cx-dq-modal-title {
      margin: 4px 0 0; font-size: 22px; font-weight: 600;
      color: var(--cx-text); letter-spacing: -0.02em;
    }
    .cx-dq-modal-sub {
      font-size: 13px; color: var(--cx-text-secondary); margin-top: 2px;
    }
    .cx-dq-modal-close {
      width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      background: var(--cx-surface-2); border: none; border-radius: 50%;
      color: var(--cx-text-secondary); cursor: pointer; flex-shrink: 0;
    }
    .cx-dq-modal-close:hover { background: var(--cx-surface-hover); color: var(--cx-text); }

    .cx-dq-modal-body { flex: 1; overflow-y: auto; padding: 20px 24px; }

    .cx-dq-loading {
      display: flex; align-items: center; justify-content: center;
      gap: 10px; padding: 48px 0;
      color: var(--cx-text-secondary); font-size: 14px;
    }
    .cx-dq-spin { animation: cx-dq-spin 1s linear infinite; }
    @keyframes cx-dq-spin { to { transform: rotate(360deg); } }

    /* Calculator */
    .cx-dq-calc {
      background: var(--cx-surface-2, #f9fafb);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl, 12px);
      padding: 16px;
      margin-bottom: 16px;
    }
    .cx-dq-calc-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;
    }
    .cx-dq-hero {
      padding: 12px 14px;
      border-radius: var(--cx-radius-md);
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
    }
    .cx-dq-hero-primary { border-color: var(--cx-success, #16a34a); }
    .cx-dq-hero-gold { border-color: var(--cx-accent-500, #d97706); }
    .cx-dq-calc-recomputing .cx-dq-hero-value {
      opacity: 0.55;
      transition: opacity 200ms;
    }
    .cx-dq-recomputing-tag {
      margin-left: 6px;
      padding: 1px 6px;
      background: rgba(245, 158, 11, 0.14);
      color: #b45309;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      border-radius: 4px;
      animation: cx-dq-pulse 1.2s ease-in-out infinite;
    }
    /* Underwriter-locked top-up indicator + readonly input styling.
       Same visual language as the account-type chips elsewhere —
       subtle background, small caps tag, a lock icon to the left. */
    .cx-dq-locked-tag {
      display: inline-flex; align-items: center; gap: 3px;
      margin-left: 6px;
      padding: 1px 6px;
      background: rgba(124, 58, 237, 0.12);
      color: #6d28d9;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      border-radius: 4px;
    }
    .cx-dq-input-locked {
      background: var(--cx-surface-2) !important;
      color: var(--cx-text-muted);
      cursor: not-allowed;
    }
    @keyframes cx-dq-pulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }
    .cx-dq-hero-label {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-dq-hero-value {
      font-size: 18px; font-weight: 600;
      color: var(--cx-text); margin-top: 4px;
      letter-spacing: -0.02em;
    }
    .cx-dq-hero-primary .cx-dq-hero-value { color: var(--cx-success, #16a34a); }
    .cx-dq-hero-gold .cx-dq-hero-value { color: var(--cx-accent-600, #b45309); }

    .cx-dq-rows { display: flex; flex-direction: column; gap: 4px; }
    .cx-dq-row {
      display: flex; justify-content: space-between;
      padding: 6px 10px; font-size: 13px; color: var(--cx-text);
    }
    .cx-dq-row-sub { padding-left: 20px; color: var(--cx-text-muted); font-size: 12px; }
    .cx-dq-row:nth-child(even) { background: rgba(0, 0, 0, 0.02); }

    .cx-dq-schedule {
      margin-top: 12px; padding-top: 12px;
      border-top: 1px solid var(--cx-border);
    }
    .cx-dq-schedule summary {
      font-size: 12px; color: var(--cx-text-secondary);
      cursor: pointer; padding: 4px 0;
    }
    .cx-dq-schedule-table {
      margin-top: 8px; max-height: 240px; overflow-y: auto;
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md); background: var(--cx-surface);
    }
    .cx-dq-schedule-head, .cx-dq-schedule-row {
      display: grid; grid-template-columns: 40px 1fr 1fr 1fr;
      gap: 8px; padding: 8px 12px; font-size: 12px;
    }
    .cx-dq-schedule-head {
      background: var(--cx-surface-2); font-weight: 600;
      color: var(--cx-text-muted);
      text-transform: uppercase; letter-spacing: 0.05em;
      font-size: 10px; border-bottom: 1px solid var(--cx-border);
    }
    .cx-dq-schedule-row { border-bottom: 1px solid var(--cx-border-subtle, var(--cx-border)); }
    .cx-dq-schedule-row:last-child { border-bottom: none; }

    .cx-dq-section { margin-bottom: 14px; }
    .cx-dq-hint {
      display: flex; align-items: flex-start; gap: 6px;
      margin-top: 6px; padding: 8px 10px;
      font-size: 11px; line-height: 1.45;
      border-radius: var(--cx-radius-md);
    }
    .cx-dq-hint-info {
      background: rgba(14, 165, 233, 0.08);
      color: var(--cx-info-600, #0284c7);
      border: 1px solid rgba(14, 165, 233, 0.18);
    }
    .cx-dq-hint-muted {
      background: var(--cx-surface-2); color: var(--cx-text-muted);
    }
    .cx-dq-required { color: var(--cx-danger, #dc2626); }

    .cx-dq-modal-actions {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 16px 24px 20px;
      border-top: 1px solid var(--cx-border);
      background: var(--cx-surface);
    }
  `],
})
export class DisbursementQueueComponent implements OnInit {
  columns: TableColumn[] = [
    { key: 'application_id', label: 'App ID' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'amount_requested', label: 'Amount', type: 'currency', align: 'right' },
    { key: 'net_disbursed', label: 'Net', type: 'currency', align: 'right' },
    { key: 'product_name', label: 'Product' },
    { key: 'branch_name', label: 'Branch' },
    { key: 'agent_name', label: 'Agent' },
    { key: 'approved_at', label: 'Approved', type: 'date' },
  ];
  rows = signal<any[]>([]);
  loading = signal(true);
  pagination = signal<TablePagination | null>(null);
  q: any = {};

  // Modal state
  modalOpen = signal(false);
  activeRow = signal<any>(null);
  preview = signal<any>(null);
  previewLoading = signal(false);
  disbursing = signal(false);
  // Set while a debounced recompute is in-flight after the user edits
  // the top-up input. Preview tiles dim to ~55% opacity while true.
  recomputing = signal(false);
  private topUpDebounceTimer: any = null;

  settlementGlId = '';
  topUpBalance = '';
  effectiveDate = '';
  notes = '';

  // ─── Batch state ────────────────────────────────────────────────────
  // Selection tracked across pagination via a Set<string> of loan IDs.
  // Keys are row.id strings (matches the DataTable's trackBy="id").
  selectedIds = signal<Set<string>>(new Set());
  batchModalOpen = signal(false);
  batchSubmitting = signal(false);
  batchGls = signal<any[]>([]);
  batchGlsLoading = signal(false);
  batchSettlementGlId = '';
  batchEffectiveDate = '';
  batchNotes = '';

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() { this.load(); }

  load(p?: any) {
    this.loading.set(true);
    this.api.get('/disbursement-queue', { ...this.q, ...p }).subscribe({
      next: r => {
        this.rows.set(r.data || []);
        this.pagination.set(r.meta || null);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onQuery(e: TableQueryEvent) { this.q = e; this.load(e); }

  /**
   * Open the disbursement modal. Fetches preview in parallel so the
   * modal can show its skeleton immediately.
   */
  openDisburse(row: any) {
    const loanId = row.id || row.loan_id;
    if (!loanId) return;
    this.activeRow.set(row);
    this.preview.set(null);
    this.previewLoading.set(true);
    this.settlementGlId = '';
    this.topUpBalance = '';
    this.notes = '';
    this.effectiveDate = new Date().toISOString().slice(0, 10);
    this.modalOpen.set(true);

    this.api.get(`/loans/${loanId}/disbursement-preview`).subscribe({
      next: r => {
        this.preview.set(r.data);
        this.previewLoading.set(false);
        this.topUpBalance = r.data?.top_up?.balance ?? '0.00';
      },
      error: e => {
        this.previewLoading.set(false);
        this.toast.error(e.error?.message || 'Could not load preview');
        this.modalOpen.set(false);
      },
    });
  }

  closeModal() {
    if (this.disbursing()) return;
    this.modalOpen.set(false);
    this.activeRow.set(null);
    this.preview.set(null);
  }

  /**
   * Debounced recompute when the top-up input changes. Same pattern as
   * loan-detail.component's onTopUpChange: 400ms trailing-edge debounce,
   * hits /loans/:id/disbursement-preview with the override query param,
   * preserves the settlement_gls list so the user's GL selection stays.
   */
  onTopUpChange() {
    const loanId = this.activeRow()?.id || this.activeRow()?.loan_id;
    if (!loanId) return;
    // No-op when the underwriter has locked this value. The input is
    // readonly in the UI but if somehow fired (programmatic change,
    // browser autofill), don't round-trip the preview endpoint.
    if (this.preview()?.top_up?.locked_by_underwriter) return;
    if (this.topUpDebounceTimer) clearTimeout(this.topUpDebounceTimer);
    this.topUpDebounceTimer = setTimeout(() => {
      this.recomputing.set(true);
      this.api.get(`/loans/${loanId}/disbursement-preview`, {
        top_up_balance: this.topUpBalance || '0',
      }).subscribe({
        next: r => {
          const current = this.preview();
          if (current) {
            this.preview.set({
              ...current,
              calculation: r.data?.calculation ?? current.calculation,
              top_up:      r.data?.top_up ?? current.top_up,
            });
          } else {
            this.preview.set(r.data);
          }
          this.recomputing.set(false);
        },
        error: () => this.recomputing.set(false),
      });
    }, 400);
  }

  confirmDisburse() {
    const loanId = this.activeRow()?.id || this.activeRow()?.loan_id;
    if (!loanId || !this.settlementGlId) return;
    this.disbursing.set(true);
    this.api.post(`/loans/${loanId}/disburse`, {
      settlement_gl_id: this.settlementGlId,
      effective_date: this.effectiveDate,
      top_up_balance: this.topUpBalance || '0',
      notes: this.notes,
    }).subscribe({
      next: r => {
        this.disbursing.set(false);
        this.toast.success(r.message || 'Loan disbursed');
        this.modalOpen.set(false);
        this.load(this.q);
      },
      error: e => {
        this.disbursing.set(false);
        this.toast.error(e.error?.message || 'Disbursement failed');
      },
    });
  }

  // ─── Batch disburse ─────────────────────────────────────────────────

  onSelectionChange(next: Set<string>): void {
    this.selectedIds.set(new Set(next));
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  /**
   * Open the batch disburse modal. Fetches the settlement-GL list
   * once via a preview call against the first selected loan (any
   * loan works — the list is global, not per-loan). Cached across
   * opens within the session.
   */
  openBatchModal(): void {
    if (this.selectedIds().size === 0) return;
    this.batchSettlementGlId = '';
    this.batchEffectiveDate = new Date().toISOString().slice(0, 10);
    this.batchNotes = '';
    this.batchModalOpen.set(true);

    // Only fetch the GL list if we don't already have it cached.
    if (this.batchGls().length > 0) return;

    const firstId = Array.from(this.selectedIds())[0];
    if (!firstId) return;
    this.batchGlsLoading.set(true);
    this.api.get(`/loans/${firstId}/disbursement-preview`).subscribe({
      next: r => {
        this.batchGls.set(r.data?.settlement_gls ?? []);
        this.batchGlsLoading.set(false);
      },
      error: () => this.batchGlsLoading.set(false),
    });
  }

  closeBatchModal(): void {
    if (this.batchSubmitting()) return;
    this.batchModalOpen.set(false);
  }

  /**
   * Submit the batch. Same settlement GL + effective date for every
   * loan; top-up auto-detected per loan server-side. Response has
   * success[] and failed[] arrays.
   */
  submitBatch(): void {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0 || !this.batchSettlementGlId) return;
    this.batchSubmitting.set(true);
    this.api.post('/disbursement/batch', {
      loan_ids: ids,
      settlement_gl_id: this.batchSettlementGlId,
      effective_date: this.batchEffectiveDate,
      notes: this.batchNotes,
    }).subscribe({
      next: r => {
        this.batchSubmitting.set(false);
        this.batchModalOpen.set(false);
        const success = r.data?.success ?? [];
        const failed  = r.data?.failed ?? [];
        if (failed.length === 0) {
          this.toast.success(r.message || `All ${success.length} processed`);
          this.clearSelection();
        } else {
          // Keep failed loan_ids selected so the user can retry
          // (e.g. after bumping a permission or checking the loan
          // status). Successful ones drop out of the queue naturally
          // on the next load.
          const failedIds = new Set<string>(failed.map((f: any) => String(f.loan_id)));
          this.selectedIds.set(failedIds);
          this.toast.error(
            `${success.length} disbursed, ${failed.length} failed — ${failed[0]?.error || 'see details'}`
          );
        }
        this.load(this.q);
      },
      error: e => {
        this.batchSubmitting.set(false);
        this.toast.error(e.error?.message || 'Batch disbursement failed');
      },
    });
  }
}
