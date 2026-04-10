import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { LucideAngularModule } from 'lucide-angular';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

@Component({
  selector: 'cx-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, LucideAngularModule],
  template: `
    <div class="p-6 max-w-md">
      <div class="flex items-start gap-4">
        <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
             [ngClass]="{
               'bg-[var(--cx-danger-light)]': data.variant === 'danger',
               'bg-[var(--cx-warning-light)]': data.variant === 'warning',
               'bg-[var(--cx-info-light)]': data.variant !== 'danger' && data.variant !== 'warning'
             }">
          <lucide-icon
            [name]="data.variant === 'danger' ? 'triangle-alert' : data.variant === 'warning' ? 'alert-circle' : 'info'"
            [size]="20"
            [ngClass]="{
              'text-[var(--cx-danger)]': data.variant === 'danger',
              'text-[var(--cx-warning)]': data.variant === 'warning',
              'text-[var(--cx-info)]': data.variant !== 'danger' && data.variant !== 'warning'
            }"
          ></lucide-icon>
        </div>
        <div>
          <h3 class="text-base font-semibold text-[var(--cx-text)]">{{ data.title }}</h3>
          <p class="text-sm text-[var(--cx-text-secondary)] mt-1">{{ data.message }}</p>
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-6">
        <button class="cx-btn cx-btn-outline" (click)="dialogRef.close(false)">{{ data.cancelText || 'Cancel' }}</button>
        <button class="cx-btn" [ngClass]="data.variant === 'danger' ? 'cx-btn-danger' : 'cx-btn-primary'" (click)="dialogRef.close(true)">
          {{ data.confirmText || 'Confirm' }}
        </button>
      </div>
    </div>
  `,
})
export class ConfirmDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData,
  ) {}
}
