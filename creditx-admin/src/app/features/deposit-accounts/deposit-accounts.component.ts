import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { SettingsService } from '../../core/services/settings.service';
import { SearchableSelectDirective } from '../../shared/directives/searchable-select.directive';

/**
 * Deposit Accounts — the subsidiary ledger behind the CUSTDEP control GL.
 * Lists accounts (filterable by status / product), opens new accounts, and
 * links each row to the statement/detail view.
 *
 * Gated by deposits.view (menu) + deposits.transact (open account).
 */
@Component({
  selector: 'app-deposit-accounts',
  standalone: true,
  imports: [SearchableSelectDirective, CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent, MoneyPipe],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Deposit Accounts"
        subtitle="Customer savings accounts — the subsidiary ledger behind Customer Deposits"
        eyebrow="Deposits">
        @if (auth.hasPermission('deposits.transact')) {
          <button class="cx-btn cx-btn-primary" (click)="openAccountDialog()">
            <lucide-icon name="plus" [size]="14"></lucide-icon>
            <span>Open Account</span>
          </button>
        }
      </cx-page-header>

      <!-- Filter bar -->
      <div class="cx-da-filters">
        <div class="cx-da-filter-group">
          <label class="cx-da-filter-label">Status</label>
          <select class="cx-input cx-da-filter-input" [(ngModel)]="filters.status" (change)="applyFilters()">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="dormant">Dormant</option>
            <option value="frozen">Frozen</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div class="cx-da-filter-group">
          <label class="cx-da-filter-label">Product</label>
          <select class="cx-input cx-da-filter-input" [(ngModel)]="filters.product_id" (change)="applyFilters()">
            <option value="">All products</option>
            @for (p of products(); track p.id) {
              <option [value]="p.id">{{ p.name }} ({{ p.code }})</option>
            }
          </select>
        </div>
        <div class="cx-da-filter-actions">
          @if (filters.status || filters.product_id) {
            <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="clearFilters()">
              <lucide-icon name="x" [size]="12"></lucide-icon>
              <span>Clear</span>
            </button>
          }
        </div>
      </div>

      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
                     searchPlaceholder="Search account number..." [hasActions]="true" trackBy="id" (query)="onQuery($event)">
        <ng-template #cellTemplate let-row let-col="column">
          @if (col.key === 'status') {
            <span class="cx-badge" [ngClass]="statusClass(row.status)">{{ statusLabel(row.status) }}</span>
          } @else if (col.key === 'balance') {
            <span class="tabular-nums">{{ row.balance | money:2 }}</span>
          } @else {
            {{ row[col.key] }}
          }
        </ng-template>
        <ng-template #rowActions let-row>
          <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="open(row)" title="View statement">
            <lucide-icon name="eye" [size]="14"></lucide-icon>
          </button>
        </ng-template>
      </cx-data-table>
    </div>

    <!-- Open account dialog -->
    <cx-form-dialog
      [open]="showOpen()"
      title="Open Deposit Account"
      subtitle="Create a savings account for a customer"
      saveLabel="Open Account"
      [saving]="saving()" maxWidth="640px" (close)="showOpen.set(false)" (save)="submitOpen()">
      <div class="cx-form-stack">
        <div>
          <label class="cx-label">Customer *</label>
          <input class="cx-input" [(ngModel)]="customerSearch" (ngModelChange)="onCustomerSearch($event)"
                 [placeholder]="openForm.customer_name || 'Search customer by name...'" />
          @if (customerResults().length > 0) {
            <div class="cx-da-typeahead">
              @for (c of customerResults(); track c.id) {
                <button type="button" class="cx-da-typeahead-item" (click)="pickCustomer(c)">
                  {{ c.full_name }}
                  @if (c.staff_id) { <span class="cx-da-typeahead-sub">· {{ c.staff_id }}</span> }
                </button>
              }
            </div>
          }
          @if (openForm.customer_id) {
            <div class="cx-field-hint">Selected: <strong>{{ openForm.customer_name }}</strong></div>
          }
        </div>
        <div>
          <label class="cx-label">Product *</label>
          <select class="cx-select" [(ngModel)]="openForm.product_id" (ngModelChange)="onProductPick($event)">
            <option value="">Select product…</option>
            @for (p of products(); track p.id) {
              <option [value]="p.id">{{ p.name }} ({{ p.code }})</option>
            }
          </select>
          @if (selectedProduct()) {
            <div class="cx-field-hint">
              Min opening: {{ selectedProduct().min_opening_balance | money:2 }}
              · Min balance: {{ selectedProduct().min_balance | money:2 }}
            </div>
          }
        </div>
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Opening Deposit ({{ settings.currencySymbol() }})</label>
            <input class="cx-input" type="number" min="0" step="0.01" [(ngModel)]="openForm.opening_deposit" />
          </div>
          <div>
            <label class="cx-label">Posting Date</label>
            <input class="cx-input" type="date" [(ngModel)]="openForm.posting_date" />
          </div>
        </div>
      </div>
    </cx-form-dialog>
  `,
  styles: [`
    .cx-da-filters {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px; padding: 14px 16px;
      background: var(--cx-surface-2, #f5f5f4);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl, 12px);
      margin-bottom: 14px;
    }
    .cx-da-filter-group { display: flex; flex-direction: column; gap: 4px; }
    .cx-da-filter-label {
      font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--cx-text-muted);
    }
    .cx-da-filter-input { font-size: 13px; padding: 6px 10px; }
    .cx-da-filter-actions { display: flex; align-items: flex-end; gap: 6px; }

    .cx-da-typeahead {
      margin-top: 4px; border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md); overflow: hidden;
      max-height: 220px; overflow-y: auto; background: var(--cx-surface);
    }
    .cx-da-typeahead-item {
      display: block; width: 100%; text-align: left;
      padding: 8px 12px; font-size: 13px; background: transparent;
      border: none; border-bottom: 1px solid var(--cx-border-subtle);
      cursor: pointer; color: var(--cx-text);
    }
    .cx-da-typeahead-item:last-child { border-bottom: none; }
    .cx-da-typeahead-item:hover { background: var(--cx-surface-hover); }
    .cx-da-typeahead-sub { color: var(--cx-text-muted); font-size: 12px; }
  `],
})
export class DepositAccountsComponent implements OnInit {
  private router = inject(Router);

  columns: TableColumn[] = [
    { key: 'account_number', label: 'Account #' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'product_code', label: 'Product' },
    { key: 'balance', label: 'Balance', type: 'custom', align: 'right' },
    { key: 'status', label: 'Status', type: 'custom' },
    { key: 'opened_date', label: 'Opened', type: 'date' },
  ];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination | null>(null);
  products = signal<any[]>([]);
  q: any = {};
  filters = { status: '', product_id: '' };

  // Open-account dialog
  showOpen = signal(false); saving = signal(false);
  openForm: any = this.blankOpen();
  customerSearch = '';
  customerResults = signal<any[]>([]);
  selectedProduct = signal<any>(null);
  private searchTimer: any;

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService, public settings: SettingsService) {}

  ngOnInit() {
    this.load();
    this.api.get('/deposits/products', { per_page: 200 }).subscribe({ next: r => this.products.set(r.data || []) });
  }

  statusLabel(s: string): string {
    return { active: 'Active', dormant: 'Dormant', frozen: 'Frozen', closed: 'Closed' }[s] ?? s;
  }
  statusClass(s: string): string {
    return { active: 'cx-badge-success', dormant: 'cx-badge-warning', frozen: 'cx-badge-danger', closed: 'cx-badge-neutral' }[s] ?? 'cx-badge-neutral';
  }

  load(p?: any) {
    this.loading.set(true);
    const params: any = { ...this.q, ...p };
    if (this.filters.status) params.status = this.filters.status;
    if (this.filters.product_id) params.product_id = this.filters.product_id;
    this.api.get('/deposits/accounts', params).subscribe({
      next: r => { this.rows.set(r.data || []); this.pagination.set(r.meta || null); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
  onQuery(e: TableQueryEvent) { this.q = e; this.load(e); }
  applyFilters() { this.load({ page: 1, per_page: this.pagination()?.per_page ?? 20 }); }
  clearFilters() { this.filters = { status: '', product_id: '' }; this.applyFilters(); }

  open(row: any) { this.router.navigate(['/deposit-accounts', row.id]); }

  // ─── Open-account dialog ───────────────────────────────────────────
  private blankOpen() {
    return {
      customer_id: '', customer_name: '', product_id: '',
      opening_deposit: '0', posting_date: new Date().toISOString().slice(0, 10),
    };
  }

  openAccountDialog() {
    this.openForm = this.blankOpen();
    this.customerSearch = '';
    this.customerResults.set([]);
    this.selectedProduct.set(null);
    this.showOpen.set(true);
  }

  onCustomerSearch(term: string) {
    this.openForm.customer_id = '';
    this.openForm.customer_name = '';
    clearTimeout(this.searchTimer);
    if (!term || term.trim().length < 2) { this.customerResults.set([]); return; }
    this.searchTimer = setTimeout(() => {
      this.api.get('/customers', { search: term.trim(), per_page: 10 }).subscribe({
        next: r => this.customerResults.set(r.data || []),
      });
    }, 350);
  }

  pickCustomer(c: any) {
    this.openForm.customer_id = c.id;
    this.openForm.customer_name = c.full_name;
    this.customerSearch = c.full_name;
    this.customerResults.set([]);
  }

  onProductPick(id: string) {
    this.selectedProduct.set(this.products().find(p => p.id === id) ?? null);
  }

  submitOpen() {
    if (!this.openForm.customer_id) { this.toast.error('Select a customer'); return; }
    if (!this.openForm.product_id) { this.toast.error('Select a product'); return; }
    this.saving.set(true);
    this.api.post('/deposits/accounts', {
      customer_id: this.openForm.customer_id,
      product_id: this.openForm.product_id,
      opening_deposit: this.openForm.opening_deposit || '0',
      posting_date: this.openForm.posting_date,
    }).subscribe({
      next: r => { this.saving.set(false); this.toast.success(r.message || 'Account opened'); this.showOpen.set(false); this.load(this.q); },
      error: e => { this.saving.set(false); this.toast.error(e.error?.message || 'Failed to open account'); },
    });
  }
}
