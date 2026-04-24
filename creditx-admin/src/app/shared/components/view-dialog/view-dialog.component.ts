import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

/**
 * Slim view-only dialog — sibling to cx-form-dialog but without the
 * save/cancel footer. Used for content-display modals like embedding
 * a detail view, showing receipts, previewing a document, etc.
 *
 * Content is projected via <ng-content> so the host decides what goes
 * in the body. The dialog supplies the chrome: title, close button,
 * backdrop, max-height with scroll, and an Escape-to-close affordance
 * that matches platform expectations.
 *
 * Why separate from cx-form-dialog: every consumer of cx-form-dialog
 * has a save handler and a primary action. Bolting a "no save" mode
 * onto it would have forked its API; a dedicated view dialog keeps
 * both components focused and predictable.
 */
@Component({
  selector: 'cx-view-dialog',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    @if (open) {
      <div class="cx-view-dialog-root" (click)="onBackdropClick($event)">
        <div class="cx-view-dialog-backdrop"></div>
        <div class="cx-view-dialog-panel" [style.max-width]="maxWidth">
          <header class="cx-view-dialog-header">
            <div>
              <h2 class="cx-view-dialog-title">{{ title }}</h2>
              @if (subtitle) {
                <p class="cx-view-dialog-subtitle">{{ subtitle }}</p>
              }
            </div>
            <button class="cx-btn cx-btn-ghost cx-btn-icon" (click)="close.emit()" aria-label="Close">
              <lucide-icon name="x" [size]="18"></lucide-icon>
            </button>
          </header>
          <div class="cx-view-dialog-body">
            <ng-content></ng-content>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .cx-view-dialog-root {
      position: fixed; inset: 0;
      z-index: var(--cx-z-modal);
      display: flex; align-items: flex-start; justify-content: center;
      padding-top: 5vh;
    }
    @media (min-width: 640px) {
      .cx-view-dialog-root { align-items: center; padding-top: 0; }
    }
    .cx-view-dialog-backdrop {
      position: fixed; inset: 0;
      background: rgba(15, 28, 22, 0.52);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      animation: cx-view-fade-in var(--cx-dur-base) var(--cx-ease-premium);
    }
    @keyframes cx-view-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .cx-view-dialog-panel {
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
      animation: cx-view-dialog-in var(--cx-dur-slow) var(--cx-ease-premium);
    }
    @keyframes cx-view-dialog-in {
      from { opacity: 0; transform: translateY(16px) scale(0.96); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    .cx-view-dialog-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 1rem;
      padding: 1.25rem 1.5rem 1rem;
      border-bottom: 1px solid var(--cx-border);
      flex-shrink: 0;
    }
    .cx-view-dialog-title {
      margin: 0;
      font-size: var(--cx-text-md); font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
    }
    .cx-view-dialog-subtitle {
      margin: 0.25rem 0 0;
      font-size: var(--cx-text-sm);
      color: var(--cx-text-muted);
    }
    .cx-view-dialog-body {
      padding: 1.25rem 1.5rem;
      overflow-y: auto;
      flex: 1; min-height: 0;
    }
  `],
})
export class CxViewDialogComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() subtitle = '';
  @Input() maxWidth = '800px';
  @Output() close = new EventEmitter<void>();

  onBackdropClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.classList.contains('cx-view-dialog-root') || target.classList.contains('cx-view-dialog-backdrop')) {
      this.close.emit();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.close.emit();
  }
}
