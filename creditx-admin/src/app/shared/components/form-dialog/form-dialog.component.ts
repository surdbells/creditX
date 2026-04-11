import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'cx-form-dialog',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    @if (open) {
      <div class="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] sm:items-center sm:pt-0" (click)="onBackdropClick($event)">
        <div class="fixed inset-0 bg-black/40"></div>
        <div class="relative bg-[var(--cx-surface)] rounded-2xl shadow-2xl w-full mx-4 cx-animate-in overflow-hidden"
             [style.max-width]="maxWidth" [style.max-height]="'85vh'">
          <div class="flex items-center justify-between px-6 py-4 border-b border-[var(--cx-border)]">
            <h2 class="text-base font-semibold text-[var(--cx-text)]">{{ title }}</h2>
            <button class="cx-btn cx-btn-ghost cx-btn-icon" (click)="close.emit()">
              <lucide-icon name="x" [size]="18"></lucide-icon>
            </button>
          </div>
          <div class="px-6 py-4 overflow-y-auto" [style.max-height]="'calc(85vh - 130px)'">
            <ng-content></ng-content>
          </div>
          <div class="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--cx-border)]">
            <button class="cx-btn cx-btn-outline" (click)="close.emit()" [disabled]="saving">Cancel</button>
            <button class="cx-btn cx-btn-primary" (click)="save.emit()" [disabled]="saving || saveDisabled">
              @if (saving) { <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> }
              {{ saveLabel }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class FormDialogComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() saveLabel = 'Save';
  @Input() saving = false;
  @Input() saveDisabled = false;
  @Input() maxWidth = '560px';
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();

  onBackdropClick(event: Event): void {
    if ((event.target as HTMLElement).classList.contains('fixed')) this.close.emit();
  }
}
