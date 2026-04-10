import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'cx-stat-card',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="cx-card cx-card-hover flex items-start gap-4">
      <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
           [style.background]="iconBg">
        <lucide-icon [name]="icon" [size]="20" [style.color]="iconColor"></lucide-icon>
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-sm text-[var(--cx-text-muted)] truncate">{{ label }}</p>
        <p class="text-2xl font-bold text-[var(--cx-text)] mt-0.5 leading-tight">{{ value }}</p>
        @if (subtext) {
          <p class="text-xs mt-1" [style.color]="subtextColor || 'var(--cx-text-muted)'">{{ subtext }}</p>
        }
      </div>
    </div>
  `,
})
export class StatCardComponent {
  @Input() label = '';
  @Input() value: string | number = '—';
  @Input() icon = 'activity';
  @Input() iconBg = 'var(--cx-primary-50)';
  @Input() iconColor = 'var(--cx-primary)';
  @Input() subtext = '';
  @Input() subtextColor = '';
}
