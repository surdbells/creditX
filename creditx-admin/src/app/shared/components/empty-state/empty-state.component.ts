import { Component, Input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'cx-empty-state',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="cx-empty-state">
      <div class="cx-empty-icon">
        <lucide-icon [name]="icon" [size]="32"></lucide-icon>
      </div>
      <h3 class="cx-empty-title">{{ title }}</h3>
      @if (description) { <p class="cx-empty-description">{{ description }}</p> }
      <div class="cx-empty-actions"><ng-content></ng-content></div>
    </div>
  `,
  styles: [`
    .cx-empty-state {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center;
      padding: 3rem 1.5rem;
      text-align: center;
      animation: cx-fade-in var(--cx-dur-slow) var(--cx-ease-premium);
    }
    .cx-empty-icon {
      width: 72px; height: 72px;
      border-radius: 50%;
      background: var(--cx-stone-100);
      color: var(--cx-text-muted);
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 1rem;
      position: relative;
    }
    .cx-empty-icon::before {
      content: '';
      position: absolute; inset: -4px;
      border-radius: 50%;
      border: 1px dashed var(--cx-border-strong);
    }
    .cx-empty-title {
      margin: 0 0 0.35rem;
      font-size: var(--cx-text-md); font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
    }
    .cx-empty-description {
      margin: 0;
      font-size: var(--cx-text-sm);
      color: var(--cx-text-muted);
      max-width: 28rem;
      line-height: 1.55;
    }
    .cx-empty-actions:not(:empty) { margin-top: 1.25rem; }
  `],
})
export class EmptyStateComponent {
  @Input() title = 'No data';
  @Input() description = '';
  @Input() icon = 'inbox';
}

