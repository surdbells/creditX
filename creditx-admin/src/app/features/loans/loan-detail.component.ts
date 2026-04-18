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

@Component({
  selector: 'app-loan-detail', standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, PageHeaderComponent, StatusBadgeComponent, FormDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header [title]="'Loan ' + (loan()?.application_id || '')" [subtitle]="loan()?.customer_name || ''">
        <div class="flex items-center gap-2">
          @if (loan()?.status === 'approved' && auth.hasPermission('loans.disburse')) {
            <button class="cx-btn cx-btn-primary" (click)="showDisburse.set(true)"><lucide-icon name="banknote" [size]="16"></lucide-icon> Disburse</button>
          }
          <a routerLink="/loans" class="cx-btn cx-btn-outline cx-btn-sm"><lucide-icon name="arrow-left" [size]="14"></lucide-icon> Back</a>
        </div>
      </cx-page-header>

      @if (loading()) {
        <div class="cx-card flex items-center justify-center py-16"><div class="w-8 h-8 border-3 border-[var(--cx-primary)] border-t-transparent rounded-full animate-spin"></div></div>
      } @else if (loan()) {
        <!-- KPI Summary -->
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
          @for (kpi of kpis; track kpi.label) {
            <div class="cx-card !p-4">
              <div class="text-[10px] font-bold text-[var(--cx-text-muted)] uppercase tracking-wider">{{ kpi.label }}</div>
              <div class="text-lg font-bold mt-1" [class]="kpi.color || 'text-[var(--cx-text)]'">{{ kpi.value }}</div>
            </div>
          }
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 mb-4 border-b border-[var(--cx-border)] pb-px overflow-x-auto">
          @for (tab of tabs; track tab.key) {
            <button class="px-4 py-2.5 text-xs font-semibold whitespace-nowrap rounded-t-lg transition-all"
                    [class]="activeTab === tab.key ? 'text-[var(--cx-primary)] border-b-2 border-[var(--cx-primary)] bg-[var(--cx-surface)]' : 'text-[var(--cx-text-muted)] hover:text-[var(--cx-text)]'"
                    (click)="activeTab = tab.key">{{ tab.label }}</button>
          }
        </div>

        <!-- SUMMARY TAB -->
        @if (activeTab === 'summary') {
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="cx-card">
              <h3 class="text-xs font-bold text-[var(--cx-text-muted)] uppercase tracking-wider mb-3">Loan Details</h3>
              <div class="space-y-1.5">
                @for (f of loanFields; track f.label) {
                  <div class="flex justify-between py-1.5 border-b border-[var(--cx-border)] last:border-0">
                    <span class="text-xs text-[var(--cx-text-muted)]">{{ f.label }}</span>
                    <span class="text-xs font-medium text-[var(--cx-text)]">{{ f.value }}</span>
                  </div>
                }
              </div>
            </div>
            <div class="cx-card">
              <h3 class="text-xs font-bold text-[var(--cx-text-muted)] uppercase tracking-wider mb-3">Customer</h3>
              <div class="space-y-1.5">
                @for (f of customerFields; track f.label) {
                  <div class="flex justify-between py-1.5 border-b border-[var(--cx-border)] last:border-0">
                    <span class="text-xs text-[var(--cx-text-muted)]">{{ f.label }}</span>
                    <span class="text-xs font-medium text-[var(--cx-text)]">{{ f.value }}</span>
                  </div>
                }
              </div>
              <a [routerLink]="'/customers/' + loan()?.customer_id" class="cx-btn cx-btn-outline cx-btn-sm w-full mt-3"><lucide-icon name="external-link" [size]="12"></lucide-icon> View Customer</a>
            </div>
          </div>
          @if (loan()?.fee_breakdowns?.length) {
            <div class="cx-card mt-4">
              <h3 class="text-xs font-bold text-[var(--cx-text-muted)] uppercase tracking-wider mb-3">Fee Breakdown</h3>
              <table class="w-full text-sm">
                <thead><tr class="border-b border-[var(--cx-border)]">
                  <th class="px-3 py-2 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Fee</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase">Amount</th>
                </tr></thead>
                <tbody>
                  @for (fee of loan()?.fee_breakdowns; track fee.id) {
                    <tr class="border-b border-[var(--cx-border)]"><td class="px-3 py-2">{{ fee.fee_name }}</td><td class="px-3 py-2 text-right font-mono">₦{{ fee.amount | number:'1.2-2' }}</td></tr>
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
              <div class="py-12 text-center"><div class="w-6 h-6 border-2 border-[var(--cx-primary)] border-t-transparent rounded-full animate-spin mx-auto"></div></div>
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
})
export class LoanDetailComponent implements OnInit {
  @Input() id = '';
  loan = signal<any>(null);
  loading = signal(true);
  schedule = signal<any[]>([]);
  scheduleLoading = signal(false);
  payments = signal<any[]>([]);
  approvals = signal<any[]>([]);
  activeTab = 'summary';
  showDisburse = signal(false);
  disbursing = signal(false);
  disburseNotes = '';

  tabs = [
    { key: 'summary', label: 'Summary' },
    { key: 'schedule', label: 'Repayment Schedule' },
    { key: 'payments', label: 'Payments' },
    { key: 'approvals', label: 'Approval Trail' },
    { key: 'trail', label: 'Loan Trail' },
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
