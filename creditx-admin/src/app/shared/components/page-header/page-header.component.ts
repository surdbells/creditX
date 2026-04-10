import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'cx-page-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col gap-1 mb-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-xl font-semibold text-[var(--cx-text)]">{{ title }}</h1>
        @if (subtitle) {
          <p class="text-sm text-[var(--cx-text-muted)] mt-0.5">{{ subtitle }}</p>
        }
      </div>
      <div class="flex items-center gap-2 mt-2 sm:mt-0">
        <ng-content></ng-content>
      </div>
    </div>
  `,
})
export class PageHeaderComponent {
  @Input() title = '';
  @Input() subtitle = '';
}
