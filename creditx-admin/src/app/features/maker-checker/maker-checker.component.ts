import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
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
            <!-- Preview calculation -->
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
                    <span>Gross Loan</span>
                    <span class="tabular-nums">₦{{ p.calculation?.gross_loan | number:'1.2-2' }}</span>
                  </div>
                  <div class="cx-mc-row">
                    <span>Total Fees</span>
                    <span class="tabular-nums">₦{{ p.calculation?.total_fees | number:'1.2-2' }}</span>
                  </div>
                  @if (p.calculation?.fee_details?.length) {
                    @for (fee of p.calculation.fee_details; track fee.code) {
                      <div class="cx-mc-row cx-mc-row-sub">
                        <span>↳ {{ fee.name || fee.code }}</span>
                        <span class="tabular-nums">₦{{ fee.amount | number:'1.2-2' }}</span>
                      </div>
                    }
                  }
                  <div class="cx-mc-row">
                    <span>Monthly Principal</span>
                    <span class="tabular-nums">₦{{ p.calculation?.mr_principal | number:'1.2-2' }}</span>
                  </div>
                  <div class="cx-mc-row">
                    <span>Monthly Interest</span>
                    <span class="tabular-nums">₦{{ p.calculation?.mr_interest | number:'1.2-2' }}</span>
                  </div>
                </div>
              </div>
            </section>

            <!-- Full loan details — customer + loan metadata + employment -->
            <section class="cx-mc-section">
              <h3 class="cx-mc-section-title">Loan Details</h3>
              <div class="cx-mc-rows">
                <div class="cx-mc-row">
                  <span>Application ID</span>
                  <span class="tabular-nums">{{ p.loan?.application_id || '—' }}</span>
                </div>
                <div class="cx-mc-row">
                  <span>Customer</span>
                  <span>{{ p.loan?.customer_name || '—' }}</span>
                </div>
                @if (p.loan?.customer_staff_id) {
                  <div class="cx-mc-row">
                    <span>Staff ID</span>
                    <span class="tabular-nums">{{ p.loan?.customer_staff_id }}</span>
                  </div>
                }
                <div class="cx-mc-row">
                  <span>Product</span>
                  <span>{{ p.loan?.product_name || '—' }}</span>
                </div>
                <div class="cx-mc-row">
                  <span>Amount Requested</span>
                  <span class="tabular-nums">₦{{ p.loan?.amount_requested | number:'1.2-2' }}</span>
                </div>
                <div class="cx-mc-row">
                  <span>Tenure</span>
                  <span class="tabular-nums">{{ p.loan?.tenure }} months</span>
                </div>
                <div class="cx-mc-row">
                  <span>Interest Rate</span>
                  <span class="tabular-nums">{{ p.loan?.interest_rate }}% ({{ p.loan?.calculation_method }})</span>
                </div>
                @if (p.loan?.loan_type && p.loan?.loan_type !== 'new') {
                  <div class="cx-mc-row">
                    <span>Loan Type</span>
                    <span class="cx-mc-tag-topup">{{ p.loan?.loan_type | titlecase }}</span>
                  </div>
                }
                @if (p.loan?.top_up_balance) {
                  <div class="cx-mc-row">
                    <span>Captured Top-up</span>
                    <span class="tabular-nums">₦{{ p.loan?.top_up_balance | number:'1.2-2' }}</span>
                  </div>
                }
                @if (p.loan?.branch_name) {
                  <div class="cx-mc-row">
                    <span>Branch</span>
                    <span>{{ p.loan?.branch_name }}</span>
                  </div>
                }
                @if (p.loan?.agent_name) {
                  <div class="cx-mc-row">
                    <span>Agent</span>
                    <span>{{ p.loan?.agent_name }}</span>
                  </div>
                }
                @if (p.loan?.purpose) {
                  <div class="cx-mc-row">
                    <span>Purpose</span>
                    <span>{{ p.loan?.purpose }}</span>
                  </div>
                }
              </div>
            </section>

            <!-- Attachments — documents submitted with the loan -->
            <section class="cx-mc-section">
              <h3 class="cx-mc-section-title">
                Attachments
                @if (attachments().length) {
                  <span class="cx-mc-section-count">{{ attachments().length }}</span>
                }
              </h3>
              @if (attachmentsLoading()) {
                <div class="cx-mc-loading">
                  <lucide-icon name="loader-2" [size]="16" class="cx-mc-spin"></lucide-icon>
                  <span>Loading attachments...</span>
                </div>
              } @else if (!attachments().length) {
                <div class="cx-mc-empty">No documents uploaded for this loan.</div>
              } @else {
                <div class="cx-mc-attachments">
                  @for (doc of attachments(); track doc.id) {
                    <button type="button" class="cx-mc-attachment" (click)="openDocPreview(doc)">
                      <div class="cx-mc-attachment-icon" [attr.data-mime]="docMimeCategory(doc.mime_type)">
                        <lucide-icon [name]="docIcon(doc.mime_type)" [size]="18"></lucide-icon>
                      </div>
                      <div class="cx-mc-attachment-meta">
                        <div class="cx-mc-attachment-name" [title]="doc.file_name">{{ doc.file_name }}</div>
                        <div class="cx-mc-attachment-sub">
                          <span>{{ prettyDocType(doc.type) }}</span>
                          @if (doc.file_size) { <span>·</span><span>{{ formatBytes(doc.file_size) }}</span> }
                        </div>
                      </div>
                      <lucide-icon name="eye" [size]="14" class="cx-mc-attachment-eye"></lucide-icon>
                    </button>
                  }
                </div>
              }
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

    <!--
      Document preview overlay — sits above the MC modal backdrop so
      the checker can click an attachment, inspect it inline, and
      return to the decision. Uses the same pattern as loan-detail's
      viewer: image via <img>, PDF via iframe with sanitized URL,
      everything else via download fallback. z-index bumped above
      the modal's z-index: 101.
    -->
    @if (docPreviewDoc(); as pd) {
      <div class="cx-mc-doc-backdrop" (click)="closeDocPreview()"></div>
      <div class="cx-mc-doc-viewer" role="dialog">
        <div class="cx-mc-doc-viewer-head">
          <div class="cx-mc-doc-viewer-meta">
            <div class="cx-mc-doc-viewer-type">{{ prettyDocType(pd.type) }}</div>
            <div class="cx-mc-doc-viewer-name">{{ pd.file_name }}</div>
          </div>
          <div class="cx-mc-doc-viewer-actions">
            <a class="cx-btn cx-btn-ghost cx-btn-sm" [href]="docUrl(pd)" target="_blank" rel="noopener" title="Open in new tab">
              <lucide-icon name="external-link" [size]="14"></lucide-icon>
            </a>
            <a class="cx-btn cx-btn-ghost cx-btn-sm" [href]="docUrl(pd)" [download]="pd.file_name" title="Download">
              <lucide-icon name="download" [size]="14"></lucide-icon>
            </a>
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="closeDocPreview()" aria-label="Close preview">
              <lucide-icon name="x" [size]="16"></lucide-icon>
            </button>
          </div>
        </div>
        <div class="cx-mc-doc-viewer-body">
          @if (isImage(pd.mime_type)) {
            <img [src]="docUrl(pd)" [alt]="pd.file_name" class="cx-mc-doc-img" />
          } @else if (isPdf(pd.mime_type)) {
            <iframe [src]="docUrlSafe(pd)" class="cx-mc-doc-frame" frameborder="0"></iframe>
          } @else {
            <div class="cx-mc-doc-fallback">
              <lucide-icon name="file-text" [size]="48"></lucide-icon>
              <div class="cx-mc-doc-fallback-message">
                This file type ({{ pd.mime_type || 'unknown' }}) can't be previewed inline.
              </div>
              <a class="cx-btn cx-btn-primary" [href]="docUrl(pd)" target="_blank" rel="noopener">
                <lucide-icon name="download" [size]="14"></lucide-icon>
                <span>Open file</span>
              </a>
            </div>
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

    /* ═══ Section extras ═══ */
    .cx-mc-row-sub {
      padding-left: 20px;
      color: var(--cx-text-muted);
      font-size: 12px;
    }
    .cx-mc-section-count {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 8px;
      background: var(--cx-primary-50, rgba(59, 130, 246, 0.1));
      color: var(--cx-primary-600, #2563eb);
      border-radius: 999px;
      font-size: 10px;
      font-weight: 600;
    }
    .cx-mc-empty {
      padding: 16px;
      background: var(--cx-surface-2);
      border-radius: var(--cx-radius-md);
      text-align: center;
      color: var(--cx-text-muted);
      font-size: 13px;
    }
    .cx-mc-tag-topup {
      display: inline-block;
      padding: 2px 8px;
      background: rgba(245, 158, 11, 0.14);
      color: #b45309;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    /* ═══ Attachments grid ═══ */
    .cx-mc-attachments {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
    @media (min-width: 500px) {
      .cx-mc-attachments { grid-template-columns: 1fr 1fr; }
    }
    .cx-mc-attachment {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      cursor: pointer;
      text-align: left;
      transition: border-color 120ms, background 120ms;
    }
    .cx-mc-attachment:hover {
      border-color: var(--cx-primary-600, #2563eb);
      background: var(--cx-surface-2);
    }
    .cx-mc-attachment-icon {
      width: 36px; height: 36px;
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      background: var(--cx-surface-2);
      color: var(--cx-text-secondary);
      flex-shrink: 0;
    }
    .cx-mc-attachment-icon[data-mime="image"] {
      background: rgba(22, 163, 74, 0.12);
      color: var(--cx-success, #16a34a);
    }
    .cx-mc-attachment-icon[data-mime="pdf"] {
      background: rgba(239, 68, 68, 0.12);
      color: var(--cx-danger, #dc2626);
    }
    .cx-mc-attachment-meta {
      flex: 1;
      min-width: 0;
    }
    .cx-mc-attachment-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--cx-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cx-mc-attachment-sub {
      display: flex;
      gap: 4px;
      font-size: 11px;
      color: var(--cx-text-muted);
      margin-top: 1px;
    }
    .cx-mc-attachment-eye {
      color: var(--cx-text-muted);
      flex-shrink: 0;
    }

    /* ═══ Document preview overlay ═══ */
    .cx-mc-doc-backdrop {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.8);
      z-index: 200;
    }
    .cx-mc-doc-viewer {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: min(900px, calc(100vw - 32px));
      height: min(700px, calc(100vh - 32px));
      background: #1a1a1a;
      border-radius: var(--cx-radius-xl, 12px);
      box-shadow: 0 40px 100px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      z-index: 201;
      overflow: hidden;
      animation: cx-mc-doc-modal-in 200ms var(--cx-ease-premium, cubic-bezier(0.4, 0, 0.2, 1));
    }
    @keyframes cx-mc-doc-modal-in {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
      to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
    .cx-mc-doc-viewer-head {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; padding: 12px 16px;
      background: #0f0f0f;
      color: #fff;
      flex-shrink: 0;
    }
    .cx-mc-doc-viewer-type {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: rgba(255, 255, 255, 0.6);
    }
    .cx-mc-doc-viewer-name {
      font-size: 14px;
      color: #fff;
      margin-top: 2px;
      max-width: 460px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cx-mc-doc-viewer-actions {
      display: flex; gap: 6px;
    }
    .cx-mc-doc-viewer-actions .cx-btn {
      color: #fff;
      border-color: rgba(255, 255, 255, 0.2);
    }
    .cx-mc-doc-viewer-body {
      flex: 1;
      overflow: auto;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .cx-mc-doc-img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .cx-mc-doc-frame {
      width: 100%;
      height: 100%;
      background: #fff;
    }
    .cx-mc-doc-fallback {
      display: flex; flex-direction: column; align-items: center; gap: 16px;
      color: #fff;
      padding: 48px;
      text-align: center;
    }
    .cx-mc-doc-fallback-message {
      font-size: 14px;
      max-width: 360px;
      line-height: 1.5;
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

  // Loan attachments — documents uploaded against the target loan.
  // Populated in parallel with disbursePreview when the modal opens
  // for a disbursement request. Empty for non-disbursement operations.
  attachments = signal<any[]>([]);
  attachmentsLoading = signal(false);

  // Document preview overlay — sits above the MC modal, same pattern
  // as loan-detail's viewer. Null = no preview open.
  docPreviewDoc = signal<any>(null);
  private sanitizer = inject(DomSanitizer);

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
    this.attachments.set([]);
    this.modalOpen.set(true);

    // For disbursement operations, fetch the loan's preview so the
    // checker sees the calculator view — same as the disburse dialog
    // shows the maker. Gives both sides identical information.
    //
    // In parallel, fetch documents uploaded against the loan so the
    // checker can visually inspect each attachment before deciding.
    // Matches the 'Documents' tab on the loan-detail page — same
    // API, same preview overlay pattern.
    if (row.operation_type === 'disbursement' && row.payload?.loan_id) {
      const loanId = row.payload.loan_id;

      this.disbursePreviewLoading.set(true);
      this.api.get(`/loans/${loanId}/disbursement-preview`).subscribe({
        next: r => {
          this.disbursePreview.set(r.data);
          this.disbursePreviewLoading.set(false);
        },
        error: () => this.disbursePreviewLoading.set(false),
      });

      this.attachmentsLoading.set(true);
      this.api.get('/documents', { loan_id: loanId }).subscribe({
        next: r => {
          this.attachments.set(r.data || []);
          this.attachmentsLoading.set(false);
        },
        error: () => this.attachmentsLoading.set(false),
      });
    }
  }

  closeModal() {
    if (this.deciding()) return;
    this.modalOpen.set(false);
    this.activeRow.set(null);
    this.disbursePreview.set(null);
    this.attachments.set([]);
    this.comment = '';
  }

  // ─── Document preview helpers ──────────────────────────────────────
  //
  // Mirrors the pattern from loan-detail.component.ts so the two
  // surfaces behave identically. The checker clicks an attachment →
  // inline viewer opens. Images render via <img>, PDFs via iframe
  // with a sanitized URL, anything else shows a download fallback.

  openDocPreview(doc: any): void { this.docPreviewDoc.set(doc); }
  closeDocPreview(): void { this.docPreviewDoc.set(null); }

  isImage(mime: string | null | undefined): boolean {
    return !!(mime && mime.startsWith('image/'));
  }

  isPdf(mime: string | null | undefined): boolean {
    return mime === 'application/pdf';
  }

  /**
   * Icon for a document card based on MIME type. Constrained to icons
   * registered in admin app.config.ts LucideAngularModule.pick.
   */
  docIcon(mime: string | null | undefined): string {
    if (!mime) return 'file-text';
    if (mime.includes('sheet') || mime.includes('excel')) return 'file-spreadsheet';
    return 'file-text';
  }

  /**
   * MIME category used to tint the attachment card's icon well.
   */
  docMimeCategory(mime: string | null | undefined): string {
    if (!mime) return 'other';
    if (mime.startsWith('image/')) return 'image';
    if (mime === 'application/pdf') return 'pdf';
    return 'other';
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

  /**
   * Human-readable byte count. '0 B', '4.2 KB', '1.8 MB'.
   */
  formatBytes(bytes: number | null | undefined): string {
    const n = Number(bytes || 0);
    if (!n) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return i === 0 ? `${Math.round(v)} B` : `${v.toFixed(1)} ${units[i]}`;
  }

  /**
   * Build a serve URL for a document via the backend's unauthenticated
   * /storage/{path:.*} streaming endpoint.
   */
  docUrl(doc: any): string {
    if (!doc?.file_path) return '';
    return `${environment.apiUrl}/storage/${doc.file_path}`;
  }

  docUrlSafe(doc: any): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.docUrl(doc));
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
