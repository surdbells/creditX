import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmarkCircle, closeCircle, alertCircle, informationCircle, close,
} from 'ionicons/icons';
import { Subscription } from 'rxjs';
import { ToastService, Toast } from '../../../core/services/toast.service';

/**
 * Bottom-anchored stack of toast cards.
 *
 * Design notes (premium mobile feel):
 *
 *   - Dark card on a subtly tinted background — readable over any page
 *     content without the 'alert fatigue' look of colorful banners.
 *   - Colored icon well (type-tinted) + tight 'Success' / 'Error' /
 *     'Notice' / 'Heads up' title + the actual server message in the
 *     body. Two-line hierarchy scans fast at arm's length.
 *   - Spring-in animation on entry (scale 0.92→1 + translateY from 40px).
 *     Exit is a clean fade; no jank.
 *   - Progress bar at the bottom shows remaining dwell time. Synced to
 *     the duration prop via CSS animation-duration.
 *   - Safe-area-bottom inset so the stack clears the iOS home indicator
 *     AND the agent's bottom tab bar.
 *   - Tap anywhere on the card dismisses. Dedicated X for users who
 *     missed that affordance.
 *
 * Rendered once at the top of AppComponent so it sits above all route
 * content and every page gets toasts for free.
 */
@Component({
  selector: 'cxm-toast-container',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <div class="cxm-toast-root">
      @for (toast of toasts(); track toast.id) {
        <div class="cxm-toast" [attr.data-type]="toast.type" (click)="dismiss(toast.id)" role="alert">
          <div class="cxm-toast-inner">
            <div class="cxm-toast-icon">
              <ion-icon [name]="iconName(toast.type)" style="font-size: 18px"></ion-icon>
            </div>
            <div class="cxm-toast-content">
              <div class="cxm-toast-title">{{ titleText(toast.type) }}</div>
              <div class="cxm-toast-message">{{ toast.message }}</div>
            </div>
            <button class="cxm-toast-close" aria-label="Dismiss" (click)="dismiss(toast.id); $event.stopPropagation()">
              <ion-icon name="close" style="font-size: 14px"></ion-icon>
            </button>
          </div>
          <div class="cxm-toast-progress" [style.animation-duration]="toast.duration + 'ms'"></div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .cxm-toast-root {
      position: fixed;
      left: 12px; right: 12px;
      /* Anchor above tab bar + safe area so toasts never collide with nav */
      bottom: calc(72px + env(safe-area-inset-bottom));
      z-index: 9999;
      display: flex;
      flex-direction: column-reverse;
      gap: 8px;
      pointer-events: none;
    }

    .cxm-toast {
      pointer-events: auto;
      background: #0f172a;
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.08),
        0 8px 28px rgba(0, 0, 0, 0.35);
      cursor: pointer;
      position: relative;
      overflow: hidden;
      animation: cxm-toast-in 340ms cubic-bezier(0.34, 1.56, 0.64, 1);
      transform-origin: bottom center;
    }

    @keyframes cxm-toast-in {
      0% { opacity: 0; transform: translateY(40px) scale(0.92); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }

    .cxm-toast-inner {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 12px 14px;
    }

    .cxm-toast-icon {
      width: 32px; height: 32px;
      flex-shrink: 0;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.85);
    }

    .cxm-toast[data-type="success"] .cxm-toast-icon { background: rgba(34, 197, 94, 0.18); color: #4ade80; }
    .cxm-toast[data-type="error"]   .cxm-toast-icon { background: rgba(239, 68, 68, 0.18); color: #fca5a5; }
    .cxm-toast[data-type="warning"] .cxm-toast-icon { background: rgba(245, 158, 11, 0.18); color: #fcd34d; }
    .cxm-toast[data-type="info"]    .cxm-toast-icon { background: rgba(56, 189, 248, 0.18); color: #7dd3fc; }

    .cxm-toast-content {
      flex: 1;
      min-width: 0;
    }

    .cxm-toast-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: rgba(255, 255, 255, 0.55);
      margin-bottom: 2px;
    }

    .cxm-toast[data-type="success"] .cxm-toast-title { color: #4ade80; }
    .cxm-toast[data-type="error"]   .cxm-toast-title { color: #fca5a5; }
    .cxm-toast[data-type="warning"] .cxm-toast-title { color: #fcd34d; }
    .cxm-toast[data-type="info"]    .cxm-toast-title { color: #7dd3fc; }

    .cxm-toast-message {
      font-size: 13px;
      line-height: 1.45;
      color: #f1f5f9;
      word-break: break-word;
    }

    .cxm-toast-close {
      width: 28px; height: 28px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 50%;
      color: rgba(255, 255, 255, 0.65);
      cursor: pointer;
      transition: all 150ms ease;
    }

    .cxm-toast-close:active {
      background: rgba(255, 255, 255, 0.12);
      transform: scale(0.9);
    }

    .cxm-toast-progress {
      height: 2px;
      background: rgba(255, 255, 255, 0.12);
      position: relative;
      overflow: hidden;
    }

    .cxm-toast-progress::after {
      content: '';
      position: absolute;
      inset: 0;
      background: currentColor;
      transform-origin: left;
      animation: cxm-toast-progress linear forwards;
    }

    .cxm-toast[data-type="success"] .cxm-toast-progress::after { background: #4ade80; }
    .cxm-toast[data-type="error"]   .cxm-toast-progress::after { background: #fca5a5; }
    .cxm-toast[data-type="warning"] .cxm-toast-progress::after { background: #fcd34d; }
    .cxm-toast[data-type="info"]    .cxm-toast-progress::after { background: #7dd3fc; }

    @keyframes cxm-toast-progress {
      0% { transform: scaleX(1); }
      100% { transform: scaleX(0); }
    }
  `],
})
export class ToastContainerComponent implements OnInit, OnDestroy {
  toasts = signal<Toast[]>([]);
  private sub?: Subscription;

  constructor(private toastService: ToastService) {
    addIcons({ checkmarkCircle, closeCircle, alertCircle, informationCircle, close });
  }

  ngOnInit(): void {
    this.sub = this.toastService.toasts$.subscribe(ts => this.toasts.set(ts));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  dismiss(id: number): void {
    this.toastService.dismiss(id);
  }

  iconName(type: Toast['type']): string {
    switch (type) {
      case 'success': return 'checkmark-circle';
      case 'error':   return 'close-circle';
      case 'warning': return 'alert-circle';
      case 'info':    return 'information-circle';
      default:        return 'information-circle';
    }
  }

  titleText(type: Toast['type']): string {
    switch (type) {
      case 'success': return 'Success';
      case 'error':   return 'Error';
      case 'warning': return 'Heads up';
      case 'info':    return 'Notice';
      default:        return 'Notice';
    }
  }
}
