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
    <div class="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      @for (toast of toasts(); track toast.id) {
        <div class="pointer-events-auto cx-toast-item" [class]="toastClass(toast.type)"
             (click)="dismiss(toast.id)" role="alert">
          <div class="flex items-start gap-3">
            <div class="toast-icon-wrap" [class]="iconWrapClass(toast.type)">
              <lucide-icon [name]="iconName(toast.type)" [size]="16"></lucide-icon>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold" [class]="titleClass(toast.type)">{{ titleText(toast.type) }}</div>
              <div class="text-xs mt-0.5 opacity-80">{{ toast.message }}</div>
            </div>
            <button class="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity">
              <lucide-icon name="x" [size]="14"></lucide-icon>
            </button>
          </div>
          <div class="toast-progress" [class]="progressClass(toast.type)"
               [style.animation-duration]="toast.duration + 'ms'"></div>
        </div>
      }
    </div>
  `,
  styles: [`
    .cx-toast-item {
      padding: 14px 16px;
      border-radius: 12px;
      backdrop-filter: blur(12px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
      border: 1px solid rgba(255,255,255,0.1);
      cursor: pointer;
      animation: toastIn 0.3s cubic-bezier(0.21, 1.02, 0.73, 1) forwards;
      position: relative;
      overflow: hidden;
    }
    .toast-icon-wrap {
      width: 28px; height: 28px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .toast-progress {
      position: absolute; bottom: 0; left: 0; right: 0; height: 3px;
      animation: progressShrink linear forwards;
      border-radius: 0 0 12px 12px;
    }
    .toast-success { background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); color: #065f46; border-color: #a7f3d0; }
    .toast-success .toast-icon-wrap { background: #059669; color: white; }
    .toast-success .toast-progress { background: #059669; }
    .toast-error { background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); color: #991b1b; border-color: #fca5a5; }
    .toast-error .toast-icon-wrap { background: #dc2626; color: white; }
    .toast-error .toast-progress { background: #dc2626; }
    .toast-info { background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); color: #1e40af; border-color: #93c5fd; }
    .toast-info .toast-icon-wrap { background: #2563eb; color: white; }
    .toast-info .toast-progress { background: #2563eb; }
    .toast-warning { background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); color: #92400e; border-color: #fcd34d; }
    .toast-warning .toast-icon-wrap { background: #d97706; color: white; }
    .toast-warning .toast-progress { background: #d97706; }

    :host-context(.dark) .toast-success { background: linear-gradient(135deg, #064e3b 0%, #065f46 100%); color: #a7f3d0; border-color: #065f46; }
    :host-context(.dark) .toast-error { background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); color: #fca5a5; border-color: #991b1b; }
    :host-context(.dark) .toast-info { background: linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%); color: #93c5fd; border-color: #1e40af; }
    :host-context(.dark) .toast-warning { background: linear-gradient(135deg, #78350f 0%, #92400e 100%); color: #fcd34d; border-color: #92400e; }

    @keyframes toastIn { from { opacity: 0; transform: translateX(100px) scale(0.95); } to { opacity: 1; transform: translateX(0) scale(1); } }
    @keyframes progressShrink { from { width: 100%; } to { width: 0%; } }
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

  toastClass(type: string): string { return 'toast-' + type; }
  iconWrapClass(type: string): string { return ''; }
  progressClass(type: string): string { return ''; }
  titleClass(type: string): string { return ''; }

  iconName(type: string): string {
    return { success: 'check-circle', error: 'alert-triangle', info: 'info', warning: 'alert-triangle' }[type] || 'info';
  }

  titleText(type: string): string {
    return { success: 'Success', error: 'Error', info: 'Info', warning: 'Warning' }[type] || 'Notice';
  }
}
