import { Component, Input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'cx-empty-state',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="flex flex-col items-center justify-center py-12 text-center">
      <lucide-icon [name]="icon" [size]="48" class="text-[var(--cx-text-muted)] mb-3"></lucide-icon>
      <h3 class="text-lg font-medium text-[var(--cx-text)]">{{ title }}</h3>
      @if (description) { <p class="text-sm text-[var(--cx-text-muted)] mt-1 max-w-md">{{ description }}</p> }
      <div class="mt-4"><ng-content></ng-content></div>
    </div>
  `,
})
export class EmptyStateComponent {
  @Input() title = 'No data';
  @Input() description = '';
  @Input() icon = 'inbox';
}
