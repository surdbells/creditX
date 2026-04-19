import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'cx-confirm-dialog',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    @if (open) {
      <div class="fixed inset-0 z-50 flex items-center justify-center cx-animate-in" (click)="cancel()">
        <div class="fixed inset-0 bg-black/40"></div>
        <div class="relative cx-card max-w-md w-full mx-4 shadow-2xl" (click)="$event.stopPropagation()">
          <div class="px-6 py-5">
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                   [class]="variant === 'danger' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'">
                <lucide-icon [name]="variant === 'danger' ? 'alert-triangle' : 'alert-circle'" [size]="20"></lucide-icon>
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="text-sm font-bold text-[var(--cx-text)] mb-1">{{ title }}</h3>
                <p class="text-sm text-[var(--cx-text-secondary)]">{{ message }}</p>
              </div>
            </div>
          </div>
          <div class="px-6 py-3 border-t border-[var(--cx-border)] flex justify-end gap-2">
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="cancel()">{{ cancelLabel }}</button>
            <button class="cx-btn cx-btn-sm" [class]="variant === 'danger' ? 'cx-btn-danger' : 'cx-btn-warning'" (click)="confirm()">{{ confirmLabel }}</button>
          </div>
        </div>
      </div>
    }
  `,
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
