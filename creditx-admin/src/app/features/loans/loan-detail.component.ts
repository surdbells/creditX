import { Component, OnInit, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { CxTabsComponent, CxTab } from '../../shared/components/tabs/tabs.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-loan-detail', standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, PageHeaderComponent, StatusBadgeComponent, FormDialogComponent, CxTabsComponent, LoadingSpinnerComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        [title]="'Loan ' + (loan()?.application_id || '—')"
        [subtitle]="loan()?.customer_name || ''"
        eyebrow="Loan details">
        <div class="flex items-center gap-2">
          @if (loan()?.status === 'approved' && auth.hasPermission('loans.disburse')) {
            <button class="cx-btn cx-btn-primary" (click)="showDisburse.set(true)">
              <lucide-icon name="banknote" [size]="14"></lucide-icon>
              <span>Disburse</span>
            </button>
          }
          <a routerLink="/loans" class="cx-btn cx-btn-outline cx-btn-sm">
            <lucide-icon name="chevron-left" [size]="14"></lucide-icon>
            <span>Back</span>
          </a>
        </div>
      </cx-page-header>

      @if (loading()) {
        <cx-loading message="Loading loan details..."></cx-loading>
      } @else if (loan()) {
        <!-- KPI Summary -->
        <div class="cx-loan-kpis cx-stagger">
          @for (kpi of kpis; track kpi.label) {
            <div class="cx-loan-kpi">
              <div class="cx-eyebrow">{{ kpi.label }}</div>
              <div class="cx-loan-kpi-value tabular-nums" [class]="kpi.color || ''">{{ kpi.value }}</div>
            </div>
          }
        </div>

        <!-- Premium tabs -->
        <div class="cx-loan-tabs-row">
          <cx-tabs [tabs]="cxTabs" [(activeId)]="activeTab"></cx-tabs>
        </div>

        <!-- SUMMARY TAB -->
        @if (activeTab === 'summary') {
          <div class="cx-loan-summary-grid">
            <div class="cx-card cx-loan-detail-card">
              <div class="cx-loan-card-header">
                <h3 class="cx-loan-card-title">Loan Details</h3>
                <span class="cx-eyebrow">Application</span>
              </div>
              <div class="cx-loan-field-list">
                @for (f of loanFields; track f.label) {
                  <div class="cx-loan-field-row">
                    <span class="cx-loan-field-label">{{ f.label }}</span>
                    <span class="cx-loan-field-value">{{ f.value }}</span>
                  </div>
                }
              </div>
            </div>
            <div class="cx-card cx-loan-detail-card">
              <div class="cx-loan-card-header">
                <h3 class="cx-loan-card-title">Customer</h3>
                <span class="cx-eyebrow">Contact</span>
              </div>
              <div class="cx-loan-field-list">
                @for (f of customerFields; track f.label) {
                  <div class="cx-loan-field-row">
                    <span class="cx-loan-field-label">{{ f.label }}</span>
                    <span class="cx-loan-field-value">{{ f.value }}</span>
                  </div>
                }
              </div>
              <a [routerLink]="'/customers/' + loan()?.customer_id" class="cx-btn cx-btn-outline cx-btn-sm" style="width:100%; margin-top: 1rem;">
                <lucide-icon name="external-link" [size]="12"></lucide-icon>
                <span>View Customer Profile</span>
              </a>
            </div>
          </div>
          @if (loan()?.fee_breakdowns?.length) {
            <div class="cx-card cx-loan-fees-card">
              <div class="cx-loan-card-header">
                <h3 class="cx-loan-card-title">Fee Breakdown</h3>
                <span class="cx-eyebrow">Charges</span>
              </div>
              <table class="cx-loan-fees-table">
                <thead>
                  <tr>
                    <th>Fee Type</th>
                    <th>Calculation</th>
                    <th class="cx-dash-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  @for (fee of loan().fee_breakdowns; track fee.name) {
                    <tr>
                      <td>{{ fee.name }}</td>
                      <td class="cx-loan-fee-calc">{{ fee.calculation_type || 'Flat' }} @if (fee.percentage) { · {{ fee.percentage }}% }</td>
                      <td class="cx-dash-right tabular-nums">₦{{ fee.amount | number:'1.2-2' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }

        <!-- SCHEDULE TAB -->
        @if (activeTab === 'schedule') {
          <div class="cx-card !p-0 overflow-hidden">
            @if (scheduleLoading()) {
              <cx-loading size="sm" message="Loading schedule..."></cx-loading>
            } @else if (schedule().length === 0) {
              <div class="py-12 text-center text-sm text-[var(--cx-text-muted)]">No repayment schedule generated</div>
            } @else {
              <table class="w-full">
                <thead><tr class="border-b border-[var(--cx-border)]">
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase">#</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Due Date</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Principal</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Interest</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Total</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Balance</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Status</th>
                </tr></thead>
                <tbody>
                  @for (s of schedule(); track s.id || $index) {
                    <tr class="border-b border-[var(--cx-border)] hover:bg-[var(--cx-surface-hover)] transition-colors">
                      <td class="px-4 py-3 text-xs font-mono text-[var(--cx-text-muted)]">{{ s.installment_number || ($index + 1) }}</td>
                      <td class="px-4 py-3 text-xs">{{ s.due_date | date:'mediumDate' }}</td>
                      <td class="px-4 py-3 text-xs text-right font-mono">₦{{ s.principal_amount || s.principal || 0 | number:'1.2-2' }}</td>
                      <td class="px-4 py-3 text-xs text-right font-mono">₦{{ s.interest_amount || s.interest || 0 | number:'1.2-2' }}</td>
                      <td class="px-4 py-3 text-xs text-right font-mono font-medium">₦{{ s.total_amount || s.total || 0 | number:'1.2-2' }}</td>
                      <td class="px-4 py-3 text-xs text-right font-mono">₦{{ s.outstanding_balance || s.balance || 0 | number:'1.2-2' }}</td>
                      <td class="px-4 py-3"><cx-status-badge [status]="s.status || 'pending'"></cx-status-badge></td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>
        }

        <!-- PAYMENTS TAB -->
        @if (activeTab === 'payments') {
          <div class="cx-card !p-0 overflow-hidden">
            @if (payments().length === 0) {
              <div class="py-12 text-center text-sm text-[var(--cx-text-muted)]">No payments recorded</div>
            } @else {
              <table class="w-full">
                <thead><tr class="border-b border-[var(--cx-border)]">
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Date</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Reference</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Amount</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Method</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Status</th>
                </tr></thead>
                <tbody>
                  @for (p of payments(); track p.id) {
                    <tr class="border-b border-[var(--cx-border)] hover:bg-[var(--cx-surface-hover)]">
                      <td class="px-4 py-3 text-xs">{{ p.created_at | date:'mediumDate' }}</td>
                      <td class="px-4 py-3 text-xs font-mono text-[var(--cx-primary)]">{{ p.reference }}</td>
                      <td class="px-4 py-3 text-xs text-right font-mono font-medium text-[var(--cx-success)]">₦{{ p.amount | number:'1.2-2' }}</td>
                      <td class="px-4 py-3 text-xs">{{ p.payment_method }}</td>
                      <td class="px-4 py-3"><cx-status-badge [status]="p.status"></cx-status-badge></td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>
        }

        <!-- APPROVAL TRAIL TAB -->
        @if (activeTab === 'approvals') {
          <div class="cx-card">
            @if (approvals().length === 0) {
              <div class="py-8 text-center text-sm text-[var(--cx-text-muted)]">No approval records</div>
            } @else {
              <div class="space-y-3">
                @for (a of approvals(); track a.id) {
                  <div class="flex items-start gap-3 p-3 rounded-xl border border-[var(--cx-border)]">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                         [class]="a.decision === 'approved' ? 'bg-[var(--cx-success)]/10 text-[var(--cx-success)]' : a.decision === 'rejected' ? 'bg-[var(--cx-danger)]/10 text-[var(--cx-danger)]' : 'bg-[var(--cx-warning)]/10 text-[var(--cx-warning)]'">
                      <lucide-icon [name]="a.decision === 'approved' ? 'check' : a.decision === 'rejected' ? 'x' : 'clock'" [size]="16"></lucide-icon>
                    </div>
                    <div class="flex-1">
                      <div class="text-sm font-medium text-[var(--cx-text)]">{{ a.step_name || 'Step ' + a.step_order }}</div>
                      <div class="text-xs text-[var(--cx-text-muted)]">{{ a.approver_name || 'Pending' }} &bull; {{ a.decided_at | date:'medium' }}</div>
                      @if (a.comment) { <div class="text-xs text-[var(--cx-text-secondary)] mt-1 italic">"{{ a.comment }}"</div> }
                    </div>
                    <cx-status-badge [status]="a.decision || 'pending'"></cx-status-badge>
                  </div>
                }
              </div>
            }
          </div>
        }

        <!-- TRAIL TAB -->
        @if (activeTab === 'trail') {
          <div class="cx-card">
            @if (loan()?.trails?.length) {
              <div class="space-y-2">
                @for (t of loan()?.trails; track t.id) {
                  <div class="flex items-start gap-3 py-2 border-b border-[var(--cx-border)] last:border-0">
                    <div class="w-2 h-2 rounded-full bg-[var(--cx-primary)] mt-1.5 flex-shrink-0"></div>
                    <div>
                      <div class="text-xs font-medium text-[var(--cx-text)]">{{ t.action }}</div>
                      <div class="text-[10px] text-[var(--cx-text-muted)]">{{ t.user_name || 'System' }} &bull; {{ t.created_at | date:'medium' }}</div>
                      @if (t.notes) { <div class="text-[10px] text-[var(--cx-text-secondary)] mt-0.5">{{ t.notes }}</div> }
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="py-8 text-center text-sm text-[var(--cx-text-muted)]">No trail records</div>
            }
          </div>
        }
      }
    </div>

    <!-- Disbursement Dialog -->
    <cx-form-dialog [open]="showDisburse()" title="Disburse Loan" [saving]="disbursing()" saveLabel="Confirm Disbursement" (close)="showDisburse.set(false)" (save)="disburse()">
      <div class="space-y-4">
        <div class="p-4 rounded-xl bg-[var(--cx-success-light)] border border-[var(--cx-success)]/20">
          <div class="text-xs font-bold text-[var(--cx-success)]">Loan: {{ loan()?.application_id }}</div>
          <div class="text-lg font-bold text-[var(--cx-success)] mt-1">₦{{ loan()?.gross_loan || loan()?.amount_requested | number:'1.2-2' }}</div>
          <div class="text-[10px] text-[var(--cx-success)]/70 mt-1">Customer: {{ loan()?.customer_name }}</div>
        </div>
        <div><label class="cx-label">Disbursement Notes (optional)</label>
          <textarea class="cx-input" rows="2" [(ngModel)]="disburseNotes"></textarea>
        </div>
      </div>
    </cx-form-dialog>
  `,
  styles: [`
    :host { display: block; }

    .cx-loan-kpis {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.85rem;
      margin-bottom: 1.25rem;
    }
    @media (min-width: 1024px) {
      .cx-loan-kpis { grid-template-columns: repeat(5, 1fr); }
    }
    .cx-loan-kpi {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      padding: 0.95rem 1rem;
      transition: box-shadow var(--cx-dur-base) var(--cx-ease-premium), transform var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cx-loan-kpi:hover { box-shadow: var(--cx-shadow-sm); transform: translateY(-1px); }
    .cx-loan-kpi .cx-eyebrow { margin-bottom: 0.45rem; }
    .cx-loan-kpi-value {
      font-size: var(--cx-text-lg);
      font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.01em;
      line-height: 1.2;
    }

    .cx-loan-tabs-row { margin-bottom: 1.25rem; }

    .cx-loan-summary-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    @media (min-width: 1024px) {
      .cx-loan-summary-grid { grid-template-columns: repeat(2, 1fr); }
    }

    .cx-loan-detail-card { display: flex; flex-direction: column; gap: 0.85rem; }
    .cx-loan-card-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 1rem;
      padding-bottom: 0.65rem;
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cx-loan-card-title {
      margin: 0;
      font-size: var(--cx-text-md); font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
    }

    .cx-loan-field-list {
      display: flex; flex-direction: column;
    }
    .cx-loan-field-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 1rem;
      padding: 0.6rem 0;
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cx-loan-field-row:last-child { border-bottom: none; }
    .cx-loan-field-label {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      flex-shrink: 0;
    }
    .cx-loan-field-value {
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      font-weight: 500;
      text-align: right;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cx-loan-fees-card { margin-top: 1rem; display: flex; flex-direction: column; gap: 0.85rem; }
    .cx-loan-fees-table { width: 100%; border-collapse: collapse; }
    .cx-loan-fees-table thead th {
      font-size: var(--cx-text-xs); font-weight: 600;
      color: var(--cx-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid var(--cx-border);
      text-align: left;
    }
    .cx-loan-fees-table tbody td {
      padding: 0.65rem 0.75rem;
      border-bottom: 1px solid var(--cx-border-subtle);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
    }
    .cx-loan-fees-table tbody tr:last-child td { border-bottom: none; }
    .cx-loan-fee-calc {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      text-transform: capitalize;
    }

    .cx-dash-right { text-align: right; }
  `],
})
export class LoanDetailComponent implements OnInit {
  @Input() id = '';
  loan = signal<any>(null);
  loading = signal(true);
  schedule = signal<any[]>([]);
  scheduleLoading = signal(false);
  payments = signal<any[]>([]);
  approvals = signal<any[]>([]);
  activeTab: string = 'summary';
  showDisburse = signal(false);
  disbursing = signal(false);
  disburseNotes = '';

  cxTabs: CxTab[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'schedule', label: 'Repayment Schedule' },
    { id: 'payments', label: 'Payments' },
    { id: 'approvals', label: 'Approval Trail' },
    { id: 'trail', label: 'Loan Trail' },
  ];

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit(): void {
    if (!this.id) return;
    this.api.get(`/loans/${this.id}`).subscribe({
      next: r => { this.loan.set(r.data); this.loading.set(false); this.loadRelated(); },
      error: () => this.loading.set(false),
    });
  }

  loadRelated(): void {
    // Repayment schedule
    this.scheduleLoading.set(true);
    this.api.get(`/loans/${this.id}/repayment-schedule`).subscribe({
      next: r => { this.schedule.set(r.data || []); this.scheduleLoading.set(false); },
      error: () => this.scheduleLoading.set(false),
    });
    // Payments
    this.api.get('/payments', { loan_id: this.id, per_page: 100 }).subscribe({
      next: r => this.payments.set(r.data || []),
    });
    // Approvals
    this.api.get(`/approvals/loan/${this.id}`).subscribe({
      next: r => this.approvals.set(r.data || []),
    });
  }

  disburse(): void {
    this.disbursing.set(true);
    this.api.post(`/loans/${this.id}/disburse`, { notes: this.disburseNotes }).subscribe({
      next: r => {
        this.disbursing.set(false);
        this.toast.success(r.message || 'Loan disbursed');
        this.showDisburse.set(false);
        this.ngOnInit(); // reload
      },
      error: e => { this.disbursing.set(false); this.toast.error(e.error?.message || 'Disbursement failed'); },
    });
  }

  get kpis() {
    const l = this.loan();
    if (!l) return [];
    return [
      { label: 'Amount', value: '₦' + this.fmt(l.amount_requested) },
      { label: 'Gross Loan', value: '₦' + this.fmt(l.gross_loan || l.amount_requested) },
      { label: 'Net Disbursed', value: '₦' + this.fmt(l.net_disbursed || l.amount_requested) },
      { label: 'Status', value: (l.status || '').replace(/_/g, ' ').toUpperCase(), color: l.status === 'active' || l.status === 'disbursed' ? 'text-[var(--cx-success)]' : l.status === 'overdue' ? 'text-[var(--cx-danger)]' : '' },
      { label: 'Tenure', value: l.tenure + ' months' },
    ];
  }

  get loanFields() {
    const l = this.loan();
    if (!l) return [];
    return [
      { label: 'Application ID', value: l.application_id },
      { label: 'Product', value: l.product_name },
      { label: 'Interest Rate', value: l.interest_rate + '%' },
      { label: 'Calculation Method', value: l.calculation_method },
      { label: 'Loan Type', value: l.loan_type },
      { label: 'Branch', value: l.branch_name || '—' },
      { label: 'Agent', value: l.agent_name || '—' },
      { label: 'Created', value: l.created_at },
      { label: 'Disbursed', value: l.disbursed_at || '—' },
    ];
  }

  get customerFields() {
    const l = this.loan();
    if (!l) return [];
    return [
      { label: 'Name', value: l.customer_name },
      { label: 'Staff ID', value: l.customer_staff_id || '—' },
      { label: 'Phone', value: l.customer_phone || '—' },
      { label: 'Email', value: l.customer_email || '—' },
    ];
  }

  private fmt(n: any): string { return Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
}
