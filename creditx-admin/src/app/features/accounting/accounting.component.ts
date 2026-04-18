import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';

@Component({
  selector: 'app-accounting', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, FormDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Accounting" subtitle="General Ledger & Financial Management"></cx-page-header>

      <!-- Tab Navigation -->
      <div class="flex gap-1 mb-4 border-b border-[var(--cx-border)] pb-px">
        @for (tab of tabs; track tab.key) {
          <button class="px-4 py-2.5 text-xs font-semibold transition-all rounded-t-lg"
                  [class]="activeTab === tab.key ? 'text-[var(--cx-primary)] border-b-2 border-[var(--cx-primary)] bg-[var(--cx-surface)]' : 'text-[var(--cx-text-muted)] hover:text-[var(--cx-text)]'"
                  (click)="setTab(tab.key)">
            <lucide-icon [name]="tab.icon" [size]="14" class="inline mr-1.5"></lucide-icon>{{ tab.label }}
          </button>
        }
      </div>

      <!-- CHART OF ACCOUNTS TAB -->
      @if (activeTab === 'coa') {
        <div class="cx-card !p-4 mb-4">
          <div class="flex items-center justify-between mb-3">
            <div class="relative flex-1 max-w-sm">
              <lucide-icon name="search" class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" [size]="16"></lucide-icon>
              <input type="text" class="cx-input !pl-8" placeholder="Search accounts..." [(ngModel)]="coaSearch" (input)="loadCoa()" />
            </div>
            <button class="cx-btn cx-btn-primary" (click)="openCoaForm()"><lucide-icon name="plus" [size]="16"></lucide-icon> Add Account</button>
          </div>
        </div>
        <div class="cx-card !p-4 overflow-hidden">
          @if (coaLoading()) {
            <div class="flex items-center justify-center py-16"><div class="w-8 h-8 border-3 border-[var(--cx-primary)] border-t-transparent rounded-full animate-spin"></div></div>
          } @else {
            <table class="w-full">
              <thead><tr class="border-b border-[var(--cx-border)]">
                <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Code</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Account Name</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Type</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Ledger</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Balance</th>
                <th class="px-4 py-3 w-16"></th>
              </tr></thead>
              <tbody>
                @for (a of coaRows(); track a.id) {
                  <tr class="border-b border-[var(--cx-border)] hover:bg-[var(--cx-surface-hover)] transition-colors">
                    <td class="px-4 py-3 font-mono text-sm font-medium text-[var(--cx-primary)]">{{ a.account_code }}</td>
                    <td class="px-4 py-3 text-sm font-medium text-[var(--cx-text)]">{{ a.account_name }}</td>
                    <td class="px-4 py-3"><span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" [class]="acctTypeClass(a.account_type)">{{ a.account_type }}</span></td>
                    <td class="px-4 py-3 text-xs text-[var(--cx-text-secondary)]">{{ a.ledger_type }}</td>
                    <td class="px-4 py-3 text-right text-sm font-medium">₦{{ (a.balance || 0) | number:'1.2-2' }}</td>
                    <td class="px-4 py-3"><button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openCoaForm(a)"><lucide-icon name="pencil" [size]="14"></lucide-icon></button></td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      }

      <!-- TRIAL BALANCE TAB -->
      @if (activeTab === 'trial') {
        <div class="cx-card !p-4 overflow-hidden">
          @if (trialLoading()) {
            <div class="flex items-center justify-center py-16"><div class="w-8 h-8 border-3 border-[var(--cx-primary)] border-t-transparent rounded-full animate-spin"></div></div>
          } @else {
            <table class="w-full">
              <thead><tr class="border-b border-[var(--cx-border)]">
                <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Code</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Account Name</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Debit (₦)</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Credit (₦)</th>
              </tr></thead>
              <tbody>
                @for (row of trialRows(); track row.account_code) {
                  <tr class="border-b border-[var(--cx-border)] hover:bg-[var(--cx-surface-hover)]">
                    <td class="px-4 py-3 font-mono text-sm text-[var(--cx-primary)]">{{ row.account_code }}</td>
                    <td class="px-4 py-3 text-sm text-[var(--cx-text)]">{{ row.account_name }}</td>
                    <td class="px-4 py-3 text-right text-sm">{{ (row.debit || 0) | number:'1.2-2' }}</td>
                    <td class="px-4 py-3 text-right text-sm">{{ (row.credit || 0) | number:'1.2-2' }}</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr class="bg-[var(--cx-surface-hover)] font-semibold border-t-2 border-[var(--cx-border)]">
                  <td class="px-4 py-3" colspan="2">Total</td>
                  <td class="px-4 py-3 text-right">₦{{ trialTotalDebit | number:'1.2-2' }}</td>
                  <td class="px-4 py-3 text-right">₦{{ trialTotalCredit | number:'1.2-2' }}</td>
                </tr>
              </tfoot>
            </table>
          }
        </div>
      }

      <!-- TRANSACTIONS TAB -->
      @if (activeTab === 'txns') {
        <div class="cx-card !p-4 mb-4">
          <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div class="sm:col-span-2 relative">
              <lucide-icon name="search" class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" [size]="16"></lucide-icon>
              <input type="text" class="cx-input !pl-8" placeholder="Search transactions..." [(ngModel)]="txnSearch" (input)="onTxnFilter()" />
            </div>
            <input type="date" class="cx-input" [(ngModel)]="txnFrom" (change)="onTxnFilter()" />
            <input type="date" class="cx-input" [(ngModel)]="txnTo" (change)="onTxnFilter()" />
          </div>
        </div>
        <div class="cx-card !p-4 overflow-hidden">
          @if (txnLoading()) {
            <div class="flex items-center justify-center py-16"><div class="w-8 h-8 border-3 border-[var(--cx-primary)] border-t-transparent rounded-full animate-spin"></div></div>
          } @else if (txnRows().length === 0) {
            <div class="flex flex-col items-center justify-center py-16">
              <lucide-icon name="arrow-left-right" [size]="48" class="text-[var(--cx-text-muted)] opacity-30 mb-3"></lucide-icon>
              <p class="text-sm text-[var(--cx-text-muted)]">No transactions found</p>
            </div>
          } @else {
            <table class="w-full">
              <thead><tr class="border-b border-[var(--cx-border)]">
                <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Date</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Reference</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Description</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Account</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Debit</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Credit</th>
              </tr></thead>
              <tbody>
                @for (t of txnRows(); track t.id) {
                  <tr class="border-b border-[var(--cx-border)] hover:bg-[var(--cx-surface-hover)]">
                    <td class="px-4 py-3 text-xs font-mono text-[var(--cx-text-muted)]">{{ t.created_at | date:'shortDate' }}</td>
                    <td class="px-4 py-3 text-xs font-mono text-[var(--cx-primary)]">{{ t.reference || t.trans_callback || '—' }}</td>
                    <td class="px-4 py-3 text-sm text-[var(--cx-text)]">{{ t.description || t.narration || '—' }}</td>
                    <td class="px-4 py-3 text-xs text-[var(--cx-text-secondary)]">{{ t.account_name || '—' }}</td>
                    <td class="px-4 py-3 text-right text-sm">@if (t.debit_amount > 0) { ₦{{ t.debit_amount | number:'1.2-2' }} }</td>
                    <td class="px-4 py-3 text-right text-sm">@if (t.credit_amount > 0) { ₦{{ t.credit_amount | number:'1.2-2' }} }</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      }
    </div>

    <!-- COA Form Dialog -->
    <cx-form-dialog [open]="showCoaForm()" [title]="coaEditId ? 'Edit Account' : 'Create GL Account'" [saving]="coaSaving()" (close)="showCoaForm.set(false)" (save)="saveCoa()">
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Account Code *</label><input class="cx-input" [(ngModel)]="coaForm.account_code" /></div>
          <div><label class="cx-label">Account Name *</label><input class="cx-input" [(ngModel)]="coaForm.account_name" /></div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Account Type *</label>
            <select class="cx-select" [(ngModel)]="coaForm.account_type">
              <option value="">Select</option><option>Asset</option><option>Liability</option><option>Equity</option><option>Revenue</option><option>Expense</option>
            </select>
          </div>
          <div><label class="cx-label">Ledger Type</label>
            <select class="cx-select" [(ngModel)]="coaForm.ledger_type">
              <option value="">Select</option><option>General</option><option>Customer</option><option>Vendor</option>
            </select>
          </div>
        </div>
        <div><label class="cx-label">Description</label><textarea class="cx-input" rows="2" [(ngModel)]="coaForm.description"></textarea></div>
      </div>
    </cx-form-dialog>
  `,
})
export class AccountingComponent implements OnInit {
  tabs = [
    { key: 'coa', label: 'Chart of Accounts', icon: 'landmark' },
    { key: 'trial', label: 'Trial Balance', icon: 'bar-chart-3' },
    { key: 'txns', label: 'Transactions', icon: 'arrow-left-right' },
  ];
  activeTab = 'coa';

  // COA
  coaRows = signal<any[]>([]); coaLoading = signal(true); coaSearch = '';
  showCoaForm = signal(false); coaSaving = signal(false); coaEditId: string|null = null; coaForm: any = {};

  // Trial Balance
  trialRows = signal<any[]>([]); trialLoading = signal(true);
  trialTotalDebit = 0; trialTotalCredit = 0;

  // Transactions
  txnRows = signal<any[]>([]); txnLoading = signal(true); txnSearch = ''; txnFrom = ''; txnTo = '';
  private txnTimer: any;

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() { this.loadCoa(); }

  setTab(key: string) {
    this.activeTab = key;
    if (key === 'coa') this.loadCoa();
    else if (key === 'trial') this.loadTrial();
    else if (key === 'txns') this.loadTxns();
  }

  // ── Chart of Accounts ──
  loadCoa() {
    this.coaLoading.set(true);
    const params: any = { per_page: 200 };
    if (this.coaSearch) params.search = this.coaSearch;
    this.api.get('/gl-accounts', params).subscribe({
      next: r => { this.coaRows.set(r.data || []); this.coaLoading.set(false); },
      error: () => this.coaLoading.set(false),
    });
  }

  acctTypeClass(t: string): string {
    const m: Record<string, string> = { Asset: 'bg-blue-50 text-blue-700', Liability: 'bg-red-50 text-red-700', Equity: 'bg-purple-50 text-purple-700', Revenue: 'bg-emerald-50 text-emerald-700', Expense: 'bg-amber-50 text-amber-700' };
    return m[t] || 'bg-gray-100 text-gray-600';
  }

  openCoaForm(row?: any) {
    if (row) { this.coaEditId = row.id; this.coaForm = { account_code: row.account_code, account_name: row.account_name, account_type: row.account_type, ledger_type: row.ledger_type, description: row.description }; }
    else { this.coaEditId = null; this.coaForm = { account_code: '', account_name: '', account_type: '', ledger_type: '', description: '' }; }
    this.showCoaForm.set(true);
  }

  saveCoa() {
    this.coaSaving.set(true);
    (this.coaEditId ? this.api.put('/gl-accounts/' + this.coaEditId, this.coaForm) : this.api.post('/gl-accounts', this.coaForm)).subscribe({
      next: r => { this.coaSaving.set(false); this.toast.success(r.message || 'Saved'); this.showCoaForm.set(false); this.loadCoa(); },
      error: e => { this.coaSaving.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }

  // ── Trial Balance ──
  loadTrial() {
    this.trialLoading.set(true);
    this.api.get('/gl-accounts/reports/trial-balance').subscribe({
      next: r => {
        const data = r.data || [];
        this.trialRows.set(data);
        this.trialTotalDebit = data.reduce((s: number, r: any) => s + (r.debit || 0), 0);
        this.trialTotalCredit = data.reduce((s: number, r: any) => s + (r.credit || 0), 0);
        this.trialLoading.set(false);
      },
      error: () => this.trialLoading.set(false),
    });
  }

  // ── Transactions ──
  loadTxns() {
    this.txnLoading.set(true);
    const params: any = { per_page: 100 };
    if (this.txnSearch) params.search = this.txnSearch;
    if (this.txnFrom) params.date_from = this.txnFrom;
    if (this.txnTo) params.date_to = this.txnTo;
    // Try first GL account's transactions as a sample, or use a general endpoint
    this.api.get('/gl-accounts', { per_page: 1 }).subscribe({
      next: r => {
        const first = (r.data || [])[0];
        if (first) {
          this.api.get('/gl-accounts/' + first.id + '/transactions', params).subscribe({
            next: tr => { this.txnRows.set(tr.data || []); this.txnLoading.set(false); },
            error: () => { this.txnRows.set([]); this.txnLoading.set(false); },
          });
        } else { this.txnRows.set([]); this.txnLoading.set(false); }
      },
      error: () => this.txnLoading.set(false),
    });
  }

  onTxnFilter() { clearTimeout(this.txnTimer); this.txnTimer = setTimeout(() => this.loadTxns(), 400); }
}
