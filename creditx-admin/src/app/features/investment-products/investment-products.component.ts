import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { SettingsService } from '../../core/services/settings.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../shared/components/data-table/data-table.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { SearchableSelectDirective } from '../../shared/directives/searchable-select.directive';
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import { PageGuide } from '../../shared/guide/page-guide.model';

/**
 * Investment Products — templates an investment is placed against.
 *
 * Two shapes:
 *   Fixed term — locked for a tenor (90d, 365d, …) at a rate fixed on the day
 *                of placement, with a maturity date and an early-exit penalty.
 *   Open ended — no maturity; the investor can top up and withdraw, and
 *                interest keeps running on the balance.
 *
 * Terms are SNAPSHOTTED onto each investment at placement, so editing a
 * product here never changes money already placed — only new placements.
 *
 * Gated by investments.view (read) + investments.create (write).
 */
const INVESTMENT_PRODUCTS_GUIDE: PageGuide = {
  id: 'investment-products',
  titleKey: 'Investment Products',
  purposeKey: 'The investment offerings — their rate, tenor, payout pattern and tax treatment.',
  descriptionKey:
    'An investment product is the template an investor\'s placement is created from. Fixed-term '
    + 'products run to a maturity date; open-ended ones continue until the investor withdraws. The '
    + 'product also fixes how often interest is paid out and how withholding tax is handled, both of '
    + 'which change what the investor actually receives.',
  actionKeys: [
    'Create a fixed-term or open-ended product',
    'Set the rate, tenor and payout frequency',
    'Set the withholding tax treatment',
    'Deactivate a product no longer offered',
  ],
  dependsOnKeys: ['GL Mappings', 'Tax rates'],
  usedByKeys: ['Investments', 'Investment Accrual'],
  businessRuleKeys: [
    'Investments are a LIABILITY — the placement is the investor\'s money, and the interest is the institution\'s cost of it.',
    'Fixed-term and open-ended behave differently at every stage: maturity, early withdrawal and accrual all follow from this choice.',
    'Withholding tax is deducted from investor interest and remitted; the investor receives the net.',
    'Placements copy their terms at creation, so changing a product never reprices existing investments.',
  ],
  tipKeys: [
    'Be explicit about early-withdrawal treatment before launching a fixed-term product — it is the commonest source of investor dispute.',
  ],
  permissionKeys: ['investments.view'],
};

@Component({
  selector: 'app-investment-products',
  standalone: true,
  imports: [SearchableSelectDirective, CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent, PageGuideComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Investment Products"
        subtitle="Fixed-term and open-ended investment templates — rate, payout, tenor and tax"
        eyebrow="Investments">
        @if (auth.hasPermission('investments.create')) {
          <button class="cx-btn cx-btn-primary" (click)="openForm()">
            <lucide-icon name="plus" [size]="14"></lucide-icon>
            <span>Add Product</span>
          </button>
        }
      </cx-page-header>

      <cx-page-guide [guide]="guide"></cx-page-guide>

      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()"
                     [searchPlaceholder]="''" [hasActions]="true" trackBy="id">
        <ng-template #cellTemplate let-row let-col="column">
          @switch (col.key) {
            @case ('type') {
              <span class="cx-badge" [ngClass]="row.type === 'open_ended' ? 'cx-badge-info' : 'cx-badge-neutral'">
                {{ row.type === 'open_ended' ? 'Open-ended' : 'Fixed term' }}
              </span>
            }
            @case ('interest_rate') { <span class="tabular-nums">{{ pct(row.interest_rate) }}</span> }
            @case ('payout_mode') {
              <span>{{ payoutLabel(row.payout_mode) }}</span>
              @if (row.payout_mode !== 'at_maturity') {
                <span class="cx-ip-sub">{{ row.payout_frequency }}</span>
              }
            }
            @case ('tenor') {
              @if (row.type === 'open_ended') { <span class="cx-ip-muted">No maturity</span> }
              @else { <span class="tabular-nums">{{ tenorLabel(row) }}</span> }
            }
            @case ('wht_rate') { <span class="tabular-nums">{{ pct(row.wht_rate) }}</span> }
            @case ('is_active') {
              <span class="cx-badge" [ngClass]="row.is_active ? 'cx-badge-success' : 'cx-badge-neutral'">
                {{ row.is_active ? 'Active' : 'Inactive' }}
              </span>
            }
            @default { {{ row[col.key] }} }
          }
        </ng-template>
        <ng-template #rowActions let-row>
          @if (auth.hasPermission('investments.create')) {
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)" title="Edit">
              <lucide-icon name="pencil" [size]="14"></lucide-icon>
            </button>
          }
        </ng-template>
      </cx-data-table>
    </div>

    <cx-form-dialog
      [open]="showForm()"
      [title]="editId ? 'Edit Investment Product' : 'Create Investment Product'"
      [subtitle]="editId ? 'Changes apply to NEW placements only — live investments keep their agreed terms' : 'Define a new investment product'"
      [saving]="saving()" maxWidth="760px" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="cx-form-stack">
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Name *</label><input class="cx-input" [(ngModel)]="form.name" placeholder="e.g. 90-Day Fixed Deposit" /></div>
          <div><label class="cx-label">Code *</label><input class="cx-input" [(ngModel)]="form.code" placeholder="e.g. FD90" /></div>
        </div>
        <div><label class="cx-label">Description</label><input class="cx-input" [(ngModel)]="form.description" placeholder="Short product description" /></div>

        <h4 class="cx-form-section-title">Shape &amp; Interest</h4>
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Type *</label>
            <select class="cx-select" [(ngModel)]="form.type" (ngModelChange)="onTypeChange()">
              <option value="fixed_term">Fixed term (has a maturity date)</option>
              <option value="open_ended">Open ended (no maturity)</option>
            </select>
            <div class="cx-field-hint">
              @if (form.type === 'open_ended') {
                Runs until the investor withdraws or closes it. Top-ups can be allowed.
              } @else {
                Locked for a set tenor (e.g. 90 or 365 days) at the rate agreed on placement.
              }
            </div>
          </div>
          <div>
            <label class="cx-label">Annual Rate (fraction) *</label>
            <input class="cx-input" type="number" step="0.000001" min="0" max="1" [(ngModel)]="form.interest_rate" placeholder="e.g. 0.12" />
            <div class="cx-field-hint">Enter as a fraction: 0.12 = 12% p.a.</div>
          </div>
        </div>

        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Payout Mode *</label>
            <select class="cx-select" [(ngModel)]="form.payout_mode">
              @if (form.type === 'fixed_term') {
                <option value="at_maturity">At maturity (lump sum)</option>
              }
              <option value="periodic">Periodic payout (income)</option>
              <option value="compounded">Compounded (rolls up)</option>
            </select>
            @if (form.type === 'open_ended') {
              <div class="cx-field-hint">Open-ended has no maturity, so "at maturity" is not available.</div>
            }
          </div>
          <div>
            <label class="cx-label">Payout / Compounding Frequency</label>
            <select class="cx-select" [(ngModel)]="form.payout_frequency" [disabled]="form.payout_mode === 'at_maturity'">
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
            </select>
          </div>
        </div>

        @if (form.type === 'fixed_term') {
          <h4 class="cx-form-section-title">Tenor</h4>
          <div class="cx-form-row cx-form-row-2">
            <div>
              <label class="cx-label">Min Tenor (days)</label>
              <input class="cx-input" type="number" min="1" step="1" [(ngModel)]="form.min_tenor_days" placeholder="e.g. 90" />
            </div>
            <div>
              <label class="cx-label">Max Tenor (days)</label>
              <input class="cx-input" type="number" min="1" step="1" [(ngModel)]="form.max_tenor_days" placeholder="e.g. 365" />
            </div>
          </div>
          <div class="cx-field-hint">Leave blank for no bound. The exact tenor is chosen per placement.</div>
        }

        <h4 class="cx-form-section-title">Money &amp; Tax</h4>
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Minimum Amount ({{ settings.currencySymbol() }})</label>
            <input class="cx-input" type="number" min="0" step="0.01" [(ngModel)]="form.min_amount" />
          </div>
          <div>
            <label class="cx-label">Withholding Tax (fraction)</label>
            <input class="cx-input" type="number" step="0.000001" min="0" max="1" [(ngModel)]="form.wht_rate" />
            <div class="cx-field-hint">Deducted whenever interest is credited. Nigeria: 0.1 = 10%.</div>
          </div>
        </div>

        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Day-count Basis</label>
            <select class="cx-select" [(ngModel)]="form.day_count_basis">
              <option [ngValue]="365">365 (actual)</option>
              <option [ngValue]="360">360</option>
            </select>
          </div>
          @if (form.type === 'fixed_term') {
            <div>
              <label class="cx-label">Early Liquidation Penalty (fraction)</label>
              <input class="cx-input" type="number" step="0.000001" min="0" max="1" [(ngModel)]="form.early_liquidation_penalty_rate" />
              <div class="cx-field-hint">Share of unsettled interest forfeited on early exit. Principal is never forfeited.</div>
            </div>
          } @else {
            <div>
              <label class="cx-label">Allow Top-ups</label>
              <select class="cx-select" [(ngModel)]="form.top_up_allowed">
                <option [ngValue]="true">Yes</option>
                <option [ngValue]="false">No</option>
              </select>
            </div>
          }
        </div>

        <div class="cx-form-row cx-form-row-2">
          @if (form.type === 'fixed_term') {
            <div>
              <label class="cx-label">Auto-rollover at Maturity</label>
              <select class="cx-select" [(ngModel)]="form.auto_rollover">
                <option [ngValue]="false">No</option>
                <option [ngValue]="true">Yes</option>
              </select>
            </div>
          }
          <div>
            <label class="cx-label">Active</label>
            <select class="cx-select" [(ngModel)]="form.is_active">
              <option [ngValue]="true">Yes</option>
              <option [ngValue]="false">No</option>
            </select>
          </div>
        </div>
      </div>
    </cx-form-dialog>
  `,
  styles: [`
    .cx-ip-sub { display: block; font-size: 11px; color: var(--cx-text-muted); text-transform: capitalize; }
    .cx-ip-muted { color: var(--cx-text-muted); }
  `],
})
export class InvestmentProductsComponent implements OnInit {
  readonly guide = INVESTMENT_PRODUCTS_GUIDE;

  columns: TableColumn[] = [
    { key: 'name', label: 'Product' },
    { key: 'code', label: 'Code' },
    { key: 'type', label: 'Type', type: 'custom' },
    { key: 'interest_rate', label: 'Rate', type: 'custom', align: 'right' },
    { key: 'payout_mode', label: 'Payout', type: 'custom' },
    { key: 'tenor', label: 'Tenor', type: 'custom' },
    { key: 'wht_rate', label: 'WHT', type: 'custom', align: 'right' },
    { key: 'is_active', label: 'Status', type: 'custom' },
  ];

  rows = signal<any[]>([]);
  loading = signal(true);
  showForm = signal(false);
  saving = signal(false);
  editId: string | null = null;
  form: any = {};

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService, public settings: SettingsService) {}

  ngOnInit() { this.load(); }

  pct(v: string): string {
    const n = parseFloat(v || '0');
    if (!n) return '—';
    return (n * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
  }
  payoutLabel(v: string): string {
    return ({ at_maturity: 'At maturity', periodic: 'Periodic', compounded: 'Compounded' } as any)[v] ?? v;
  }
  tenorLabel(row: any): string {
    const min = row.min_tenor_days, max = row.max_tenor_days;
    if (min && max) return min === max ? `${min}d` : `${min}–${max}d`;
    if (min) return `≥ ${min}d`;
    if (max) return `≤ ${max}d`;
    return 'Any';
  }

  load() {
    this.loading.set(true);
    this.api.get('/investments/products').subscribe({
      next: r => { this.rows.set(r.data || []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  /** Open-ended cannot pay at maturity — keep the form consistent with the API. */
  onTypeChange() {
    if (this.form.type === 'open_ended' && this.form.payout_mode === 'at_maturity') {
      this.form.payout_mode = 'compounded';
    }
    if (this.form.type === 'fixed_term') {
      this.form.top_up_allowed = false;
    } else {
      this.form.min_tenor_days = null;
      this.form.max_tenor_days = null;
      this.form.auto_rollover = false;
    }
  }

  openForm(row?: any) {
    if (row) {
      this.editId = row.id;
      this.form = {
        name: row.name, code: row.code, description: row.description || '',
        type: row.type, interest_rate: row.interest_rate,
        payout_mode: row.payout_mode, payout_frequency: row.payout_frequency,
        min_tenor_days: row.min_tenor_days, max_tenor_days: row.max_tenor_days,
        min_amount: row.min_amount, top_up_allowed: !!row.top_up_allowed,
        early_liquidation_penalty_rate: row.early_liquidation_penalty_rate,
        wht_rate: row.wht_rate, day_count_basis: row.day_count_basis,
        auto_rollover: !!row.auto_rollover, is_active: !!row.is_active,
      };
    } else {
      this.editId = null;
      this.form = {
        name: '', code: '', description: '',
        type: 'fixed_term', interest_rate: '',
        payout_mode: 'at_maturity', payout_frequency: 'monthly',
        min_tenor_days: null, max_tenor_days: null,
        min_amount: '0', top_up_allowed: false,
        early_liquidation_penalty_rate: '0', wht_rate: '0.1',
        day_count_basis: 365, auto_rollover: false, is_active: true,
      };
    }
    this.showForm.set(true);
  }

  saveForm() {
    if (!this.form.name || !this.form.code) { this.toast.error('Name and code are required.'); return; }
    if (!this.form.interest_rate) { this.toast.error('An annual rate is required.'); return; }

    this.saving.set(true);
    const p = { ...this.form };
    // Blank tenor inputs come through as '' — send null so the API treats them as "no bound".
    p.min_tenor_days = p.min_tenor_days === '' ? null : p.min_tenor_days;
    p.max_tenor_days = p.max_tenor_days === '' ? null : p.max_tenor_days;

    (this.editId
      ? this.api.put('/investments/products/' + this.editId, p)
      : this.api.post('/investments/products', p)
    ).subscribe({
      next: r => { this.saving.set(false); this.toast.success(r.message || 'Saved'); this.showForm.set(false); this.load(); },
      error: e => {
        this.saving.set(false);
        const errs = e.error?.errors;
        this.toast.error(errs ? Object.values(errs)[0] as string : (e.error?.message || 'Failed'));
      },
    });
  }
}
