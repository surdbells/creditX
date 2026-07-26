import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PortalService } from '../../core/services/portal.service';
import { Investment, InvestmentPerformance, InvestmentTransaction } from '../../core/models';
import { money } from '../../shared/format';

/**
 * One investment, in the investor's own words: what they put in, what it is
 * worth now, what it has earned, what tax was withheld, and every movement.
 *
 * All figures come from the server's performance block — the portal formats,
 * it never calculates money.
 */
@Component({
  selector: 'app-investment-detail',
  imports: [CommonModule, RouterLink, LucideAngularModule],
  template: `
    <div class="flex flex-col gap-6">
      <a routerLink="/investments" class="inline-flex items-center gap-1.5 text-sm" style="color: var(--cx-text-muted)">
        <lucide-icon name="arrow-left" [size]="15"></lucide-icon>
        Back to my investments
      </a>

      @if (loading()) {
        <div class="cx-skeleton h-32"></div>
        <div class="cx-skeleton h-48"></div>
      } @else if (notFound()) {
        <div class="cx-card text-center py-12">
          <div class="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center" style="background: var(--cx-surface-subtle)">
            <lucide-icon name="alert-circle" [size]="22" style="color: var(--cx-text-muted)"></lucide-icon>
          </div>
          <p class="font-semibold mb-1" style="color: var(--cx-text)">Investment not found</p>
          <p class="text-sm" style="color: var(--cx-text-muted)">It may have been closed, or the link is not yours.</p>
        </div>
      } @else if (perf(); as p) {
        <!-- Headline -->
        <div class="cx-card flex flex-col gap-4">
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 class="cx-heading cx-heading-lg mb-0.5">{{ investment()?.product_name || 'Investment' }}</h1>
              <p class="text-xs" style="color: var(--cx-text-muted)">{{ p.investment_number }}</p>
            </div>
            <span class="cx-badge" [class]="statusBadge(p.status)">{{ statusLabel(p.status) }}</span>
          </div>

          <div>
            <p class="text-xs mb-1" style="color: var(--cx-text-muted)">Current value</p>
            <p class="text-3xl font-bold tabular-nums" style="color: var(--cx-primary-600)">{{ money(p.current_value) }}</p>
            <p class="text-sm mt-1" style="color: var(--cx-text-secondary)">
              You invested <strong class="tabular-nums">{{ money(p.principal) }}</strong>
              at <strong>{{ ratePct(p.interest_rate) }} p.a.</strong>
            </p>
          </div>

          @if (p.type === 'fixed_term' && p.maturity_date) {
            <div>
              <div class="flex items-center justify-between text-xs mb-1">
                <span style="color: var(--cx-text-muted)">
                  @if (p.status === 'active') { {{ p.days_to_maturity }} day(s) to maturity }
                  @else { Term complete }
                </span>
                <span style="color: var(--cx-text-muted)">Matures {{ p.maturity_date }}</span>
              </div>
              <div class="cx-id-bar"><i [style.width.%]="progress(p)"></i></div>
            </div>
          } @else {
            <p class="text-sm px-3 py-2 rounded-lg" style="background: var(--cx-surface-subtle); color: var(--cx-text-secondary)">
              <strong>Open-ended</strong> — there is no maturity date. Your money keeps earning until you withdraw it.
            </p>
          }
        </div>

        <!-- Earnings -->
        <div class="cx-card flex flex-col gap-3">
          <h2 class="font-semibold" style="color: var(--cx-text)">Earnings</h2>
          <div class="grid sm:grid-cols-3 gap-3">
            <div class="cx-id-stat">
              <span>Interest earned</span>
              <strong class="tabular-nums">{{ money(p.interest_earned_to_date) }}</strong>
              <em>gross, to date</em>
            </div>
            <div class="cx-id-stat">
              <span>Withholding tax</span>
              <strong class="tabular-nums">{{ money(p.wht_withheld_to_date) }}</strong>
              <em>deducted and remitted</em>
            </div>
            <div class="cx-id-stat is-accent">
              <span>Interest paid to you</span>
              <strong class="tabular-nums">{{ money(p.interest_paid_to_date) }}</strong>
              <em>net of tax</em>
            </div>
          </div>

          @if (p.type === 'fixed_term' && p.projected_maturity_value) {
            <div class="cx-id-projection">
              <lucide-icon name="badge-check" [size]="16"></lucide-icon>
              <div>
                <p class="text-sm font-semibold" style="color: var(--cx-text)">
                  At maturity you receive {{ money(p.projected_maturity_value) }}
                </p>
                <p class="text-xs" style="color: var(--cx-text-muted)">
                  Principal {{ money(p.principal) }} + net interest {{ money(p.projected_net_interest) }}
                  (gross {{ money(p.projected_gross_interest) }} less withholding tax)
                </p>
              </div>
            </div>
          } @else if (p.indicative_annual_net) {
            <div class="cx-id-projection">
              <lucide-icon name="info" [size]="16"></lucide-icon>
              <div>
                <p class="text-sm font-semibold" style="color: var(--cx-text)">
                  About {{ money(p.indicative_annual_net) }} a year at your current balance
                </p>
                <p class="text-xs" style="color: var(--cx-text-muted)">
                  Indicative only — the figure moves as you add to or withdraw from this investment.
                </p>
              </div>
            </div>
          }

          @if (accrued(p)) {
            <p class="text-xs" style="color: var(--cx-text-muted)">
              Includes {{ money(p.accrued_interest) }} of interest earned but not yet paid out.
            </p>
          }
        </div>

        <!-- Statement -->
        <div class="cx-card flex flex-col gap-3">
          <h2 class="font-semibold" style="color: var(--cx-text)">Statement</h2>
          @if (transactions().length === 0) {
            <p class="text-sm" style="color: var(--cx-text-muted)">No movements yet.</p>
          } @else {
            <div class="cx-id-table-wrap">
              <table class="cx-id-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Movement</th>
                    <th class="right">Amount</th><th class="right">Tax</th><th class="right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  @for (t of transactions(); track t.id) {
                    <tr>
                      <td class="whitespace-nowrap">{{ t.value_date }}</td>
                      <td>
                        {{ txnLabel(t.type) }}
                        @if (t.net_interest) {
                          <span class="cx-id-sub">net {{ money(t.net_interest) }}</span>
                        }
                      </td>
                      <td class="right tabular-nums">{{ money(t.amount) }}</td>
                      <td class="right tabular-nums">{{ t.wht_amount ? money(t.wht_amount) : '—' }}</td>
                      <td class="right tabular-nums">{{ money(t.balance_after) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .cx-id-bar { height: 6px; border-radius: 999px; background: var(--cx-surface-subtle); overflow: hidden; }
    .cx-id-bar > i { display: block; height: 100%; border-radius: 999px; background: var(--cx-primary-600); transition: width .3s ease; }

    .cx-id-stat { padding: 11px 13px; border-radius: 10px; background: var(--cx-surface-subtle); }
    .cx-id-stat span { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--cx-text-muted); }
    .cx-id-stat strong { display: block; font-size: 18px; font-weight: 700; margin-top: 3px; color: var(--cx-text); }
    .cx-id-stat em { display: block; font-style: normal; font-size: 11px; color: var(--cx-text-muted); margin-top: 2px; }
    .cx-id-stat.is-accent strong { color: var(--cx-primary-600); }

    .cx-id-projection { display: flex; gap: 10px; align-items: flex-start; padding: 11px 13px; border-radius: 10px;
      background: var(--cx-surface-subtle); }

    .cx-id-table-wrap { overflow-x: auto; }
    .cx-id-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .cx-id-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
      color: var(--cx-text-muted); padding: 7px 8px; border-bottom: 1px solid var(--cx-border); white-space: nowrap; }
    .cx-id-table td { padding: 8px; border-bottom: 1px solid var(--cx-border); color: var(--cx-text); }
    .cx-id-table tr:last-child td { border-bottom: none; }
    .cx-id-table .right { text-align: right; }
    .cx-id-sub { display: block; font-size: 11px; color: var(--cx-text-muted); }
  `],
})
export class InvestmentDetailComponent implements OnInit {
  private portal = inject(PortalService);
  private route = inject(ActivatedRoute);

  money = money;

  loading = signal(true);
  notFound = signal(false);
  investment = signal<Investment | null>(null);
  perf = signal<InvestmentPerformance | null>(null);
  transactions = signal<InvestmentTransaction[]>([]);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.notFound.set(true); this.loading.set(false); return; }

    this.portal.getInvestment(id).subscribe({
      next: res => {
        this.investment.set(res.data?.investment ?? null);
        this.perf.set(res.data?.performance ?? null);
        this.transactions.set(res.data?.transactions ?? []);
        this.loading.set(false);
      },
      // 404 covers both "gone" and "not yours" — the API deliberately does not
      // distinguish, so neither does the message.
      error: () => { this.notFound.set(true); this.loading.set(false); },
    });
  }

  ratePct(rate: string | null | undefined): string {
    const n = parseFloat(rate || '0');
    if (!n) return '0%';
    return (n * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
  }

  progress(p: InvestmentPerformance): number {
    const total = (this.investment()?.tenor_days) ?? 0;
    if (!total) return 100;
    return Math.max(0, Math.min(100, Math.round((p.days_invested / total) * 100)));
  }

  accrued(p: InvestmentPerformance): boolean {
    return parseFloat(p.accrued_interest || '0') > 0;
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

  txnLabel(t: string): string {
    return ({
      placement: 'Investment placed', top_up: 'Top-up', accrual: 'Interest earned',
      payout: 'Interest paid to you', capitalisation: 'Interest added to balance',
      withdrawal: 'Withdrawal', maturity: 'Matured — paid out',
      liquidation: 'Closed early — paid out', penalty: 'Early-exit charge',
      wht: 'Withholding tax', reversal: 'Reversal',
    } as Record<string, string>)[t] ?? t;
  }
}
