import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { PortalService } from '../../core/services/portal.service';
import { Loan } from '../../core/models';
import { money, statusLabel, statusBadge } from '../../shared/format';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterLink, LucideAngularModule],
  template: `
    <div class="flex flex-col gap-6">
      <!-- Greeting -->
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p class="cx-eyebrow mb-1">Welcome back</p>
          <h1 class="cx-heading cx-heading-lg">{{ firstName() }}</h1>
        </div>
        <a routerLink="/loans/apply" class="cx-btn cx-btn-primary">
          <lucide-icon name="plus-circle" [size]="17"></lucide-icon>
          Apply for a loan
        </a>
      </div>

      <!-- Stat cards -->
      <div class="grid sm:grid-cols-3 gap-4 cx-stagger">
        <div class="cx-card">
          <div class="flex items-center gap-2 mb-2" style="color: var(--cx-text-muted)">
            <lucide-icon name="clipboard-list" [size]="16"></lucide-icon>
            <span class="text-xs font-semibold uppercase tracking-wide">Applications</span>
          </div>
          <p class="text-2xl font-bold tabular-nums" style="color: var(--cx-text)">{{ inProgressCount() }}</p>
          <p class="text-xs mt-1" style="color: var(--cx-text-muted)">In progress</p>
        </div>
        <div class="cx-card">
          <div class="flex items-center gap-2 mb-2" style="color: var(--cx-text-muted)">
            <lucide-icon name="banknote" [size]="16"></lucide-icon>
            <span class="text-xs font-semibold uppercase tracking-wide">Active loans</span>
          </div>
          <p class="text-2xl font-bold tabular-nums" style="color: var(--cx-text)">{{ activeCount() }}</p>
          <p class="text-xs mt-1" style="color: var(--cx-text-muted)">Currently disbursed</p>
        </div>
        <div class="cx-card">
          <div class="flex items-center gap-2 mb-2" style="color: var(--cx-text-muted)">
            <lucide-icon name="wallet" [size]="16"></lucide-icon>
            <span class="text-xs font-semibold uppercase tracking-wide">Outstanding</span>
          </div>
          <p class="text-2xl font-bold tabular-nums" style="color: var(--cx-text)">{{ money(totalOutstanding()) }}</p>
          <p class="text-xs mt-1" style="color: var(--cx-text-muted)">Across active loans</p>
        </div>
      </div>

      <!-- Recent loans -->
      <div class="cx-card !p-0 overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b" style="border-color: var(--cx-border)">
          <h2 class="cx-heading cx-heading-sm">Recent activity</h2>
          <a routerLink="/loans" class="text-sm font-semibold" style="color: var(--cx-primary-600)">View all</a>
        </div>

        @if (loading()) {
          <div class="p-5 flex flex-col gap-3">
            @for (i of [1,2,3]; track i) { <div class="cx-skeleton h-12"></div> }
          </div>
        } @else if (loans().length === 0) {
          <div class="p-10 text-center">
            <div class="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center" style="background: var(--cx-surface-subtle)">
              <lucide-icon name="file-text" [size]="22" style="color: var(--cx-primary-600)"></lucide-icon>
            </div>
            <p class="font-semibold mb-1" style="color: var(--cx-text)">No applications yet</p>
            <p class="text-sm mb-4" style="color: var(--cx-text-muted)">Apply for your first loan to get started.</p>
            <a routerLink="/loans/apply" class="cx-btn cx-btn-primary cx-btn-sm">Apply now</a>
          </div>
        } @else {
          <div class="divide-y" style="border-color: var(--cx-border-subtle)">
            @for (loan of loans(); track loan.id) {
              <a [routerLink]="['/loans', loan.id]"
                class="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-[var(--cx-surface-hover)] transition-colors">
                <div class="min-w-0">
                  <p class="font-semibold text-sm truncate" style="color: var(--cx-text)">
                    {{ loan.product_name || 'Loan' }}
                  </p>
                  <p class="text-xs" style="color: var(--cx-text-muted)">
                    {{ loan.application_id || loan.id }}
                  </p>
                </div>
                <div class="flex items-center gap-3 shrink-0">
                  <span class="text-sm font-semibold tabular-nums" style="color: var(--cx-text)">
                    {{ money(loan.gross_loan || loan.application_amount) }}
                  </span>
                  <span class="cx-badge" [class]="statusBadge(loan.status)">{{ statusLabel(loan.status) }}</span>
                  <lucide-icon name="chevron-right" [size]="16" style="color: var(--cx-text-muted)"></lucide-icon>
                </div>
              </a>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class DashboardComponent implements OnInit {
  private auth = inject(AuthService);
  private portal = inject(PortalService);

  money = money;
  statusLabel = statusLabel;
  statusBadge = statusBadge;

  loading = signal(true);
  loans = signal<Loan[]>([]);

  private inProgress = ['DRAFT', 'CAPTURED', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED'];
  private active = ['DISBURSED', 'ACTIVE', 'OVERDUE'];

  firstName = computed(() => {
    const c = this.auth.customer();
    const name = c?.first_name || c?.full_name || 'there';
    return name.split(' ')[0];
  });

  inProgressCount = computed(() => this.loans().filter(l => this.inProgress.includes((l.status ?? '').toUpperCase())).length);
  activeCount = computed(() => this.loans().filter(l => this.active.includes((l.status ?? '').toUpperCase())).length);
  totalOutstanding = computed(() =>
    this.loans()
      .filter(l => this.active.includes((l.status ?? '').toUpperCase()))
      .reduce((sum, l) => sum + (parseFloat(String(l.outstanding_balance ?? 0)) || 0), 0),
  );

  ngOnInit(): void {
    this.portal.listLoans({ per_page: 5, sort_by: 'created_at', sort_dir: 'desc' }).subscribe({
      next: res => {
        this.loans.set(res.data ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
