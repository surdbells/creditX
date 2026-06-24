import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="fixed top-4 right-4 z-[1080] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]">
      @for (t of toast.toasts$ | async; track t.id) {
        <div
          class="cx-card cx-animate-scale flex items-start gap-3 !p-3.5 shadow-lg"
          [class.!border-l-4]="true"
          [style.borderLeftColor]="accent(t.type)"
        >
          <lucide-icon [name]="icon(t.type)" [size]="18" class="mt-0.5 shrink-0" [style.color]="accent(t.type)"></lucide-icon>
          <p class="text-sm flex-1 leading-snug" style="color: var(--cx-text)">{{ t.message }}</p>
          <button (click)="toast.dismiss(t.id)" class="cx-btn-ghost !p-1 rounded-md shrink-0">
            <lucide-icon name="x" [size]="15"></lucide-icon>
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastContainer {
  toast = inject(ToastService);

  icon(type: string): string {
    switch (type) {
      case 'success': return 'check-circle';
      case 'error': return 'x-circle';
      case 'warning': return 'alert-triangle';
      default: return 'info';
    }
  }

  accent(type: string): string {
    switch (type) {
      case 'success': return 'var(--cx-success)';
      case 'error': return 'var(--cx-danger)';
      case 'warning': return 'var(--cx-warning)';
      default: return 'var(--cx-info)';
    }
  }
}
