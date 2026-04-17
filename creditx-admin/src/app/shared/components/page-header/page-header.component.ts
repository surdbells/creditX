import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'cx-page-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col gap-1 mb-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-xl font-bold text-[var(--cx-text)] tracking-tight">{{ title }}</h1>
        @if (subtitle) {
          <p class="text-xs text-[var(--cx-text-muted)] mt-1 font-medium">{{ subtitle }}</p>
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
