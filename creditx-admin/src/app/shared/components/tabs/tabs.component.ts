import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface CxTab {
  id: string;
  label: string;
  badge?: string | number;
  disabled?: boolean;
}

/**
 * CxTabs — premium pill-in-tray tab component.
 *
 * Usage:
 *   <cx-tabs [tabs]="[{id:'overview', label:'Overview'}, ...]"
 *            [(activeId)]="activeTab"
 *            variant="pill"        <!-- 'pill' | 'underline' -->
 *            size="md"             <!-- 'sm' | 'md' | 'lg' -->
 *            [fullWidth]="false">
 *   </cx-tabs>
 */
@Component({
  selector: 'cx-tabs',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="wrapperClasses()" role="tablist">
      @for (tab of tabs; track tab.id) {
        <button
          type="button"
          role="tab"
          class="cx-tabs-tab"
          [class.is-active]="tab.id === activeId"
          [disabled]="tab.disabled"
          [attr.aria-selected]="tab.id === activeId"
          (click)="select(tab)">
          <span>{{ tab.label }}</span>
          @if (tab.badge !== undefined && tab.badge !== null) {
            <span class="cx-tabs-badge">{{ tab.badge }}</span>
          }
        </button>
      }
    </div>
  `,
  styles: [`
    :host { display: inline-block; }
    :host-context(.cx-tabs-full-host), :host([full-width]) { display: block; }
    .cx-tabs-badge {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 18px; height: 18px; padding: 0 5px;
      background: var(--cx-stone-200); color: var(--cx-text-secondary);
      border-radius: var(--cx-radius-pill);
      font-size: 10px; font-weight: 600;
      margin-left: 6px;
      transition: background var(--cx-dur-fast) var(--cx-ease-premium),
                  color var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-tabs-tab.is-active .cx-tabs-badge {
      background: var(--cx-primary-600);
      color: #fff;
    }
  `],
})
export class CxTabsComponent {
  @Input({ required: true }) tabs: CxTab[] = [];
  @Input() activeId: string | null = null;
  @Input() variant: 'pill' | 'underline' = 'pill';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() fullWidth = false;

  @Output() activeIdChange = new EventEmitter<string>();
  @Output() tabSelect = new EventEmitter<CxTab>();

  wrapperClasses(): string {
    const classes = ['cx-tabs'];
    if (this.variant === 'underline') classes.push('cx-tabs-underline');
    if (this.size === 'sm') classes.push('cx-tabs-sm');
    if (this.size === 'lg') classes.push('cx-tabs-lg');
    if (this.fullWidth) classes.push('cx-tabs-full');
    return classes.join(' ');
  }

  select(tab: CxTab): void {
    if (tab.disabled || tab.id === this.activeId) return;
    this.activeId = tab.id;
    this.activeIdChange.emit(tab.id);
    this.tabSelect.emit(tab);
  }
}
