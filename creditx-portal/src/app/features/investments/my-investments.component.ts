import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PortalService } from '../../core/services/portal.service';
import { Investment } from '../../core/models';
import { money } from '../../shared/format';

/**
 * My investments — what the investor has placed and what it has earned.
 *
 * Everything shown here is computed server-side (the performance block on each
 * investment); the portal never re-derives money. Fixed-term cards show
 * progress to maturity and the projected value; open-ended cards show the
 * running value with no maturity.
 */
@Component({
  selector: 'app-my-investments',
  imports: [CommonModule, RouterLink, LucideAngularModule],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="cx-heading cx-heading-lg mb-1">My investments</h1>
        <p class="text-sm" style="color: var(--cx-text-secondary)">Track what you've invested and what it has earned.</p>
      </div>

      @if (loading()) {
        <div class="grid sm:grid-cols-3 gap-4">
          @for (i of [1,2,3]; track i) { <div class="cx-skeleton h-24"></div> }
        </div>
        <div class="flex flex-col gap-3">
          @for (i of [1,2]; track i) { <div class="cx-skeleton h-28"></div> }
        </div>
      } @else if (investments().length === 0) {
        <div class="cx-card text-center py-12">
          <div class="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center" style="background: var(--cx-surface-subtle)">
            <lucide-icon name="trending-up" [size]="22" style="color: var(--cx-primary-600)"></lucide-icon>
          </div>
          <p class="font-semibold mb-1" style="color: var(--cx-text)">No investments yet</p>
          <p class="text-sm" style="color: var(--cx-text-muted)">
            When you place an investment with us it will appear here, along with what it earns.
          </p>
        </div>
      } @else {
        <!-- Portfolio summary -->
        <div class="grid sm:grid-cols-3 gap-4">
          <div class="cx-card">
            <p class="text-xs mb-1" style="color: var(--cx-text-muted)">Total value</p>
            <p class="text-2xl font-bold tabular-nums" style="color: var(--cx-primary-600)">{{ money(summary()?.total_current_value) }}</p>
            <p class="text-xs mt-1" style="color: var(--cx-text-muted)">Across {{ summary()?.active_count || 0 }} active investment(s)</p>
          </div>
          <div class="cx-card">
            <p class="text-xs mb-1" style="color: var(--cx-text-muted)">Interest earned</p>
            <p class="text-2xl font-bold tabular-nums" style="color: var(--cx-text)">{{ money(summary()?.total_interest_earned) }}</p>
            <p class="text-xs mt-1" style="color: var(--cx-text-muted)">Gross, before withholding tax</p>
          </div>
          <div class="cx-card">
            <p class="text-xs mb-1" style="color: var(--cx-text-muted)">Investments</p>
            <p class="text-2xl font-bold tabular-nums" style="color: var(--cx-text)">{{ summary()?.total_count || 0 }}</p>
            <p class="text-xs mt-1" style="color: var(--cx-text-muted)">{{ summary()?.active_count || 0 }} active</p>
          </div>
        </div>

        <!-- Cards -->
        <div class="grid sm:grid-cols-2 gap-4 cx-stagger">
          @for (inv of investments(); track inv.id) {
            <a [routerLink]="['/investments', inv.id]" class="cx-card cx-card-hover flex flex-col gap-3">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="font-semibold truncate" style="color: var(--cx-text)">{{ inv.product_name || 'Investment' }}</p>
                  <p class="text-xs" style="color: var(--cx-text-muted)">{{ inv.investment_number }}</p>
                </div>
                <span class="cx-badge shrink-0" [class]="statusBadge(inv.status)">{{ statusLabel(inv.status) }}</span>
              </div>

              <div class="flex items-end justify-between gap-2">
                <div>
                  <p class="text-xs" style="color: var(--cx-text-muted)">Current value</p>
                  <p class="text-lg font-bold tabular-nums" style="color: var(--cx-text)">{{ money(inv.current_value) }}</p>
                </div>
                <div class="text-right">
                  <p class="text-xs" style="color: var(--cx-text-muted)">Rate</p>
                  <p class="text-sm font-semibold" style="color: var(--cx-text)">{{ ratePct(inv.interest_rate) }} p.a.</p>
                </div>
              </div>

              <!-- Earned so far -->
              <div class="flex items-center justify-between text-xs pt-2" style="border-top: 1px solid var(--cx-border)">
                <span style="color: var(--cx-text-muted)">Earned so far</span>
                <span class="font-semibold tabular-nums" style="color: var(--cx-primary-600)">
                  {{ money(inv.performance?.interest_earned_to_date) }}
                </span>
              </div>

              @if (inv.type === 'fixed_term' && inv.performance) {
                <!-- Progress to maturity -->
                <div>
                  <div class="flex items-center justify-between text-xs mb-1">
                    <span style="color: var(--cx-text-muted)">
                      @if (inv.status === 'active') {
                        {{ inv.performance.days_to_maturity }} day(s) to maturity
                      } @else {
                        Matured {{ inv.maturity_date }}
                      }
                    </span>
                    <span style="color: var(--cx-text-muted)">{{ progress(inv) }}%</span>
                  </div>
                  <div class="cx-mi-bar"><i [style.width.%]="progress(inv)"></i></div>
                </div>
                <p class="text-xs" style="color: var(--cx-text-muted)">
                  Projected at maturity:
                  <strong class="tabular-nums" style="color: var(--cx-text)">{{ money(inv.performance.projected_maturity_value) }}</strong>
                </p>
              } @else if (inv.performance) {
                <p class="text-xs" style="color: var(--cx-text-muted)">
                  Open-ended — no maturity date. Invested {{ inv.performance.days_invested }} day(s).
                </p>
              }
            </a>
          }
        </div>

        <p class="text-xs" style="color: var(--cx-text-muted)">
          Interest figures are shown gross. Withholding tax is deducted when interest is paid to you —
          open an investment to see the exact split.
        </p>
      }
    </div>
  `,
  styles: [`
    .cx-mi-bar { height: 5px; border-radius: 999px; background: var(--cx-surface-subtle); overflow: hidden; }
    .cx-mi-bar > i { display: block; height: 100%; border-radius: 999px; background: var(--cx-primary-600); transition: width .3s ease; }
  `],
})
export class MyInvestmentsComponent implements OnInit {
  private portal = inject(PortalService);

  money = money;

  loading = signal(true);
  investments = signal<Investment[]>([]);
  summary = signal<{ active_count: number; total_count: number; total_current_value: string; total_interest_earned: string } | null>(null);

  ngOnInit(): void {
    this.portal.listInvestments().subscribe({
      next: res => {
        this.investments.set(res.data?.investments ?? []);
        this.summary.set(res.data?.summary ?? null);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  ratePct(rate: string | null | undefined): string {
    const n = parseFloat(rate || '0');
    if (!n) return '0%';
    return (n * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
  }

  /** How far through its term a fixed-term investment is, 0–100. */
  progress(inv: Investment): number {
    const total = inv.tenor_days ?? 0;
    if (!total) return 0;
    const done = inv.performance?.days_invested ?? 0;
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }

  statusLabel(s: string): string {
    return ({
      active: 'Active', matured: 'Matured', liquidated: 'Liquidated',
      closed: 'Closed', rolled_over: 'Rolled over',
    } as Record<string, string>)[s] ?? s;
  }

  statusBadge(s: string): string {
    switch (s) {
      case 'active': return 'cx-badge-success';
      case 'matured': return 'cx-badge-gold';
      case 'liquidated': return 'cx-badge-danger';
      default: return 'cx-badge-neutral';
    }
  }
}
