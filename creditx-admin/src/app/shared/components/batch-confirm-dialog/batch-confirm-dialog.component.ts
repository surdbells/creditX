import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';

/**
 * BatchConfirmDialog — shared confirmation modal for batch operations.
 * Used by approval-queue, disbursement-queue, and maker-checker to
 * confirm bulk approve/reject actions before firing the batch API call.
 *
 * Features:
 *   - Count + item-type header so the user sees exactly what they're
 *     about to do.
 *   - Optional comment textarea (required for reject, optional for
 *     approve — enforced by the parent via required input).
 *   - Destructive-action tone switch for reject (danger button + red
 *     warning tone).
 *   - Busy state disables submit while the batch is in flight.
 *
 * Contract:
 *   <cx-batch-confirm
 *     [open]="batchConfirmOpen()"
 *     [count]="selectedCount()"
 *     [action]="batchAction()"
 *     [itemNoun]="'loan'"
 *     [busy]="batchSubmitting()"
 *     [(comment)]="batchComment"
 *     (confirm)="submitBatch()"
 *     (cancel)="batchConfirmOpen.set(false)">
 *   </cx-batch-confirm>
 */
@Component({
  selector: 'cx-batch-confirm',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    @if (open) {
      <div class="cx-bcd-backdrop" (click)="cancel.emit()"></div>
      <div class="cx-bcd-modal" role="dialog" aria-labelledby="bcd-title">
        <div class="cx-bcd-head">
          <div class="cx-bcd-icon" [attr.data-tone]="action === 'reject' ? 'danger' : 'primary'">
            <lucide-icon [name]="action === 'reject' ? 'x-circle' : 'check-circle'" [size]="22"></lucide-icon>
          </div>
          <div class="cx-bcd-head-text">
            <div class="cx-bcd-eyebrow">Batch {{ action }}</div>
            <h2 id="bcd-title" class="cx-bcd-title">
              {{ action === 'reject' ? 'Reject' : 'Approve' }}
              <strong class="tabular-nums">{{ count }}</strong>
              {{ count === 1 ? itemNoun : itemNounPlural() }}?
            </h2>
            <p class="cx-bcd-sub">
              @if (action === 'reject') {
                This will reject every selected {{ itemNoun }} with the reason below.
                Rejections cannot be undone from this screen.
              } @else {
                This will approve every selected {{ itemNoun }}.
                @if (action === 'approve' && executorWarning) {
                  <strong>The underlying operation will fire immediately for each.</strong>
                }
              }
            </p>
          </div>
        </div>

        <div class="cx-bcd-body">
          <label class="cx-bcd-label">
            Comment
            @if (action === 'reject') {
              <span class="cx-bcd-required">*</span>
            } @else {
              <span class="cx-bcd-optional">(optional)</span>
            }
          </label>
          <textarea class="cx-bcd-textarea"
                    rows="3"
                    [ngModel]="comment"
                    (ngModelChange)="commentChange.emit($event)"
                    [placeholder]="action === 'reject'
                      ? 'Why are you rejecting these?'
                      : 'Add a note for the audit log...'"></textarea>
          @if (action === 'reject' && !comment.trim()) {
            <div class="cx-bcd-hint cx-bcd-hint-danger">
              <lucide-icon name="info" [size]="12"></lucide-icon>
              <span>A rejection reason is required.</span>
            </div>
          }
        </div>

        <div class="cx-bcd-actions">
          <button class="cx-btn cx-btn-ghost" (click)="cancel.emit()" [disabled]="busy">
            Cancel
          </button>
          @if (action === 'reject') {
            <button class="cx-btn cx-btn-danger"
                    (click)="confirm.emit()"
                    [disabled]="busy || !comment.trim()">
              @if (busy) {
                <span>Rejecting…</span>
              } @else {
                <lucide-icon name="x-circle" [size]="14"></lucide-icon>
                <span>Reject {{ count }}</span>
              }
            </button>
          } @else {
            <button class="cx-btn cx-btn-primary"
                    (click)="confirm.emit()"
                    [disabled]="busy">
              @if (busy) {
                <span>Approving…</span>
              } @else {
                <lucide-icon name="check-circle" [size]="14"></lucide-icon>
                <span>Approve {{ count }}</span>
              }
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .cx-bcd-backdrop {
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.5);
      z-index: 100;
      backdrop-filter: blur(4px);
    }
    .cx-bcd-modal {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: min(480px, calc(100vw - 32px));
      background: var(--cx-surface);
      border-radius: var(--cx-radius-xl, 16px);
      box-shadow: 0 32px 80px rgba(0, 0, 0, 0.25);
      z-index: 101;
      overflow: hidden;
      animation: cx-bcd-in 200ms var(--cx-ease-premium, cubic-bezier(0.4, 0, 0.2, 1));
    }
    @keyframes cx-bcd-in {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
      to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }

    .cx-bcd-head {
      display: flex;
      gap: 14px;
      padding: 20px 24px;
    }
    .cx-bcd-icon {
      width: 44px; height: 44px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .cx-bcd-icon[data-tone="primary"] {
      background: rgba(22, 163, 74, 0.12);
      color: var(--cx-success, #16a34a);
    }
    .cx-bcd-icon[data-tone="danger"] {
      background: rgba(239, 68, 68, 0.12);
      color: var(--cx-danger, #dc2626);
    }
    .cx-bcd-head-text { flex: 1; }
    .cx-bcd-eyebrow {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-bcd-title {
      margin: 4px 0 6px;
      font-size: 18px;
      font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.01em;
    }
    .cx-bcd-sub {
      margin: 0;
      font-size: 13px;
      color: var(--cx-text-secondary);
      line-height: 1.5;
    }

    .cx-bcd-body {
      padding: 0 24px 16px;
    }
    .cx-bcd-label {
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: var(--cx-text-secondary);
      margin-bottom: 6px;
    }
    .cx-bcd-required { color: var(--cx-danger, #dc2626); }
    .cx-bcd-optional { color: var(--cx-text-muted); font-weight: 400; }
    .cx-bcd-textarea {
      width: 100%;
      padding: 10px 12px;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      font-family: inherit;
      font-size: 13px;
      color: var(--cx-text);
      resize: vertical;
      min-height: 72px;
      outline: none;
      transition: border-color 120ms;
    }
    .cx-bcd-textarea:focus { border-color: var(--cx-primary-600, #2563eb); }

    .cx-bcd-hint {
      display: flex; align-items: center; gap: 6px;
      margin-top: 6px;
      padding: 6px 10px;
      font-size: 11px;
      border-radius: var(--cx-radius-md);
    }
    .cx-bcd-hint-danger {
      background: rgba(239, 68, 68, 0.08);
      color: var(--cx-danger, #dc2626);
    }

    .cx-bcd-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 24px 20px;
      border-top: 1px solid var(--cx-border);
    }
  `],
})
export class BatchConfirmDialogComponent {
  @Input() open = false;
  @Input() count = 0;
  @Input() action: 'approve' | 'reject' = 'approve';
  @Input() itemNoun = 'item';
  @Input() busy = false;
  @Input() comment = '';
  @Input() executorWarning = false;

  @Output() commentChange = new EventEmitter<string>();
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  /**
   * Naïve pluralisation — handles the common cases (loans, items,
   * requests) and falls back to suffixing 's'. Callers can pass any
   * singular noun; we only show the plural in the count line so
   * precision isn't critical.
   */
  itemNounPlural(): string {
    const n = this.itemNoun;
    if (n.endsWith('s')) return n + 'es';
    if (n.endsWith('y') && !['aeiou'].includes(n[n.length - 2])) {
      return n.slice(0, -1) + 'ies';
    }
    return n + 's';
  }
}
