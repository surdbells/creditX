import { Component, Input } from '@angular/core';

@Component({
  selector: 'cx-loading',
  standalone: true,
  template: `
    <div class="cx-loading" [attr.data-size]="size">
      <div class="cx-loading-spinner">
        <span></span><span></span><span></span>
      </div>
      @if (message) { <span class="cx-loading-msg">{{ message }}</span> }
    </div>
  `,
  styles: [`
    .cx-loading {
      display: flex; align-items: center; justify-content: center;
      gap: 0.75rem;
      padding: 2rem 1rem;
      color: var(--cx-text-muted);
    }
    .cx-loading-spinner {
      display: inline-flex; gap: 4px; align-items: center;
    }
    .cx-loading-spinner span {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--cx-primary-600);
      animation: cx-loading-pulse 1.2s infinite var(--cx-ease-premium);
    }
    .cx-loading-spinner span:nth-child(2) { animation-delay: 0.2s; background: var(--cx-accent-500); }
    .cx-loading-spinner span:nth-child(3) { animation-delay: 0.4s; }
    .cx-loading-msg { font-size: var(--cx-text-sm); }
    .cx-loading[data-size="sm"] { padding: 1rem; }
    .cx-loading[data-size="sm"] .cx-loading-spinner span { width: 4px; height: 4px; }
    @keyframes cx-loading-pulse {
      0%, 100% { opacity: 0.3; transform: scale(0.8); }
      50% { opacity: 1; transform: scale(1.15); }
    }
  `],
})
export class LoadingSpinnerComponent {
  @Input() message = 'Loading...';
  @Input() size: 'sm' | 'md' = 'md';
}

