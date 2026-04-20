import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'cx-stat-card',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="cx-stat-card cx-card cx-card-hover">
      <div class="cx-stat-header">
        <div class="cx-stat-icon" [style.background]="iconBg">
          <lucide-icon [name]="icon" [size]="18" [style.color]="iconColor"></lucide-icon>
        </div>
        @if (trend !== undefined && trend !== null) {
          <div class="cx-stat-trend" [class.is-up]="trend > 0" [class.is-down]="trend < 0">
            <lucide-icon [name]="trend > 0 ? 'trending-up' : trend < 0 ? 'trending-down' : 'minus'" [size]="12"></lucide-icon>
            <span>{{ trend > 0 ? '+' : '' }}{{ trend }}%</span>
          </div>
        }
      </div>
      <div class="cx-stat-body">
        <p class="cx-stat-label">{{ label }}</p>
        <p class="cx-stat-value tabular-nums">{{ value }}</p>
        @if (subtext) {
          <p class="cx-stat-subtext" [style.color]="subtextColor || 'var(--cx-text-muted)'">{{ subtext }}</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .cx-stat-card { display: flex; flex-direction: column; gap: 0.75rem; }
    .cx-stat-header { display: flex; align-items: center; justify-content: space-between; }
    .cx-stat-icon {
      width: 40px; height: 40px;
      border-radius: var(--cx-radius-md);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      transition: transform var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cx-stat-card:hover .cx-stat-icon { transform: scale(1.06); }
    .cx-stat-label {
      font-size: var(--cx-text-xs); font-weight: 500;
      color: var(--cx-text-muted);
      margin: 0;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .cx-stat-value {
      font-size: var(--cx-text-2xl); font-weight: 600;
      color: var(--cx-text);
      margin: 0.25rem 0 0;
      line-height: 1.1;
      letter-spacing: -0.015em;
    }
    .cx-stat-subtext {
      font-size: var(--cx-text-xs);
      margin: 0.35rem 0 0;
    }
    .cx-stat-trend {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 2px 8px;
      background: var(--cx-stone-100);
      color: var(--cx-text-muted);
      border-radius: var(--cx-radius-pill);
      font-size: var(--cx-text-xs); font-weight: 500;
    }
    .cx-stat-trend.is-up { background: var(--cx-success-50); color: var(--cx-primary-700); }
    .cx-stat-trend.is-down { background: var(--cx-danger-50); color: var(--cx-danger); }
  `],
})
export class StatCardComponent {
  @Input() label = '';
  @Input() value: string | number = '—';
  @Input() icon = 'activity';
  @Input() iconBg = 'var(--cx-primary-50)';
  @Input() iconColor = 'var(--cx-primary-600)';
  @Input() subtext = '';
  @Input() subtextColor = '';
  @Input() trend?: number | null;
}

