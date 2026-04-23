import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';

/**
 * Maker-Checker queue — dedicated page for users with maker_checker.check.
 *
 * Lists all pending maker-checker requests (disbursements, reversals,
 * etc. submitted by makers when two-eyes control is enforced in
 * settings). Each row opens an inline modal with the full payload
 * preview — for disbursements, the modal mirrors the disburse dialog
 * so the checker sees exactly what will happen on approval.
 *
 * Maker cannot be their own checker. The backend enforces this; the
 * UI greys out the approve/reject buttons when the current user's ID
 * matches the maker_id on the row.
 *
 * Gated at menu + route + backend endpoint (RbacMiddleware).
 */
@Component({
  selector: 'app-maker-checker',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Maker-Checker Queue"
        subtitle="Operations awaiting second-eye approval"
        eyebrow="Compliance"></cx-page-header>

      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()"
                     [pagination]="pagination()"
                     searchPlaceholder="Search by operation or entity..."
                     [hasActions]="true" (query)="onQuery($event)">
        <ng-template #rowActions let-row>
          <div class="flex items-center gap-1 justify-end">
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openReview(row)" title="Review">
              <lucide-icon name="eye" [size]="14"></lucide-icon>
            </button>
          </div>
        </ng-template>
      </cx-data-table>
    </div>

    @if (modalOpen()) {
      <div class="cx-mc-backdrop" (click)="closeModal()"></div>
      <div class="cx-mc-modal" role="dialog" aria-labelledby="mc-modal-title">
        <div class="cx-mc-modal-head">
          <div>
            <div class="cx-mc-modal-eyebrow">{{ prettyOperationType(activeRow()?.operation_type) }}</div>
            <h2 id="mc-modal-title" class="cx-mc-modal-title">
              {{ activeRow()?.entity_type }} review
            </h2>
            <div class="cx-mc-modal-sub">
              Submitted by {{ activeRow()?.maker_name }}
              @if (activeRow()?.created_at) { · {{ activeRow()?.created_at }} }
            </div>
          </div>
          <button class="cx-mc-modal-close" (click)="closeModal()" aria-label="Close">
            <lucide-icon name="x" [size]="18"></lucide-icon>
          </button>
        </div>

        <div class="cx-mc-modal-body">
          <!-- Maker comment -->
          @if (activeRow()?.maker_comment) {
            <section class="cx-mc-section">
              <h3 class="cx-mc-section-title">Maker's Note</h3>
              <div class="cx-mc-comment">"{{ activeRow()?.maker_comment }}"</div>
            </section>
          }

          <!-- Disbursement preview -->
          @if (activeRow()?.operation_type === 'disbursement' && disbursePreview(); as p) {
            <section class="cx-mc-section">
              <h3 class="cx-mc-section-title">Disbursement Preview</h3>
              <div class="cx-mc-preview">
                <div class="cx-mc-grid">
                  <div class="cx-mc-hero cx-mc-hero-primary">
                    <div class="cx-mc-hero-label">Net Disbursed</div>
                    <div class="cx-mc-hero-value tabular-nums">
                      ₦{{ p.calculation?.net_disbursed | number:'1.0-0' }}
                    </div>
                  </div>
                  <div class="cx-mc-hero cx-mc-hero-gold">
                    <div class="cx-mc-hero-label">Monthly Repayment</div>
                    <div class="cx-mc-hero-value tabular-nums">
                      ₦{{ p.calculation?.mr_principal_interest | number:'1.0-0' }}
                    </div>
                  </div>
                </div>
                <div class="cx-mc-rows">
                  <div class="cx-mc-row">
                    <span>Loan</span>
                    <span class="tabular-nums">{{ p.loan?.application_id }}</span>
                  </div>
                  <div class="cx-mc-row">
                    <span>Customer</span>
                    <span>{{ p.loan?.customer_name }}</span>
                  </div>
                  <div class="cx-mc-row">
                    <span>Product</span>
                    <span>{{ p.loan?.product_name }}</span>
                  </div>
                  <div class="cx-mc-row">
                    <span>Gross Loan</span>
                    <span class="tabular-nums">₦{{ p.calculation?.gross_loan | number:'1.2-2' }}</span>
                  </div>
                  <div class="cx-mc-row">
                    <span>Total Fees</span>
                    <span class="tabular-nums">₦{{ p.calculation?.total_fees | number:'1.2-2' }}</span>
                  </div>
                  <div class="cx-mc-row">
                    <span>Tenure</span>
                    <span class="tabular-nums">{{ p.loan?.tenure }} months</span>
                  </div>
                </div>
              </div>
            </section>
          } @else if (activeRow()?.operation_type === 'disbursement' && disbursePreviewLoading()) {
            <section class="cx-mc-section">
              <h3 class="cx-mc-section-title">Disbursement Preview</h3>
              <div class="cx-mc-loading">
                <lucide-icon name="loader-2" [size]="24" class="cx-mc-spin"></lucide-icon>
                <span>Loading preview...</span>
              </div>
            </section>
          }

          <!-- Raw payload — always shown so checker can verify exact values -->
          <section class="cx-mc-section">
            <h3 class="cx-mc-section-title">Operation Details</h3>
            <div class="cx-mc-payload">
              @for (entry of payloadEntries(); track entry.key) {
                <div class="cx-mc-payload-row">
                  <span class="cx-mc-payload-key">{{ entry.key }}</span>
                  <span class="cx-mc-payload-val tabular-nums">{{ entry.value }}</span>
                </div>
              }
            </div>
          </section>

          <!-- Decision area -->
          @if (isOwnRequest()) {
            <div class="cx-mc-self-warning">
              <lucide-icon name="info" [size]="14"></lucide-icon>
              <span>You submitted this request. A different user must act as the checker.</span>
            </div>
          } @else {
            <section class="cx-mc-section">
              <h3 class="cx-mc-section-title">Your Decision</h3>
              <label class="cx-label">Comment (required for reject, optional for approve)</label>
              <textarea class="cx-input" rows="3" [(ngModel)]="comment"
                        placeholder="Why are you approving or rejecting this request?"></textarea>
            </section>
          }
        </div>

        <div class="cx-mc-modal-actions">
          <button class="cx-btn cx-btn-ghost" (click)="closeModal()" [disabled]="deciding()">
            Cancel
          </button>
          @if (!isOwnRequest()) {
            <button class="cx-btn cx-btn-danger" (click)="decide('reject')"
                    [disabled]="deciding() || !comment.trim()">
              <lucide-icon name="x-circle" [size]="14"></lucide-icon>
              <span>Reject</span>
            </button>
            <button class="cx-btn cx-btn-primary" (click)="decide('approve')"
                    [disabled]="deciding()">
              <lucide-icon name="check-circle" [size]="14"></lucide-icon>
              <span>Approve & Execute</span>
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .cx-mc-backdrop {
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.5);
      z-index: 100;
      backdrop-filter: blur(4px);
    }
    .cx-mc-modal {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: min(720px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      background: var(--cx-surface);
      border-radius: var(--cx-radius-xl, 16px);
      box-shadow: 0 32px 80px rgba(0, 0, 0, 0.25);
      display: flex; flex-direction: column;
      z-index: 101; overflow: hidden;
      animation: cx-mc-modal-in 200ms var(--cx-ease-premium, cubic-bezier(0.4, 0, 0.2, 1));
    }
    @keyframes cx-mc-modal-in {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
      to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
    @media (max-width: 640px) {
      .cx-mc-modal { width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; }
    }
    .cx-mc-modal-head {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 12px; padding: 20px 24px 16px;
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-mc-modal-eyebrow {
      font-size: 11px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-accent-600, var(--cx-primary-600));
    }
    .cx-mc-modal-title {
      margin: 4px 0 0; font-size: 20px; font-weight: 600;
      color: var(--cx-text); letter-spacing: -0.015em;
    }
    .cx-mc-modal-sub {
      font-size: 12px; color: var(--cx-text-secondary); margin-top: 2px;
    }
    .cx-mc-modal-close {
      width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      background: var(--cx-surface-2); border: none; border-radius: 50%;
      color: var(--cx-text-secondary); cursor: pointer; flex-shrink: 0;
    }
    .cx-mc-modal-close:hover { background: var(--cx-surface-hover); color: var(--cx-text); }

    .cx-mc-modal-body { flex: 1; overflow-y: auto; padding: 20px 24px; }
    .cx-mc-section { margin-bottom: 20px; }
    .cx-mc-section:last-child { margin-bottom: 0; }
    .cx-mc-section-title {
      font-size: 11px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted); margin: 0 0 10px;
    }

    .cx-mc-comment {
      font-size: 13px; font-style: italic;
      color: var(--cx-text-secondary);
      padding: 10px 14px;
      background: var(--cx-surface-2);
      border-left: 3px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
    }

    .cx-mc-loading {
      display: flex; align-items: center; justify-content: center;
      gap: 10px; padding: 24px 0;
      color: var(--cx-text-secondary); font-size: 14px;
    }
    .cx-mc-spin { animation: cx-mc-spin 1s linear infinite; }
    @keyframes cx-mc-spin { to { transform: rotate(360deg); } }

    /* Disbursement preview — compact version of the disbursement queue's */
    .cx-mc-preview {
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl, 12px);
      padding: 14px;
    }
    .cx-mc-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;
    }
    .cx-mc-hero {
      padding: 10px 12px;
      border-radius: var(--cx-radius-md);
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
    }
    .cx-mc-hero-primary { border-color: var(--cx-success, #16a34a); }
    .cx-mc-hero-gold { border-color: var(--cx-accent-500, #d97706); }
    .cx-mc-hero-label {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-mc-hero-value {
      font-size: 16px; font-weight: 600; color: var(--cx-text);
      margin-top: 4px; letter-spacing: -0.02em;
    }
    .cx-mc-hero-primary .cx-mc-hero-value { color: var(--cx-success, #16a34a); }
    .cx-mc-hero-gold .cx-mc-hero-value { color: var(--cx-accent-600, #b45309); }
    .cx-mc-rows { display: flex; flex-direction: column; gap: 2px; }
    .cx-mc-row {
      display: flex; justify-content: space-between;
      padding: 6px 10px; font-size: 13px; color: var(--cx-text);
    }
    .cx-mc-row:nth-child(even) { background: rgba(0, 0, 0, 0.02); }

    /* Payload table — key/value inspection for any operation type */
    .cx-mc-payload {
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      padding: 6px 0;
    }
    .cx-mc-payload-row {
      display: flex; justify-content: space-between; gap: 16px;
      padding: 8px 14px; font-size: 12px;
      border-bottom: 1px solid var(--cx-border-subtle, var(--cx-border));
    }
    .cx-mc-payload-row:last-child { border-bottom: none; }
    .cx-mc-payload-key {
      color: var(--cx-text-muted);
      font-family: var(--cx-font-mono, monospace);
      font-size: 11px;
      flex-shrink: 0;
    }
    .cx-mc-payload-val {
      color: var(--cx-text);
      text-align: right;
      word-break: break-all;
    }

    .cx-mc-self-warning {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 12px 14px; margin-top: 4px;
      background: rgba(250, 204, 21, 0.08);
      border: 1px solid rgba(250, 204, 21, 0.24);
      border-radius: var(--cx-radius-md);
      color: var(--cx-warning-700, #a16207);
      font-size: 12px; line-height: 1.45;
    }

    .cx-mc-modal-actions {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 16px 24px 20px;
      border-top: 1px solid var(--cx-border);
      background: var(--cx-surface);
    }
  `],
})
export class MakerCheckerComponent implements OnInit {
  columns: TableColumn[] = [
    { key: 'operation_type', label: 'Operation' },
    { key: 'entity_type', label: 'Entity' },
    { key: 'maker_name', label: 'Submitted By' },
    { key: 'status', label: 'Status' },
    { key: 'created_at', label: 'Submitted', type: 'date' },
  ];
  rows = signal<any[]>([]);
  loading = signal(true);
  pagination = signal<TablePagination | null>(null);
  q: any = { status: 'pending' };  // default filter: pending only

  // Modal state
  modalOpen = signal(false);
  activeRow = signal<any>(null);
  disbursePreview = signal<any>(null);
  disbursePreviewLoading = signal(false);
  deciding = signal(false);
  comment = '';

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() { this.load(); }

  load(p?: any) {
    this.loading.set(true);
    this.api.get('/maker-checker', { ...this.q, ...p }).subscribe({
      next: r => {
        this.rows.set(r.data || []);
        this.pagination.set(r.meta || null);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onQuery(e: TableQueryEvent) { this.q = { ...this.q, ...e }; this.load(); }

  openReview(row: any) {
    this.activeRow.set(row);
    this.comment = '';
    this.disbursePreview.set(null);
    this.modalOpen.set(true);

    // For disbursement operations, fetch the loan's preview so the
    // checker sees the calculator view — same as the disburse dialog
    // shows the maker. Gives both sides identical information.
    if (row.operation_type === 'disbursement' && row.payload?.loan_id) {
      this.disbursePreviewLoading.set(true);
      this.api.get(`/loans/${row.payload.loan_id}/disbursement-preview`).subscribe({
        next: r => {
          this.disbursePreview.set(r.data);
          this.disbursePreviewLoading.set(false);
        },
        error: () => this.disbursePreviewLoading.set(false),
      });
    }
  }

  closeModal() {
    if (this.deciding()) return;
    this.modalOpen.set(false);
    this.activeRow.set(null);
    this.disbursePreview.set(null);
    this.comment = '';
  }

  decide(action: 'approve' | 'reject') {
    const id = this.activeRow()?.id;
    if (!id) return;
    if (action === 'reject' && !this.comment.trim()) {
      this.toast.error('Please provide a comment for rejection');
      return;
    }
    this.deciding.set(true);
    this.api.post(`/maker-checker/${id}/decide`, {
      action,
      comment: this.comment.trim() || null,
    }).subscribe({
      next: r => {
        this.deciding.set(false);
        this.toast.success(r.message || `Request ${action}d`);
        this.modalOpen.set(false);
        this.load(this.q);
      },
      error: e => {
        this.deciding.set(false);
        this.toast.error(e.error?.message || `${action} failed`);
      },
    });
  }

  /**
   * Backend rejects a self-check (maker === checker) with 403. The UI
   * hides the approve/reject buttons when this condition holds to avoid
   * the user submitting only to be refused.
   */
  isOwnRequest(): boolean {
    const row = this.activeRow();
    const currentUserId = this.auth.user()?.id;
    return !!row && !!currentUserId && row.maker_id === currentUserId;
  }

  prettyOperationType(type: string | null | undefined): string {
    if (!type) return '—';
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  /**
   * Flatten payload into key/value rows for the "Operation Details"
   * table. Any object/array values are JSON.stringified so the checker
   * can inspect them without a nested UI.
   */
  payloadEntries(): Array<{ key: string; value: string }> {
    const payload = this.activeRow()?.payload;
    if (!payload || typeof payload !== 'object') return [];
    return Object.entries(payload).map(([k, v]) => ({
      key: k,
      value: typeof v === 'object' && v !== null
        ? JSON.stringify(v)
        : String(v),
    }));
  }
}
