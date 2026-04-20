import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService, Toast } from '../../../core/services/toast.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'cx-toast-container',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="cx-toast-root">
      @for (toast of toasts(); track toast.id) {
        <div class="cx-toast" [attr.data-type]="toast.type" (click)="dismiss(toast.id)" role="alert">
          <div class="cx-toast-inner">
            <div class="cx-toast-icon">
              <lucide-icon [name]="iconName(toast.type)" [size]="16"></lucide-icon>
            </div>
            <div class="cx-toast-content">
              <div class="cx-toast-title">{{ titleText(toast.type) }}</div>
              <div class="cx-toast-message">{{ toast.message }}</div>
            </div>
            <button class="cx-toast-close" aria-label="Dismiss">
              <lucide-icon name="x" [size]="14"></lucide-icon>
            </button>
          </div>
          <div class="cx-toast-progress" [style.animation-duration]="toast.duration + 'ms'"></div>
        </div>
      }
    </div>
  `,
  styles: [`
    .cx-toast-root {
      position: fixed; top: 1rem; right: 1rem;
      z-index: var(--cx-z-toast);
      display: flex; flex-direction: column; gap: 0.5rem;
      max-width: 380px; width: calc(100% - 2rem);
      pointer-events: none;
    }
    .cx-toast {
      pointer-events: auto;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-lg);
      box-shadow: var(--cx-shadow-lg);
      cursor: pointer;
      position: relative;
      overflow: hidden;
      animation: cx-toast-in var(--cx-dur-slow) var(--cx-ease-spring);
    }
    .cx-toast-inner { display: flex; gap: 0.75rem; padding: 0.85rem 0.95rem; align-items: flex-start; }
    .cx-toast-icon {
      width: 28px; height: 28px; flex-shrink: 0;
      border-radius: var(--cx-radius-sm);
      display: flex; align-items: center; justify-content: center;
    }
    .cx-toast-content { flex: 1; min-width: 0; }
    .cx-toast-title {
      font-size: var(--cx-text-sm); font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
    }
    .cx-toast-message {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-secondary);
      margin-top: 2px;
      line-height: 1.5;
    }
    .cx-toast-close {
      flex-shrink: 0;
      background: transparent; border: none;
      color: var(--cx-text-muted);
      cursor: pointer; padding: 2px;
      border-radius: var(--cx-radius-xs);
      opacity: 0.6;
      transition: opacity var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-toast-close:hover { opacity: 1; background: var(--cx-surface-hover); }
    .cx-toast-progress {
      position: absolute; bottom: 0; left: 0; right: 0; height: 2px;
      animation: cx-progress-shrink linear forwards;
    }

    /* Tone variants — subtle accent on left border + icon bg */
    .cx-toast[data-type="success"] { border-left: 3px solid var(--cx-success); }
    .cx-toast[data-type="success"] .cx-toast-icon { background: var(--cx-success-50); color: var(--cx-primary-700); }
    .cx-toast[data-type="success"] .cx-toast-progress { background: var(--cx-success); }

    .cx-toast[data-type="error"] { border-left: 3px solid var(--cx-danger); }
    .cx-toast[data-type="error"] .cx-toast-icon { background: var(--cx-danger-50); color: var(--cx-danger); }
    .cx-toast[data-type="error"] .cx-toast-progress { background: var(--cx-danger); }

    .cx-toast[data-type="warning"] { border-left: 3px solid var(--cx-warning); }
    .cx-toast[data-type="warning"] .cx-toast-icon { background: var(--cx-warning-50); color: var(--cx-warning); }
    .cx-toast[data-type="warning"] .cx-toast-progress { background: var(--cx-warning); }

    .cx-toast[data-type="info"] { border-left: 3px solid var(--cx-info); }
    .cx-toast[data-type="info"] .cx-toast-icon { background: var(--cx-info-50); color: var(--cx-info); }
    .cx-toast[data-type="info"] .cx-toast-progress { background: var(--cx-info); }

    @keyframes cx-toast-in {
      from { opacity: 0; transform: translateX(80px) scale(0.96); }
      to { opacity: 1; transform: translateX(0) scale(1); }
    }
    @keyframes cx-progress-shrink { from { width: 100%; } to { width: 0%; } }
  `],
})
export class ToastContainerComponent implements OnInit, OnDestroy {
  toasts = signal<Toast[]>([]);
  private sub!: Subscription;

  constructor(private toastService: ToastService) {}

  ngOnInit(): void {
    this.sub = this.toastService.toasts$.subscribe(toasts => this.toasts.set(toasts));
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  dismiss(id: number): void { this.toastService.dismiss(id); }

  iconName(type: string): string {
    return { success: 'check-circle', error: 'alert-triangle', info: 'info', warning: 'alert-triangle' }[type] || 'info';
  }

  titleText(type: string): string {
    return { success: 'Success', error: 'Error', info: 'Info', warning: 'Warning' }[type] || 'Notice';
  }
}

