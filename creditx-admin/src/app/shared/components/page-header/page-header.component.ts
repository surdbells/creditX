import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'cx-page-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="cx-page-header">
      <div class="cx-page-header-main">
        @if (eyebrow) {
          <div class="cx-eyebrow">{{ eyebrow }}</div>
        }
        <h1 class="cx-heading cx-heading-lg">{{ title }}</h1>
        @if (subtitle) {
          <p class="cx-page-header-subtitle">{{ subtitle }}</p>
        }
      </div>
      <div class="cx-page-header-actions">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .cx-page-header {
      display: flex; flex-direction: column; gap: 0.75rem;
      margin-bottom: 1.75rem;
    }
    @media (min-width: 640px) {
      .cx-page-header { flex-direction: row; align-items: flex-start; justify-content: space-between; gap: 1.5rem; }
    }
    .cx-page-header-main {
      display: flex; flex-direction: column; gap: 0.35rem;
      animation: cx-fade-in var(--cx-dur-slow) var(--cx-ease-premium);
    }
    .cx-eyebrow { margin-bottom: 0.15rem; color: var(--cx-accent-600); }
    .cx-page-header-subtitle {
      font-size: var(--cx-text-sm);
      color: var(--cx-text-muted);
      margin: 0;
      max-width: 60ch;
      line-height: 1.5;
    }
    .cx-page-header-actions {
      display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
      flex-shrink: 0;
    }
  `],
})
export class PageHeaderComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() eyebrow = '';
}

