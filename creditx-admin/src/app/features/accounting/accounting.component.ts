import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { CxTabsComponent, CxTab } from '../../shared/components/tabs/tabs.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-accounting', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, FormDialogComponent, CxTabsComponent, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Accounting"
        subtitle="General ledger, trial balance, and financial transactions"
        eyebrow="Finance">
        @if (activeTab === 'coa' && auth.hasPermission('accounting.create')) {
          <button class="cx-btn cx-btn-primary" (click)="openCoaForm()">
            <lucide-icon name="plus" [size]="14"></lucide-icon>
            <span>New GL Account</span>
          </button>
        }
      </cx-page-header>

      <!-- Tabs -->
      <div class="cx-acc-tabs-row">
        <cx-tabs [tabs]="cxTabs" [activeId]="activeTab" (activeIdChange)="setTab($event)"></cx-tabs>
      </div>

      <!-- CHART OF ACCOUNTS TAB -->
      @if (activeTab === 'coa') {
        <div class="cx-acc-filters">
          <div class="cx-acc-filter-search">
            <lucide-icon name="search" [size]="14" class="cx-acc-filter-search-icon"></lucide-icon>
            <input type="text" class="cx-acc-filter-search-input"
              placeholder="Search accounts by code or name..." [(ngModel)]="coaSearch" (input)="loadCoa()" />
          </div>
        </div>

        <div class="cx-acc-table-wrap">
          @if (coaLoading()) {
            <div class="cx-acc-state"><cx-loading message="Loading chart of accounts..."></cx-loading></div>
          } @else if (coaRows().length === 0) {
            <div class="cx-acc-state"><cx-empty-state title="No GL accounts" description="Start by adding your first general ledger account." icon="landmark"></cx-empty-state></div>
          } @else {
            <div class="cx-acc-scroll">
              <table class="cx-acc-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Account Name</th>
                    <th>Type</th>
                    <th>Ledger</th>
                    <th class="cx-acc-right">Balance</th>
                    <th class="cx-acc-actions-col"></th>
                  </tr>
                </thead>
                <tbody>
                  @for (a of coaRows(); track a.id) {
                    <tr>
                      <td><span class="cx-acc-code">{{ a.account_code }}</span></td>
                      <td class="cx-acc-name">{{ a.account_name }}</td>
                      <td><span class="cx-acc-type-chip" [attr.data-type]="a.account_type?.toLowerCase()">{{ a.account_type }}</span></td>
                      <td class="cx-acc-ledger">{{ a.ledger_type }}</td>
                      <td class="cx-acc-right cx-acc-balance tabular-nums">₦{{ (a.balance || 0) | number:'1.2-2' }}</td>
                      <td class="cx-acc-actions-col">
                        <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openCoaForm(a)" title="Edit">
                          <lucide-icon name="pencil" [size]="14"></lucide-icon>
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }

      <!-- TRIAL BALANCE TAB -->
      @if (activeTab === 'trial') {
        <div class="cx-acc-table-wrap">
          @if (trialLoading()) {
            <div class="cx-acc-state"><cx-loading message="Generating trial balance..."></cx-loading></div>
          } @else if (trialRows().length === 0) {
            <div class="cx-acc-state"><cx-empty-state title="No data for trial balance" description="Post some transactions first to generate a trial balance." icon="bar-chart-3"></cx-empty-state></div>
          } @else {
            <div class="cx-acc-scroll">
              <table class="cx-acc-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Account Name</th>
                    <th class="cx-acc-right">Debit (₦)</th>
                    <th class="cx-acc-right">Credit (₦)</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of trialRows(); track row.account_code) {
                    <tr>
                      <td><span class="cx-acc-code">{{ row.account_code }}</span></td>
                      <td class="cx-acc-name">{{ row.account_name }}</td>
                      <td class="cx-acc-right tabular-nums">{{ (row.debit || 0) | number:'1.2-2' }}</td>
                      <td class="cx-acc-right tabular-nums">{{ (row.credit || 0) | number:'1.2-2' }}</td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr class="cx-acc-total-row">
                    <td colspan="2">Total</td>
                    <td class="cx-acc-right tabular-nums">₦{{ trialTotalDebit | number:'1.2-2' }}</td>
                    <td class="cx-acc-right tabular-nums">₦{{ trialTotalCredit | number:'1.2-2' }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          }
        </div>
      }

      <!-- TRANSACTIONS TAB -->
      @if (activeTab === 'txns') {
        <div class="cx-acc-filters cx-acc-filters-txn">
          <div class="cx-acc-filter-search">
            <lucide-icon name="search" [size]="14" class="cx-acc-filter-search-icon"></lucide-icon>
            <input type="text" class="cx-acc-filter-search-input"
              placeholder="Search transactions..." [(ngModel)]="txnSearch" (input)="onTxnFilter()" />
          </div>
          <input type="date" class="cx-input" [(ngModel)]="txnFrom" (change)="onTxnFilter()" title="From date" />
          <input type="date" class="cx-input" [(ngModel)]="txnTo" (change)="onTxnFilter()" title="To date" />
        </div>
        <div class="cx-acc-table-wrap">
          @if (txnLoading()) {
            <div class="cx-acc-state"><cx-loading message="Loading transactions..."></cx-loading></div>
          } @else if (txnRows().length === 0) {
            <div class="cx-acc-state"><cx-empty-state title="No transactions found" description="Try adjusting your filters or date range." icon="arrow-left-right"></cx-empty-state></div>
          } @else {
            <div class="cx-acc-scroll">
              <table class="cx-acc-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reference</th>
                    <th>Description</th>
                    <th>Account</th>
                    <th class="cx-acc-right">Debit</th>
                    <th class="cx-acc-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  @for (t of txnRows(); track t.id) {
                    <tr>
                      <td class="cx-acc-date">{{ t.created_at | date:'MMM d, y' }}</td>
                      <td><span class="cx-acc-code">{{ t.reference || t.trans_callback || '—' }}</span></td>
                      <td class="cx-acc-desc">{{ t.description || t.narration || '—' }}</td>
                      <td class="cx-acc-ledger">{{ t.account_name || '—' }}</td>
                      <td class="cx-acc-right tabular-nums cx-acc-debit">
                        @if (t.debit_amount > 0) { ₦{{ t.debit_amount | number:'1.2-2' }} } @else { — }
                      </td>
                      <td class="cx-acc-right tabular-nums cx-acc-credit">
                        @if (t.credit_amount > 0) { ₦{{ t.credit_amount | number:'1.2-2' }} } @else { — }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }
    </div>

    <!-- COA Form Dialog -->
    <cx-form-dialog
      [open]="showCoaForm()"
      [title]="coaEditId ? 'Edit Account' : 'Create GL Account'"
      [subtitle]="coaEditId ? 'Update account details' : 'Add a new account to the chart of accounts'"
      [saving]="coaSaving()" (close)="showCoaForm.set(false)" (save)="saveCoa()">
      <div class="cx-form-stack">
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Account Code *</label><input class="cx-input" [(ngModel)]="coaForm.account_code" placeholder="e.g. 1001" /></div>
          <div><label class="cx-label">Account Name *</label><input class="cx-input" [(ngModel)]="coaForm.account_name" placeholder="e.g. Cash on Hand" /></div>
        </div>
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Account Type *</label>
            <select class="cx-select" [(ngModel)]="coaForm.account_type">
              <option value="">Select...</option>
              <option>Asset</option>
              <option>Liability</option>
              <option>Equity</option>
              <option>Revenue</option>
              <option>Expense</option>
            </select>
          </div>
          <div>
            <label class="cx-label">Ledger Type</label>
            <select class="cx-select" [(ngModel)]="coaForm.ledger_type">
              <option value="">Select...</option>
              <option>General</option>
              <option>Customer</option>
              <option>Vendor</option>
            </select>
          </div>
        </div>
        <div><label class="cx-label">Description</label><textarea class="cx-input" rows="2" [(ngModel)]="coaForm.description" placeholder="Optional account notes..."></textarea></div>
      </div>
    </cx-form-dialog>
  `,
  styles: [`
    .cx-acc-tabs-row { margin-bottom: 1.25rem; }

    /* Filter bar */
    .cx-acc-filters {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.65rem;
      padding: 0.85rem;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      margin-bottom: 1rem;
    }
    @media (min-width: 768px) {
      .cx-acc-filters-txn { grid-template-columns: 2fr 1fr 1fr; }
    }
    .cx-acc-filter-search { position: relative; }
    .cx-acc-filter-search-icon {
      position: absolute; left: 0.75rem; top: 50%;
      transform: translateY(-50%);
      color: var(--cx-text-muted);
      pointer-events: none;
    }
    .cx-acc-filter-search-input {
      width: 100%;
      padding: 0.55rem 0.85rem 0.55rem 2.15rem;
      background: var(--cx-surface-2);
      border: 1px solid transparent;
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      outline: none;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-acc-filter-search-input:hover { border-color: var(--cx-border); }
    .cx-acc-filter-search-input:focus {
      background: var(--cx-surface);
      border-color: var(--cx-primary-600);
      box-shadow: var(--cx-ring-focus);
    }

    /* Table */
    .cx-acc-table-wrap {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      overflow: hidden;
    }
    .cx-acc-state { padding: 4rem 1rem; text-align: center; }
    .cx-acc-scroll { overflow-x: auto; }
    .cx-acc-table { width: 100%; border-collapse: collapse; }
    .cx-acc-table thead { background: var(--cx-surface-2); }
    .cx-acc-table thead tr { border-bottom: 1px solid var(--cx-border); }
    .cx-acc-table th {
      padding: 0.75rem 1rem;
      font-size: var(--cx-text-xs); font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.05em;
      color: var(--cx-text-muted);
      text-align: left;
      white-space: nowrap;
    }
    .cx-acc-right { text-align: right; }
    .cx-acc-actions-col { width: 60px; text-align: right; }
    .cx-acc-table tbody td {
      padding: 0.75rem 1rem;
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      border-bottom: 1px solid var(--cx-border-subtle);
      vertical-align: middle;
    }
    .cx-acc-table tbody tr { transition: background var(--cx-dur-fast) var(--cx-ease-premium); }
    .cx-acc-table tbody tr:hover { background: var(--cx-surface-hover); }
    .cx-acc-table tbody tr:last-child td { border-bottom: none; }

    .cx-acc-code {
      display: inline-flex; align-items: center;
      padding: 2px 8px;
      font-family: var(--cx-font-mono);
      font-size: var(--cx-text-xs);
      font-weight: 500;
      color: var(--cx-primary-700);
      background: var(--cx-primary-50);
      border-radius: var(--cx-radius-sm);
      letter-spacing: 0.02em;
    }
    .cx-acc-name { font-weight: 500; }
    .cx-acc-ledger { font-size: var(--cx-text-xs); color: var(--cx-text-secondary); }
    .cx-acc-date { font-size: var(--cx-text-xs); color: var(--cx-text-muted); white-space: nowrap; }
    .cx-acc-desc { color: var(--cx-text-secondary); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cx-acc-balance { font-weight: 500; }
    .cx-acc-debit { color: var(--cx-danger); }
    .cx-acc-credit { color: var(--cx-primary-700); }

    /* Account type chips */
    .cx-acc-type-chip {
      display: inline-flex; align-items: center;
      padding: 2px 10px;
      border-radius: var(--cx-radius-pill);
      font-size: var(--cx-text-xs);
      font-weight: 500;
      background: var(--cx-stone-100);
      color: var(--cx-text-secondary);
      white-space: nowrap;
    }
    .cx-acc-type-chip[data-type="asset"] { background: rgba(30, 92, 168, 0.1); color: var(--cx-info); }
    .cx-acc-type-chip[data-type="liability"] { background: var(--cx-danger-50); color: var(--cx-danger); }
    .cx-acc-type-chip[data-type="equity"] { background: rgba(124, 58, 237, 0.1); color: #6d28d9; }
    .cx-acc-type-chip[data-type="revenue"] { background: var(--cx-success-50); color: var(--cx-primary-700); }
    .cx-acc-type-chip[data-type="expense"] { background: var(--cx-accent-50); color: var(--cx-accent-700); }

    /* Trial balance total row */
    .cx-acc-total-row {
      background: var(--cx-surface-2);
      font-weight: 600;
      border-top: 2px solid var(--cx-border);
    }
    .cx-acc-total-row td {
      padding: 0.85rem 1rem !important;
      color: var(--cx-text);
      font-size: var(--cx-text-sm);
    }
  `],
})
export class AccountingComponent implements OnInit {
  tabs = [
    { key: 'coa', label: 'Chart of Accounts', icon: 'landmark' },
    { key: 'trial', label: 'Trial Balance', icon: 'bar-chart-3' },
    { key: 'txns', label: 'Transactions', icon: 'arrow-left-right' },
  ];
  cxTabs: CxTab[] = this.tabs.map(t => ({ id: t.key, label: t.label }));
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
        /*
         * Response shape:
         *   data: {
         *     accounts: [{account_code, account_name, total_dr, total_cr, balance}, ...],
         *     total_dr: '500000.00',
         *     total_cr: '1012000.00',
         *     difference: '-512000.00',
         *     is_balanced: false,
         *     period: '2026'
         *   }
         *
         * A prior revision read r.data as the rows array directly and
         * called .reduce on it, which threw synchronously inside the
         * observable's next() handler. rxjs does NOT route sync errors
         * from next() to the error channel — they just bubble. So
         * trialLoading never flipped to false and the spinner stuck.
         * Now we pull data.accounts explicitly and coerce-guard so a
         * missing field falls back to [] instead of throwing.
         *
         * We also normalise the field names: backend sends total_dr /
         * total_cr per row, but the template reads row.debit / row.credit.
         * Mapping at load time keeps the template untouched.
         */
        const data = r?.data ?? {};
        const accounts = Array.isArray(data.accounts) ? data.accounts : [];
        const rows = accounts.map((a: any) => ({
          ...a,
          debit:  parseFloat(a.total_dr ?? a.debit ?? '0'),
          credit: parseFloat(a.total_cr ?? a.credit ?? '0'),
        }));
        this.trialRows.set(rows);
        // Use the backend-computed totals when present (they've already
        // summed across all accounts), but recompute from rows as a
        // fallback for older responses.
        this.trialTotalDebit = data.total_dr != null
          ? parseFloat(data.total_dr)
          : rows.reduce((s: number, row: any) => s + row.debit, 0);
        this.trialTotalCredit = data.total_cr != null
          ? parseFloat(data.total_cr)
          : rows.reduce((s: number, row: any) => s + row.credit, 0);
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
