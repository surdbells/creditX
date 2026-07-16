import { Component, OnInit, computed, signal } from '@angular/core';
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
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { SettingsService } from '../../core/services/settings.service';
import { SearchableSelectDirective } from '../../shared/directives/searchable-select.directive';

@Component({
  selector: 'app-accounting', standalone: true,
  imports: [SearchableSelectDirective, CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, FormDialogComponent, CxTabsComponent, LoadingSpinnerComponent, EmptyStateComponent, MoneyPipe],
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
          <div class="cx-coa-toolbar-actions">
            <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="coaExpandAll()">
              <lucide-icon name="chevrons-down" [size]="14"></lucide-icon><span>Expand all</span>
            </button>
            <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="coaCollapseAll()">
              <lucide-icon name="chevrons-up" [size]="14"></lucide-icon><span>Collapse all</span>
            </button>
          </div>
        </div>

        <div class="cx-acc-table-wrap">
          @if (coaLoading()) {
            <div class="cx-acc-state"><cx-loading message="Loading chart of accounts..."></cx-loading></div>
          } @else if (coaRows().length === 0) {
            <div class="cx-acc-state"><cx-empty-state title="No GL accounts" description="Start by adding your first general ledger account." icon="landmark"></cx-empty-state></div>
          } @else {
            <div class="cx-coa-tree">
              @for (row of coaVisible(); track row.node.id) {
                @if (row.node.isCategory) {
                  <div class="cx-coa-cat" (click)="toggleCoaNode(row.node.id)">
                    <lucide-icon [name]="row.collapsed ? 'chevron-right' : 'chevron-down'" [size]="16" class="cx-coa-chevron"></lucide-icon>
                    <lucide-icon [name]="row.node.icon" [size]="16" class="cx-coa-cat-icon" [attr.data-type]="row.node.key"></lucide-icon>
                    <span class="cx-coa-cat-label">{{ row.node.label }}</span>
                    <span class="cx-coa-cat-count">{{ row.node.count }}</span>
                    <span class="cx-coa-cat-balance tabular-nums">{{ row.node.balance | money:2 }}</span>
                  </div>
                } @else {
                  <div class="cx-coa-node" [style.paddingLeft.px]="16 + row.depth * 22">
                    @if (row.hasChildren) {
                      <button type="button" class="cx-coa-node-toggle" (click)="toggleCoaNode(row.node.id)">
                        <lucide-icon [name]="row.collapsed ? 'chevron-right' : 'chevron-down'" [size]="15"></lucide-icon>
                      </button>
                    } @else {
                      <span class="cx-coa-node-dot"></span>
                    }
                    <span class="cx-acc-code">{{ row.node.account_code }}</span>
                    <span class="cx-coa-node-name">{{ row.node.account_name }}</span>
                    <span class="cx-acc-type-chip" [attr.data-type]="row.node.account_type?.toLowerCase()">{{ row.node.account_type }}</span>
                    <span class="cx-coa-node-ledger">{{ row.node.ledger_type }}</span>
                    <span class="cx-coa-node-balance tabular-nums">{{ (row.node.balance || 0) | money:2 }}</span>
                    <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon cx-coa-node-edit" (click)="openCoaForm(row.node)" title="Edit">
                      <lucide-icon name="pencil" [size]="14"></lucide-icon>
                    </button>
                  </div>
                }
              }
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
                    <th class="cx-acc-right">Debit ({{ settings.currencySymbol() }})</th>
                    <th class="cx-acc-right">Credit ({{ settings.currencySymbol() }})</th>
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
                    <td class="cx-acc-right tabular-nums">{{ trialTotalDebit | money:2 }}</td>
                    <td class="cx-acc-right tabular-nums">{{ trialTotalCredit | money:2 }}</td>
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
                      <td class="cx-acc-date">{{ t.trans_date || (t.created_at | date:'MMM d, y') }}</td>
                      <td><span class="cx-acc-code">{{ t.trans_reference || t.trans_callback || '—' }}</span></td>
                      <td class="cx-acc-desc">{{ t.trans_narration || '—' }}</td>
                      <td class="cx-acc-ledger">
                        <span class="cx-acc-code">{{ t.gl_code }}</span>
                        <span>{{ t.gl_name || '—' }}</span>
                      </td>
                      <td class="cx-acc-right tabular-nums cx-acc-debit">
                        @if (t.trans_type === 'DR') { {{ t.trans_amount | money:2 }} } @else { — }
                      </td>
                      <td class="cx-acc-right tabular-nums cx-acc-credit">
                        @if (t.trans_type === 'CR') { {{ t.trans_amount | money:2 }} } @else { — }
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
    .cx-acc-type-chip[data-type="revenue"], .cx-acc-type-chip[data-type="income"] { background: var(--cx-success-50); color: var(--cx-primary-700); }
    .cx-acc-type-chip[data-type="expense"] { background: var(--cx-accent-50); color: var(--cx-accent-700); }

    /* ═══ Chart of Accounts — collapsible hierarchical tree ═══ */
    .cx-coa-toolbar-actions { display: flex; gap: 6px; margin-left: auto; }
    .cx-coa-tree {
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-lg, 12px);
      background: var(--cx-surface);
      overflow: hidden;
    }
    .cx-coa-cat {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 16px;
      cursor: pointer;
      background: var(--cx-surface-2, var(--cx-stone-50));
      border-top: 1px solid var(--cx-border);
      user-select: none;
      transition: background 120ms;
    }
    .cx-coa-cat:first-child { border-top: none; }
    .cx-coa-cat:hover { background: var(--cx-hover, var(--cx-stone-100)); }
    .cx-coa-chevron { color: var(--cx-text-muted); flex-shrink: 0; }
    .cx-coa-cat-icon { flex-shrink: 0; }
    .cx-coa-cat-icon[data-type="asset"] { color: var(--cx-info); }
    .cx-coa-cat-icon[data-type="liability"] { color: var(--cx-danger); }
    .cx-coa-cat-icon[data-type="equity"] { color: #6d28d9; }
    .cx-coa-cat-icon[data-type="income"] { color: var(--cx-primary-700); }
    .cx-coa-cat-icon[data-type="expense"] { color: var(--cx-accent-700); }
    .cx-coa-cat-label { font-weight: 600; font-size: 14px; color: var(--cx-text); }
    .cx-coa-cat-count {
      font-size: 11px; font-weight: 600; color: var(--cx-text-secondary);
      background: var(--cx-surface); border: 1px solid var(--cx-border);
      border-radius: 999px; padding: 1px 8px;
    }
    .cx-coa-cat-balance { margin-left: auto; font-weight: 600; font-size: 13px; color: var(--cx-text); }
    .cx-coa-node {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 16px;
      border-top: 1px solid var(--cx-border-subtle, var(--cx-border));
      transition: background 120ms;
    }
    .cx-coa-node:hover { background: var(--cx-hover, rgba(0,0,0,0.02)); }
    .cx-coa-node-toggle {
      display: inline-flex; align-items: center; justify-content: center;
      width: 20px; height: 20px; padding: 0; border: none; background: none;
      color: var(--cx-text-muted); cursor: pointer; flex-shrink: 0;
    }
    .cx-coa-node-dot {
      width: 5px; height: 5px; border-radius: 50%;
      background: var(--cx-border-strong, var(--cx-text-muted));
      flex-shrink: 0; margin: 0 7px;
    }
    .cx-coa-node-name { font-size: 13px; color: var(--cx-text); flex: 1; min-width: 0; }
    .cx-coa-node-ledger { font-size: 12px; color: var(--cx-text-muted); white-space: nowrap; }
    .cx-coa-node-balance { font-size: 13px; color: var(--cx-text); min-width: 110px; text-align: right; }
    .cx-coa-node-edit { opacity: 0; transition: opacity 120ms; }
    .cx-coa-node:hover .cx-coa-node-edit { opacity: 1; }
    @media (max-width: 720px) {
      .cx-coa-node-ledger { display: none; }
      .cx-coa-node-edit { opacity: 1; }
    }

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

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService, public settings: SettingsService) {}

  ngOnInit() { this.loadCoa(); }

  setTab(key: string) {
    this.activeTab = key;
    if (key === 'coa') this.loadCoa();
    else if (key === 'trial') this.loadTrial();
    else if (key === 'txns') this.loadTxns();
  }

  // ── Chart of Accounts (collapsible hierarchical tree) ──
  // Top-level categories are the five account types. Under each, accounts nest
  // by their self-referential parent_id; accounts with no (in-set) parent sit
  // directly under their category.
  private readonly coaCategoryMeta: { key: string; label: string; icon: string }[] = [
    { key: 'asset',     label: 'Assets',      icon: 'wallet' },
    { key: 'liability', label: 'Liabilities', icon: 'credit-card' },
    { key: 'equity',    label: 'Equity',      icon: 'landmark' },
    { key: 'income',    label: 'Income',      icon: 'trending-up' },
    { key: 'expense',   label: 'Expenses',    icon: 'trending-down' },
  ];
  coaCollapsed = signal<Set<string>>(new Set());

  loadCoa() {
    this.coaLoading.set(true);
    const params: any = { per_page: 500 };
    if (this.coaSearch) params.search = this.coaSearch;
    this.api.get('/gl-accounts', params).subscribe({
      next: r => { this.coaRows.set(r.data || []); this.coaLoading.set(false); },
      error: () => this.coaLoading.set(false),
    });
  }

  /** Nested tree: category → (parent account → children). */
  coaTree = computed(() => {
    const rows = this.coaRows();
    const nodeById = new Map<string, any>();
    for (const a of rows) nodeById.set(a.id, { ...a, children: [] });

    const rootsByType: Record<string, any[]> = {};
    for (const a of rows) {
      const node = nodeById.get(a.id);
      const parent = a.parent_id ? nodeById.get(a.parent_id) : null;
      if (parent) {
        parent.children.push(node);
      } else {
        const type = (a.account_type || 'other').toLowerCase();
        (rootsByType[type] ||= []).push(node);
      }
    }

    const sortRec = (ns: any[]) => {
      ns.sort((x, y) => String(x.account_code || '').localeCompare(String(y.account_code || '')));
      for (const n of ns) if (n.children.length) sortRec(n.children);
    };

    const cats = [];
    for (const meta of this.coaCategoryMeta) {
      const roots = rootsByType[meta.key] || [];
      if (!roots.length) continue;
      sortRec(roots);
      const total = this.sumBalances(roots);
      cats.push({ ...meta, id: 'cat:' + meta.key, isCategory: true, children: roots, count: this.countNodes(roots), balance: total });
    }
    return cats;
  });

  private sumBalances(ns: any[]): number {
    let t = 0;
    for (const n of ns) { t += Number(n.balance || 0); if (n.children?.length) t += this.sumBalances(n.children); }
    return t;
  }
  private countNodes(ns: any[]): number {
    let c = 0;
    for (const n of ns) { c += 1; if (n.children?.length) c += this.countNodes(n.children); }
    return c;
  }

  /** Flattened visible rows honoring collapse state, for @for rendering. */
  coaVisible = computed(() => {
    const collapsed = this.coaCollapsed();
    const out: any[] = [];
    const walk = (nodes: any[], depth: number) => {
      for (const n of nodes) {
        const hasChildren = !!n.children?.length;
        out.push({ node: n, depth, hasChildren, collapsed: collapsed.has(n.id) });
        if (hasChildren && !collapsed.has(n.id)) walk(n.children, depth + 1);
      }
    };
    walk(this.coaTree(), 0);
    return out;
  });

  toggleCoaNode(id: string): void {
    const next = new Set(this.coaCollapsed());
    next.has(id) ? next.delete(id) : next.add(id);
    this.coaCollapsed.set(next);
  }
  coaExpandAll(): void { this.coaCollapsed.set(new Set()); }
  coaCollapseAll(): void {
    const ids = new Set<string>();
    const collect = (ns: any[]) => { for (const n of ns) { if (n.children?.length || n.isCategory) ids.add(n.id); if (n.children?.length) collect(n.children); } };
    collect(this.coaTree());
    this.coaCollapsed.set(ids);
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
  // Hits the global /journal-entries endpoint which returns every
  // LedgerTransaction across the whole ledger, filtered by date,
  // amount, type etc. The old implementation fetched the first GL
  // account's transactions as a 'sample' — placeholder from early
  // development that got left in. It showed whichever account
  // happened to sort first alphabetically and missed 99% of the
  // actual ledger activity, which is why this tab looked empty.
  loadTxns() {
    this.txnLoading.set(true);
    const params: any = { per_page: 100, sort_by: 'createdAt', sort_dir: 'DESC' };
    if (this.txnSearch) params.search = this.txnSearch;
    if (this.txnFrom) params.date_from = this.txnFrom;
    if (this.txnTo) params.date_to = this.txnTo;
    this.api.get('/journal-entries', params).subscribe({
      next: r => { this.txnRows.set(r.data || []); this.txnLoading.set(false); },
      error: () => { this.txnRows.set([]); this.txnLoading.set(false); },
    });
  }

  onTxnFilter() { clearTimeout(this.txnTimer); this.txnTimer = setTimeout(() => this.loadTxns(), 400); }
}
