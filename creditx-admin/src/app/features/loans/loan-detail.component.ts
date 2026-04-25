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
import { SettingsService } from '../../core/services/settings.service';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

@Component({
  selector: 'app-loan-detail', standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, PageHeaderComponent, StatusBadgeComponent, FormDialogComponent, CxTabsComponent, LoadingSpinnerComponent, MoneyPipe],
  template: `
    <div class="cx-animate-in">
      @if (!embedded) {
        <cx-page-header
          [title]="'Loan ' + (loan()?.application_id || '—')"
          [subtitle]="loan()?.customer_name || ''"
          eyebrow="Loan details">
          <div class="flex items-center gap-2">
            @if (loan()?.status === 'approved' && auth.hasPermission('loans.disburse')) {
              <button class="cx-btn cx-btn-primary" (click)="openDisburseDialog()">
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
      }

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
                      <td class="cx-dash-right tabular-nums">{{ fee.amount | money:2 }}</td>
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
                      <td class="px-4 py-3 text-xs text-right font-mono">{{ s.principal_amount || s.principal || 0 | money:2 }}</td>
                      <td class="px-4 py-3 text-xs text-right font-mono">{{ s.interest_amount || s.interest || 0 | money:2 }}</td>
                      <td class="px-4 py-3 text-xs text-right font-mono font-medium">{{ s.total_amount || s.total || 0 | money:2 }}</td>
                      <td class="px-4 py-3 text-xs text-right font-mono">{{ s.outstanding_balance || s.balance || 0 | money:2 }}</td>
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
                      <td class="px-4 py-3 text-xs text-right font-mono font-medium text-[var(--cx-success)]">{{ p.amount | money:2 }}</td>
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
                  <!--
                    Backend serializes LoanApproval.status (enum value:
                    pending | approved | rejected | auto_approved | escalated).
                    A prior revision of this template read a.decision — a
                    field that does not exist in the response — so the
                    ternary fell through to the 'pending' branch on every
                    row, making even fully-approved trails render with the
                    clock icon + warning color. Using a.status matches the
                    actual payload. auto_approved maps to the approved
                    styling since it represents a committed decision.
                  -->
                  <div class="flex items-start gap-3 p-3 rounded-xl border border-[var(--cx-border)]">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                         [class]="(a.status === 'approved' || a.status === 'auto_approved') ? 'bg-[var(--cx-success)]/10 text-[var(--cx-success)]' : a.status === 'rejected' ? 'bg-[var(--cx-danger)]/10 text-[var(--cx-danger)]' : 'bg-[var(--cx-warning)]/10 text-[var(--cx-warning)]'">
                      <lucide-icon [name]="(a.status === 'approved' || a.status === 'auto_approved') ? 'check' : a.status === 'rejected' ? 'x' : 'clock'" [size]="16"></lucide-icon>
                    </div>
                    <div class="flex-1">
                      <div class="text-sm font-medium text-[var(--cx-text)]">{{ a.step_name || 'Step ' + a.step_order }}</div>
                      <div class="text-xs text-[var(--cx-text-muted)]">{{ a.approver_name || 'Pending' }} &bull; {{ a.decided_at | date:'medium' }}</div>
                      @if (a.comment) { <div class="text-xs text-[var(--cx-text-secondary)] mt-1 italic">"{{ a.comment }}"</div> }
                    </div>
                    <cx-status-badge [status]="a.status || 'pending'"></cx-status-badge>
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

        <!-- LEDGER TAB -->
        <!--
          Shows the CustomerLedger (one per disbursed loan) + all its
          LedgerTransaction entries. Pre-disbursement loans have no
          ledger yet, so we show a friendly message from the backend's
          response instead of an error. Disbursed loans show header +
          posting list grouped by callback reference.
        -->
        @if (activeTab === 'ledger') {
          <div class="cx-card">
            @if (ledgerLoading()) {
              <cx-loading size="sm" message="Loading ledger..."></cx-loading>
            } @else if (!customerLedger()) {
              <div class="py-8 text-center text-sm text-[var(--cx-text-muted)]">
                {{ ledgerMessage() || 'No ledger for this loan.' }}
              </div>
            } @else {
              <!-- Ledger header -->
              <div class="cx-ld-ledger-head">
                <div>
                  <div class="cx-ld-ledger-eyebrow">Customer Ledger</div>
                  <div class="cx-ld-ledger-acc tabular-nums">{{ customerLedger()?.account_number }}</div>
                  <div class="cx-ld-ledger-sub">
                    Rolls up to: <span class="tabular-nums">{{ customerLedger()?.gl_name }}</span>
                  </div>
                </div>
                <cx-status-badge [status]="customerLedger()?.status || 'active'"></cx-status-badge>
              </div>

              <!-- Transactions table -->
              @if (ledgerTransactions().length === 0) {
                <div class="py-8 text-center text-sm text-[var(--cx-text-muted)]">
                  No transactions posted yet.
                </div>
              } @else {
                <div class="cx-ld-txn-wrap">
                  <table class="cx-ld-txn-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Narration</th>
                        <th>Reference</th>
                        <th class="cx-ld-right">Debit ({{ settings.currencySymbol() }})</th>
                        <th class="cx-ld-right">Credit ({{ settings.currencySymbol() }})</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (t of ledgerTransactions(); track t.id) {
                        <tr [class.cx-ld-row-reversal]="!!t.reversal_of_id">
                          <td class="tabular-nums">{{ t.trans_date }}</td>
                          <td>
                            <div class="cx-ld-narration">{{ t.trans_narration }}</div>
                            @if (t.reversal_of_id) {
                              <div class="cx-ld-reversal-tag">REVERSAL</div>
                            }
                          </td>
                          <td class="tabular-nums cx-ld-ref">{{ t.trans_callback || t.trans_reference }}</td>
                          <td class="cx-ld-right tabular-nums">
                            @if (t.trans_type === 'DR') {
                              {{ (t.trans_amount || 0) | number:'1.2-2' }}
                            }
                          </td>
                          <td class="cx-ld-right tabular-nums">
                            @if (t.trans_type === 'CR') {
                              {{ (t.trans_amount || 0) | number:'1.2-2' }}
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                    <tfoot>
                      <tr class="cx-ld-txn-total-row">
                        <td colspan="3">Total</td>
                        <td class="cx-ld-right tabular-nums">{{ ledgerTotalDr() | money:2 }}</td>
                        <td class="cx-ld-right tabular-nums">{{ ledgerTotalCr() | money:2 }}</td>
                      </tr>
                      <tr class="cx-ld-txn-balance-row">
                        <td colspan="4">Outstanding Balance</td>
                        <td class="cx-ld-right tabular-nums">{{ ledgerBalance() | money:2 }}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              }
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

    <!-- Disbursement Dialog — full preview + GL + top-up override -->
    <cx-form-dialog [open]="showDisburse()" title="Disburse Loan" [saving]="disbursing()"
                    saveLabel="Confirm Disbursement"
                    [saveDisabled]="!disburseSettlementGlId || disbursePreviewLoading()"
                    maxWidth="640px"
                    (close)="closeDisburseDialog()" (save)="disburse()">

      @if (disbursePreviewLoading()) {
        <div class="cx-dis-loading">
          <cx-loading size="sm" message="Calculating loan preview..."></cx-loading>
        </div>
      } @else if (disbursePreview(); as p) {

        <!-- Loan header -->
        <div class="cx-dis-header">
          <div class="cx-dis-header-eyebrow">Disbursing</div>
          <div class="cx-dis-header-title tabular-nums">{{ p.loan?.application_id }}</div>
          <div class="cx-dis-header-sub">{{ p.loan?.customer_name }} · {{ p.loan?.product_name }}</div>
        </div>

        <!-- Calculator preview — matches agent app's loan calculator -->
        <div class="cx-dis-calc" [class.cx-dis-calc-recomputing]="disburseRecomputing()">
          <div class="cx-dis-calc-grid">
            <div class="cx-dis-hero cx-dis-hero-primary">
              <div class="cx-dis-hero-label">
                Net Disbursed
                @if (disburseRecomputing()) {
                  <span class="cx-dis-recomputing-tag">recalculating…</span>
                }
              </div>
              <div class="cx-dis-hero-value tabular-nums">
                {{ p.calculation?.net_disbursed | money }}
              </div>
            </div>
            <div class="cx-dis-hero cx-dis-hero-gold">
              <div class="cx-dis-hero-label">Monthly Repayment</div>
              <div class="cx-dis-hero-value tabular-nums">
                {{ p.calculation?.mr_principal_interest | money }}
              </div>
            </div>
          </div>

          <div class="cx-dis-rows">
            <div class="cx-dis-row">
              <span>Gross Loan</span>
              <span class="tabular-nums">{{ p.calculation?.gross_loan | money:2 }}</span>
            </div>
            <div class="cx-dis-row">
              <span>Total Fees</span>
              <span class="tabular-nums">{{ p.calculation?.total_fees | money:2 }}</span>
            </div>
            @if (p.calculation?.fee_details?.length) {
              @for (fee of p.calculation.fee_details; track fee.code) {
                <div class="cx-dis-row cx-dis-row-sub">
                  <span>↳ {{ fee.name || fee.code }}</span>
                  <span class="tabular-nums">{{ fee.amount | money:2 }}</span>
                </div>
              }
            }
            <div class="cx-dis-row">
              <span>Monthly Principal</span>
              <span class="tabular-nums">{{ p.calculation?.mr_principal | money:2 }}</span>
            </div>
            <div class="cx-dis-row">
              <span>Monthly Interest</span>
              <span class="tabular-nums">{{ p.calculation?.mr_interest | money:2 }}</span>
            </div>
            <div class="cx-dis-row">
              <span>Tenure</span>
              <span class="tabular-nums">{{ p.loan?.tenure }} months</span>
            </div>
          </div>

          <!-- First 3 installments of the repayment schedule -->
          @if (p.calculation?.schedule_preview?.length) {
            <details class="cx-dis-schedule">
              <summary>View repayment schedule ({{ p.calculation.schedule_preview.length }} installments)</summary>
              <div class="cx-dis-schedule-table">
                <div class="cx-dis-schedule-head">
                  <span>#</span>
                  <span>Principal</span>
                  <span>Interest</span>
                  <span>Total</span>
                </div>
                @for (inst of p.calculation.schedule_preview; track $index) {
                  <div class="cx-dis-schedule-row">
                    <span class="tabular-nums">{{ $index + 1 }}</span>
                    <span class="tabular-nums">{{ inst.principal | money:2 }}</span>
                    <span class="tabular-nums">{{ inst.interest | money:2 }}</span>
                    <span class="tabular-nums">{{ inst.total | money:2 }}</span>
                  </div>
                }
              </div>
            </details>
          }
        </div>

        <!-- Top-up balance — auto-detected or manual -->
        <div class="cx-dis-section">
          <label class="cx-label">Top-up Balance</label>
          <input type="number" class="cx-input tabular-nums"
                 [(ngModel)]="disburseTopUpBalance"
                 (ngModelChange)="onTopUpChange()"
                 placeholder="0.00" step="0.01" min="0" />

          @if (p.top_up?.auto_detected) {
            <div class="cx-dis-hint cx-dis-hint-info">
              <lucide-icon name="info" [size]="14"></lucide-icon>
              <span>{{ p.top_up?.message }}</span>
            </div>
          } @else {
            <div class="cx-dis-hint cx-dis-hint-muted">
              <lucide-icon name="info" [size]="14"></lucide-icon>
              <span>{{ p.top_up?.message }}</span>
            </div>
          }
        </div>

        <!-- Settlement GL account -->
        <div class="cx-dis-section">
          <label class="cx-label">Settlement GL Account <span class="cx-required">*</span></label>
          <select class="cx-input" [(ngModel)]="disburseSettlementGlId">
            <option value="">— Select settlement account —</option>
            @for (gl of p.settlement_gls; track gl.id) {
              <option [value]="gl.id">{{ gl.code }} — {{ gl.name }}</option>
            }
          </select>
          <div class="cx-dis-hint cx-dis-hint-muted">
            <lucide-icon name="info" [size]="14"></lucide-icon>
            <span>Bank or cash account funds will be drawn from.</span>
          </div>
        </div>

        <!-- Effective date -->
        <div class="cx-dis-section">
          <label class="cx-label">Effective Date</label>
          <input type="date" class="cx-input" [(ngModel)]="disburseEffectiveDate" />
        </div>

        <!-- Notes -->
        <div class="cx-dis-section">
          <label class="cx-label">Notes (optional)</label>
          <textarea class="cx-input" rows="2" [(ngModel)]="disburseNotes"
                    placeholder="Any additional notes for the audit log..."></textarea>
        </div>
      }
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
      /* Centering-safe animation (see approval-queue for rationale) */
      animation: cx-ld-doc-viewer-in 200ms var(--cx-ease-premium, cubic-bezier(0.4, 0, 0.2, 1));
    }
    @keyframes cx-ld-doc-viewer-in {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
      to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
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

    /* ═══ Disbursement dialog ═══ */
    .cx-dis-loading { padding: 32px 0; }
    .cx-dis-header {
      padding: 16px 20px;
      background: var(--cx-surface-2, #f5f5f4);
      border-radius: var(--cx-radius-md);
      margin-bottom: 16px;
    }
    .cx-dis-header-eyebrow {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-dis-header-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--cx-text);
      margin-top: 2px;
      letter-spacing: -0.01em;
    }
    .cx-dis-header-sub {
      font-size: 12px;
      color: var(--cx-text-secondary);
      margin-top: 2px;
    }

    .cx-dis-calc {
      background: var(--cx-surface-2, #f9fafb);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl, 12px);
      padding: 16px;
      margin-bottom: 16px;
    }
    .cx-dis-calc-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 12px;
    }
    .cx-dis-hero {
      padding: 12px 14px;
      border-radius: var(--cx-radius-md);
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
    }
    .cx-dis-hero-primary { border-color: var(--cx-success, #16a34a); }
    .cx-dis-hero-gold { border-color: var(--cx-accent-500, #d97706); }
    .cx-dis-calc-recomputing { position: relative; }
    .cx-dis-calc-recomputing .cx-dis-hero-value {
      opacity: 0.55;
      transition: opacity 200ms;
    }
    .cx-dis-recomputing-tag {
      margin-left: 6px;
      padding: 1px 6px;
      background: rgba(245, 158, 11, 0.14);
      color: #b45309;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      border-radius: 4px;
      animation: cx-dis-pulse 1.2s ease-in-out infinite;
    }
    @keyframes cx-dis-pulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }
    .cx-dis-hero-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-dis-hero-value {
      font-size: 18px;
      font-weight: 600;
      color: var(--cx-text);
      margin-top: 4px;
      letter-spacing: -0.02em;
    }
    .cx-dis-hero-primary .cx-dis-hero-value { color: var(--cx-success, #16a34a); }
    .cx-dis-hero-gold .cx-dis-hero-value { color: var(--cx-accent-600, #b45309); }

    .cx-dis-rows { display: flex; flex-direction: column; gap: 4px; }
    .cx-dis-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 10px;
      font-size: 13px;
      color: var(--cx-text);
    }
    .cx-dis-row-sub {
      padding-left: 20px;
      color: var(--cx-text-muted);
      font-size: 12px;
    }
    .cx-dis-row:nth-child(even) { background: rgba(0, 0, 0, 0.02); }

    .cx-dis-schedule {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--cx-border);
    }
    .cx-dis-schedule summary {
      font-size: 12px;
      color: var(--cx-text-secondary);
      cursor: pointer;
      padding: 4px 0;
    }
    .cx-dis-schedule-table {
      margin-top: 8px;
      max-height: 240px;
      overflow-y: auto;
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      background: var(--cx-surface);
    }
    .cx-dis-schedule-head,
    .cx-dis-schedule-row {
      display: grid;
      grid-template-columns: 40px 1fr 1fr 1fr;
      gap: 8px;
      padding: 8px 12px;
      font-size: 12px;
    }
    .cx-dis-schedule-head {
      background: var(--cx-surface-2);
      font-weight: 600;
      color: var(--cx-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 10px;
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-dis-schedule-row {
      border-bottom: 1px solid var(--cx-border-subtle, var(--cx-border));
    }
    .cx-dis-schedule-row:last-child { border-bottom: none; }

    .cx-dis-section {
      margin-bottom: 14px;
    }
    .cx-dis-hint {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin-top: 6px;
      padding: 8px 10px;
      font-size: 11px;
      line-height: 1.45;
      border-radius: var(--cx-radius-md);
    }
    .cx-dis-hint-info {
      background: rgba(14, 165, 233, 0.08);
      color: var(--cx-info-600, #0284c7);
      border: 1px solid rgba(14, 165, 233, 0.18);
    }
    .cx-dis-hint-muted {
      background: var(--cx-surface-2);
      color: var(--cx-text-muted);
    }
    .cx-required { color: var(--cx-danger, #dc2626); }

    /* ═══ Ledger tab ═══ */
    .cx-ld-ledger-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      background: var(--cx-surface-2, #f5f5f4);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl, 12px);
      margin-bottom: 16px;
    }
    .cx-ld-ledger-eyebrow {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-ld-ledger-acc {
      font-size: 18px;
      font-weight: 600;
      color: var(--cx-text);
      margin-top: 4px;
      letter-spacing: -0.01em;
    }
    .cx-ld-ledger-sub {
      font-size: 12px;
      color: var(--cx-text-secondary);
      margin-top: 2px;
    }

    .cx-ld-txn-wrap {
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      overflow: hidden;
    }
    .cx-ld-txn-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .cx-ld-txn-table thead th {
      background: var(--cx-surface-2);
      padding: 10px 12px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--cx-text-muted);
      text-align: left;
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-ld-txn-table tbody td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--cx-border-subtle, var(--cx-border));
      color: var(--cx-text);
      vertical-align: top;
    }
    .cx-ld-txn-table tbody tr:last-child td { border-bottom: none; }
    .cx-ld-right { text-align: right; }
    .cx-ld-narration {
      font-size: 13px;
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cx-ld-ref {
      font-size: 11px;
      color: var(--cx-text-muted);
      font-family: var(--cx-font-mono, monospace);
    }
    .cx-ld-reversal-tag {
      display: inline-block;
      margin-top: 2px;
      padding: 1px 6px;
      background: rgba(239, 68, 68, 0.12);
      color: var(--cx-danger, #dc2626);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.05em;
      border-radius: 3px;
    }
    .cx-ld-row-reversal {
      background: rgba(239, 68, 68, 0.03);
    }
    .cx-ld-txn-total-row td,
    .cx-ld-txn-balance-row td {
      background: var(--cx-surface-2);
      font-weight: 600;
      border-top: 1px solid var(--cx-border);
    }
    .cx-ld-txn-balance-row td {
      border-top: 2px solid var(--cx-border);
      color: var(--cx-success, #16a34a);
    }
  `],
})
export class LoanDetailComponent implements OnInit {
  @Input() id = '';
  /**
   * When true, hides the page-header chrome (title / eyebrow / back link /
   * disburse CTA) so the component can be embedded inside another container
   * — typically a modal that supplies its own header. Data loading and
   * internal interaction behaviour is unchanged either way.
   */
  @Input() embedded = false;
  loan = signal<any>(null);
  loading = signal(true);
  schedule = signal<any[]>([]);
  scheduleLoading = signal(false);
  payments = signal<any[]>([]);
  approvals = signal<any[]>([]);
  documents = signal<any[]>([]);
  documentsLoading = signal(false);
  // Ledger tab — CustomerLedger + all LedgerTransactions for this loan.
  // Populated by /loans/:id/customer-ledger, which returns null ledger
  // for pre-disbursement loans (empty state, not error).
  customerLedger = signal<any>(null);
  ledgerTransactions = signal<any[]>([]);
  ledgerLoading = signal(false);
  ledgerMessage = signal<string>('');
  activeTab: string = 'summary';
  showDisburse = signal(false);
  disbursing = signal(false);
  disburseNotes = '';

  // Disbursement preview state — populated on openDisburseDialog
  disbursePreview = signal<any>(null);
  disbursePreviewLoading = signal(false);
  disburseSettlementGlId = '';
  disburseTopUpBalance = '';  // editable; bound to the override input
  disburseEffectiveDate = '';  // defaults to today when dialog opens

  cxTabs: CxTab[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'schedule', label: 'Repayment Schedule' },
    { id: 'payments', label: 'Payments' },
    { id: 'ledger', label: 'Ledger' },
    { id: 'documents', label: 'Documents' },
    { id: 'approvals', label: 'Approval Trail' },
    { id: 'trail', label: 'Loan Trail' },
  ];

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService, public settings: SettingsService) {}

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

    // Customer ledger — the GL sub-ledger created at disbursement time.
    // Pre-disbursement loans return null ledger + a friendly message;
    // we surface that as the empty-state text.
    this.ledgerLoading.set(true);
    this.api.get(`/loans/${this.id}/customer-ledger`).subscribe({
      next: r => {
        this.customerLedger.set(r.data?.ledger ?? null);
        this.ledgerTransactions.set(r.data?.transactions ?? []);
        this.ledgerMessage.set(r.data?.message ?? '');
        this.ledgerLoading.set(false);
      },
      error: () => this.ledgerLoading.set(false),
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

  // ─── Ledger helpers ────────────────────────────────────────────────

  /**
   * Totals computed from the transactions signal. Reading them as
   * methods (not computed signals) is fine here — the arrays are
   * small (typically <20 entries per loan through its full lifecycle)
   * and the template already re-evaluates on signal changes.
   *
   * Outstanding balance = total CR (what's owed to customer / lent)
   *                     - total DR (what's been paid down)
   * Positive = customer still owes money. Negative = bank owes
   * customer (overpayment scenario). Zero = fully settled.
   */
  ledgerTotalDr(): number {
    return this.ledgerTransactions().reduce(
      (s, t) => s + (t.trans_type === 'DR' ? parseFloat(t.trans_amount || '0') : 0),
      0,
    );
  }

  ledgerTotalCr(): number {
    return this.ledgerTransactions().reduce(
      (s, t) => s + (t.trans_type === 'CR' ? parseFloat(t.trans_amount || '0') : 0),
      0,
    );
  }

  ledgerBalance(): number {
    return this.ledgerTotalCr() - this.ledgerTotalDr();
  }

  /**
   * Open the disbursement dialog. Fetches a fresh preview from the
   * backend (which re-runs the calculator with auto-detected top-up
   * balance) and populates the form fields.
   */
  openDisburseDialog(): void {
    this.showDisburse.set(true);
    this.disbursePreview.set(null);
    this.disbursePreviewLoading.set(true);
    this.disburseSettlementGlId = '';
    this.disburseTopUpBalance = '';
    this.disburseNotes = '';
    this.disburseEffectiveDate = new Date().toISOString().slice(0, 10);

    this.api.get(`/loans/${this.id}/disbursement-preview`).subscribe({
      next: r => {
        this.disbursePreview.set(r.data);
        this.disbursePreviewLoading.set(false);
        // Prefill top-up from the auto-detected value (or the
        // capture-time value as fallback).
        this.disburseTopUpBalance = r.data?.top_up?.balance ?? '0.00';
      },
      error: e => {
        this.disbursePreviewLoading.set(false);
        this.toast.error(e.error?.message || 'Could not load disbursement preview');
        this.showDisburse.set(false);
      },
    });
  }

  closeDisburseDialog(): void {
    if (this.disbursing()) return;
    this.showDisburse.set(false);
    this.disbursePreview.set(null);
    this.disburseSettlementGlId = '';
    this.disburseTopUpBalance = '';
  }

  /**
   * Re-fetch the preview when top-up changes so the calculator reflects
   * the new net_disbursed. Debounced at 400ms — user is typing into a
   * number input and we don't want a fetch per keystroke.
   *
   * The endpoint accepts ?top_up_balance=X as a query param; when set,
   * the backend skips auto-detection and recomputes against the
   * override. The response shape is identical to the initial fetch,
   * plus top_up.override_applied = true so the UI can show a
   * 'Using your manual entry' hint.
   *
   * While the fetch is in flight, we set a lightweight 'recomputing'
   * signal so the preview tiles show subtle loading state instead of
   * stale numbers. The tiles don't clear — the old numbers stay
   * visible until the new ones land, which avoids the flicker of
   * collapsing to skeletons and back.
   */
  private topUpDebounceTimer: any = null;
  disburseRecomputing = signal(false);

  onTopUpChange(): void {
    if (this.topUpDebounceTimer) clearTimeout(this.topUpDebounceTimer);
    this.topUpDebounceTimer = setTimeout(() => {
      const topUpValue = this.disburseTopUpBalance ?? '';
      this.disburseRecomputing.set(true);
      this.api.get(`/loans/${this.id}/disbursement-preview`, {
        top_up_balance: topUpValue || '0',
      }).subscribe({
        next: r => {
          // Merge only the calculation + top_up fields — keep the
          // previously-loaded settlement_gls list intact so the user's
          // selected GL dropdown value isn't reset on every recompute.
          const current = this.disbursePreview();
          if (current) {
            this.disbursePreview.set({
              ...current,
              calculation: r.data?.calculation ?? current.calculation,
              top_up:      r.data?.top_up ?? current.top_up,
            });
          } else {
            this.disbursePreview.set(r.data);
          }
          this.disburseRecomputing.set(false);
        },
        error: () => {
          this.disburseRecomputing.set(false);
          // Silent fail — preview remains at the last-good state.
          // The user's typed value is still sent on final submit;
          // the backend will recompute server-side regardless.
        },
      });
    }, 400);
  }

  /**
   * Submit the disbursement with the full payload the backend now
   * requires: settlement_gl_id, effective_date, optional top_up_balance
   * override, optional notes for the audit log.
   */
  disburse(): void {
    if (!this.disburseSettlementGlId) {
      this.toast.error('Please select a settlement GL account');
      return;
    }
    this.disbursing.set(true);
    this.api.post(`/loans/${this.id}/disburse`, {
      settlement_gl_id: this.disburseSettlementGlId,
      effective_date: this.disburseEffectiveDate,
      top_up_balance: this.disburseTopUpBalance || '0',
      notes: this.disburseNotes,
    }).subscribe({
      next: r => {
        this.disbursing.set(false);
        this.toast.success(r.message || 'Loan disbursed');
        this.closeDisburseDialog();
        this.ngOnInit(); // reload
      },
      error: e => { this.disbursing.set(false); this.toast.error(e.error?.message || 'Disbursement failed'); },
    });
  }

  get kpis() {
    const l = this.loan();
    if (!l) return [];
    return [
      { label: 'Amount', value: this.settings.formatMoney(l.amount_requested) },
      { label: 'Gross Loan', value: this.settings.formatMoney(l.gross_loan || l.amount_requested) },
      { label: 'Net Disbursed', value: this.settings.formatMoney(l.net_disbursed || l.amount_requested) },
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
