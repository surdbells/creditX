import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, CheckCircle, XCircle, Eye } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-approval-queue', standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, PageHeaderComponent, FormDialogComponent, StatusBadgeComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Approval Queue" subtitle="Pending loan approvals for your role"></cx-page-header>

      @if (loading()) {
        <div class="flex justify-center py-12"><div class="w-5 h-5 border-2 border-[var(--cx-primary)] border-t-transparent rounded-full animate-spin"></div></div>
      } @else if (items().length === 0) {
        <div class="cx-card text-center py-12">
          <lucide-icon name="check-circle" [size]="48" class="text-[var(--cx-success)] mx-auto mb-3"></lucide-icon>
          <h3 class="text-lg font-semibold text-[var(--cx-text)]">All caught up!</h3>
          <p class="text-sm text-[var(--cx-text-muted)]">No pending approvals at the moment.</p>
        </div>
      } @else {
        <div class="space-y-3">
          @for (item of items(); track item.id) {
            <div class="cx-card cx-card-hover">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-sm font-medium text-[var(--cx-primary)]">{{ item.loan?.application_id }}</span>
                    <cx-status-badge [status]="item.status"></cx-status-badge>
                  </div>
                  <div class="text-sm text-[var(--cx-text)] mt-1">{{ item.loan?.customer_name }}</div>
                  <div class="text-xs text-[var(--cx-text-muted)]">
                    ₦{{ item.loan?.amount_requested | number:'1.0-0' }} &bull; {{ item.step_name }} &bull; {{ item.role_name }}
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <a [routerLink]="['/loans', item.loan?.id]" class="cx-btn cx-btn-outline cx-btn-sm">
                    <lucide-icon name="eye" [size]="14"></lucide-icon> View
                  </a>
                  <button class="cx-btn cx-btn-primary cx-btn-sm" (click)="openDecision(item, 'approve')">
                    <lucide-icon name="check-circle" [size]="14"></lucide-icon> Approve
                  </button>
                  <button class="cx-btn cx-btn-danger cx-btn-sm" (click)="openDecision(item, 'reject')">
                    <lucide-icon name="x-circle" [size]="14"></lucide-icon> Reject
                  </button>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>

    <!-- Approve/Reject Dialog -->
    <cx-form-dialog [open]="showDecision()" [title]="decisionAction === 'approve' ? 'Approve Loan' : 'Reject Loan'"
      [saveLabel]="decisionAction === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'" [saving]="deciding()"
      (close)="showDecision.set(false)" (save)="submitDecision()">
      <div class="space-y-4">
        @if (selectedItem) {
          <div class="p-4 rounded-xl bg-[var(--cx-surface-hover)]">
            <div class="text-sm"><strong>{{ selectedItem.loan?.application_id }}</strong> — {{ selectedItem.loan?.customer_name }}</div>
            <div class="text-sm text-[var(--cx-text-muted)]">Amount: ₦{{ selectedItem.loan?.amount_requested | number:'1.0-0' }} &bull; Step: {{ selectedItem.step_name }}</div>
          </div>
        }
        <div>
          <label class="cx-label">Comment {{ decisionAction === 'reject' ? '*' : '(optional)' }}</label>
          <textarea class="cx-input" rows="3" [(ngModel)]="comment" placeholder="Enter your comment..."></textarea>
        </div>
      </div>
    </cx-form-dialog>
  `,
})
export class ApprovalQueueComponent implements OnInit {
  items = signal<any[]>([]); loading = signal(true);
  showDecision = signal(false); deciding = signal(false);
  selectedItem: any = null; decisionAction = 'approve'; comment = '';

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.get('/approvals/queue', { per_page: 50 }).subscribe({
      next: r => { this.items.set(r.data || []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openDecision(item: any, action: string) {
    this.selectedItem = item;
    this.decisionAction = action;
    this.comment = '';
    this.showDecision.set(true);
  }

  submitDecision() {
    if (this.decisionAction === 'reject' && !this.comment.trim()) {
      this.toast.error('Comment is required for rejection');
      return;
    }
    this.deciding.set(true);
    this.api.post(`/approvals/loan/${this.selectedItem.loan?.id}/decide`, {
      action: this.decisionAction,
      comment: this.comment || null,
    }).subscribe({
      next: r => {
        this.deciding.set(false);
        this.toast.success(r.message || 'Decision recorded');
        this.showDecision.set(false);
        this.load();
      },
      error: e => { this.deciding.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }
}
