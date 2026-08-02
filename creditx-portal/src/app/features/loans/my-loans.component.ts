import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PortalService } from '../../core/services/portal.service';
import { ToastService } from '../../core/services/toast.service';
import { Loan } from '../../core/models';
import { money, statusLabel, statusBadge } from '../../shared/format';

@Component({
  selector: 'app-my-loans',
  imports: [CommonModule, RouterLink, LucideAngularModule],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="cx-heading cx-heading-lg mb-1">My loans</h1>
          <p class="text-sm" style="color: var(--cx-text-secondary)">Track your applications and active loans.</p>
        </div>
        <a routerLink="/loans/apply" class="cx-btn cx-btn-primary">
          <lucide-icon name="plus-circle" [size]="17"></lucide-icon>
          Apply for a loan
        </a>
      </div>

      <!-- Filter tabs -->
      <div class="cx-tabs">
        @for (f of filters; track f.value) {
          <button class="cx-tabs-tab" [class.is-active]="activeFilter() === f.value" (click)="setFilter(f.value)" type="button">
            {{ f.label }}
          </button>
        }
      </div>

      @if (loading()) {
        <div class="flex flex-col gap-3">
          @for (i of [1,2,3,4]; track i) { <div class="cx-skeleton h-16"></div> }
        </div>
      } @else if (loans().length === 0) {
        <div class="cx-card text-center py-12">
          <div class="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center" style="background: var(--cx-surface-subtle)">
            <lucide-icon name="file-text" [size]="22" style="color: var(--cx-primary-600)"></lucide-icon>
          </div>
          <p class="font-semibold mb-1" style="color: var(--cx-text)">Nothing here yet</p>
          <p class="text-sm mb-4" style="color: var(--cx-text-muted)">You have no loans in this category.</p>
          <a routerLink="/loans/apply" class="cx-btn cx-btn-primary cx-btn-sm">Apply now</a>
        </div>
      } @else {
        <div class="grid sm:grid-cols-2 gap-4 cx-stagger">
          @for (loan of loans(); track loan.id) {
            <a [routerLink]="['/loans', loan.id]" class="cx-card cx-card-hover flex flex-col gap-3">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="font-semibold truncate" style="color: var(--cx-text)">{{ loan.product_name || 'Loan' }}</p>
                  <p class="text-xs" style="color: var(--cx-text-muted)">{{ loan.application_id || loan.id }}</p>
                </div>
                <span class="cx-badge shrink-0" [class]="statusBadge(loan.status)">{{ statusLabel(loan.status) }}</span>
              </div>
              <div class="flex items-end justify-between gap-2">
                <div>
                  <p class="text-xs" style="color: var(--cx-text-muted)">Amount</p>
                  <p class="text-lg font-bold tabular-nums" style="color: var(--cx-text)">
                    {{ money(loan.gross_loan || loan.amount_requested) }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-xs" style="color: var(--cx-text-muted)">Tenure</p>
                  <p class="text-sm font-semibold" style="color: var(--cx-text)">{{ loan.tenure || '—' }} mo</p>
                </div>
              </div>
            </a>
          }
        </div>

        @if (hasMore()) {
          <div class="flex justify-center">
            <button class="cx-btn cx-btn-outline" (click)="loadMore()" [disabled]="loadingMore()">
              @if (loadingMore()) { <lucide-icon name="loader-2" [size]="16" class="animate-spin"></lucide-icon> }
              Load more
            </button>
          </div>
        }
      }
    </div>
  `,
})
export class MyLoansComponent implements OnInit {
  private portal = inject(PortalService);
  private toast = inject(ToastService);

  money = money;
  statusLabel = statusLabel;
  statusBadge = statusBadge;

  loading = signal(true);
  loadingMore = signal(false);
  loans = signal<Loan[]>([]);
  activeFilter = signal<string>('');
  hasMore = signal(false);

  private page = 1;
  private readonly perPage = 10;
  private total = 0;

  /**
   * Each tab is a SET of statuses, lower-case to match the backend enum.
   *
   * They used to be single UPPERCASE values, which hid loans: "In review"
   * missed under_review (a loan vanished the moment review actually started),
   * "Active" missed disbursed and overdue, and the casing only matched at all
   * because MySQL collates case-insensitively.
   */
  filters = [
    { label: 'All', value: '' },
    { label: 'In review', value: 'submitted,under_review' },
    { label: 'Approved', value: 'approved' },
    { label: 'Active', value: 'disbursed,active,overdue,restructured' },
    { label: 'Closed', value: 'closed' },
    { label: 'Rejected', value: 'rejected,cancelled' },
  ];

  ngOnInit(): void {
    this.fetch(true);
  }

  setFilter(value: string): void {
    if (this.activeFilter() === value) {
      return;
    }
    this.activeFilter.set(value);
    this.page = 1;
    this.fetch(true);
  }

  loadMore(): void {
    this.page++;
    this.fetch(false);
  }

  private fetch(reset: boolean): void {
    if (reset) {
      this.loading.set(true);
    } else {
      this.loadingMore.set(true);
    }
    const params: Record<string, any> = {
      page: this.page,
      per_page: this.perPage,
      sort_by: 'created_at',
      sort_dir: 'desc',
    };
    const status = this.activeFilter();
    if (status) {
      params['status'] = status;
    }
    this.portal.listLoans(params).subscribe({
      next: res => {
        const items = res.data ?? [];
        this.total = res.meta?.total ?? items.length;
        this.loans.set(reset ? items : [...this.loans(), ...items]);
        this.hasMore.set(this.loans().length < this.total);
        this.loading.set(false);
        this.loadingMore.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadingMore.set(false);
        // Roll the page back so a retry re-requests the page that failed
        // instead of silently skipping it, and say something — the empty
        // state otherwise reads as "you have no loans" after a network error.
        if (!reset) {
          this.page--;
        }
        this.toast.error('Could not load your loans. Please try again.');
      },
    });
  }
}
