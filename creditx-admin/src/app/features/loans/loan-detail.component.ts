import { Component, OnInit, inject, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { CxTabsComponent, CxTab } from '../../shared/components/tabs/tabs.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-loan-detail', standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, PageHeaderComponent, StatusBadgeComponent, FormDialogComponent, CxTabsComponent, LoadingSpinnerComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        [title]="'Loan ' + (loan()?.application_id || '—')"
        [subtitle]="loan()?.customer_name || ''"
        eyebrow="Loan details">
        <div class="flex items-center gap-2">
          @if (loan()?.status === 'approved' && auth.hasPermission('loans.disburse')) {
            <button class="cx-btn cx-btn-primary" (click)="showDisburse.set(true)">
              <lucide-icon name="banknote" [size]="14"></lucide-icon>
              <span>Disburse</span>
            </button>
          }
          <a routerLink="/loans" class="cx-btn cx-btn-outline cx-btn-sm">
            <lucide-icon name="chevron-left" [size]="14"></lucide-icon>
            <span>Back</span>
          </a>
        </div>
      </cx-page-header>

      @if (loading()) {
        <cx-loading message="Loading loan details..."></cx-loading>
      } @else if (loan()) {
        <!-- KPI Summary -->
        <div class="cx-loan-kpis cx-stagger">
          @for (kpi of kpis; track kpi.label) {
            <div class="cx-loan-kpi">
              <div class="cx-eyebrow">{{ kpi.label }}</div>
              <div class="cx-loan-kpi-value tabular-nums" [class]="kpi.color || ''">{{ kpi.value }}</div>
            </div>
          }
        </div>

        <!-- Premium tabs -->
        <div class="cx-loan-tabs-row">
          <cx-tabs [tabs]="cxTabs" [(activeId)]="activeTab"></cx-tabs>
        </div>

        <!-- SUMMARY TAB -->
        @if (activeTab === 'summary') {
          <div class="cx-loan-summary-grid">
            <div class="cx-card cx-loan-detail-card">
              <div class="cx-loan-card-header">
                <h3 class="cx-loan-card-title">Loan Details</h3>
                <span class="cx-eyebrow">Application</span>
              </div>
              <div class="cx-loan-field-list">
                @for (f of loanFields; track f.label) {
                  <div class="cx-loan-field-row">
                    <span class="cx-loan-field-label">{{ f.label }}</span>
                    <span class="cx-loan-field-value">{{ f.value }}</span>
                  </div>
                }
              </div>
            </div>
            <div class="cx-card cx-loan-detail-card">
              <div class="cx-loan-card-header">
                <h3 class="cx-loan-card-title">Customer</h3>
                <span class="cx-eyebrow">Contact</span>
              </div>
              <div class="cx-loan-field-list">
                @for (f of customerFields; track f.label) {
                  <div class="cx-loan-field-row">
                    <span class="cx-loan-field-label">{{ f.label }}</span>
                    <span class="cx-loan-field-value">{{ f.value }}</span>
                  </div>
                }
              </div>
              <a [routerLink]="'/customers/' + loan()?.customer_id" class="cx-btn cx-btn-outline cx-btn-sm" style="width:100%; margin-top: 1rem;">
                <lucide-icon name="external-link" [size]="12"></lucide-icon>
                <span>View Customer Profile</span>
              </a>
            </div>
          </div>
          @if (loan()?.fee_breakdowns?.length) {
            <div class="cx-card cx-loan-fees-card">
              <div class="cx-loan-card-header">
                <h3 class="cx-loan-card-title">Fee Breakdown</h3>
                <span class="cx-eyebrow">Charges</span>
              </div>
              <table class="cx-loan-fees-table">
                <thead>
                  <tr>
                    <th>Fee Type</th>
                    <th>Calculation</th>
                    <th class="cx-dash-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  @for (fee of loan().fee_breakdowns; track fee.id) {
                    <tr>
                      <td>{{ fee.fee_type_name || fee.fee_type_code || '—' }}</td>
                      <td class="cx-loan-fee-calc">
                        {{ fee.calculation_type | titlecase }}
                        @if (fee.calculation_type === 'percentage' && fee.base_value) {
                          · {{ (fee.base_value * 100) | number:'1.0-2' }}%
                        }
                      </td>
                      <td class="cx-dash-right tabular-nums">₦{{ fee.amount | number:'1.2-2' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }

        <!-- SCHEDULE TAB -->
        @if (activeTab === 'schedule') {
          <div class="cx-card !p-0 overflow-hidden">
            @if (scheduleLoading()) {
              <cx-loading size="sm" message="Loading schedule..."></cx-loading>
            } @else if (schedule().length === 0) {
              <div class="py-12 text-center text-sm text-[var(--cx-text-muted)]">No repayment schedule generated</div>
            } @else {
              <table class="w-full">
                <thead><tr class="border-b border-[var(--cx-border)]">
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase">#</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Due Date</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Principal</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Interest</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Total</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Balance</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Status</th>
                </tr></thead>
                <tbody>
                  @for (s of schedule(); track s.id || $index) {
                    <tr class="border-b border-[var(--cx-border)] hover:bg-[var(--cx-surface-hover)] transition-colors">
                      <td class="px-4 py-3 text-xs font-mono text-[var(--cx-text-muted)]">{{ s.installment_number || ($index + 1) }}</td>
                      <td class="px-4 py-3 text-xs">{{ s.due_date | date:'mediumDate' }}</td>
                      <td class="px-4 py-3 text-xs text-right font-mono">₦{{ s.principal_amount || s.principal || 0 | number:'1.2-2' }}</td>
                      <td class="px-4 py-3 text-xs text-right font-mono">₦{{ s.interest_amount || s.interest || 0 | number:'1.2-2' }}</td>
                      <td class="px-4 py-3 text-xs text-right font-mono font-medium">₦{{ s.total_amount || s.total || 0 | number:'1.2-2' }}</td>
                      <td class="px-4 py-3 text-xs text-right font-mono">₦{{ s.outstanding_balance || s.balance || 0 | number:'1.2-2' }}</td>
                      <td class="px-4 py-3"><cx-status-badge [status]="s.status || 'pending'"></cx-status-badge></td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>
        }

        <!-- PAYMENTS TAB -->
        @if (activeTab === 'payments') {
          <div class="cx-card !p-0 overflow-hidden">
            @if (payments().length === 0) {
              <div class="py-12 text-center text-sm text-[var(--cx-text-muted)]">No payments recorded</div>
            } @else {
              <table class="w-full">
                <thead><tr class="border-b border-[var(--cx-border)]">
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Date</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Reference</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Amount</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Method</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Status</th>
                </tr></thead>
                <tbody>
                  @for (p of payments(); track p.id) {
                    <tr class="border-b border-[var(--cx-border)] hover:bg-[var(--cx-surface-hover)]">
                      <td class="px-4 py-3 text-xs">{{ p.created_at | date:'mediumDate' }}</td>
                      <td class="px-4 py-3 text-xs font-mono text-[var(--cx-primary)]">{{ p.reference }}</td>
                      <td class="px-4 py-3 text-xs text-right font-mono font-medium text-[var(--cx-success)]">₦{{ p.amount | number:'1.2-2' }}</td>
                      <td class="px-4 py-3 text-xs">{{ p.payment_method }}</td>
                      <td class="px-4 py-3"><cx-status-badge [status]="p.status"></cx-status-badge></td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>
        }

        <!-- APPROVAL TRAIL TAB -->
        @if (activeTab === 'approvals') {
          <div class="cx-card">
            @if (approvals().length === 0) {
              <div class="py-8 text-center text-sm text-[var(--cx-text-muted)]">No approval records</div>
            } @else {
              <div class="space-y-3">
                @for (a of approvals(); track a.id) {
                  <div class="flex items-start gap-3 p-3 rounded-xl border border-[var(--cx-border)]">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                         [class]="a.decision === 'approved' ? 'bg-[var(--cx-success)]/10 text-[var(--cx-success)]' : a.decision === 'rejected' ? 'bg-[var(--cx-danger)]/10 text-[var(--cx-danger)]' : 'bg-[var(--cx-warning)]/10 text-[var(--cx-warning)]'">
                      <lucide-icon [name]="a.decision === 'approved' ? 'check' : a.decision === 'rejected' ? 'x' : 'clock'" [size]="16"></lucide-icon>
                    </div>
                    <div class="flex-1">
                      <div class="text-sm font-medium text-[var(--cx-text)]">{{ a.step_name || 'Step ' + a.step_order }}</div>
                      <div class="text-xs text-[var(--cx-text-muted)]">{{ a.approver_name || 'Pending' }} &bull; {{ a.decided_at | date:'medium' }}</div>
                      @if (a.comment) { <div class="text-xs text-[var(--cx-text-secondary)] mt-1 italic">"{{ a.comment }}"</div> }
                    </div>
                    <cx-status-badge [status]="a.decision || 'pending'"></cx-status-badge>
                  </div>
                }
              </div>
            }
          </div>
        }

        <!-- TRAIL TAB -->
        @if (activeTab === 'trail') {
          <div class="cx-card">
            @if (loan()?.trails?.length) {
              <div class="space-y-2">
                @for (t of loan()?.trails; track t.id) {
                  <div class="flex items-start gap-3 py-2 border-b border-[var(--cx-border)] last:border-0">
                    <div class="w-2 h-2 rounded-full bg-[var(--cx-primary)] mt-1.5 flex-shrink-0"></div>
                    <div>
                      <div class="text-xs font-medium text-[var(--cx-text)]">{{ t.action }}</div>
                      <div class="text-[10px] text-[var(--cx-text-muted)]">{{ t.user_name || 'System' }} &bull; {{ t.created_at | date:'medium' }}</div>
                      @if (t.notes) { <div class="text-[10px] text-[var(--cx-text-secondary)] mt-0.5">{{ t.notes }}</div> }
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="py-8 text-center text-sm text-[var(--cx-text-muted)]">No trail records</div>
            }
          </div>
        }

        <!-- DOCUMENTS TAB -->
        @if (activeTab === 'documents') {
          <div class="cx-card">
            @if (documentsLoading()) {
              <cx-loading size="sm" message="Loading documents..."></cx-loading>
            } @else if (documents().length === 0) {
              <div class="py-8 text-center text-sm text-[var(--cx-text-muted)]">No documents attached to this loan</div>
            } @else {
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                @for (doc of documents(); track doc.id) {
                  <button type="button" class="cx-loan-doc-card cx-loan-doc-clickable" (click)="openDocPreview(doc)">
                    <div class="cx-loan-doc-icon" [attr.data-mime]="docMimeCategory(doc.mime_type)">
                      <lucide-icon [name]="docIcon(doc.mime_type)" [size]="20"></lucide-icon>
                    </div>
                    <div class="cx-loan-doc-meta">
                      <div class="cx-loan-doc-name" [title]="doc.file_name">{{ doc.file_name }}</div>
                      <div class="cx-loan-doc-sub">
                        <span>{{ prettyDocType(doc.type) }}</span>
                        @if (doc.file_size) { <span>·</span><span>{{ formatBytes(doc.file_size) }}</span> }
                      </div>
                    </div>
                    <div class="cx-loan-doc-actions">
                      <cx-status-badge [status]="doc.status"></cx-status-badge>
                      <lucide-icon name="eye" [size]="14" class="cx-loan-doc-eye"></lucide-icon>
                    </div>
                  </button>
                }
              </div>
            }
          </div>
        }
      }
    </div>

    <!-- Disbursement Dialog -->
    <cx-form-dialog [open]="showDisburse()" title="Disburse Loan" [saving]="disbursing()" saveLabel="Confirm Disbursement" (close)="showDisburse.set(false)" (save)="disburse()">
      <div class="space-y-4">
        <div class="p-4 rounded-xl bg-[var(--cx-success-light)] border border-[var(--cx-success)]/20">
          <div class="text-xs font-bold text-[var(--cx-success)]">Loan: {{ loan()?.application_id }}</div>
          <div class="text-lg font-bold text-[var(--cx-success)] mt-1">₦{{ loan()?.gross_loan || loan()?.amount_requested | number:'1.2-2' }}</div>
          <div class="text-[10px] text-[var(--cx-success)]/70 mt-1">Customer: {{ loan()?.customer_name }}</div>
        </div>
        <div><label class="cx-label">Disbursement Notes (optional)</label>
          <textarea class="cx-input" rows="2" [(ngModel)]="disburseNotes"></textarea>
        </div>
      </div>
    </cx-form-dialog>

    <!--
      Document preview overlay. Shared pattern with approval-queue's
      modal-overlay preview: backdrop + viewer card, supports images
      inline, PDFs in iframe, everything else via download fallback.
    -->
    @if (docPreviewDoc(); as pd) {
      <div class="cx-ld-doc-backdrop" (click)="closeDocPreview()"></div>
      <div class="cx-ld-doc-viewer" role="dialog">
        <div class="cx-ld-doc-viewer-head">
          <div class="cx-ld-doc-viewer-meta">
            <div class="cx-ld-doc-viewer-type">{{ prettyDocType(pd.type || pd.document_type) }}</div>
            <div class="cx-ld-doc-viewer-name">{{ pd.file_name }}</div>
          </div>
          <div class="cx-ld-doc-viewer-actions">
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
        <div class="cx-ld-doc-viewer-body">
          @if (isImage(pd.mime_type)) {
            <img [src]="docUrl(pd)" [alt]="pd.file_name" class="cx-ld-doc-img" />
          } @else if (isPdf(pd.mime_type)) {
            <iframe [src]="docUrlSafe(pd)" class="cx-ld-doc-frame" frameborder="0"></iframe>
          } @else {
            <div class="cx-ld-doc-fallback">
              <lucide-icon name="file-text" [size]="48"></lucide-icon>
              <div class="cx-ld-doc-fallback-message">
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
    :host { display: block; }

    .cx-loan-kpis {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.85rem;
      margin-bottom: 1.25rem;
    }
    @media (min-width: 1024px) {
      .cx-loan-kpis { grid-template-columns: repeat(5, 1fr); }
    }
    .cx-loan-kpi {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      padding: 0.95rem 1rem;
      transition: box-shadow var(--cx-dur-base) var(--cx-ease-premium), transform var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cx-loan-kpi:hover { box-shadow: var(--cx-shadow-sm); transform: translateY(-1px); }
    .cx-loan-kpi .cx-eyebrow { margin-bottom: 0.45rem; }
    .cx-loan-kpi-value {
      font-size: var(--cx-text-lg);
      font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.01em;
      line-height: 1.2;
    }

    .cx-loan-tabs-row { margin-bottom: 1.25rem; }

    .cx-loan-summary-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    @media (min-width: 1024px) {
      .cx-loan-summary-grid { grid-template-columns: repeat(2, 1fr); }
    }

    .cx-loan-detail-card { display: flex; flex-direction: column; gap: 0.85rem; }
    .cx-loan-card-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 1rem;
      padding-bottom: 0.65rem;
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cx-loan-card-title {
      margin: 0;
      font-size: var(--cx-text-md); font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
    }

    .cx-loan-field-list {
      display: flex; flex-direction: column;
    }
    .cx-loan-field-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 1rem;
      padding: 0.6rem 0;
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cx-loan-field-row:last-child { border-bottom: none; }
    .cx-loan-field-label {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      flex-shrink: 0;
    }
    .cx-loan-field-value {
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      font-weight: 500;
      text-align: right;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cx-loan-fees-card { margin-top: 1rem; display: flex; flex-direction: column; gap: 0.85rem; }
    .cx-loan-fees-table { width: 100%; border-collapse: collapse; }
    .cx-loan-fees-table thead th {
      font-size: var(--cx-text-xs); font-weight: 600;
      color: var(--cx-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid var(--cx-border);
      text-align: left;
    }
    .cx-loan-fees-table tbody td {
      padding: 0.65rem 0.75rem;
      border-bottom: 1px solid var(--cx-border-subtle);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
    }
    .cx-loan-fees-table tbody tr:last-child td { border-bottom: none; }
    .cx-loan-fee-calc {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      text-transform: capitalize;
    }

    .cx-dash-right { text-align: right; }

    /* ═══ Documents tab — card grid ═══ */
    .cx-loan-doc-card {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 14px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl, 12px);
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-loan-doc-card:hover {
      border-color: var(--cx-border-strong, var(--cx-border));
      background: var(--cx-surface-hover, var(--cx-surface-2));
      transform: translateY(-1px);
      box-shadow: var(--cx-shadow-sm);
    }
    .cx-loan-doc-icon {
      width: 40px; height: 40px;
      flex-shrink: 0;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--cx-surface-2);
      color: var(--cx-text-secondary);
    }
    .cx-loan-doc-icon[data-mime="image"] {
      background: rgba(34, 197, 94, 0.10);
      color: #16a34a;
    }
    .cx-loan-doc-icon[data-mime="pdf"] {
      background: rgba(239, 68, 68, 0.10);
      color: #dc2626;
    }
    .cx-loan-doc-meta {
      flex: 1;
      min-width: 0;
    }
    .cx-loan-doc-name {
      font-size: var(--cx-text-sm);
      font-weight: 500;
      color: var(--cx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cx-loan-doc-sub {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: var(--cx-text-muted);
      margin-top: 3px;
      white-space: nowrap;
    }
    .cx-loan-doc-actions {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    /*
     * Clickable doc card — renders as a <button> so keyboard users can
     * tab + Enter. Reset button defaults (background/border/text-align/
     * font) so the content layout stays identical to the div version.
     */
    .cx-loan-doc-clickable {
      width: 100%;
      cursor: pointer;
      text-align: left;
      font: inherit;
      color: inherit;
    }
    .cx-loan-doc-eye {
      color: var(--cx-text-muted);
    }

    /* ═══ Document preview overlay ═══
     * Same pattern as approval-queue's overlay: backdrop + centered
     * viewer, dark body, image / iframe / fallback switch. See that
     * component for the authoritative style decisions.
     */
    .cx-ld-doc-backdrop {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 110;
      backdrop-filter: blur(4px);
    }
    .cx-ld-doc-viewer {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: min(1100px, 90vw);
      height: 90vh;
      background: var(--cx-surface);
      border-radius: var(--cx-radius-xl, 16px);
      box-shadow: 0 32px 80px rgba(0, 0, 0, 0.4);
      z-index: 111;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    @media (max-width: 640px) {
      .cx-ld-doc-viewer {
        width: 100vw;
        height: 100vh;
        border-radius: 0;
      }
    }
    .cx-ld-doc-viewer-head {
      display: flex;
      align-items: center;
      padding: 12px 20px;
      border-bottom: 1px solid var(--cx-border);
      gap: 16px;
      flex-shrink: 0;
    }
    .cx-ld-doc-viewer-meta { flex: 1; min-width: 0; }
    .cx-ld-doc-viewer-type {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-ld-doc-viewer-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--cx-text);
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cx-ld-doc-viewer-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    .cx-ld-doc-viewer-body {
      flex: 1;
      overflow: auto;
      background: #1a1a1a;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 0;
    }
    .cx-ld-doc-img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .cx-ld-doc-frame { width: 100%; height: 100%; background: #fff; border: none; }
    .cx-ld-doc-fallback {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      color: #fff;
      padding: 48px;
      text-align: center;
    }
    .cx-ld-doc-fallback-message {
      font-size: 14px;
      max-width: 360px;
      line-height: 1.5;
    }
  `],
})
export class LoanDetailComponent implements OnInit {
  @Input() id = '';
  loan = signal<any>(null);
  loading = signal(true);
  schedule = signal<any[]>([]);
  scheduleLoading = signal(false);
  payments = signal<any[]>([]);
  approvals = signal<any[]>([]);
  documents = signal<any[]>([]);
  documentsLoading = signal(false);
  activeTab: string = 'summary';
  showDisburse = signal(false);
  disbursing = signal(false);
  disburseNotes = '';

  cxTabs: CxTab[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'schedule', label: 'Repayment Schedule' },
    { id: 'payments', label: 'Payments' },
    { id: 'documents', label: 'Documents' },
    { id: 'approvals', label: 'Approval Trail' },
    { id: 'trail', label: 'Loan Trail' },
  ];

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit(): void {
    if (!this.id) return;
    this.api.get(`/loans/${this.id}`).subscribe({
      next: r => { this.loan.set(r.data); this.loading.set(false); this.loadRelated(); },
      error: () => this.loading.set(false),
    });
  }

  loadRelated(): void {
    // Repayment schedule
    this.scheduleLoading.set(true);
    this.api.get(`/loans/${this.id}/repayment-schedule`).subscribe({
      next: r => { this.schedule.set(r.data || []); this.scheduleLoading.set(false); },
      error: () => this.scheduleLoading.set(false),
    });
    // Payments
    this.api.get('/payments', { loan_id: this.id, per_page: 100 }).subscribe({
      next: r => this.payments.set(r.data || []),
    });
    // Approvals
    this.api.get(`/approvals/loan/${this.id}`).subscribe({
      next: r => this.approvals.set(r.data || []),
    });
    // Documents — fetch eagerly so the tab count / empty-state
    // reflects reality the moment the user clicks into Documents.
    // Doc counts are typically <10 per loan so the payload is small.
    this.documentsLoading.set(true);
    this.api.get('/documents', { loan_id: this.id }).subscribe({
      next: r => { this.documents.set(r.data || []); this.documentsLoading.set(false); },
      error: () => this.documentsLoading.set(false),
    });
  }

  // ── Documents tab helpers ─────────────────────────────────────────

  /**
   * Icon for a document card based on MIME type. Constrained to icons
   * already registered in admin app.config.ts LucideAngularModule.pick —
   * 'file-text' for docs/PDFs, 'file-spreadsheet' for Excel, and we use
   * the generic 'file-text' for anything else including images (no
   * dedicated 'image' icon is picked).
   */
  docIcon(mime: string | null | undefined): string {
    if (!mime) return 'file-text';
    if (mime.includes('sheet') || mime.includes('excel')) return 'file-spreadsheet';
    return 'file-text';
  }

  /**
   * Category for tinting the icon well. Keeps images 'photo-green' and
   * PDFs 'paper-red' etc., consistent with document-viewer conventions.
   */
  docMimeCategory(mime: string | null | undefined): string {
    if (!mime) return 'other';
    if (mime.startsWith('image/')) return 'image';
    if (mime === 'application/pdf') return 'pdf';
    return 'other';
  }

  /**
   * Humanise a DocumentType enum value. 'id_card' → 'ID Card',
   * 'bank_statement' → 'Bank Statement'. Titlecase + underscore swap.
   */
  prettyDocType(type: string | null | undefined): string {
    if (!type) return '—';
    // Special-case common acronyms where titlecase would look wrong
    const special: Record<string, string> = {
      'id_card': 'ID Card',
      'work_id': 'Work ID',
    };
    if (special[type]) return special[type];
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  /**
   * Human-readable file size. 0 bytes stays '0 B' (not '0 undefined').
   * 1,024 is 1 KB (binary). Keep one decimal for KB+, zero for bytes.
   */
  formatBytes(n: number | null | undefined): string {
    if (n == null || n <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return i === 0 ? `${Math.round(v)} B` : `${v.toFixed(1)} ${units[i]}`;
  }

  disburse(): void {
    this.disbursing.set(true);
    this.api.post(`/loans/${this.id}/disburse`, { notes: this.disburseNotes }).subscribe({
      next: r => {
        this.disbursing.set(false);
        this.toast.success(r.message || 'Loan disbursed');
        this.showDisburse.set(false);
        this.ngOnInit(); // reload
      },
      error: e => { this.disbursing.set(false); this.toast.error(e.error?.message || 'Disbursement failed'); },
    });
  }

  get kpis() {
    const l = this.loan();
    if (!l) return [];
    return [
      { label: 'Amount', value: '₦' + this.fmt(l.amount_requested) },
      { label: 'Gross Loan', value: '₦' + this.fmt(l.gross_loan || l.amount_requested) },
      { label: 'Net Disbursed', value: '₦' + this.fmt(l.net_disbursed || l.amount_requested) },
      { label: 'Status', value: (l.status || '').replace(/_/g, ' ').toUpperCase(), color: l.status === 'active' || l.status === 'disbursed' ? 'text-[var(--cx-success)]' : l.status === 'overdue' ? 'text-[var(--cx-danger)]' : '' },
      { label: 'Tenure', value: l.tenure + ' months' },
    ];
  }

  get loanFields() {
    const l = this.loan();
    if (!l) return [];
    return [
      { label: 'Application ID', value: l.application_id },
      { label: 'Product', value: l.product_name },
      { label: 'Interest Rate', value: l.interest_rate + '%' },
      { label: 'Calculation Method', value: l.calculation_method },
      { label: 'Loan Type', value: l.loan_type },
      { label: 'Branch', value: l.branch_name || '—' },
      { label: 'Agent', value: l.agent_name || '—' },
      { label: 'Created', value: l.created_at },
      { label: 'Disbursed', value: l.disbursed_at || '—' },
    ];
  }

  get customerFields() {
    const l = this.loan();
    if (!l) return [];
    return [
      { label: 'Name', value: l.customer_name },
      { label: 'Staff ID', value: l.customer_staff_id || '—' },
      { label: 'Phone', value: l.customer_phone || '—' },
      { label: 'Email', value: l.customer_email || '—' },
    ];
  }

  private fmt(n: any): string { return Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

  // ─── Document preview ───
  docPreviewDoc = signal<any>(null);
  private sanitizer = inject(DomSanitizer);

  openDocPreview(doc: any): void { this.docPreviewDoc.set(doc); }
  closeDocPreview(): void { this.docPreviewDoc.set(null); }

  isImage(mime: string | null | undefined): boolean {
    return !!(mime && mime.startsWith('image/'));
  }

  isPdf(mime: string | null | undefined): boolean {
    return mime === 'application/pdf';
  }

  /**
   * Build a serve URL for a document. Uses the backend's
   * /api/storage/{path:.*} unauthenticated streaming endpoint that
   * returns the file with the right Content-Type. environment.apiUrl
   * already includes the /api prefix.
   */
  docUrl(doc: any): string {
    if (!doc?.file_path) return '';
    return `${environment.apiUrl}/storage/${doc.file_path}`;
  }

  docUrlSafe(doc: any): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.docUrl(doc));
  }
}
