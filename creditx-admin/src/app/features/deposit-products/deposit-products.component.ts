import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { SettingsService } from '../../core/services/settings.service';
import { SearchableSelectDirective } from '../../shared/directives/searchable-select.directive';

/**
 * Deposit Products — CRUD for the templates a deposit account is opened
 * against. Mirrors the loan-products page. The two per-product knobs the
 * business asked for live here:
 *   - interest_method   (none / min_balance_monthly / daily_balance_monthly)
 *   - withdrawal_policy  (strict_min_balance / block_overdraw / allow_overdraw)
 *
 * Gated by deposits.view (menu) + deposits.create (write) at the backend.
 */
@Component({
  selector: 'app-deposit-products',
  standalone: true,
  imports: [SearchableSelectDirective, CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Deposit Products"
        subtitle="Configure savings products — interest accrual method, withdrawal policy, and balance floors"
        eyebrow="Deposits">
        @if (auth.hasPermission('deposits.create')) {
          <button class="cx-btn cx-btn-primary" (click)="openForm()">
            <lucide-icon name="plus" [size]="14"></lucide-icon>
            <span>Add Product</span>
          </button>
        }
      </cx-page-header>

      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
                     searchPlaceholder="Search products..." [hasActions]="true" (query)="onQuery($event)">
        <ng-template #cellTemplate let-row let-col="column">
          @if (col.key === 'interest_method') {
            {{ interestMethodLabel(row.interest_method) }}
          } @else if (col.key === 'withdrawal_policy') {
            {{ withdrawalPolicyLabel(row.withdrawal_policy) }}
          } @else if (col.key === 'interest_rate') {
            <span class="tabular-nums">{{ ratePercent(row.interest_rate) }}</span>
          } @else if (col.key === 'is_active') {
            <span class="cx-badge" [ngClass]="row.is_active ? 'cx-badge-success' : 'cx-badge-neutral'">
              {{ row.is_active ? 'Active' : 'Inactive' }}
            </span>
          } @else {
            {{ row[col.key] }}
          }
        </ng-template>
        <ng-template #rowActions let-row>
          @if (auth.hasPermission('deposits.create')) {
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)" title="Edit">
              <lucide-icon name="pencil" [size]="14"></lucide-icon>
            </button>
          }
        </ng-template>
      </cx-data-table>
    </div>

    <cx-form-dialog
      [open]="showForm()"
      [title]="editId ? 'Edit Deposit Product' : 'Create Deposit Product'"
      [subtitle]="editId ? 'Update deposit product configuration' : 'Define a new deposit product'"
      [saving]="saving()" maxWidth="720px" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="cx-form-stack">
        <!-- Identity -->
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Name *</label><input class="cx-input" [(ngModel)]="form.name" placeholder="e.g. Regular Savings" /></div>
          <div><label class="cx-label">Code *</label><input class="cx-input" [(ngModel)]="form.code" placeholder="e.g. SAV" /></div>
        </div>
        <div><label class="cx-label">Description</label><input class="cx-input" [(ngModel)]="form.description" placeholder="Short product description" /></div>

        <!-- Interest -->
        <h4 class="cx-form-section-title">Interest</h4>
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Accrual Method *</label>
            <select class="cx-select" [(ngModel)]="form.interest_method">
              <option value="none">None (no interest)</option>
              <option value="min_balance_monthly">Minimum Balance (Monthly)</option>
              <option value="daily_balance_monthly">Daily Balance (Monthly)</option>
            </select>
          </div>
          <div>
            <label class="cx-label">Annual Rate (fraction)</label>
            <input class="cx-input" type="number" step="0.000001" min="0" max="1"
                   [(ngModel)]="form.interest_rate" placeholder="e.g. 0.04"
                   [disabled]="form.interest_method === 'none'" />
            <div class="cx-field-hint">Enter as a fraction: 0.04 = 4% p.a.</div>
          </div>
        </div>

        <!-- Withdrawal -->
        <h4 class="cx-form-section-title">Withdrawal & Balances</h4>
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Withdrawal Policy *</label>
            <select class="cx-select" [(ngModel)]="form.withdrawal_policy">
              <option value="strict_min_balance">Enforce Minimum Balance</option>
              <option value="block_overdraw">Block Overdraw (allow to zero)</option>
              <option value="allow_overdraw">Allow Overdraw (negative balance)</option>
            </select>
            <div class="cx-field-hint">
              @if (form.withdrawal_policy === 'strict_min_balance') {
                Balance may never drop below the minimum below
              } @else if (form.withdrawal_policy === 'block_overdraw') {
                Withdrawals allowed down to zero; cannot go negative
              } @else {
                Withdrawals may take the balance negative
              }
            </div>
          </div>
          <div>
            <label class="cx-label">Dormancy (days)</label>
            <input class="cx-input" type="number" min="0" step="1" [(ngModel)]="form.dormancy_days" />
            <div class="cx-field-hint">Inactivity before an account is flagged dormant</div>
          </div>
        </div>
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Min Balance ({{ settings.currencySymbol() }})</label>
            <input class="cx-input" type="number" min="0" step="0.01" [(ngModel)]="form.min_balance" />
            <div class="cx-field-hint">Must remain after a withdrawal under "Enforce Minimum Balance"</div>
          </div>
          <div>
            <label class="cx-label">Min Opening Balance ({{ settings.currencySymbol() }})</label>
            <input class="cx-input" type="number" min="0" step="0.01" [(ngModel)]="form.min_opening_balance" />
          </div>
        </div>

        <div>
          <label class="cx-label">Active</label>
          <select class="cx-select" [(ngModel)]="form.is_active">
            <option [ngValue]="true">Yes</option>
            <option [ngValue]="false">No</option>
          </select>
        </div>
      </div>
    </cx-form-dialog>
  `,
})
export class DepositProductsComponent implements OnInit {
  columns: TableColumn[] = [
    { key: 'name', label: 'Product Name' },
    { key: 'code', label: 'Code' },
    { key: 'interest_method', label: 'Interest', type: 'custom' },
    { key: 'interest_rate', label: 'Rate', type: 'custom', align: 'right' },
    { key: 'withdrawal_policy', label: 'Withdrawal', type: 'custom' },
    { key: 'min_balance', label: 'Min Balance', type: 'currency', align: 'right' },
    { key: 'is_active', label: 'Status', type: 'custom' },
  ];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination | null>(null);
  showForm = signal(false); saving = signal(false); editId: string | null = null; form: any = {}; q: any = {};

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService, public settings: SettingsService) {}

  ngOnInit() { this.load(); }

  interestMethodLabel(v: string): string {
    return { none: 'None', min_balance_monthly: 'Min Balance', daily_balance_monthly: 'Daily Balance' }[v] ?? v;
  }
  withdrawalPolicyLabel(v: string): string {
    return { strict_min_balance: 'Min Balance', block_overdraw: 'Block Overdraw', allow_overdraw: 'Allow Overdraw' }[v] ?? v;
  }
  ratePercent(rate: string): string {
    const n = parseFloat(rate || '0');
    if (!n) return '—';
    return (n * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
  }

  load(p?: any) {
    this.loading.set(true);
    this.api.get('/deposits/products', { ...this.q, ...p }).subscribe({
      next: r => { this.rows.set(r.data || []); this.pagination.set(r.meta || null); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
  onQuery(e: TableQueryEvent) { this.q = e; this.load(e); }

  openForm(row?: any) {
    if (row) {
      this.editId = row.id;
      this.form = {
        name: row.name, code: row.code, description: row.description,
        interest_method: row.interest_method, interest_rate: row.interest_rate,
        withdrawal_policy: row.withdrawal_policy, min_balance: row.min_balance,
        min_opening_balance: row.min_opening_balance, dormancy_days: row.dormancy_days,
        is_active: row.is_active,
      };
    } else {
      this.editId = null;
      this.form = {
        name: '', code: '', description: '',
        interest_method: 'none', interest_rate: '',
        withdrawal_policy: 'block_overdraw', min_balance: '0',
        min_opening_balance: '0', dormancy_days: 180, is_active: true,
      };
    }
    this.showForm.set(true);
  }

  saveForm() {
    this.saving.set(true);
    const p = { ...this.form };
    if (p.interest_method === 'none') p.interest_rate = '0';
    (this.editId ? this.api.put('/deposits/products/' + this.editId, p) : this.api.post('/deposits/products', p)).subscribe({
      next: r => { this.saving.set(false); this.toast.success(r.message || 'Saved'); this.showForm.set(false); this.load(this.q); },
      error: e => { this.saving.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }
}
