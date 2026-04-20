import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'cx-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="cx-status-badge" [attr.data-tone]="tone">
      @if (showDot) {
        <span class="cx-status-dot"></span>
      }
      <span>{{ displayLabel }}</span>
    </span>
  `,
  styles: [`
    .cx-status-badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 3px 10px;
      border-radius: var(--cx-radius-pill);
      font-size: var(--cx-text-xs); font-weight: 500;
      letter-spacing: 0.01em;
      line-height: 1.5;
      white-space: nowrap;
    }
    .cx-status-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: currentColor;
      flex-shrink: 0;
    }
    .cx-status-badge[data-tone="success"] { background: var(--cx-success-50); color: var(--cx-primary-700); }
    .cx-status-badge[data-tone="warning"] { background: var(--cx-warning-50); color: var(--cx-warning); }
    .cx-status-badge[data-tone="danger"]  { background: var(--cx-danger-50); color: var(--cx-danger); }
    .cx-status-badge[data-tone="info"]    { background: var(--cx-info-50); color: var(--cx-info); }
    .cx-status-badge[data-tone="gold"]    { background: var(--cx-accent-50); color: var(--cx-accent-700); }
    .cx-status-badge[data-tone="neutral"] { background: var(--cx-stone-100); color: var(--cx-text-secondary); }
    .cx-status-badge[data-tone="purple"]  { background: #f3eefc; color: #6b4ca3; }
  `],
})
export class StatusBadgeComponent {
  @Input() status = '';
  @Input() label = '';
  @Input() showDot = true;

  private readonly toneMap: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'gold' | 'neutral' | 'purple'> = {
    // Success tones
    active: 'success', approved: 'success', success: 'success', paid: 'success', done: 'success',
    // Info tones
    closed: 'info', matched: 'info', disbursed: 'info', resolved: 'info', processing: 'info',
    // Warning tones
    pending: 'warning', submitted: 'warning', under_review: 'warning',
    // Gold (captured/special)
    captured: 'gold',
    // Danger tones
    overdue: 'danger', rejected: 'danger', failed: 'danger', written_off: 'danger', exception: 'danger',
    // Neutral tones
    draft: 'neutral', queued: 'neutral', cancelled: 'neutral', inactive: 'neutral',
    // Purple
    restructured: 'purple',
  };

  get tone(): string {
    return this.toneMap[this.status.toLowerCase()] || 'neutral';
  }

  get displayLabel(): string {
    return this.label || this.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}

