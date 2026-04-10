import { Component, OnInit, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, ArrowLeft, Clock, CheckCircle, XCircle, DollarSign } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-loan-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, PageHeaderComponent, StatusBadgeComponent, LoadingSpinnerComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header [title]="loan()?.application_id || 'Loan Detail'" [subtitle]="loan()?.customer_name || ''">
        <a routerLink="/loans" class="cx-btn cx-btn-outline cx-btn-sm">
          <lucide-icon name="arrow-left" [size]="14"></lucide-icon> Back
        </a>
      </cx-page-header>

      @if (loading()) {
        <cx-loading message="Loading loan details..."></cx-loading>
      } @else if (loan()) {
        <!-- Status + Summary -->
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
          <div class="cx-card flex items-center gap-3">
            <div class="text-sm text-[var(--cx-text-muted)]">Status</div>
            <cx-status-badge [status]="loan()?.status"></cx-status-badge>
          </div>
          <div class="cx-card">
            <div class="text-sm text-[var(--cx-text-muted)]">Amount Requested</div>
            <div class="text-lg font-bold text-[var(--cx-text)]">₦{{ loan()?.amount_requested | number:'1.2-2' }}</div>
          </div>
          <div class="cx-card">
            <div class="text-sm text-[var(--cx-text-muted)]">Net Disbursed</div>
            <div class="text-lg font-bold text-[var(--cx-success)]">₦{{ loan()?.net_disbursed | number:'1.2-2' }}</div>
          </div>
          <div class="cx-card">
            <div class="text-sm text-[var(--cx-text-muted)]">Tenure</div>
            <div class="text-lg font-bold text-[var(--cx-text)]">{{ loan()?.tenure }} months</div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- Loan Info -->
          <div class="cx-card">
            <h3 class="text-sm font-semibold text-[var(--cx-text)] mb-3">Loan Information</h3>
            <div class="space-y-2 text-sm">
              @for (field of loanFields; track field.label) {
                <div class="flex justify-between py-1 border-b border-[var(--cx-border)] last:border-0">
                  <span class="text-[var(--cx-text-muted)]">{{ field.label }}</span>
                  <span class="text-[var(--cx-text)] font-medium">{{ field.value || '—' }}</span>
                </div>
              }
            </div>
          </div>

          <!-- Fee Breakdown -->
          <div class="cx-card">
            <h3 class="text-sm font-semibold text-[var(--cx-text)] mb-3">Fee Breakdown</h3>
            @if (loan()?.fee_breakdowns?.length) {
              <div class="space-y-2 text-sm">
                @for (fee of loan()?.fee_breakdowns; track fee.id) {
                  <div class="flex justify-between py-1 border-b border-[var(--cx-border)] last:border-0">
                    <span class="text-[var(--cx-text-muted)]">{{ fee.fee_type_name }}</span>
                    <span class="text-[var(--cx-text)] font-medium">₦{{ fee.amount | number:'1.2-2' }}</span>
                  </div>
                }
              </div>
            } @else {
              <p class="text-sm text-[var(--cx-text-muted)]">No fee breakdown available</p>
            }
          </div>
        </div>

        <!-- Activity Trail -->
        @if (loan()?.trails?.length) {
          <div class="cx-card mt-4">
            <h3 class="text-sm font-semibold text-[var(--cx-text)] mb-3">Activity Trail</h3>
            <div class="space-y-3">
              @for (trail of loan()?.trails; track trail.id) {
                <div class="flex items-start gap-3 text-sm">
                  <div class="w-2 h-2 rounded-full bg-[var(--cx-primary)] mt-1.5 flex-shrink-0"></div>
                  <div>
                    <div class="text-[var(--cx-text)]">{{ trail.action }}</div>
                    <div class="text-xs text-[var(--cx-text-muted)]">{{ trail.created_at }}</div>
                  </div>
                </div>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class LoanDetailComponent implements OnInit {
  @Input() id = '';
  loan = signal<any>(null);
  loading = signal(true);

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    if (this.id) {
      this.api.get(`/loans/${this.id}`).subscribe({
        next: res => { this.loan.set(res.data); this.loading.set(false); },
        error: () => this.loading.set(false),
      });
    }
  }

  get loanFields(): { label: string; value: string }[] {
    const l = this.loan();
    if (!l) return [];
    return [
      { label: 'Application ID', value: l.application_id },
      { label: 'Product', value: l.product_name },
      { label: 'Customer', value: l.customer_name },
      { label: 'Staff ID', value: l.customer_staff_id },
      { label: 'Branch', value: l.branch_name },
      { label: 'Agent', value: l.agent_name },
      { label: 'Interest Rate', value: l.interest_rate },
      { label: 'Calculation Method', value: l.calculation_method },
      { label: 'Loan Type', value: l.loan_type },
      { label: 'Gross Loan', value: l.gross_loan ? '₦' + Number(l.gross_loan).toLocaleString() : '—' },
      { label: 'Disbursed At', value: l.disbursed_at },
      { label: 'Closed At', value: l.closed_at },
    ];
  }
}
