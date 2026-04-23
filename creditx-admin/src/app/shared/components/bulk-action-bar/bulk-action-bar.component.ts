import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

/**
 * BulkActionBar — floating bar that appears when rows are selected
 * in a data table. Provides approve/reject actions with a count
 * badge. Used by approval-queue, disbursement-queue, and maker-checker
 * to drive batch decisions.
 *
 * The bar is non-modal (sits at the bottom of the viewport) and
 * dismissible via Clear. Click an action → parent opens its confirm
 * dialog → parent calls the batch endpoint.
 *
 * The shared component exists because three queues need the same
 * pattern and same styling — putting it here keeps the queue
 * components focused on their domain logic instead of replicating
 * 100 lines of floating-bar CSS each.
 *
 * Usage:
 *   <cx-bulk-action-bar
 *     [count]="selectedCount()"
 *     [primaryLabel]="'Approve'"
 *     [dangerLabel]="'Reject'"
 *     (primary)="openBatchConfirm('approve')"
 *     (danger)="openBatchConfirm('reject')"
 *     (clear)="clearSelection()">
 *   </cx-bulk-action-bar>
 */
@Component({
  selector: 'cx-bulk-action-bar',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    @if (count > 0) {
      <div class="cx-bab" role="toolbar" aria-label="Bulk actions">
        <div class="cx-bab-count">
          <lucide-icon name="check-circle" [size]="16"></lucide-icon>
          <span class="cx-bab-count-text">
            <strong class="tabular-nums">{{ count }}</strong>
            {{ count === 1 ? 'item' : 'items' }} selected
          </span>
        </div>

        <div class="cx-bab-actions">
          <button class="cx-btn cx-btn-ghost cx-btn-sm"
                  (click)="clear.emit()"
                  [disabled]="busy">
            Clear
          </button>
          @if (dangerLabel) {
            <button class="cx-btn cx-btn-danger cx-btn-sm"
                    (click)="danger.emit()"
                    [disabled]="busy">
              <lucide-icon name="x-circle" [size]="14"></lucide-icon>
              <span>{{ dangerLabel }}</span>
            </button>
          }
          @if (primaryLabel) {
            <button class="cx-btn cx-btn-primary cx-btn-sm"
                    (click)="primary.emit()"
                    [disabled]="busy">
              <lucide-icon [name]="primaryIcon" [size]="14"></lucide-icon>
              <span>{{ primaryLabel }}</span>
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .cx-bab {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 10px 16px 10px 20px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: 999px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
      z-index: 90;
      animation: cx-bab-in 220ms var(--cx-ease-premium, cubic-bezier(0.4, 0, 0.2, 1));
    }
    @keyframes cx-bab-in {
      from { opacity: 0; transform: translate(-50%, 12px); }
      to   { opacity: 1; transform: translate(-50%, 0); }
    }
    @media (max-width: 640px) {
      .cx-bab {
        left: 12px; right: 12px; transform: none;
        border-radius: var(--cx-radius-xl, 12px);
      }
    }

    .cx-bab-count {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--cx-text);
      padding-right: 16px;
      border-right: 1px solid var(--cx-border);
    }
    .cx-bab-count-text strong {
      font-weight: 600;
      margin-right: 2px;
    }

    .cx-bab-actions {
      display: flex;
      gap: 6px;
    }

    @media (max-width: 640px) {
      .cx-bab-count { padding-right: 12px; }
      .cx-bab-count-text { font-size: 12px; }
    }
  `],
})
export class BulkActionBarComponent {
  @Input() count = 0;
  @Input() primaryLabel: string | null = null;
  @Input() primaryIcon = 'check-circle';
  @Input() dangerLabel: string | null = null;
  @Input() busy = false;

  @Output() primary = new EventEmitter<void>();
  @Output() danger = new EventEmitter<void>();
  @Output() clear = new EventEmitter<void>();
}
