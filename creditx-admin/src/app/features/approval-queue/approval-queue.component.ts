import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';

/**
 * Approval queue + inline review modal.
 *
 * Previous version navigated row-click to /loans/:id — pulling the
 * reviewer away from their queue and making bulk review painful. When
 * dealing with thousands of loans, switching pages to approve each one
 * creates friction and increases the risk of approving the wrong loan
 * (the reviewer's muscle-memory on the back-button).
 *
 * New flow:
 *   - Row click  → opens modal with full loan details + approve/reject
 *   - Approve    → optional comment, loan advances, modal closes
 *   - Reject     → REQUIRES a reason. Reason goes to the agent's inbox
 *                  and notifications (see backend ApprovalEngineService)
 *   - Close      → returns to the queue, no page navigation
 *
 * The queue stays in place with its pagination/search state intact.
 */
@Component({
  selector: 'app-approval-queue', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Approval Queue"
        subtitle="Loans awaiting your decision at this approval step"
        eyebrow="Workflow"></cx-page-header>
      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
        searchPlaceholder="Search pending approvals..." [hasActions]="true" (query)="onQuery($event)">
        <ng-template #rowActions let-row>
          <div class="flex items-center gap-1 justify-end">
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openReview(row)" title="Review">
              <lucide-icon name="eye" [size]="14"></lucide-icon>
            </button>
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon cx-aq-approve" (click)="quickApprove(row)" title="Quick approve">
              <lucide-icon name="check-circle" [size]="14"></lucide-icon>
            </button>
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon cx-aq-reject" (click)="openReject(row)" title="Reject with reason">
              <lucide-icon name="x-circle" [size]="14"></lucide-icon>
            </button>
          </div>
        </ng-template>
      </cx-data-table>
    </div>

    <!--
      Review modal. Full-height on mobile, centered card on desktop.
      All loan data visible so the reviewer can make an informed call
      without leaving the queue. Approve/reject actions sit in a
      sticky footer so they're always reachable even when scrolling
      through a long loan.
    -->
    @if (modalOpen()) {
      <div class="cx-aq-backdrop" (click)="closeModal()"></div>
      <div class="cx-aq-modal cx-animate-in" role="dialog" aria-labelledby="aq-modal-title">
        <div class="cx-aq-modal-head">
          <div>
            <div class="cx-aq-modal-eyebrow">Reviewing</div>
            <h2 id="aq-modal-title" class="cx-aq-modal-title tabular-nums">
              {{ activeRow()?.application_id }}
            </h2>
            <div class="cx-aq-modal-sub">{{ activeRow()?.customer_name }}</div>
          </div>
          <button class="cx-aq-modal-close" (click)="closeModal()" aria-label="Close">
            <lucide-icon name="x" [size]="18"></lucide-icon>
          </button>
        </div>

        <div class="cx-aq-modal-body">
          @if (detailLoading()) {
            <div class="cx-aq-modal-loading">
              <lucide-icon name="loader-2" [size]="24" class="cx-spin"></lucide-icon>
              <span>Loading loan details...</span>
            </div>
          } @else if (loanDetail(); as l) {
            <!-- Summary grid -->
            <section class="cx-aq-section">
              <h3 class="cx-aq-section-title">Summary</h3>
              <div class="cx-aq-grid">
                <div class="cx-aq-field">
                  <span class="cx-aq-field-label">Product</span>
                  <span class="cx-aq-field-value">{{ l.product_name || '—' }}</span>
                </div>
                <div class="cx-aq-field">
                  <span class="cx-aq-field-label">Amount Requested</span>
                  <span class="cx-aq-field-value tabular-nums">₦{{ l.amount_requested | number:'1.2-2' }}</span>
                </div>
                <div class="cx-aq-field">
                  <span class="cx-aq-field-label">Tenure</span>
                  <span class="cx-aq-field-value tabular-nums">{{ l.tenure }} months</span>
                </div>
                <div class="cx-aq-field">
                  <span class="cx-aq-field-label">Interest Rate</span>
                  <span class="cx-aq-field-value tabular-nums">{{ l.interest_rate }}%</span>
                </div>
                <div class="cx-aq-field">
                  <span class="cx-aq-field-label">Gross Loan</span>
                  <span class="cx-aq-field-value tabular-nums">₦{{ l.gross_loan | number:'1.2-2' }}</span>
                </div>
                <div class="cx-aq-field">
                  <span class="cx-aq-field-label">Net Disbursed</span>
                  <span class="cx-aq-field-value tabular-nums">₦{{ l.net_disbursed | number:'1.2-2' }}</span>
                </div>
                <div class="cx-aq-field">
                  <span class="cx-aq-field-label">Branch</span>
                  <span class="cx-aq-field-value">{{ l.branch_name || '—' }}</span>
                </div>
                <div class="cx-aq-field">
                  <span class="cx-aq-field-label">Agent</span>
                  <span class="cx-aq-field-value">{{ l.agent_name || '—' }}</span>
                </div>
                @if (l.loan_purpose) {
                  <div class="cx-aq-field cx-aq-field-wide">
                    <span class="cx-aq-field-label">Purpose</span>
                    <span class="cx-aq-field-value">{{ l.loan_purpose }}</span>
                  </div>
                }
              </div>
            </section>

            <!-- Customer -->
            @if (l.customer; as c) {
              <section class="cx-aq-section">
                <h3 class="cx-aq-section-title">Customer</h3>
                <div class="cx-aq-grid">
                  <div class="cx-aq-field">
                    <span class="cx-aq-field-label">Full Name</span>
                    <span class="cx-aq-field-value">{{ c.full_name || '—' }}</span>
                  </div>
                  <div class="cx-aq-field">
                    <span class="cx-aq-field-label">Staff ID</span>
                    <span class="cx-aq-field-value tabular-nums">{{ c.staff_id || '—' }}</span>
                  </div>
                  <div class="cx-aq-field">
                    <span class="cx-aq-field-label">Phone</span>
                    <span class="cx-aq-field-value tabular-nums">{{ c.phone || '—' }}</span>
                  </div>
                  <div class="cx-aq-field">
                    <span class="cx-aq-field-label">Email</span>
                    <span class="cx-aq-field-value">{{ c.email || '—' }}</span>
                  </div>
                  <div class="cx-aq-field">
                    <span class="cx-aq-field-label">BVN</span>
                    <span class="cx-aq-field-value tabular-nums">{{ c.bvn || '—' }}</span>
                  </div>
                  <div class="cx-aq-field">
                    <span class="cx-aq-field-label">Gross Pay</span>
                    <span class="cx-aq-field-value tabular-nums">
                      {{ c.gross_pay ? ('₦' + (c.gross_pay | number:'1.2-2')) : '—' }}
                    </span>
                  </div>
                  <div class="cx-aq-field">
                    <span class="cx-aq-field-label">Job Title</span>
                    <span class="cx-aq-field-value">{{ c.job_title || '—' }}</span>
                  </div>
                  <div class="cx-aq-field">
                    <span class="cx-aq-field-label">Organization</span>
                    <span class="cx-aq-field-value">{{ c.organization || c.employer || '—' }}</span>
                  </div>
                  <div class="cx-aq-field">
                    <span class="cx-aq-field-label">Bank</span>
                    <span class="cx-aq-field-value">{{ c.bank_name || '—' }}</span>
                  </div>
                  <div class="cx-aq-field">
                    <span class="cx-aq-field-label">Account Number</span>
                    <span class="cx-aq-field-value tabular-nums">{{ c.account_number || '—' }}</span>
                  </div>
                </div>
              </section>
            }

            <!-- Fee breakdown -->
            @if (l.fee_breakdowns?.length) {
              <section class="cx-aq-section">
                <h3 class="cx-aq-section-title">Fee Breakdown</h3>
                <div class="cx-aq-fees">
                  @for (fee of l.fee_breakdowns; track fee.id) {
                    <div class="cx-aq-fee-row">
                      <span class="cx-aq-fee-name">{{ fee.fee_type_name || fee.fee_type_code }}</span>
                      <span class="cx-aq-fee-amount tabular-nums">₦{{ fee.amount | number:'1.2-2' }}</span>
                    </div>
                  }
                </div>
              </section>
            }

            <!-- Documents -->
            @if (l.documents?.length) {
              <section class="cx-aq-section">
                <h3 class="cx-aq-section-title">Documents</h3>
                <div class="cx-aq-docs">
                  @for (doc of l.documents; track doc.id) {
                    <div class="cx-aq-doc">
                      <lucide-icon name="file-text" [size]="14"></lucide-icon>
                      <span class="cx-aq-doc-type">{{ prettyDocType(doc.document_type || doc.type) }}</span>
                      <span class="cx-aq-doc-name">{{ doc.file_name || '—' }}</span>
                    </div>
                  }
                </div>
              </section>
            } @else {
              <section class="cx-aq-section">
                <h3 class="cx-aq-section-title">Documents</h3>
                <div class="cx-aq-empty">No documents attached</div>
              </section>
            }

            <!-- Approval timeline -->
            @if (approvals()?.length) {
              <section class="cx-aq-section">
                <h3 class="cx-aq-section-title">Approval Timeline</h3>
                <div class="cx-aq-timeline">
                  @for (a of approvals(); track a.id) {
                    <div class="cx-aq-timeline-row" [attr.data-state]="a.status">
                      <div class="cx-aq-timeline-dot"></div>
                      <div class="cx-aq-timeline-body">
                        <div class="cx-aq-timeline-name">{{ a.step_name }}</div>
                        <div class="cx-aq-timeline-meta">
                          {{ a.role_name }} · {{ a.status | titlecase }}
                          @if (a.decided_at) { · {{ a.decided_at }} }
                        </div>
                        @if (a.comment) {
                          <div class="cx-aq-timeline-comment">"{{ a.comment }}"</div>
                        }
                      </div>
                    </div>
                  }
                </div>
              </section>
            }

            <!-- Activity trail -->
            @if (l.trails?.length) {
              <section class="cx-aq-section">
                <h3 class="cx-aq-section-title">Activity</h3>
                <div class="cx-aq-trail">
                  @for (t of l.trails; track t.id) {
                    <div class="cx-aq-trail-row">
                      <lucide-icon name="calendar" [size]="12"></lucide-icon>
                      <span class="cx-aq-trail-action">{{ t.action }}</span>
                      <span class="cx-aq-trail-time tabular-nums">{{ t.created_at }}</span>
                    </div>
                  }
                </div>
              </section>
            }
          }
        </div>

        <!-- Sticky action footer -->
        <div class="cx-aq-modal-actions">
          @if (mode() === 'review') {
            <div class="cx-aq-decision-area">
              <label class="cx-aq-label" for="aq-comment">Comment (optional for approve, required for reject)</label>
              <textarea id="aq-comment" class="cx-aq-textarea" rows="2"
                        placeholder="Type a note about your decision..."
                        [(ngModel)]="comment"></textarea>
              <div class="cx-aq-buttons">
                <button class="cx-btn cx-btn-ghost" (click)="closeModal()" [disabled]="deciding()">
                  Cancel
                </button>
                <button class="cx-btn cx-btn-danger" (click)="decideFromModal('reject')"
                        [disabled]="deciding() || !comment.trim()">
                  <lucide-icon name="x-circle" [size]="14"></lucide-icon>
                  <span>Reject</span>
                </button>
                <button class="cx-btn cx-btn-primary" (click)="decideFromModal('approve')" [disabled]="deciding()">
                  <lucide-icon name="check-circle" [size]="14"></lucide-icon>
                  <span>Approve</span>
                </button>
              </div>
            </div>
          } @else if (mode() === 'reject') {
            <div class="cx-aq-decision-area">
              <label class="cx-aq-label cx-aq-label-required" for="aq-reject-reason">
                Reason for rejection
                <span class="cx-aq-required-mark">*</span>
              </label>
              <textarea id="aq-reject-reason" class="cx-aq-textarea" rows="3"
                        placeholder="Explain why this loan is being rejected. This message will be sent to the agent's inbox."
                        [(ngModel)]="comment"
                        autofocus></textarea>
              <div class="cx-aq-buttons">
                <button class="cx-btn cx-btn-ghost" (click)="closeModal()" [disabled]="deciding()">
                  Cancel
                </button>
                <button class="cx-btn cx-btn-danger" (click)="decideFromModal('reject')"
                        [disabled]="deciding() || !comment.trim()">
                  <lucide-icon name="x-circle" [size]="14"></lucide-icon>
                  <span>Confirm Rejection</span>
                </button>
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .cx-aq-approve { color: var(--cx-success); }
    .cx-aq-approve:hover { background: var(--cx-success-50); }
    .cx-aq-reject { color: var(--cx-danger); }
    .cx-aq-reject:hover { background: var(--cx-danger-50); }

    /* ═══ Review modal ═══ */
    .cx-aq-backdrop {
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.5);
      z-index: 100;
      backdrop-filter: blur(4px);
    }
    .cx-aq-modal {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: min(900px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      background: var(--cx-surface);
      border-radius: var(--cx-radius-xl, 16px);
      box-shadow: 0 32px 80px rgba(0, 0, 0, 0.25);
      display: flex;
      flex-direction: column;
      z-index: 101;
      overflow: hidden;
    }
    @media (max-width: 640px) {
      .cx-aq-modal {
        width: 100vw;
        height: 100vh;
        max-height: 100vh;
        border-radius: 0;
      }
    }
    .cx-aq-modal-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 20px 24px 16px;
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-aq-modal-eyebrow {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cx-accent-600, var(--cx-primary-600));
    }
    .cx-aq-modal-title {
      margin: 4px 0 0;
      font-size: 22px;
      font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.02em;
    }
    .cx-aq-modal-sub {
      font-size: 13px;
      color: var(--cx-text-secondary);
      margin-top: 2px;
    }
    .cx-aq-modal-close {
      width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      background: var(--cx-surface-2);
      border: none;
      border-radius: 50%;
      color: var(--cx-text-secondary);
      cursor: pointer;
      flex-shrink: 0;
    }
    .cx-aq-modal-close:hover {
      background: var(--cx-surface-hover, var(--cx-stone-100));
      color: var(--cx-text);
    }
    .cx-aq-modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 20px 24px;
    }
    .cx-aq-modal-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 48px 0;
      color: var(--cx-text-secondary);
      font-size: 14px;
    }
    .cx-spin { animation: cx-aq-spin 1s linear infinite; }
    @keyframes cx-aq-spin { to { transform: rotate(360deg); } }

    /* Sections */
    .cx-aq-section { margin-bottom: 24px; }
    .cx-aq-section:last-child { margin-bottom: 0; }
    .cx-aq-section-title {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cx-text-muted);
      margin: 0 0 10px;
    }

    /* Field grid */
    .cx-aq-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 16px;
    }
    @media (min-width: 768px) {
      .cx-aq-grid { grid-template-columns: 1fr 1fr 1fr; }
    }
    .cx-aq-field-wide { grid-column: 1 / -1; }
    .cx-aq-field {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .cx-aq-field-label {
      font-size: 11px;
      color: var(--cx-text-muted);
    }
    .cx-aq-field-value {
      font-size: 14px;
      color: var(--cx-text);
      word-break: break-word;
    }

    /* Fee breakdown */
    .cx-aq-fees { display: flex; flex-direction: column; gap: 4px; }
    .cx-aq-fee-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 12px;
      background: var(--cx-surface-2);
      border-radius: var(--cx-radius-md);
      font-size: 13px;
    }
    .cx-aq-fee-name { color: var(--cx-text-secondary); }
    .cx-aq-fee-amount { color: var(--cx-text); font-weight: 500; }

    /* Documents */
    .cx-aq-docs { display: flex; flex-direction: column; gap: 4px; }
    .cx-aq-doc {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--cx-surface-2);
      border-radius: var(--cx-radius-md);
      font-size: 13px;
      color: var(--cx-text);
    }
    .cx-aq-doc-type { font-weight: 500; }
    .cx-aq-doc-name { color: var(--cx-text-muted); font-size: 12px; }
    .cx-aq-empty {
      padding: 16px;
      text-align: center;
      color: var(--cx-text-muted);
      font-size: 13px;
      background: var(--cx-surface-2);
      border-radius: var(--cx-radius-md);
    }

    /* Timeline */
    .cx-aq-timeline { display: flex; flex-direction: column; gap: 10px; }
    .cx-aq-timeline-row {
      display: flex;
      gap: 10px;
      padding: 8px 0;
    }
    .cx-aq-timeline-dot {
      width: 10px; height: 10px;
      border-radius: 50%;
      background: var(--cx-stone-300);
      margin-top: 5px;
      flex-shrink: 0;
    }
    .cx-aq-timeline-row[data-state="approved"] .cx-aq-timeline-dot,
    .cx-aq-timeline-row[data-state="auto_approved"] .cx-aq-timeline-dot {
      background: var(--cx-success, #16a34a);
    }
    .cx-aq-timeline-row[data-state="rejected"] .cx-aq-timeline-dot {
      background: var(--cx-danger, #dc2626);
    }
    .cx-aq-timeline-row[data-state="pending"] .cx-aq-timeline-dot {
      background: var(--cx-accent-500);
    }
    .cx-aq-timeline-name { font-size: 13px; font-weight: 500; color: var(--cx-text); }
    .cx-aq-timeline-meta { font-size: 11px; color: var(--cx-text-muted); margin-top: 2px; }
    .cx-aq-timeline-comment {
      font-size: 12px;
      color: var(--cx-text-secondary);
      margin-top: 4px;
      padding: 6px 10px;
      background: var(--cx-surface-2);
      border-left: 2px solid var(--cx-border);
      border-radius: 4px;
      font-style: italic;
    }

    /* Trail */
    .cx-aq-trail { display: flex; flex-direction: column; gap: 6px; }
    .cx-aq-trail-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    .cx-aq-trail-action { color: var(--cx-text); flex: 1; }
    .cx-aq-trail-time { color: var(--cx-text-muted); font-size: 11px; }

    /* Action footer */
    .cx-aq-modal-actions {
      padding: 16px 24px 20px;
      border-top: 1px solid var(--cx-border);
      background: var(--cx-surface);
    }
    .cx-aq-decision-area { display: flex; flex-direction: column; gap: 8px; }
    .cx-aq-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--cx-text-secondary);
    }
    .cx-aq-label-required { color: var(--cx-text); }
    .cx-aq-required-mark { color: var(--cx-danger); margin-left: 2px; }
    .cx-aq-textarea {
      width: 100%;
      padding: 10px 12px;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      font-size: 13px;
      color: var(--cx-text);
      font-family: inherit;
      resize: vertical;
      min-height: 56px;
      outline: none;
      transition: border-color 120ms;
    }
    .cx-aq-textarea:focus {
      border-color: var(--cx-primary-600);
    }
    .cx-aq-buttons {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
    }
  `],
})
export class ApprovalQueueComponent implements OnInit {
  columns: TableColumn[] = [
    { key: 'application_id', label: 'App ID' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'amount_requested', label: 'Amount', type: 'currency', align: 'right' },
    { key: 'product_name', label: 'Product' },
    { key: 'current_step', label: 'Step' },
    { key: 'status', label: 'Status' },
    { key: 'created_at', label: 'Submitted', type: 'date' },
  ];
  rows = signal<any[]>([]);
  loading = signal(true);
  pagination = signal<TablePagination | null>(null);
  q: any = {};

  // Modal state
  modalOpen = signal(false);
  mode = signal<'review' | 'reject'>('review');
  activeRow = signal<any>(null);
  loanDetail = signal<any>(null);
  approvals = signal<any[]>([]);
  detailLoading = signal(false);
  deciding = signal(false);
  comment = '';

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() { this.load(); }

  load(p?: any) {
    this.loading.set(true);
    this.api.get('/approvals/queue', { ...this.q, ...p }).subscribe({
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
   * Open the full review modal. Fetches loan + approvals in parallel
   * so the modal renders quickly without waiting for both.
   */
  openReview(row: any) {
    const loanId = row.loan_id || row.id;
    if (!loanId) return;
    this.activeRow.set(row);
    this.loanDetail.set(null);
    this.approvals.set([]);
    this.comment = '';
    this.mode.set('review');
    this.modalOpen.set(true);
    this.detailLoading.set(true);

    this.api.get(`/loans/${loanId}`).subscribe({
      next: r => {
        this.loanDetail.set(r.data);
        this.detailLoading.set(false);
      },
      error: () => this.detailLoading.set(false),
    });
    this.api.get(`/approvals/loan/${loanId}`).subscribe({
      next: r => this.approvals.set(r.data || []),
      error: () => {},
    });
  }

  /**
   * Open modal directly in reject mode — focuses the textarea so the
   * reviewer can type the reason immediately. Used by the row's
   * inline reject button for a fast reject-with-reason flow without
   * clicking through the full review first.
   */
  openReject(row: any) {
    this.openReview(row);
    this.mode.set('reject');
  }

  /**
   * Quick approve from the row. No modal, no comment, just a confirm
   * dialog. Fast lane for reviewers confident in the loan after a
   * glance at the row — rare for rejection (which should always be
   * reasoned) but common for approvals.
   */
  quickApprove(row: any) {
    const loanId = row.loan_id || row.id;
    if (!loanId) return;
    if (!confirm(`Approve loan ${row.application_id}?`)) return;
    this.decide(loanId, 'approve', null);
  }

  closeModal() {
    if (this.deciding()) return;
    this.modalOpen.set(false);
    this.activeRow.set(null);
    this.loanDetail.set(null);
    this.approvals.set([]);
    this.comment = '';
  }

  /**
   * Called from the modal footer. Validates the reject-reason gate
   * and hands off to decide(). The modal closes on success and the
   * queue refreshes so the decided loan disappears from the list.
   */
  decideFromModal(action: 'approve' | 'reject') {
    const loanId = this.activeRow()?.loan_id || this.activeRow()?.id;
    if (!loanId) return;

    if (action === 'reject' && !this.comment.trim()) {
      this.toast.error('Please provide a reason for rejection');
      return;
    }

    const comment = this.comment.trim() || null;
    this.decide(loanId, action, comment);
  }

  /**
   * Backend POST /approvals/loan/:id/decide.
   *
   * Note: the backend accepts 'action' (not 'decision' as the previous
   * version of this component sent) — the old payload key was a bug
   * that caused 400s on quickApprove/quickReject. Fixed here.
   */
  private decide(loanId: string, action: 'approve' | 'reject', comment: string | null) {
    this.deciding.set(true);
    this.api.post(`/approvals/loan/${loanId}/decide`, { action, comment }).subscribe({
      next: r => {
        this.deciding.set(false);
        this.toast.success(r.message || `Loan ${action}d`);
        this.modalOpen.set(false);
        this.comment = '';
        this.load(this.q);
      },
      error: () => {
        this.deciding.set(false);
        // Error interceptor surfaces the server message via toast.
      },
    });
  }

  /**
   * Humanise a DocumentType enum value. 'id_card' → 'ID Card',
   * 'bank_statement' → 'Bank Statement'.
   */
  prettyDocType(type: string | null | undefined): string {
    if (!type) return '—';
    const special: Record<string, string> = {
      'id_card': 'ID Card',
      'work_id': 'Work ID',
    };
    if (special[type]) return special[type];
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
}
