import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';

/**
 * Bulk Disburse — three-step flow:
 *
 *   1. INPUT: operator pastes app IDs newline-separated OR uploads a
 *      single-column CSV. The two inputs feed the same pending list;
 *      switching tabs preserves whatever's in the textarea.
 *
 *   2. PREVIEW: hit POST /disbursement/batch/preview to validate each
 *      loan. Operator sees ready/blocked counts + per-row reason for
 *      blocked items. They can edit and re-preview, or proceed.
 *
 *   3. CONFIRM: pick settlement GL + effective date + optional notes,
 *      submit POST /disbursement/batch. Result panel shows success[]
 *      and failed[] arrays from the response.
 *
 * The 50-loan ceiling matches the backend (W1 decision). Frontend
 * blocks the preview if the count exceeds it, so the operator can
 * trim before round-tripping. The backend re-validates the same
 * count, so a sloppy client can't bypass.
 *
 * Settlement GL list is loaded lazily once preview returns at least
 * one ready loan — pulled from that loan's /disbursement-preview
 * endpoint (matches the disbursement-queue's pattern, avoids the
 * accounting.view permission requirement of /gl-accounts).
 */
type PreviewItem = {
  loan_id: string | null;
  application_id: string | null;
  customer_name: string | null;
  amount_requested: string | null;
  net_disbursed: string | null;
  status: string | null;
  can_disburse: boolean;
  reason: string | null;
};

type PreviewSummary = {
  total: number;
  ready: number;
  blocked: number;
  not_found: number;
};

type ResultRow = {
  loan_id: string | null;
  application_id: string | null;
  result?: any;
  error?: string;
};

@Component({
  selector: 'app-bulk-disburse',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, LoadingSpinnerComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Bulk Disburse"
        subtitle="Disburse multiple approved loans in one batch"
        eyebrow="Loan Operations">
        @if (mode() !== 'input') {
          <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="resetAll()">
            <lucide-icon name="x" [size]="14"></lucide-icon>
            <span>Start Over</span>
          </button>
        }
      </cx-page-header>

      <!-- Step indicator -->
      <div class="cx-bd-steps">
        <div class="cx-bd-step" [class.active]="mode() === 'input'" [class.done]="stepDone(0)">
          <div class="cx-bd-step-num">1</div>
          <div class="cx-bd-step-label">Input</div>
        </div>
        <div class="cx-bd-step-line"></div>
        <div class="cx-bd-step" [class.active]="mode() === 'preview'" [class.done]="stepDone(1)">
          <div class="cx-bd-step-num">2</div>
          <div class="cx-bd-step-label">Preview</div>
        </div>
        <div class="cx-bd-step-line"></div>
        <div class="cx-bd-step" [class.active]="mode() === 'confirm'" [class.done]="stepDone(2)">
          <div class="cx-bd-step-num">3</div>
          <div class="cx-bd-step-label">Confirm</div>
        </div>
        <div class="cx-bd-step-line"></div>
        <div class="cx-bd-step" [class.active]="mode() === 'result'">
          <div class="cx-bd-step-num">4</div>
          <div class="cx-bd-step-label">Result</div>
        </div>
      </div>

      <!-- ════════════════ STEP 1: INPUT ════════════════ -->
      @if (mode() === 'input') {
        <div class="cx-bd-card">
          <!-- Input mode tabs -->
          <div class="cx-bd-tabs">
            <button class="cx-bd-tab" [class.active]="inputMode() === 'paste'"
              (click)="inputMode.set('paste')">
              <lucide-icon name="copy" [size]="14"></lucide-icon>
              <span>Paste App IDs</span>
            </button>
            <button class="cx-bd-tab" [class.active]="inputMode() === 'csv'"
              (click)="inputMode.set('csv')">
              <lucide-icon name="file-spreadsheet" [size]="14"></lucide-icon>
              <span>Upload CSV</span>
            </button>
          </div>

          @if (inputMode() === 'paste') {
            <div class="cx-bd-section">
              <label class="cx-label">
                Application IDs
                <span class="cx-bd-hint">One per line. Both Application IDs (e.g. PMFC000404) and UUIDs are accepted.</span>
              </label>
              <textarea class="cx-textarea cx-bd-paste" rows="10"
                [(ngModel)]="pasteText"
                (input)="onPasteChange()"
                placeholder="LOAN-2024-0001&#10;LOAN-2024-0002&#10;LOAN-2024-0003"></textarea>
              <div class="cx-bd-counter" [class.cx-bd-counter-error]="parsedCount() > 50">
                <span class="tabular-nums">{{ parsedCount() }}</span>
                @if (parsedCount() === 1) {
                  <span> ID parsed</span>
                } @else {
                  <span> IDs parsed</span>
                }
                @if (parsedCount() > 50) {
                  <span class="cx-bd-counter-warn"> · max 50 per batch</span>
                }
              </div>
            </div>
          } @else {
            <div class="cx-bd-section">
              <label class="cx-label">
                CSV File
                <span class="cx-bd-hint">Single column, one App ID per row. First row may be a header (auto-detected).</span>
              </label>
              <div class="cx-bd-dropzone"
                [class.dragover]="dragOver()"
                (dragover)="onDragOver($event)"
                (dragleave)="dragOver.set(false)"
                (drop)="onDrop($event)">
                <input type="file" #fileInput accept=".csv,text/csv,text/plain"
                  (change)="onFileSelect($event)"
                  class="cx-bd-fileinput" />
                <lucide-icon name="upload" [size]="32"></lucide-icon>
                <p class="cx-bd-dropzone-title">Drop CSV here or click to browse</p>
                <p class="cx-bd-dropzone-sub">Single-column file, App ID per row</p>
              </div>
              @if (uploadedFileName()) {
                <div class="cx-bd-file-info">
                  <lucide-icon name="file-text" [size]="14"></lucide-icon>
                  <span>{{ uploadedFileName() }}</span>
                  <span class="cx-bd-counter tabular-nums">— {{ parsedCount() }} row(s)</span>
                  @if (parsedCount() > 50) {
                    <span class="cx-bd-counter-warn"> · max 50 per batch</span>
                  }
                </div>
              }
            </div>
          }

          <div class="cx-bd-actions">
            <button class="cx-btn cx-btn-primary"
              (click)="runPreview()"
              [disabled]="parsedCount() === 0 || parsedCount() > 50 || previewing()">
              @if (previewing()) {
                <lucide-icon name="loader-2" [size]="14" class="cx-bd-spin"></lucide-icon>
                <span>Validating...</span>
              } @else {
                <lucide-icon name="search" [size]="14"></lucide-icon>
                <span>Preview {{ parsedCount() }} loans</span>
              }
            </button>
          </div>
        </div>
      }

      <!-- ════════════════ STEP 2: PREVIEW ════════════════ -->
      @if (mode() === 'preview') {
        <div class="cx-bd-card">
          <!-- Summary chips -->
          <div class="cx-bd-summary-row">
            <div class="cx-bd-chip cx-bd-chip-total">
              <span class="cx-bd-chip-num tabular-nums">{{ previewSummary()?.total ?? 0 }}</span>
              <span class="cx-bd-chip-label">Total</span>
            </div>
            <div class="cx-bd-chip cx-bd-chip-ready">
              <span class="cx-bd-chip-num tabular-nums">{{ previewSummary()?.ready ?? 0 }}</span>
              <span class="cx-bd-chip-label">Ready</span>
            </div>
            <div class="cx-bd-chip cx-bd-chip-blocked">
              <span class="cx-bd-chip-num tabular-nums">{{ previewSummary()?.blocked ?? 0 }}</span>
              <span class="cx-bd-chip-label">Blocked</span>
            </div>
            <div class="cx-bd-chip cx-bd-chip-notfound">
              <span class="cx-bd-chip-num tabular-nums">{{ previewSummary()?.not_found ?? 0 }}</span>
              <span class="cx-bd-chip-label">Not Found</span>
            </div>
          </div>

          <!-- Per-loan validation table -->
          <div class="cx-bd-table-wrap">
            <table class="cx-bd-table">
              <thead>
                <tr>
                  <th class="cx-bd-col-status"></th>
                  <th>App ID</th>
                  <th>Customer</th>
                  <th class="cx-bd-num">Amount</th>
                  <th class="cx-bd-num">Net Disbursed</th>
                  <th>Status</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                @for (item of previewItems(); track item.application_id || item.loan_id) {
                  <tr [class.cx-bd-row-blocked]="!item.can_disburse">
                    <td class="cx-bd-col-status">
                      @if (item.can_disburse) {
                        <lucide-icon name="check-circle" [size]="16" class="cx-bd-icon-ready"></lucide-icon>
                      } @else {
                        <lucide-icon name="x-circle" [size]="16" class="cx-bd-icon-blocked"></lucide-icon>
                      }
                    </td>
                    <td class="cx-bd-cell-mono">{{ item.application_id || '—' }}</td>
                    <td>{{ item.customer_name || '—' }}</td>
                    <td class="cx-bd-num tabular-nums">{{ formatMoney(item.amount_requested) }}</td>
                    <td class="cx-bd-num tabular-nums">{{ formatMoney(item.net_disbursed) }}</td>
                    <td>
                      @if (item.status) {
                        <span class="cx-bd-badge"
                          [class]="'cx-bd-badge-' + item.status.toLowerCase()">{{ item.status }}</span>
                      } @else { <span class="cx-bd-muted">—</span> }
                    </td>
                    <td class="cx-bd-cell-reason">{{ item.reason || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <div class="cx-bd-actions">
            <button class="cx-btn cx-btn-outline" (click)="mode.set('input')">
              <lucide-icon name="chevron-left" [size]="14"></lucide-icon>
              <span>Back to Input</span>
            </button>
            <button class="cx-btn cx-btn-primary"
              (click)="goToConfirm()"
              [disabled]="(previewSummary()?.ready ?? 0) === 0">
              <span>Continue with {{ previewSummary()?.ready ?? 0 }} ready</span>
              <lucide-icon name="chevron-right" [size]="14"></lucide-icon>
            </button>
          </div>

          @if ((previewSummary()?.ready ?? 0) === 0) {
            <p class="cx-bd-warn-msg">
              No loans are ready to disburse. Fix the blocked items above or start over with a different list.
            </p>
          }
          @if ((previewSummary()?.blocked ?? 0) > 0 || (previewSummary()?.not_found ?? 0) > 0) {
            <p class="cx-bd-info-msg">
              Continuing will only disburse the {{ previewSummary()?.ready }} ready loans.
              Blocked / not-found rows are skipped.
            </p>
          }
        </div>
      }

      <!-- ════════════════ STEP 3: CONFIRM ════════════════ -->
      @if (mode() === 'confirm') {
        <div class="cx-bd-card">
          <h2 class="cx-bd-section-title">
            Disburse <span class="tabular-nums">{{ readyForDisburse().length }}</span> loans
          </h2>
          <p class="cx-bd-section-sub">
            All loans will be funded from the same settlement GL on the same effective date.
            Top-up balances are auto-detected per loan.
          </p>

          @if (glsLoading()) {
            <div class="cx-bd-loading">
              <lucide-icon name="loader-2" [size]="14" class="cx-bd-spin"></lucide-icon>
              <span>Loading settlement accounts...</span>
            </div>
          } @else {
            <div class="cx-bd-form-grid">
              <div class="cx-bd-form-group">
                <label class="cx-label">Settlement GL Account <span class="cx-bd-required">*</span></label>
                <select class="cx-input" [(ngModel)]="settlementGlId">
                  <option value="">— Select settlement account —</option>
                  @for (gl of settlementGls(); track gl.id) {
                    <option [value]="gl.id">{{ gl.code }} — {{ gl.name }}</option>
                  }
                </select>
              </div>
              <div class="cx-bd-form-group">
                <label class="cx-label">Effective Date</label>
                <input type="date" class="cx-input" [(ngModel)]="effectiveDate" />
              </div>
              <div class="cx-bd-form-group cx-bd-form-group-wide">
                <label class="cx-label">Notes (optional)</label>
                <textarea class="cx-textarea" rows="2" [(ngModel)]="notes"
                  placeholder="Notes for the audit log..."></textarea>
              </div>
            </div>
          }

          <div class="cx-bd-actions">
            <button class="cx-btn cx-btn-outline" (click)="mode.set('preview')" [disabled]="submitting()">
              <lucide-icon name="chevron-left" [size]="14"></lucide-icon>
              <span>Back to Preview</span>
            </button>
            <button class="cx-btn cx-btn-primary"
              (click)="submit()"
              [disabled]="!settlementGlId || submitting() || glsLoading()">
              @if (submitting()) {
                <lucide-icon name="loader-2" [size]="14" class="cx-bd-spin"></lucide-icon>
                <span>Disbursing...</span>
              } @else {
                <lucide-icon name="banknote" [size]="14"></lucide-icon>
                <span>Disburse {{ readyForDisburse().length }} loans</span>
              }
            </button>
          </div>
        </div>
      }

      <!-- ════════════════ STEP 4: RESULT ════════════════ -->
      @if (mode() === 'result') {
        <!-- Success column + Failed column side-by-side -->
        <div class="cx-bd-result-grid">
          <div class="cx-bd-card cx-bd-result-card cx-bd-result-success">
            <div class="cx-bd-result-header">
              <lucide-icon name="check-circle" [size]="20"></lucide-icon>
              <h3 class="cx-bd-result-title">
                Successful (<span class="tabular-nums">{{ resultSuccess().length }}</span>)
              </h3>
            </div>
            @if (resultSuccess().length === 0) {
              <p class="cx-bd-empty">No successful disbursements.</p>
            } @else {
              <ul class="cx-bd-result-list">
                @for (s of resultSuccess(); track s.loan_id) {
                  <li>
                    <strong>{{ s.application_id || s.loan_id }}</strong>
                    @if (s.result?.status === 'pending_checker') {
                      <span class="cx-bd-result-meta">— Submitted to maker-checker</span>
                    } @else if (s.result?.transaction_id) {
                      <span class="cx-bd-result-meta">— Posted</span>
                    }
                  </li>
                }
              </ul>
            }
          </div>

          <div class="cx-bd-card cx-bd-result-card cx-bd-result-failed">
            <div class="cx-bd-result-header">
              <lucide-icon name="x-circle" [size]="20"></lucide-icon>
              <h3 class="cx-bd-result-title">
                Failed (<span class="tabular-nums">{{ resultFailed().length }}</span>)
              </h3>
            </div>
            @if (resultFailed().length === 0) {
              <p class="cx-bd-empty">No failures.</p>
            } @else {
              <ul class="cx-bd-result-list">
                @for (f of resultFailed(); track f.loan_id) {
                  <li>
                    <strong>{{ f.application_id || f.loan_id || '—' }}</strong>
                    <span class="cx-bd-result-error">— {{ f.error }}</span>
                  </li>
                }
              </ul>
            }
          </div>
        </div>

        <div class="cx-bd-actions cx-bd-actions-center">
          <button class="cx-btn cx-btn-primary" (click)="resetAll()">
            <lucide-icon name="refresh-cw" [size]="14"></lucide-icon>
            <span>Run Another Batch</span>
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    /* ─── Step indicator ─── */
    .cx-bd-steps {
      display: flex; align-items: center;
      gap: 0.5rem;
      padding: 1rem 0;
      margin-bottom: 1.5rem;
    }
    .cx-bd-step {
      display: flex; flex-direction: column; align-items: center;
      gap: 0.35rem;
      flex-shrink: 0;
    }
    .cx-bd-step-num {
      width: 32px; height: 32px;
      border-radius: 50%;
      background: var(--cx-bg);
      border: 2px solid var(--cx-border);
      display: flex; align-items: center; justify-content: center;
      font-size: var(--cx-text-sm);
      font-weight: 600;
      color: var(--cx-text-muted);
      transition: all var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cx-bd-step.active .cx-bd-step-num {
      background: var(--cx-accent, #0A4F2A);
      border-color: var(--cx-accent, #0A4F2A);
      color: white;
    }
    .cx-bd-step.done .cx-bd-step-num {
      background: var(--cx-accent-soft, #d1fae5);
      border-color: var(--cx-accent, #0A4F2A);
      color: var(--cx-accent, #0A4F2A);
    }
    .cx-bd-step-label {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .cx-bd-step.active .cx-bd-step-label,
    .cx-bd-step.done .cx-bd-step-label {
      color: var(--cx-text);
      font-weight: 600;
    }
    .cx-bd-step-line {
      flex: 1;
      height: 2px;
      background: var(--cx-border);
      margin-bottom: 1.6rem;
      max-width: 120px;
    }

    /* ─── Card ─── */
    .cx-bd-card {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    .cx-bd-section-title {
      margin: 0 0 0.35rem;
      font-size: var(--cx-text-md);
      font-weight: 600;
      color: var(--cx-text);
    }
    .cx-bd-section-sub {
      margin: 0 0 1.25rem;
      color: var(--cx-text-muted);
      font-size: var(--cx-text-sm);
    }
    .cx-bd-section { margin-bottom: 1.25rem; }
    .cx-bd-hint {
      display: block;
      font-weight: 400;
      color: var(--cx-text-muted);
      font-size: var(--cx-text-xs);
      margin-top: 0.15rem;
    }

    /* ─── Input tabs ─── */
    .cx-bd-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-bd-tab {
      display: inline-flex; align-items: center;
      gap: 0.4rem;
      padding: 0.7rem 1.1rem;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--cx-text-muted);
      font-size: var(--cx-text-sm);
      font-weight: 500;
      cursor: pointer;
      transition: all var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cx-bd-tab:hover { color: var(--cx-text); }
    .cx-bd-tab.active {
      color: var(--cx-accent, #0A4F2A);
      border-bottom-color: var(--cx-accent, #0A4F2A);
    }

    /* ─── Paste textarea ─── */
    .cx-bd-paste {
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: var(--cx-text-sm);
      width: 100%;
    }
    .cx-bd-counter {
      margin-top: 0.5rem;
      font-size: var(--cx-text-sm);
      color: var(--cx-text-muted);
    }
    .cx-bd-counter-error { color: #dc2626; }
    .cx-bd-counter-warn { color: #dc2626; font-weight: 500; }

    /* ─── CSV dropzone ─── */
    .cx-bd-dropzone {
      position: relative;
      border: 2px dashed var(--cx-border);
      border-radius: var(--cx-radius-xl);
      padding: 2.5rem 1.5rem;
      text-align: center;
      color: var(--cx-text-muted);
      cursor: pointer;
      transition: all var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cx-bd-dropzone:hover, .cx-bd-dropzone.dragover {
      border-color: var(--cx-accent, #0A4F2A);
      background: var(--cx-accent-soft, rgba(10, 79, 42, 0.04));
    }
    .cx-bd-fileinput {
      position: absolute; inset: 0;
      opacity: 0; cursor: pointer;
    }
    .cx-bd-dropzone-title {
      margin: 0.75rem 0 0.25rem;
      color: var(--cx-text);
      font-weight: 500;
    }
    .cx-bd-dropzone-sub {
      margin: 0;
      font-size: var(--cx-text-xs);
    }
    .cx-bd-file-info {
      display: flex; align-items: center; gap: 0.5rem;
      margin-top: 0.75rem;
      padding: 0.6rem 0.85rem;
      background: var(--cx-bg);
      border-radius: var(--cx-radius);
      font-size: var(--cx-text-sm);
    }

    /* ─── Summary chips ─── */
    .cx-bd-summary-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.75rem;
      margin-bottom: 1.25rem;
    }
    @media (max-width: 600px) {
      .cx-bd-summary-row { grid-template-columns: repeat(2, 1fr); }
    }
    .cx-bd-chip {
      padding: 0.85rem 1rem;
      border-radius: var(--cx-radius-xl);
      border: 1px solid var(--cx-border);
      display: flex; flex-direction: column;
    }
    .cx-bd-chip-num {
      font-size: var(--cx-text-xl);
      font-weight: 700;
      color: var(--cx-text);
      line-height: 1;
    }
    .cx-bd-chip-label {
      margin-top: 0.25rem;
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .cx-bd-chip-ready { background: #ecfdf5; border-color: #a7f3d0; }
    .cx-bd-chip-ready .cx-bd-chip-num { color: #047857; }
    .cx-bd-chip-blocked { background: #fef2f2; border-color: #fecaca; }
    .cx-bd-chip-blocked .cx-bd-chip-num { color: #b91c1c; }
    .cx-bd-chip-notfound { background: #fefce8; border-color: #fde68a; }
    .cx-bd-chip-notfound .cx-bd-chip-num { color: #92400e; }

    /* ─── Preview table ─── */
    .cx-bd-table-wrap {
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius);
      overflow: hidden;
      max-height: 50vh; overflow-y: auto;
      margin-bottom: 1.25rem;
    }
    .cx-bd-table {
      width: 100%; border-collapse: collapse;
      font-size: var(--cx-text-sm);
    }
    .cx-bd-table thead th {
      position: sticky; top: 0;
      background: var(--cx-bg);
      padding: 0.7rem 0.85rem;
      text-align: left;
      font-weight: 600;
      color: var(--cx-text);
      border-bottom: 1px solid var(--cx-border);
      white-space: nowrap;
      z-index: 1;
    }
    .cx-bd-table tbody td {
      padding: 0.6rem 0.85rem;
      border-bottom: 1px solid var(--cx-border-subtle, var(--cx-border));
      color: var(--cx-text);
    }
    .cx-bd-table tbody tr:last-child td { border-bottom: none; }
    .cx-bd-row-blocked { background: rgba(239, 68, 68, 0.04); }
    .cx-bd-num { text-align: right; }
    .cx-bd-cell-mono {
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: var(--cx-text-xs);
    }
    .cx-bd-cell-reason {
      color: var(--cx-text-muted);
      font-size: var(--cx-text-xs);
    }
    .cx-bd-col-status { width: 36px; text-align: center; }
    .cx-bd-icon-ready { color: #10b981; }
    .cx-bd-icon-blocked { color: #ef4444; }
    .cx-bd-muted { color: var(--cx-text-muted); }

    .cx-bd-badge {
      display: inline-block;
      padding: 0.15rem 0.55rem;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      background: var(--cx-bg);
    }
    .cx-bd-badge-approved { background: #dbeafe; color: #1e40af; }
    .cx-bd-badge-disbursed, .cx-bd-badge-active { background: #d1fae5; color: #065f46; }
    .cx-bd-badge-rejected { background: #fee2e2; color: #991b1b; }
    .cx-bd-badge-overdue { background: #fef3c7; color: #92400e; }

    /* ─── Confirm form ─── */
    .cx-bd-form-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;
      margin-bottom: 1.25rem;
    }
    @media (max-width: 700px) {
      .cx-bd-form-grid { grid-template-columns: 1fr; }
    }
    .cx-bd-form-group { display: flex; flex-direction: column; }
    .cx-bd-form-group-wide { grid-column: 1 / -1; }
    .cx-bd-required { color: #dc2626; }
    .cx-bd-loading {
      display: flex; align-items: center; gap: 0.5rem;
      color: var(--cx-text-muted);
      font-size: var(--cx-text-sm);
      padding: 1rem 0;
    }

    /* ─── Result panel ─── */
    .cx-bd-result-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;
      margin-bottom: 1.25rem;
    }
    @media (max-width: 800px) {
      .cx-bd-result-grid { grid-template-columns: 1fr; }
    }
    .cx-bd-result-card { margin-bottom: 0; }
    .cx-bd-result-success { border-color: #a7f3d0; background: #f0fdf4; }
    .cx-bd-result-success .cx-bd-result-header { color: #047857; }
    .cx-bd-result-failed { border-color: #fecaca; background: #fef2f2; }
    .cx-bd-result-failed .cx-bd-result-header { color: #b91c1c; }
    .cx-bd-result-header {
      display: flex; align-items: center; gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    .cx-bd-result-title {
      margin: 0; font-size: var(--cx-text-md);
      font-weight: 600;
    }
    .cx-bd-result-list {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 320px;
      overflow-y: auto;
      font-size: var(--cx-text-sm);
    }
    .cx-bd-result-list li {
      padding: 0.4rem 0;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
      color: var(--cx-text);
    }
    .cx-bd-result-list li:last-child { border-bottom: none; }
    .cx-bd-result-meta {
      color: var(--cx-text-muted);
      font-size: var(--cx-text-xs);
    }
    .cx-bd-result-error {
      color: #b91c1c;
      font-size: var(--cx-text-xs);
    }
    .cx-bd-empty {
      color: var(--cx-text-muted);
      font-size: var(--cx-text-sm);
      padding: 0.5rem 0;
      margin: 0;
    }

    /* ─── Actions row ─── */
    .cx-bd-actions {
      display: flex; gap: 0.75rem;
      margin-top: 1.25rem;
      justify-content: flex-end;
    }
    .cx-bd-actions-center { justify-content: center; }
    .cx-bd-warn-msg {
      margin: 1rem 0 0;
      padding: 0.75rem 1rem;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: var(--cx-radius);
      color: #991b1b;
      font-size: var(--cx-text-sm);
    }
    .cx-bd-info-msg {
      margin: 1rem 0 0;
      padding: 0.75rem 1rem;
      background: #fefce8;
      border: 1px solid #fde68a;
      border-radius: var(--cx-radius);
      color: #92400e;
      font-size: var(--cx-text-sm);
    }

    .cx-bd-spin { animation: cx-bd-spin 0.8s linear infinite; }
    @keyframes cx-bd-spin { to { transform: rotate(360deg); } }
  `],
})
export class BulkDisburseComponent implements OnInit {
  // ─── Step state ───
  mode = signal<'input' | 'preview' | 'confirm' | 'result'>('input');

  stepDone(idx: number): boolean {
    const order = ['input', 'preview', 'confirm', 'result'];
    return order.indexOf(this.mode()) > idx;
  }

  // ─── Input state ───
  inputMode = signal<'paste' | 'csv'>('paste');
  pasteText = '';
  uploadedFileName = signal<string | null>(null);
  dragOver = signal(false);

  /**
   * Parsed identifiers from the current input mode. Updated on every
   * paste change / CSV load. Both paths produce the same flat string[]
   * so the rest of the pipeline doesn't care which input was used.
   */
  parsedIds = signal<string[]>([]);
  parsedCount = computed(() => this.parsedIds().length);

  /**
   * Heuristic split: a string is a UUID if it has 4+ dashes (the canonical
   * UUID format has 4). Anything else is treated as an application_id.
   * The backend's BatchIdResolver does the same case normalization on
   * app_ids, so casing here doesn't matter.
   */
  private classifyIds(ids: string[]): { loan_ids: string[]; application_ids: string[] } {
    const loan_ids: string[] = [];
    const application_ids: string[] = [];
    for (const raw of ids) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const dashCount = (trimmed.match(/-/g) || []).length;
      if (dashCount >= 4 && trimmed.length >= 32) {
        loan_ids.push(trimmed);
      } else {
        application_ids.push(trimmed);
      }
    }
    return { loan_ids, application_ids };
  }

  // ─── Preview state ───
  previewing = signal(false);
  previewItems = signal<PreviewItem[]>([]);
  previewSummary = signal<PreviewSummary | null>(null);

  readyForDisburse = computed(() =>
    this.previewItems().filter(i => i.can_disburse)
  );

  // ─── Confirm form ───
  settlementGlId = '';
  effectiveDate = new Date().toISOString().slice(0, 10);
  notes = '';
  settlementGls = signal<Array<{ id: string; code: string; name: string }>>([]);
  glsLoading = signal(false);

  // ─── Submit / result state ───
  submitting = signal(false);
  resultSuccess = signal<ResultRow[]>([]);
  resultFailed = signal<ResultRow[]>([]);

  constructor(
    private api: ApiService,
    private toast: ToastService,
  ) {}

  ngOnInit() {
    // No initial load needed; everything's driven by user input.
  }

  // ─── Input parsing ───
  onPasteChange() {
    const lines = this.pasteText.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 0);
    this.parsedIds.set(lines);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.dragOver.set(true);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.parseFile(file);
  }

  onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.parseFile(file);
  }

  /**
   * Parse a CSV/text file as a single column of identifiers. Accepts
   * any newline-separated text. If the first row looks like a header
   * (non-numeric, non-app-ID-shaped), it's skipped — but only for
   * obvious headers ('Application ID', 'app_id', etc). Bare numbers
   * or app-ID-shaped tokens on the first row are kept.
   */
  private parseFile(file: File) {
    if (file.size > 1 * 1024 * 1024) {
      this.toast.error('File too large — keep it under 1MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      // Take only the first column if there are commas, ignoring quoting
      // edge cases — operators preparing single-column files won't have
      // embedded commas in app IDs.
      const rows = text.split(/[\r\n]+/).map(row => {
        const firstCell = row.split(',')[0] ?? '';
        return firstCell.replace(/^["']|["']$/g, '').trim();
      }).filter(r => r.length > 0);

      // Header detection — strip the first row only if it contains
      // alphabetic words consistent with a header label, NOT if it
      // looks like an actual ID. Letters-only or words-with-spaces
      // win heavy bias toward 'this is a header'.
      if (rows.length > 0 && /^[A-Za-z _-]+$/.test(rows[0])) {
        rows.shift();
      }

      this.parsedIds.set(rows);
      this.uploadedFileName.set(file.name);
      this.pasteText = ''; // mutual exclusion
    };
    reader.onerror = () => this.toast.error('Failed to read file');
    reader.readAsText(file);
  }

  // ─── Preview step ───
  runPreview() {
    if (this.parsedCount() === 0 || this.parsedCount() > 50) return;
    const { loan_ids, application_ids } = this.classifyIds(this.parsedIds());
    this.previewing.set(true);
    this.api.post('/disbursement/batch/preview', { loan_ids, application_ids }).subscribe({
      next: (r: any) => {
        const data = r.data || {};
        this.previewItems.set(data.items || []);
        this.previewSummary.set(data.summary || null);
        this.previewing.set(false);
        this.mode.set('preview');
      },
      error: (e: any) => {
        this.previewing.set(false);
        this.toast.error(e.error?.message || 'Preview failed');
      },
    });
  }

  // ─── Confirm step ───
  goToConfirm() {
    if (this.readyForDisburse().length === 0) return;
    this.mode.set('confirm');
    this.loadSettlementGls();
  }

  /**
   * Pull settlement GL options from the first ready loan's
   * /disbursement-preview endpoint. Mirrors the disbursement-queue
   * pattern — avoids needing accounting.view to read /gl-accounts
   * directly. The list is cached for the rest of the session.
   */
  private loadSettlementGls() {
    if (this.settlementGls().length > 0) return;
    const first = this.readyForDisburse()[0];
    if (!first || !first.loan_id) return;

    this.glsLoading.set(true);
    this.api.get(`/loans/${first.loan_id}/disbursement-preview`).subscribe({
      next: (r: any) => {
        this.settlementGls.set(r.data?.settlement_gls || []);
        this.glsLoading.set(false);
      },
      error: () => {
        this.glsLoading.set(false);
        this.toast.error('Failed to load settlement accounts');
      },
    });
  }

  // ─── Submit ───
  submit() {
    if (!this.settlementGlId || this.submitting()) return;
    const ready = this.readyForDisburse();
    if (ready.length === 0) return;

    // Submit only the ready loans — by their resolved loan_id, since
    // the preview already gave us those. Avoids re-resolving on the
    // backend and prevents an edge case where a previously-found
    // app_id has been deleted between preview and submit.
    const loan_ids = ready
      .map(i => i.loan_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    this.submitting.set(true);
    this.api.post('/disbursement/batch', {
      loan_ids,
      settlement_gl_id: this.settlementGlId,
      effective_date: this.effectiveDate,
      notes: this.notes,
    }).subscribe({
      next: (r: any) => {
        const data = r.data || {};
        this.resultSuccess.set(data.success || []);
        this.resultFailed.set(data.failed || []);
        this.submitting.set(false);
        this.mode.set('result');
        if ((data.failed || []).length === 0) {
          this.toast.success(r.message || `Disbursed ${(data.success || []).length} loans`);
        } else {
          this.toast.error(
            `${(data.success || []).length} succeeded, ${(data.failed || []).length} failed`
          );
        }
      },
      error: (e: any) => {
        this.submitting.set(false);
        this.toast.error(e.error?.message || 'Batch disbursement failed');
      },
    });
  }

  // ─── Reset ───
  resetAll() {
    this.pasteText = '';
    this.uploadedFileName.set(null);
    this.parsedIds.set([]);
    this.previewItems.set([]);
    this.previewSummary.set(null);
    this.settlementGlId = '';
    this.effectiveDate = new Date().toISOString().slice(0, 10);
    this.notes = '';
    this.resultSuccess.set([]);
    this.resultFailed.set([]);
    // settlementGls cache + inputMode preserved — operator likely wants
    // to run another batch using the same conventions.
    this.mode.set('input');
  }

  // ─── Formatting ───
  formatMoney(v: any): string {
    if (v === null || v === undefined || v === '') return '—';
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (isNaN(n)) return '—';
    return n.toLocaleString('en-NG', { maximumFractionDigits: 2 });
  }
}
