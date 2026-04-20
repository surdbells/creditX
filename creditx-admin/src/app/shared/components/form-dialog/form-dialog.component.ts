import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'cx-form-dialog',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    @if (open) {
      <div class="cx-form-dialog-root" (click)="onBackdropClick($event)">
        <div class="cx-form-dialog-backdrop"></div>
        <div class="cx-form-dialog-panel" [style.max-width]="maxWidth">
          <header class="cx-form-dialog-header">
            <div>
              <h2 class="cx-form-dialog-title">{{ title }}</h2>
              @if (subtitle) {
                <p class="cx-form-dialog-subtitle">{{ subtitle }}</p>
              }
            </div>
            <button class="cx-btn cx-btn-ghost cx-btn-icon" (click)="close.emit()" aria-label="Close">
              <lucide-icon name="x" [size]="18"></lucide-icon>
            </button>
          </header>
          <div class="cx-form-dialog-body">
            <ng-content></ng-content>
          </div>
          <footer class="cx-form-dialog-footer">
            <button class="cx-btn cx-btn-outline" (click)="close.emit()" [disabled]="saving">{{ cancelLabel }}</button>
            <button class="cx-btn cx-btn-primary" (click)="save.emit()" [disabled]="saving || saveDisabled">
              @if (saving) {
                <span class="cx-form-dialog-spinner"></span>
              }
              {{ saveLabel }}
            </button>
          </footer>
        </div>
      </div>
    }
  `,
  styles: [`
    .cx-form-dialog-root {
      position: fixed; inset: 0;
      z-index: var(--cx-z-modal);
      display: flex; align-items: flex-start; justify-content: center;
      padding-top: 5vh;
    }
    @media (min-width: 640px) {
      .cx-form-dialog-root { align-items: center; padding-top: 0; }
    }
    .cx-form-dialog-backdrop {
      position: fixed; inset: 0;
      background: rgba(15, 28, 22, 0.52);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      animation: cx-fade-in var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cx-form-dialog-panel {
      position: relative;
      background: var(--cx-surface);
      border-radius: var(--cx-radius-2xl);
      box-shadow: var(--cx-shadow-xl);
      border: 1px solid var(--cx-border);
      width: 100%;
      margin: 0 1rem;
      max-height: 90vh;
      display: flex; flex-direction: column;
      overflow: hidden;
      animation: cx-dialog-in var(--cx-dur-slow) var(--cx-ease-premium);
    }
    @keyframes cx-dialog-in {
      from { opacity: 0; transform: translateY(16px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .cx-form-dialog-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 1rem;
      padding: 1.25rem 1.5rem 1rem;
      border-bottom: 1px solid var(--cx-border);
      flex-shrink: 0;
    }
    .cx-form-dialog-title {
      margin: 0;
      font-size: var(--cx-text-md); font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
    }
    .cx-form-dialog-subtitle {
      margin: 0.25rem 0 0;
      font-size: var(--cx-text-sm);
      color: var(--cx-text-muted);
    }
    .cx-form-dialog-body {
      padding: 1.25rem 1.5rem;
      overflow-y: auto;
      flex: 1; min-height: 0;
    }
    .cx-form-dialog-footer {
      display: flex; align-items: center; justify-content: flex-end;
      gap: 0.5rem;
      padding: 1rem 1.5rem;
      border-top: 1px solid var(--cx-border);
      background: var(--cx-surface-2);
      flex-shrink: 0;
    }
    .cx-form-dialog-spinner {
      width: 14px; height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: cx-spin 0.7s linear infinite;
    }
    @keyframes cx-spin {
      to { transform: rotate(360deg); }
    }
  `],
})
export class FormDialogComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() subtitle = '';
  @Input() saveLabel = 'Save';
  @Input() cancelLabel = 'Cancel';
  @Input() saving = false;
  @Input() saveDisabled = false;
  @Input() maxWidth = '560px';
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();

  onBackdropClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.classList.contains('cx-form-dialog-root') || target.classList.contains('cx-form-dialog-backdrop')) {
      this.close.emit();
    }
  }
}

