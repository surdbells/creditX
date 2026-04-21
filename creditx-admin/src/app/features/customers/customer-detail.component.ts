import { Component, OnInit, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { CxTabsComponent, CxTab } from '../../shared/components/tabs/tabs.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-customer-detail', standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, PageHeaderComponent, StatusBadgeComponent, CxTabsComponent, LoadingSpinnerComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        [title]="customer()?.full_name || 'Customer'"
        [subtitle]="'Staff ID: ' + (customer()?.staff_id || '—')"
        eyebrow="Customer profile">
        <a routerLink="/customers" class="cx-btn cx-btn-outline cx-btn-sm">
          <lucide-icon name="chevron-left" [size]="14"></lucide-icon>
          <span>Back</span>
        </a>
      </cx-page-header>

      @if (loading()) {
        <cx-loading message="Loading customer..."></cx-loading>
      } @else if (customer()) {
        <!-- Premium tabs -->
        <div class="cx-cust-tabs-row">
          <cx-tabs [tabs]="cxTabs" [(activeId)]="activeTab"></cx-tabs>
        </div>

        <!-- PROFILE TAB -->
        @if (activeTab === 'profile') {
          <div class="cx-cust-profile-grid">
            <div class="cx-card cx-cust-card">
              <div class="cx-cust-card-header">
                <h3 class="cx-cust-card-title">Personal</h3>
                <span class="cx-eyebrow">Identity</span>
              </div>
              <div class="cx-cust-field-list">
                @for (f of personalFields; track f.label) {
                  <div class="cx-cust-field-row">
                    <span class="cx-cust-field-label">{{ f.label }}</span>
                    <span class="cx-cust-field-value">{{ f.value || '—' }}</span>
                  </div>
                }
              </div>
            </div>
            <div class="cx-card cx-cust-card">
              <div class="cx-cust-card-header">
                <h3 class="cx-cust-card-title">Banking</h3>
                <span class="cx-eyebrow">Accounts</span>
              </div>
              <div class="cx-cust-field-list">
                @for (f of bankingFields; track f.label) {
                  <div class="cx-cust-field-row">
                    <span class="cx-cust-field-label">{{ f.label }}</span>
                    <span class="cx-cust-field-value">{{ f.value || '—' }}</span>
                  </div>
                }
              </div>
            </div>
            <div class="cx-card cx-cust-card">
              <div class="cx-cust-card-header">
                <h3 class="cx-cust-card-title">Next of Kin</h3>
                <span class="cx-eyebrow">Relatives</span>
              </div>
              @if (customer()?.next_of_kins?.length) {
                <div class="cx-cust-nok-list">
                  @for (nok of customer()?.next_of_kins; track nok.id) {
                    <div class="cx-cust-nok">
                      <div class="cx-cust-nok-avatar">
                        {{ (nok.full_name || '?').charAt(0).toUpperCase() }}
                      </div>
                      <div class="cx-cust-nok-info">
                        <div class="cx-cust-nok-name">{{ nok.full_name }}</div>
                        <div class="cx-cust-nok-meta">{{ nok.relationship }} &bull; {{ nok.phone }}</div>
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <div class="cx-cust-empty-mini">No next of kin records</div>
              }
            </div>
          </div>
        }

        <!-- LOANS TAB -->
        @if (activeTab === 'loans') {
          <div class="cx-card !p-0 overflow-hidden">
            @if (loans().length === 0) {
              <div class="flex flex-col items-center justify-center py-16">
                <lucide-icon name="file-text" [size]="36" class="text-[var(--cx-text-muted)] opacity-30 mb-2"></lucide-icon>
                <p class="text-sm text-[var(--cx-text-muted)]">No loan records</p>
              </div>
            } @else {
              <table class="w-full">
                <thead><tr class="border-b border-[var(--cx-border)]">
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">App ID</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Product</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Amount</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Outstanding</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Status</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Date</th>
                  <th class="px-4 py-3 w-12"></th>
                </tr></thead>
                <tbody>
                  @for (loan of loans(); track loan.id) {
                    <tr class="border-b border-[var(--cx-border)] hover:bg-[var(--cx-surface-hover)] transition-colors">
                      <td class="px-4 py-3 font-mono text-xs text-[var(--cx-primary)] font-medium">{{ loan.application_id }}</td>
                      <td class="px-4 py-3 text-sm">{{ loan.product_name }}</td>
                      <td class="px-4 py-3 text-sm text-right font-medium">₦{{ loan.amount_disbursed || loan.amount_requested | number:'1.0-0' }}</td>
                      <td class="px-4 py-3 text-sm text-right font-medium" [class]="(loan.outstanding_balance || 0) > 0 ? 'text-[var(--cx-danger)]' : 'text-[var(--cx-success)]'">
                        ₦{{ loan.outstanding_balance || 0 | number:'1.0-0' }}
                      </td>
                      <td class="px-4 py-3"><cx-status-badge [status]="loan.status"></cx-status-badge></td>
                      <td class="px-4 py-3 text-xs text-[var(--cx-text-muted)]">{{ loan.created_at | date:'mediumDate' }}</td>
                      <td class="px-4 py-3">
                        <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="selectLoan(loan)" title="View Ledger">
                          <lucide-icon name="eye" [size]="14"></lucide-icon>
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>
        }

        <!-- LEDGER TAB (Loan Account Entries) -->
        @if (activeTab === 'ledger') {
          @if (!selectedLoan) {
            <div class="cx-card flex flex-col items-center justify-center py-12">
              <lucide-icon name="arrow-left-right" [size]="36" class="text-[var(--cx-text-muted)] opacity-30 mb-2"></lucide-icon>
              <p class="text-sm text-[var(--cx-text-muted)]">Select a loan from the Loans tab to view its ledger</p>
            </div>
          } @else {
            <!-- Loan Account Summary -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div class="cx-card !p-4">
                <div class="text-[10px] font-bold text-[var(--cx-text-muted)] uppercase tracking-wider">Loan</div>
                <div class="text-sm font-bold text-[var(--cx-text)] mt-1 font-mono">{{ selectedLoan.application_id }}</div>
              </div>
              <div class="cx-card !p-4">
                <div class="text-[10px] font-bold text-[var(--cx-text-muted)] uppercase tracking-wider">Disbursed</div>
                <div class="text-lg font-bold text-[var(--cx-text)] mt-1">₦{{ selectedLoan.amount_disbursed || selectedLoan.amount_requested | number:'1.0-0' }}</div>
              </div>
              <div class="cx-card !p-4">
                <div class="text-[10px] font-bold text-[var(--cx-text-muted)] uppercase tracking-wider">Total Repaid</div>
                <div class="text-lg font-bold text-[var(--cx-success)] mt-1">₦{{ totalCredit | number:'1.0-0' }}</div>
              </div>
              <div class="cx-card !p-4">
                <div class="text-[10px] font-bold text-[var(--cx-text-muted)] uppercase tracking-wider">Outstanding</div>
                <div class="text-lg font-bold mt-1" [class]="(selectedLoan.outstanding_balance || 0) > 0 ? 'text-[var(--cx-danger)]' : 'text-[var(--cx-success)]'">
                  ₦{{ selectedLoan.outstanding_balance || 0 | number:'1.0-0' }}
                </div>
              </div>
            </div>

            <!-- Ledger Entries Table -->
            <div class="cx-card !p-0 overflow-hidden">
              <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--cx-border)]">
                <h3 class="text-sm font-bold text-[var(--cx-text)]">Account Entries — {{ selectedLoan.application_id }}</h3>
                <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="exportLedger()"><lucide-icon name="download" [size]="14"></lucide-icon> Export</button>
              </div>
              @if (ledgerLoading()) {
                <div class="flex items-center justify-center py-12"><div class="w-6 h-6 border-2 border-[var(--cx-primary)] border-t-transparent rounded-full animate-spin"></div></div>
              } @else if (ledgerEntries().length === 0) {
                <div class="py-12 text-center text-sm text-[var(--cx-text-muted)]">No ledger entries for this loan</div>
              } @else {
                <table class="w-full">
                  <thead><tr class="border-b border-[var(--cx-border)]">
                    <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Date</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Reference</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Description</th>
                    <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider text-[var(--cx-danger)]">Debit (DR)</th>
                    <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider text-[var(--cx-success)]">Credit (CR)</th>
                    <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Balance</th>
                  </tr></thead>
                  <tbody>
                    @for (entry of ledgerEntries(); track entry.id; let i = $index) {
                      <tr class="border-b border-[var(--cx-border)] hover:bg-[var(--cx-surface-hover)] transition-colors">
                        <td class="px-4 py-3 text-xs font-mono text-[var(--cx-text-muted)]">{{ entry.created_at | date:'shortDate' }}</td>
                        <td class="px-4 py-3 text-xs font-mono text-[var(--cx-primary)]">{{ entry.reference || entry.trans_callback || '—' }}</td>
                        <td class="px-4 py-3 text-sm text-[var(--cx-text)]">{{ entry.narration || entry.description || '—' }}</td>
                        <td class="px-4 py-3 text-sm text-right font-medium text-[var(--cx-danger)]">
                          @if ((entry.debit_amount || entry.debit || 0) > 0) { ₦{{ entry.debit_amount || entry.debit | number:'1.2-2' }} }
                        </td>
                        <td class="px-4 py-3 text-sm text-right font-medium text-[var(--cx-success)]">
                          @if ((entry.credit_amount || entry.credit || 0) > 0) { ₦{{ entry.credit_amount || entry.credit | number:'1.2-2' }} }
                        </td>
                        <td class="px-4 py-3 text-sm text-right font-bold">₦{{ runningBalance(i) | number:'1.2-2' }}</td>
                      </tr>
                    }
                  </tbody>
                  <tfoot>
                    <tr class="bg-[var(--cx-surface-hover)] font-bold border-t-2 border-[var(--cx-border)]">
                      <td class="px-4 py-3" colspan="3">Totals</td>
                      <td class="px-4 py-3 text-right text-[var(--cx-danger)]">₦{{ totalDebit | number:'1.2-2' }}</td>
                      <td class="px-4 py-3 text-right text-[var(--cx-success)]">₦{{ totalCredit | number:'1.2-2' }}</td>
                      <td class="px-4 py-3 text-right">₦{{ (totalDebit - totalCredit) | number:'1.2-2' }}</td>
                    </tr>
                  </tfoot>
                </table>
              }
            </div>
          }
        }

        <!-- DOCUMENTS TAB -->
        @if (activeTab === 'documents') {
          <div class="cx-card">
            @if (customer()?.documents?.length) {
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                @for (doc of customer()?.documents; track doc.id) {
                  <div class="flex items-center gap-3 p-3 rounded-xl border border-[var(--cx-border)] hover:bg-[var(--cx-surface-hover)] transition-colors">
                    <lucide-icon name="file-text" [size]="20" class="text-[var(--cx-primary)] flex-shrink-0"></lucide-icon>
                    <div class="min-w-0 flex-1">
                      <div class="text-sm font-medium truncate text-[var(--cx-text)]">{{ doc.file_name }}</div>
                      <div class="text-xs text-[var(--cx-text-muted)]">{{ doc.type }}</div>
                    </div>
                    <cx-status-badge [status]="doc.status"></cx-status-badge>
                  </div>
                }
              </div>
            } @else {
              <div class="text-center py-8"><p class="text-sm text-[var(--cx-text-muted)]">No documents uploaded</p></div>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .cx-cust-tabs-row { margin-bottom: 1.25rem; }

    .cx-cust-profile-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    @media (min-width: 1024px) {
      .cx-cust-profile-grid { grid-template-columns: repeat(3, 1fr); }
    }

    .cx-cust-card { display: flex; flex-direction: column; gap: 0.85rem; }
    .cx-cust-card-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 1rem;
      padding-bottom: 0.65rem;
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cx-cust-card-title {
      margin: 0;
      font-size: var(--cx-text-md); font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
    }

    .cx-cust-field-list { display: flex; flex-direction: column; }
    .cx-cust-field-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 1rem;
      padding: 0.6rem 0;
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cx-cust-field-row:last-child { border-bottom: none; }
    .cx-cust-field-label {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      flex-shrink: 0;
    }
    .cx-cust-field-value {
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      font-weight: 500;
      text-align: right;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Next of Kin */
    .cx-cust-nok-list { display: flex; flex-direction: column; gap: 0.85rem; }
    .cx-cust-nok {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.65rem;
      background: var(--cx-stone-50);
      border-radius: var(--cx-radius-md);
      border: 1px solid var(--cx-border-subtle);
    }
    .cx-cust-nok-avatar {
      width: 36px; height: 36px; flex-shrink: 0;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--cx-primary-600), var(--cx-primary-500));
      color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: var(--cx-text-sm); font-weight: 600;
    }
    .cx-cust-nok-info { flex: 1; min-width: 0; }
    .cx-cust-nok-name {
      font-size: var(--cx-text-sm); font-weight: 500;
      color: var(--cx-text);
    }
    .cx-cust-nok-meta {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      margin-top: 2px;
    }

    .cx-cust-empty-mini {
      padding: 1.5rem 0.5rem;
      font-size: var(--cx-text-sm);
      color: var(--cx-text-muted);
      text-align: center;
    }
  `],
})
export class CustomerDetailComponent implements OnInit {
  @Input() id = '';
  customer = signal<any>(null);
  loading = signal(true);
  loans = signal<any[]>([]);
  ledgerEntries = signal<any[]>([]);
  ledgerLoading = signal(false);
  selectedLoan: any = null;
  totalDebit = 0; totalCredit = 0;
  activeTab: string = 'profile';

  cxTabs: CxTab[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'loans', label: 'Loans' },
    { id: 'ledger', label: 'Loan Ledger' },
    { id: 'documents', label: 'Documents' },
  ];

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    if (this.id) {
      this.api.get(`/customers/${this.id}`).subscribe({
        next: res => { this.customer.set(res.data); this.loading.set(false); },
        error: () => this.loading.set(false),
      });
      // Load customer's loans
      this.api.get('/loans', { customer_id: this.id, per_page: 100 }).subscribe({
        next: res => this.loans.set(res.data || []),
      });
    }
  }

  setTab(key: string) { this.activeTab = key; }

  selectLoan(loan: any) {
    this.selectedLoan = loan;
    this.activeTab = 'ledger';
    this.loadLedger(loan);
  }

  loadLedger(loan: any) {
    this.ledgerLoading.set(true);
    // Try repayment schedule first, then customer ledger transactions
    this.api.get(`/loans/${loan.id}/repayment-schedule`).subscribe({
      next: res => {
        const data = res.data || [];
        this.ledgerEntries.set(data);
        this.calcTotals(data);
        this.ledgerLoading.set(false);
      },
      error: () => {
        // Fallback to customer ledger
        if (loan.customer_ledger_id) {
          this.api.get(`/customer-ledgers/${loan.customer_ledger_id}/transactions`).subscribe({
            next: res => { this.ledgerEntries.set(res.data || []); this.calcTotals(res.data || []); this.ledgerLoading.set(false); },
            error: () => { this.ledgerEntries.set([]); this.ledgerLoading.set(false); },
          });
        } else { this.ledgerEntries.set([]); this.ledgerLoading.set(false); }
      },
    });
  }

  calcTotals(entries: any[]) {
    this.totalDebit = entries.reduce((s, e) => s + (e.debit_amount || e.debit || 0), 0);
    this.totalCredit = entries.reduce((s, e) => s + (e.credit_amount || e.credit || 0), 0);
  }

  runningBalance(index: number): number {
    let bal = 0;
    for (let i = 0; i <= index; i++) {
      const e = this.ledgerEntries()[i];
      bal += (e.debit_amount || e.debit || 0) - (e.credit_amount || e.credit || 0);
    }
    return bal;
  }

  exportLedger() {
    const entries = this.ledgerEntries();
    if (!entries.length) return;
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const h = ['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'];
    const rows = [h.join(',')];
    entries.forEach((e, i) => {
      rows.push([e.created_at, e.reference || e.trans_callback || '', `"${e.narration || e.description || ''}"`,
        e.debit_amount || e.debit || 0, e.credit_amount || e.credit || 0, this.runningBalance(i)].join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `CreditX_Ledger_${this.selectedLoan?.application_id}_${ts}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  get personalFields() {
    const c = this.customer();
    if (!c) return [];
    return [
      { label: 'Full Name', value: c.full_name }, { label: 'Staff ID', value: c.staff_id },
      { label: 'Phone', value: c.phone }, { label: 'Alt Phone', value: c.alt_phone },
      { label: 'Email', value: c.email }, { label: 'Gender', value: c.gender },
      { label: 'Date of Birth', value: c.date_of_birth }, { label: 'Marital Status', value: c.marital_status },
      { label: 'State of Origin', value: c.state_of_origin }, { label: 'LGA', value: c.lga },
      { label: 'Hometown', value: c.hometown }, { label: 'Religion', value: c.religion },
      { label: 'BVN', value: c.bvn }, { label: "Mother's Maiden Name", value: c.mothers_maiden_name },
      { label: 'Home Address', value: c.home_address },
    ];
  }

  get bankingFields() {
    const c = this.customer();
    if (!c) return [];
    return [
      { label: 'Bank Name', value: c.bank_name }, { label: 'Account Number', value: c.account_number },
      { label: 'Alt Bank', value: c.alt_bank_name }, { label: 'Alt Account', value: c.alt_account_number },
    ];
  }
}
