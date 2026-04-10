import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'cx-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" [ngClass]="badgeClass">
      {{ displayLabel }}
    </span>
  `,
})
export class StatusBadgeComponent {
  @Input() status = '';
  @Input() label = '';

  private readonly classMap: Record<string, string> = {
    active: 'bg-[var(--cx-success-light)] text-[var(--cx-success)]',
    approved: 'bg-[var(--cx-success-light)] text-[var(--cx-success)]',
    success: 'bg-[var(--cx-success-light)] text-[var(--cx-success)]',
    paid: 'bg-[var(--cx-success-light)] text-[var(--cx-success)]',
    closed: 'bg-[var(--cx-info-light)] text-[var(--cx-info)]',
    matched: 'bg-[var(--cx-info-light)] text-[var(--cx-info)]',
    disbursed: 'bg-[var(--cx-info-light)] text-[var(--cx-info)]',
    pending: 'bg-[var(--cx-warning-light)] text-[var(--cx-warning)]',
    submitted: 'bg-[var(--cx-warning-light)] text-[var(--cx-warning)]',
    under_review: 'bg-[var(--cx-warning-light)] text-[var(--cx-warning)]',
    captured: 'bg-[var(--cx-accent-50)] text-[var(--cx-accent)]',
    draft: 'bg-gray-100 text-gray-600',
    queued: 'bg-gray-100 text-gray-600',
    overdue: 'bg-[var(--cx-danger-light)] text-[var(--cx-danger)]',
    rejected: 'bg-[var(--cx-danger-light)] text-[var(--cx-danger)]',
    failed: 'bg-[var(--cx-danger-light)] text-[var(--cx-danger)]',
    written_off: 'bg-[var(--cx-danger-light)] text-[var(--cx-danger)]',
    cancelled: 'bg-gray-100 text-gray-500',
    inactive: 'bg-gray-100 text-gray-500',
    restructured: 'bg-purple-100 text-purple-700',
    resolved: 'bg-[var(--cx-info-light)] text-[var(--cx-info)]',
    exception: 'bg-[var(--cx-danger-light)] text-[var(--cx-danger)]',
  };

  get badgeClass(): string {
    return this.classMap[this.status.toLowerCase()] || 'bg-gray-100 text-gray-600';
  }

  get displayLabel(): string {
    return this.label || this.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}
