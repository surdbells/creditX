import { Component, inject, signal, computed, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PortalService } from '../../core/services/portal.service';
import { ToastService } from '../../core/services/toast.service';
import { Loan, RepaymentScheduleItem } from '../../core/models';
import { money, statusLabel, statusBadge } from '../../shared/format';

@Component({
  selector: 'app-loan-detail',
  imports: [CommonModule, RouterLink, LucideAngularModule],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex items-center gap-2 text-sm" style="color: var(--cx-text-muted)">
        <a routerLink="/loans" class="hover:underline">My loans</a>
        <lucide-icon name="chevron-right" [size]="14"></lucide-icon>
        <span style="color: var(--cx-text)">Details</span>
      </div>

      @if (loading()) {
        <div class="cx-card"><div class="cx-skeleton h-32"></div></div>
      } @else if (!loan()) {
        <div class="cx-card text-center py-12">
          <p class="font-semibold mb-1" style="color: var(--cx-text)">Loan not found</p>
          <p class="text-sm mb-4" style="color: var(--cx-text-muted)">We couldn't find this loan.</p>
          <a routerLink="/loans" class="cx-btn cx-btn-primary cx-btn-sm">Back to my loans</a>
        </div>
      } @else if (loan(); as l) {
        <!-- Header -->
        <div class="cx-card-premium flex flex-col gap-4">
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p class="cx-eyebrow mb-1">{{ l.application_id || l.id }}</p>
              <h1 class="cx-heading cx-heading-lg">{{ l.product_name || 'Loan' }}</h1>
            </div>
            <span class="cx-badge" [class]="statusBadge(l.status)">{{ statusLabel(l.status) }}</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
            <div>
              <p class="text-xs" style="color: var(--cx-text-muted)">Gross loan</p>
              <p class="font-bold tabular-nums" style="color: var(--cx-text)">{{ money(l.gross_loan || l.amount_requested) }}</p>
            </div>
            <div>
              <p class="text-xs" style="color: var(--cx-text-muted)">Net disbursed</p>
              <p class="font-bold tabular-nums" style="color: var(--cx-text)">{{ money(l.net_disbursed) }}</p>
            </div>
            <div>
              <p class="text-xs" style="color: var(--cx-text-muted)">Tenure</p>
              <p class="font-bold tabular-nums" style="color: var(--cx-text)">{{ l.tenure || '—' }} mo</p>
            </div>
            <div>
              <p class="text-xs" style="color: var(--cx-text-muted)">Interest rate</p>
              <p class="font-bold tabular-nums" style="color: var(--cx-text)">{{ l.interest_rate != null ? l.interest_rate + '%' : '—' }}</p>
            </div>
          </div>
          @if (l.loan_purpose) {
            <div class="pt-2 border-t" style="border-color: var(--cx-border-subtle)">
              <p class="text-xs mb-0.5" style="color: var(--cx-text-muted)">Purpose</p>
              <p class="text-sm" style="color: var(--cx-text)">{{ l.loan_purpose }}</p>
            </div>
          }
        </div>

        <!-- Repayment schedule -->
        <div class="cx-card !p-0 overflow-hidden">
          <div class="px-5 py-4 border-b flex items-center gap-2" style="border-color: var(--cx-border)">
            <lucide-icon name="calendar" [size]="18" style="color: var(--cx-primary-600)"></lucide-icon>
            <h2 class="cx-heading cx-heading-sm">Repayment schedule</h2>
          </div>

          @if (scheduleLoading()) {
            <div class="p-5 flex flex-col gap-3">
              @for (i of [1,2,3]; track i) { <div class="cx-skeleton h-10"></div> }
            </div>
          } @else if (schedule().length === 0) {
            <div class="p-8 text-center">
              <p class="text-sm" style="color: var(--cx-text-muted)">
                No repayment schedule yet. It will appear once the loan is disbursed.
              </p>
            </div>
          } @else {
            <div class="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Due date</th>
                    <th class="text-right">Principal</th>
                    <th class="text-right">Interest</th>
                    <th class="text-right">Total</th>
                    <th class="text-right">Outstanding</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of schedule(); track row.id) {
                    <tr>
                      <td class="tabular-nums">{{ row.installment_number }}</td>
                      <td>{{ row.due_date }}</td>
                      <td class="text-right tabular-nums">{{ money(row.principal_amount) }}</td>
                      <td class="text-right tabular-nums">{{ money(row.interest_amount) }}</td>
                      <td class="text-right tabular-nums font-semibold">{{ money(row.total_amount) }}</td>
                      <td class="text-right tabular-nums">{{ money(row.outstanding) }}</td>
                      <td><span class="cx-badge" [class]="statusBadge(row.status)">{{ statusLabel(row.status) }}</span></td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr style="border-top: 2px solid var(--cx-border)">
                    <td colspan="2" class="font-semibold" style="color: var(--cx-text)">Total</td>
                    <td class="text-right tabular-nums font-semibold">{{ money(totals().principal) }}</td>
                    <td class="text-right tabular-nums font-semibold">{{ money(totals().interest) }}</td>
                    <td class="text-right tabular-nums font-semibold">{{ money(totals().total) }}</td>
                    <td class="text-right tabular-nums font-semibold">{{ money(totals().outstanding) }}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class LoanDetailComponent implements OnInit {
  private portal = inject(PortalService);
  private toast = inject(ToastService);

  @Input() id = '';

  money = money;
  statusLabel = statusLabel;
  statusBadge = statusBadge;

  loading = signal(true);
  scheduleLoading = signal(true);
  loan = signal<Loan | null>(null);
  schedule = signal<RepaymentScheduleItem[]>([]);

  /** Column totals for the schedule footer, derived from real installment rows. */
  totals = computed(() => {
    const num = (v: string | number | null | undefined) => parseFloat(String(v ?? 0)) || 0;
    return this.schedule().reduce(
      (acc, row) => ({
        principal: acc.principal + num(row.principal_amount),
        interest: acc.interest + num(row.interest_amount),
        total: acc.total + num(row.total_amount),
        outstanding: acc.outstanding + num(row.outstanding),
      }),
      { principal: 0, interest: 0, total: 0, outstanding: 0 },
    );
  });

  ngOnInit(): void {
    if (!this.id) {
      this.loading.set(false);
      return;
    }
    this.portal.getLoan(this.id).subscribe({
      next: res => {
        this.loan.set(res.data ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Could not load this loan.');
      },
    });

    this.portal.getSchedule(this.id).subscribe({
      next: res => {
        this.schedule.set(res.data ?? []);
        this.scheduleLoading.set(false);
      },
      error: () => this.scheduleLoading.set(false),
    });
  }
}
