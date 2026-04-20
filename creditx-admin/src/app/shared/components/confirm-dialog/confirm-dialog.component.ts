import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'cx-confirm-dialog',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    @if (open) {
      <div class="cx-confirm-root" (click)="cancel()">
        <div class="cx-confirm-backdrop"></div>
        <div class="cx-confirm-panel" (click)="$event.stopPropagation()">
          <div class="cx-confirm-body">
            <div class="cx-confirm-icon" [attr.data-variant]="variant">
              <lucide-icon [name]="variant === 'danger' ? 'alert-triangle' : 'alert-circle'" [size]="20"></lucide-icon>
            </div>
            <div class="cx-confirm-content">
              <h3 class="cx-confirm-title">{{ title }}</h3>
              <p class="cx-confirm-message">{{ message }}</p>
            </div>
          </div>
          <div class="cx-confirm-footer">
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="cancel()">{{ cancelLabel }}</button>
            <button class="cx-btn cx-btn-sm"
                    [class.cx-btn-danger]="variant === 'danger'"
                    [class.cx-btn-primary]="variant !== 'danger'"
                    (click)="confirm()">{{ confirmLabel }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .cx-confirm-root {
      position: fixed; inset: 0;
      z-index: var(--cx-z-modal);
      display: flex; align-items: center; justify-content: center;
      padding: 1rem;
    }
    .cx-confirm-backdrop {
      position: fixed; inset: 0;
      background: rgba(15, 28, 22, 0.52);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      animation: cx-fade-in var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cx-confirm-panel {
      position: relative;
      background: var(--cx-surface);
      border-radius: var(--cx-radius-xl);
      border: 1px solid var(--cx-border);
      box-shadow: var(--cx-shadow-xl);
      max-width: 440px; width: 100%;
      overflow: hidden;
      animation: cx-dialog-in var(--cx-dur-slow) var(--cx-ease-premium);
    }
    @keyframes cx-dialog-in {
      from { opacity: 0; transform: translateY(12px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .cx-confirm-body {
      display: flex; gap: 1rem; align-items: flex-start;
      padding: 1.25rem 1.5rem;
    }
    .cx-confirm-icon {
      width: 40px; height: 40px; flex-shrink: 0;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
    }
    .cx-confirm-icon[data-variant="warning"] { background: var(--cx-warning-50); color: var(--cx-warning); }
    .cx-confirm-icon[data-variant="danger"]  { background: var(--cx-danger-50); color: var(--cx-danger); }
    .cx-confirm-content { flex: 1; min-width: 0; }
    .cx-confirm-title {
      margin: 0 0 0.35rem;
      font-size: var(--cx-text-md); font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
    }
    .cx-confirm-message {
      margin: 0;
      font-size: var(--cx-text-sm);
      color: var(--cx-text-secondary);
      line-height: 1.55;
    }
    .cx-confirm-footer {
      display: flex; justify-content: flex-end; gap: 0.5rem;
      padding: 0.75rem 1.5rem 1.25rem;
    }
  `],
})
export class ConfirmDialogComponent {
  @Input() open = false;
  @Input() title = 'Confirm Action';
  @Input() message = 'Are you sure you want to proceed?';
  @Input() confirmLabel = 'Confirm';
  @Input() cancelLabel = 'Cancel';
  @Input() variant: 'warning' | 'danger' = 'warning';
  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  confirm(): void { this.confirmed.emit(); this.open = false; }
  cancel(): void { this.cancelled.emit(); this.open = false; }
}

