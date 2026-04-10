import { Component, Input } from '@angular/core';

@Component({
  selector: 'cx-loading',
  standalone: true,
  template: `
    <div class="flex items-center justify-center gap-2 py-8 text-[var(--cx-text-muted)]">
      <div class="w-5 h-5 border-2 border-[var(--cx-primary)] border-t-transparent rounded-full animate-spin"></div>
      @if (message) { <span class="text-sm">{{ message }}</span> }
    </div>
  `,
})
export class LoadingSpinnerComponent {
  @Input() message = 'Loading...';
}
