import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { SettingsService } from '../../core/services/settings.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { CxViewDialogComponent } from '../../shared/components/view-dialog/view-dialog.component';
import { SearchableSelectDirective } from '../../shared/directives/searchable-select.directive';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

/**
 * Investments — place, service, and settle investor money.
 *
 * Fixed-term investments run to a maturity date and are matured (or liquidated
 * early, with a penalty). Open-ended investments have no maturity: the investor
 * tops up and withdraws freely, and closing pays the balance out with no
 * penalty. Interest always accrues to the actual day of any exit.
 *
 * Gated by investments.view (read) + investments.transact (money movements).
 */
@Component({
  selector: 'app-investments',
  standalone: true,
  imports: [
    SearchableSelectDirective, CommonModule, FormsModule, LucideAngularModule, MoneyPipe,
    PageHeaderComponent, DataTableComponent, FormDialogComponent, CxViewDialogComponent,
  ],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Investments"
        subtitle="Fixed-term and open-ended investor placements, with performance and settlement"
        eyebrow="Investments">
        @if (auth.hasPermission('investments.transact')) {
          <button class="cx-btn cx-btn-primary" (click)="openPlace()">
            <lucide-icon name="plus" [size]="14"></lucide-icon>
            <span>Place Investment</span>
          </button>
        }
      </cx-page-header>

      <div class="cx-inv-filters">
        <select class="cx-select" [(ngModel)]="filters.status" (change)="applyFilters()" aria-label="Status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="matured">Matured</option>
          <option value="liquidated">Liquidated</option>
          <option value="closed">Closed</option>
          <option value="rolled_over">Rolled over</option>
        </select>
        <select class="cx-select" [(ngModel)]="filters.type" (change)="applyFilters()" aria-label="Type">
          <option value="">All types</option>
          <option value="fixed_term">Fixed term</option>
          <option value="open_ended">Open ended</option>
        </select>
        <select class="cx-select" [(ngModel)]="filters.product_id" (change)="applyFilters()" aria-label="Product">
          <option value="">All products</option>
          @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
        </select>
        @if (activeFilters()) {
          <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="clearFilters()">
            <lucide-icon name="x" [size]="14"></lucide-icon><span>Clear</span>
          </button>
        }
      </div>

      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
                     searchPlaceholder="Search by investment number or investor…" [hasActions]="true"
                     trackBy="id" (query)="onQuery($event)">
        <ng-template #cellTemplate let-row let-col="column">
          @switch (col.key) {
            @case ('type') {
              <span class="cx-badge" [ngClass]="row.type === 'open_ended' ? 'cx-badge-info' : 'cx-badge-neutral'">
                {{ row.type === 'open_ended' ? 'Open-ended' : 'Fixed' }}
              </span>
            }
            @case ('principal') { <span class="tabular-nums">{{ row.principal | money:2 }}</span> }
            @case ('current_value') { <span class="tabular-nums cx-inv-strong">{{ row.current_value | money:2 }}</span> }
            @case ('interest_rate') { <span class="tabular-nums">{{ pct(row.interest_rate) }}</span> }
            @case ('maturity_date') {
              @if (row.maturity_date) {
                <span>{{ row.maturity_date }}</span>
                @if (row.status === 'active' && isDue(row)) { <span class="cx-inv-due">due</span> }
              } @else { <span class="cx-inv-muted">—</span> }
            }
            @case ('status') {
              <span class="cx-badge" [ngClass]="statusClass(row.status)">{{ statusLabel(row.status) }}</span>
            }
            @default { {{ row[col.key] }} }
          }
        </ng-template>
        <ng-template #rowActions let-row>
          <div class="flex items-center gap-1 justify-end">
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openDetail(row)" title="View performance & statement">
              <lucide-icon name="eye" [size]="15"></lucide-icon>
            </button>
            @if (row.status === 'active' && auth.hasPermission('investments.transact')) {
              @if (row.type === 'open_ended') {
                <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openMove(row, 'top-up')" title="Top up">
                  <lucide-icon name="plus-circle" [size]="15"></lucide-icon>
                </button>
                <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openMove(row, 'withdraw')" title="Withdraw">
                  <lucide-icon name="arrow-down-circle" [size]="15"></lucide-icon>
                </button>
                <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openSettle(row, 'close')" title="Close investment">
                  <lucide-icon name="lock" [size]="15"></lucide-icon>
                </button>
              } @else {
                <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openSettle(row, 'mature')" title="Mature & settle">
                  <lucide-icon name="badge-check" [size]="15"></lucide-icon>
                </button>
                <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openSettle(row, 'liquidate')" title="Liquidate early">
                  <lucide-icon name="undo-2" [size]="15"></lucide-icon>
                </button>
              }
            }
          </div>
        </ng-template>
      </cx-data-table>
    </div>

    <!-- Place -->
    <cx-form-dialog [open]="showPlace()" title="Place Investment"
      subtitle="Terms are locked onto this investment at placement — later product edits will not change them"
      [saving]="saving()" maxWidth="720px" (close)="showPlace.set(false)" (save)="submitPlace()">
      <div class="cx-form-stack">
        <div>
          <label class="cx-label">Investor *</label>
          <input class="cx-input" [(ngModel)]="customerSearch" (ngModelChange)="onCustomerSearch($event)"
                 [placeholder]="place.customer_name || 'Search customer by name…'" />
          @if (customerResults().length) {
            <div class="cx-inv-typeahead">
              @for (c of customerResults(); track c.id) {
                <button type="button" class="cx-inv-typeahead-item" (click)="pickCustomer(c)">{{ c.full_name }}</button>
              }
            </div>
          }
          @if (place.customer_id) { <div class="cx-field-hint">Selected: <strong>{{ place.customer_name }}</strong></div> }
        </div>

        <div>
          <label class="cx-label">Product *</label>
          <select class="cx-select" [(ngModel)]="place.product_id" (ngModelChange)="onProductPick($event)">
            <option value="">Select product…</option>
            @for (p of activeProducts(); track p.id) { <option [value]="p.id">{{ p.name }} ({{ p.code }})</option> }
          </select>
          @if (selectedProduct(); as sp) {
            <div class="cx-field-hint">
              {{ sp.type === 'open_ended' ? 'Open-ended — no maturity' : 'Fixed term' }}
              · {{ pct(sp.interest_rate) }} p.a. · {{ payoutLabel(sp.payout_mode) }}
              · WHT {{ pct(sp.wht_rate) }} · min {{ sp.min_amount | money:2 }}
            </div>
          }
        </div>

        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Amount ({{ settings.currencySymbol() }}) *</label>
            <input class="cx-input" type="number" min="0" step="0.01" [(ngModel)]="place.amount" />
          </div>
          @if (selectedProduct()?.type === 'fixed_term') {
            <div>
              <label class="cx-label">Tenor (days) *</label>
              <input class="cx-input" type="number" min="1" step="1" [(ngModel)]="place.tenor_days" placeholder="e.g. 90" />
              <div class="cx-field-hint">{{ tenorHint() }}</div>
            </div>
          } @else {
            <div>
              <label class="cx-label">Tenor</label>
              <input class="cx-input" value="No maturity — runs until closed" disabled />
            </div>
          }
        </div>

        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Settlement Account *</label>
            <select class="cx-select" [(ngModel)]="place.settlement_gl_id">
              <option value="">Select bank/cash account…</option>
              @for (g of settlementAccounts(); track g.id) { <option [value]="g.id">{{ g.account_code }} — {{ g.account_name }}</option> }
            </select>
            <div class="cx-field-hint">Where the investor's funds arrive.</div>
          </div>
          <div>
            <label class="cx-label">Placement Date</label>
            <input class="cx-input" type="date" [(ngModel)]="place.placement_date" />
          </div>
        </div>

        @if (projection(); as p) {
          <div class="cx-inv-projection">
            <lucide-icon name="trending-up" [size]="15"></lucide-icon>
            <div>
              <strong>Projected at maturity:</strong>
              gross {{ p.gross | money:2 }} · WHT {{ p.wht | money:2 }} · net interest {{ p.net | money:2 }}
              → investor receives <strong>{{ p.total | money:2 }}</strong>
              <div class="cx-inv-projection-note">Indicative, based on the tenor and rate entered above.</div>
            </div>
          </div>
        }
      </div>
    </cx-form-dialog>

    <!-- Top-up / Withdraw -->
    <cx-form-dialog [open]="showMove()" [title]="moveMode === 'top-up' ? 'Top Up Investment' : 'Withdraw from Investment'"
      [subtitle]="moveTarget()?.investment_number || ''"
      [saving]="saving()" maxWidth="560px" (close)="showMove.set(false)" (save)="submitMove()">
      <div class="cx-form-stack">
        @if (moveTarget(); as t) {
          <div class="cx-inv-context">
            <span>Current balance</span><strong class="tabular-nums">{{ t.balance | money:2 }}</strong>
          </div>
        }
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Amount ({{ settings.currencySymbol() }}) *</label>
            <input class="cx-input" type="number" min="0" step="0.01" [(ngModel)]="move.amount" />
          </div>
          <div>
            <label class="cx-label">Value Date</label>
            <input class="cx-input" type="date" [(ngModel)]="move.value_date" />
          </div>
        </div>
        <div>
          <label class="cx-label">Settlement Account *</label>
          <select class="cx-select" [(ngModel)]="move.settlement_gl_id">
            <option value="">Select bank/cash account…</option>
            @for (g of settlementAccounts(); track g.id) { <option [value]="g.id">{{ g.account_code }} — {{ g.account_name }}</option> }
          </select>
        </div>
        @if (moveMode === 'withdraw') {
          <label class="cx-inv-check">
            <input type="checkbox" [(ngModel)]="move.close_if_zero" />
            <span>Close the investment if this empties it</span>
          </label>
          <p class="cx-inv-note">Interest is accrued to the value date before the withdrawal, so the investor earns to the day.</p>
        }
      </div>
    </cx-form-dialog>

    <!-- Settle: mature / liquidate / close -->
    <cx-form-dialog [open]="showSettle()" [title]="settleTitle()"
      [subtitle]="settleTarget()?.investment_number || ''"
      [saving]="saving()" maxWidth="560px" (close)="showSettle.set(false)" (save)="submitSettle()">
      <div class="cx-form-stack">
        @if (settleTarget(); as t) {
          <div class="cx-inv-context">
            <span>Balance</span><strong class="tabular-nums">{{ t.balance | money:2 }}</strong>
          </div>
          <div class="cx-inv-context">
            <span>Accrued interest</span><strong class="tabular-nums">{{ t.accrued_interest | money:2 }}</strong>
          </div>
        }
        @if (settleMode === 'liquidate') {
          <p class="cx-inv-warn">
            <lucide-icon name="alert-triangle" [size]="14"></lucide-icon>
            <span>Early exit forfeits {{ pct(settleTarget()?.early_liquidation_penalty_rate) }} of unsettled interest.
            The principal is always returned in full.</span>
          </p>
        }
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Settlement Account *</label>
            <select class="cx-select" [(ngModel)]="settle.settlement_gl_id">
              <option value="">Select bank/cash account…</option>
              @for (g of settlementAccounts(); track g.id) { <option [value]="g.id">{{ g.account_code }} — {{ g.account_name }}</option> }
            </select>
          </div>
          <div>
            <label class="cx-label">Value Date</label>
            <input class="cx-input" type="date" [(ngModel)]="settle.value_date" />
          </div>
        </div>
      </div>
    </cx-form-dialog>

    <!-- Detail -->
    <cx-view-dialog [open]="showDetail()" title="Investment" [subtitle]="detailSubtitle()" maxWidth="1000px" (close)="showDetail.set(false)">
      @if (detailLoading()) {
        <div class="cx-inv-loading"><lucide-icon name="loader-2" [size]="16" class="cx-inv-spin"></lucide-icon><span>Loading…</span></div>
      }
      @if (detail(); as d) {
        <div class="cx-inv-detail">
          <div class="cx-inv-kpis">
            <div class="cx-inv-kpi"><span>Principal</span><strong class="tabular-nums">{{ d.performance.principal | money:2 }}</strong></div>
            <div class="cx-inv-kpi"><span>Balance</span><strong class="tabular-nums">{{ d.performance.balance | money:2 }}</strong></div>
            <div class="cx-inv-kpi is-accent"><span>Current value</span><strong class="tabular-nums">{{ d.performance.current_value | money:2 }}</strong></div>
            <div class="cx-inv-kpi"><span>Interest earned</span><strong class="tabular-nums">{{ d.performance.interest_earned_to_date | money:2 }}</strong></div>
            <div class="cx-inv-kpi"><span>WHT withheld</span><strong class="tabular-nums">{{ d.performance.wht_withheld_to_date | money:2 }}</strong></div>
          </div>

          <div class="cx-inv-facts">
            <div><span>Type</span><b>{{ d.performance.type === 'open_ended' ? 'Open-ended' : 'Fixed term' }}</b></div>
            <div><span>Rate</span><b>{{ pct(d.performance.interest_rate) }} p.a.</b></div>
            <div><span>Placed</span><b>{{ d.performance.placement_date }}</b></div>
            <div><span>Days invested</span><b>{{ d.performance.days_invested }}</b></div>
            @if (d.performance.maturity_date) {
              <div><span>Matures</span><b>{{ d.performance.maturity_date }}</b></div>
              <div><span>Days to maturity</span><b>{{ d.performance.days_to_maturity ?? '—' }}</b></div>
              <div><span>Projected value</span><b class="tabular-nums">{{ d.performance.projected_maturity_value | money:2 }}</b></div>
            } @else {
              <div><span>Maturity</span><b>None — open-ended</b></div>
              <div><span>Indicative / yr (net)</span><b class="tabular-nums">{{ d.performance.indicative_annual_net | money:2 }}</b></div>
            }
          </div>

          <h4 class="cx-inv-sec">Statement</h4>
          <div class="cx-inv-table-wrap">
            <table class="cx-inv-table">
              <thead>
                <tr><th>Date</th><th>Movement</th><th class="right">Amount</th><th class="right">Gross int.</th><th class="right">WHT</th><th class="right">Net</th><th class="right">Balance</th></tr>
              </thead>
              <tbody>
                @for (t of d.transactions; track t.id) {
                  <tr>
                    <td>{{ t.value_date }}</td>
                    <td>{{ txnLabel(t.type) }}<span class="cx-inv-narr">{{ t.narration }}</span></td>
                    <td class="right tabular-nums">{{ t.amount | money:2 }}</td>
                    <td class="right tabular-nums">{{ t.gross_interest ? (t.gross_interest | money:2) : '—' }}</td>
                    <td class="right tabular-nums">{{ t.wht_amount ? (t.wht_amount | money:2) : '—' }}</td>
                    <td class="right tabular-nums">{{ t.net_interest ? (t.net_interest | money:2) : '—' }}</td>
                    <td class="right tabular-nums">{{ t.balance_after | money:2 }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="cx-inv-empty">No movements yet.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </cx-view-dialog>
  `,
  styles: [`
    .cx-inv-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px;
      padding: 14px 16px; background: var(--cx-surface); border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl); margin-bottom: 1rem; align-items: center; }
    .cx-inv-strong { font-weight: 600; }
    .cx-inv-muted { color: var(--cx-text-muted); }
    .cx-inv-due { margin-left: 6px; font-size: 10px; font-weight: 700; text-transform: uppercase;
      padding: 1px 6px; border-radius: 999px; background: color-mix(in srgb, var(--cx-warning) 16%, transparent); color: var(--cx-warning); }

    .cx-inv-typeahead { border: 1px solid var(--cx-border); border-radius: var(--cx-radius-md); margin-top: 4px; overflow: hidden; }
    .cx-inv-typeahead-item { display: block; width: 100%; text-align: left; padding: 8px 12px; border: none;
      background: transparent; cursor: pointer; font-size: 13px; }
    .cx-inv-typeahead-item:hover { background: var(--cx-surface-hover, var(--cx-stone-100)); }

    .cx-inv-projection { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; padding: 11px 13px;
      border-radius: var(--cx-radius-lg, 10px); background: color-mix(in srgb, var(--cx-success) 8%, transparent); color: var(--cx-text-secondary); }
    .cx-inv-projection-note { font-size: 11px; color: var(--cx-text-muted); margin-top: 3px; }
    .cx-inv-context { display: flex; justify-content: space-between; font-size: 13px; padding: 8px 12px;
      background: var(--cx-surface-2, var(--cx-stone-100)); border-radius: var(--cx-radius-md); }
    .cx-inv-note { font-size: 12px; color: var(--cx-text-muted); margin: 0; }
    .cx-inv-warn { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; margin: 0; padding: 10px 12px;
      border-radius: var(--cx-radius-md); background: color-mix(in srgb, var(--cx-warning) 12%, transparent); color: var(--cx-warning); }
    .cx-inv-check { display: flex; gap: 8px; align-items: center; font-size: 13px; cursor: pointer; }

    .cx-inv-loading { display: flex; gap: 8px; align-items: center; color: var(--cx-text-muted); font-size: 13px; padding: 8px 0; }
    .cx-inv-spin { animation: cx-inv-spin 1s linear infinite; }
    @keyframes cx-inv-spin { to { transform: rotate(360deg); } }

    .cx-inv-detail { display: flex; flex-direction: column; gap: 16px; }
    .cx-inv-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
    .cx-inv-kpi { padding: 11px 13px; border: 1px solid var(--cx-border); border-radius: var(--cx-radius-lg, 10px); }
    .cx-inv-kpi span { display: block; font-size: 11px; color: var(--cx-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .cx-inv-kpi strong { display: block; font-size: 17px; font-weight: 700; margin-top: 3px; }
    .cx-inv-kpi.is-accent { background: color-mix(in srgb, var(--cx-primary-600) 8%, transparent); border-color: transparent; }
    .cx-inv-kpi.is-accent strong { color: var(--cx-primary-600); }

    .cx-inv-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 2px 18px;
      border-top: 1px solid var(--cx-border); padding-top: 12px; }
    .cx-inv-facts > div { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dashed var(--cx-border); font-size: 13px; }
    .cx-inv-facts span { color: var(--cx-text-muted); }

    .cx-inv-sec { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
      color: var(--cx-text-muted); margin: 4px 0 0; }
    .cx-inv-table-wrap { overflow-x: auto; }
    .cx-inv-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .cx-inv-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em;
      color: var(--cx-text-muted); padding: 6px 8px; border-bottom: 1px solid var(--cx-border); white-space: nowrap; }
    .cx-inv-table td { padding: 7px 8px; border-bottom: 1px solid var(--cx-border); vertical-align: top; }
    .cx-inv-table .right { text-align: right; }
    .cx-inv-narr { display: block; font-size: 11px; color: var(--cx-text-muted); }
    .cx-inv-empty { text-align: center; color: var(--cx-text-muted); padding: 20px 0; }
  `],
})
export class InvestmentsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  auth = inject(AuthService);
  settings = inject(SettingsService);

  columns: TableColumn[] = [
    { key: 'investment_number', label: 'Number' },
    { key: 'customer_name', label: 'Investor', sortable: false },
    { key: 'product_name', label: 'Product', sortable: false },
    { key: 'type', label: 'Type', type: 'custom', sortable: false },
    { key: 'principal', label: 'Principal', type: 'custom', align: 'right' },
    { key: 'current_value', label: 'Current value', type: 'custom', align: 'right', sortable: false },
    { key: 'interest_rate', label: 'Rate', type: 'custom', align: 'right', sortable: false },
    { key: 'maturity_date', label: 'Maturity', type: 'custom' },
    { key: 'status', label: 'Status', type: 'custom' },
  ];

  rows = signal<any[]>([]);
  loading = signal(true);
  pagination = signal<TablePagination | null>(null);
  products = signal<any[]>([]);
  settlementAccounts = signal<any[]>([]);
  activeProducts = computed(() => this.products().filter(p => p.is_active));

  filters = { status: '', type: '', product_id: '' };
  private q: any = {};

  // Place
  showPlace = signal(false);
  saving = signal(false);
  place: any = {};
  customerSearch = '';
  customerResults = signal<any[]>([]);
  private searchTimer: any;
  selectedProduct = signal<any | null>(null);

  // Top-up / withdraw
  showMove = signal(false);
  moveMode: 'top-up' | 'withdraw' = 'top-up';
  moveTarget = signal<any | null>(null);
  move: any = {};

  // Settle
  showSettle = signal(false);
  settleMode: 'mature' | 'liquidate' | 'close' = 'mature';
  settleTarget = signal<any | null>(null);
  settle: any = {};

  // Detail
  showDetail = signal(false);
  detailLoading = signal(false);
  detail = signal<any | null>(null);

  ngOnInit() {
    this.load();
    this.api.get('/investments/products').subscribe({
      next: r => this.products.set(r.data || []),
      error: () => {},
    });
    // Settlement accounts are asset GLs (bank/cash), same set disbursement uses.
    this.api.get('/gl-accounts', { account_type: 'asset', per_page: 100, sort_by: 'account_code', sort_dir: 'ASC' }).subscribe({
      next: r => this.settlementAccounts.set((r.data || []).filter((g: any) => g.is_active)),
      error: () => {},
    });
  }

  // ── List ────────────────────────────────────────────────────────────────
  load() {
    this.loading.set(true);
    const params: any = { ...this.q };
    Object.entries(this.filters).forEach(([k, v]) => { if (v) params[k] = v; });
    this.api.get('/investments', params).subscribe({
      next: r => { this.rows.set(r.data || []); this.pagination.set(r.meta || null); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
  onQuery(e: TableQueryEvent) { this.q = e; this.load(); }
  applyFilters() { this.q = { ...this.q, page: 1 }; this.load(); }
  clearFilters() { this.filters = { status: '', type: '', product_id: '' }; this.applyFilters(); }
  activeFilters(): boolean { return Object.values(this.filters).some(v => v !== ''); }

  // ── Labels ──────────────────────────────────────────────────────────────
  pct(v: string | null | undefined): string {
    const n = parseFloat(v || '0');
    if (!n) return '0%';
    return (n * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
  }
  payoutLabel(v: string): string {
    return ({ at_maturity: 'At maturity', periodic: 'Periodic payout', compounded: 'Compounded' } as any)[v] ?? v;
  }
  statusLabel(v: string): string {
    return ({ active: 'Active', matured: 'Matured', liquidated: 'Liquidated', closed: 'Closed', rolled_over: 'Rolled over' } as any)[v] ?? v;
  }
  statusClass(v: string): string {
    return ({ active: 'cx-badge-success', matured: 'cx-badge-info', liquidated: 'cx-badge-warning',
              closed: 'cx-badge-neutral', rolled_over: 'cx-badge-info' } as any)[v] ?? 'cx-badge-neutral';
  }
  txnLabel(v: string): string {
    return ({ placement: 'Placement', top_up: 'Top-up', accrual: 'Interest accrued', payout: 'Interest paid',
              capitalisation: 'Interest capitalised', withdrawal: 'Withdrawal', maturity: 'Maturity',
              liquidation: 'Liquidation', penalty: 'Penalty', wht: 'WHT', reversal: 'Reversal' } as any)[v] ?? v;
  }
  isDue(row: any): boolean {
    return !!row.maturity_date && row.maturity_date <= new Date().toISOString().slice(0, 10);
  }

  // ── Place ───────────────────────────────────────────────────────────────
  openPlace() {
    this.place = {
      customer_id: '', customer_name: '', product_id: '', amount: '',
      tenor_days: null, settlement_gl_id: '', placement_date: new Date().toISOString().slice(0, 10),
    };
    this.customerSearch = '';
    this.customerResults.set([]);
    this.selectedProduct.set(null);
    this.showPlace.set(true);
  }

  onCustomerSearch(term: string) {
    clearTimeout(this.searchTimer);
    if (!term || term.trim().length < 2) { this.customerResults.set([]); return; }
    this.searchTimer = setTimeout(() => {
      this.api.get('/customers', { search: term.trim(), per_page: 10 }).subscribe({
        next: r => this.customerResults.set(r.data || []),
        error: () => this.customerResults.set([]),
      });
    }, 300);
  }
  pickCustomer(c: any) {
    this.place.customer_id = c.id;
    this.place.customer_name = c.full_name;
    this.customerSearch = c.full_name;
    this.customerResults.set([]);
  }
  onProductPick(id: string) {
    const p = this.products().find(x => x.id === id) || null;
    this.selectedProduct.set(p);
    // Prefill a sensible tenor so the operator isn't guessing the bounds.
    if (p?.type === 'fixed_term') {
      this.place.tenor_days = p.min_tenor_days ?? 90;
    } else {
      this.place.tenor_days = null;
    }
  }
  tenorHint(): string {
    const p = this.selectedProduct();
    if (!p) return '';
    const min = p.min_tenor_days, max = p.max_tenor_days;
    if (min && max) return `Allowed: ${min}–${max} days`;
    if (min) return `Minimum ${min} days`;
    if (max) return `Maximum ${max} days`;
    return 'Any number of days';
  }

  /** Indicative maturity projection shown while placing a fixed-term investment. */
  projection(): { gross: string; wht: string; net: string; total: string } | null {
    const p = this.selectedProduct();
    const amt = parseFloat(this.place?.amount || '0');
    const days = parseInt(this.place?.tenor_days || '0', 10);
    if (!p || p.type !== 'fixed_term' || !amt || !days) return null;
    const rate = parseFloat(p.interest_rate || '0');
    const basis = parseInt(p.day_count_basis || '365', 10);
    const gross = (amt * rate * days) / basis;
    const wht = gross * parseFloat(p.wht_rate || '0');
    const net = gross - wht;
    return { gross: gross.toFixed(2), wht: wht.toFixed(2), net: net.toFixed(2), total: (amt + net).toFixed(2) };
  }

  submitPlace() {
    const p = this.place;
    if (!p.customer_id) { this.toast.error('Select an investor.'); return; }
    if (!p.product_id) { this.toast.error('Select a product.'); return; }
    if (!p.amount) { this.toast.error('Enter an amount.'); return; }
    if (!p.settlement_gl_id) { this.toast.error('Select a settlement account.'); return; }
    if (this.selectedProduct()?.type === 'fixed_term' && !p.tenor_days) { this.toast.error('Enter a tenor in days.'); return; }

    this.saving.set(true);
    this.api.post('/investments', p).subscribe({
      next: r => { this.saving.set(false); this.toast.success(r.message || 'Investment placed'); this.showPlace.set(false); this.load(); },
      error: e => { this.saving.set(false); this.toast.error(this.errText(e)); },
    });
  }

  // ── Top-up / withdraw ───────────────────────────────────────────────────
  openMove(row: any, mode: 'top-up' | 'withdraw') {
    this.moveMode = mode;
    this.moveTarget.set(row);
    this.move = { amount: '', settlement_gl_id: '', value_date: new Date().toISOString().slice(0, 10), close_if_zero: false };
    this.showMove.set(true);
  }
  submitMove() {
    const t = this.moveTarget();
    if (!t) return;
    if (!this.move.amount) { this.toast.error('Enter an amount.'); return; }
    if (!this.move.settlement_gl_id) { this.toast.error('Select a settlement account.'); return; }

    this.saving.set(true);
    this.api.post(`/investments/${t.id}/${this.moveMode}`, this.move).subscribe({
      next: r => { this.saving.set(false); this.toast.success(r.message || 'Posted'); this.showMove.set(false); this.load(); },
      error: e => { this.saving.set(false); this.toast.error(this.errText(e)); },
    });
  }

  // ── Settle ──────────────────────────────────────────────────────────────
  openSettle(row: any, mode: 'mature' | 'liquidate' | 'close') {
    this.settleMode = mode;
    this.settleTarget.set(row);
    this.settle = { settlement_gl_id: '', value_date: new Date().toISOString().slice(0, 10) };
    this.showSettle.set(true);
  }
  settleTitle(): string {
    return ({ mature: 'Mature & Settle', liquidate: 'Liquidate Early', close: 'Close Investment' })[this.settleMode];
  }
  submitSettle() {
    const t = this.settleTarget();
    if (!t) return;
    if (!this.settle.settlement_gl_id) { this.toast.error('Select a settlement account.'); return; }

    this.saving.set(true);
    this.api.post(`/investments/${t.id}/${this.settleMode}`, this.settle).subscribe({
      next: r => { this.saving.set(false); this.toast.success(r.message || 'Settled'); this.showSettle.set(false); this.load(); },
      error: e => { this.saving.set(false); this.toast.error(this.errText(e)); },
    });
  }

  // ── Detail ──────────────────────────────────────────────────────────────
  openDetail(row: any) {
    this.detail.set(null);
    this.showDetail.set(true);
    this.detailLoading.set(true);
    this.api.get(`/investments/${row.id}/statement`).subscribe({
      next: r => { this.detail.set(r.data); this.detailLoading.set(false); },
      error: () => { this.detailLoading.set(false); this.toast.error('Could not load the investment.'); },
    });
  }
  detailSubtitle(): string {
    const d = this.detail();
    if (!d) return '';
    return [d.investment?.investment_number, d.investment?.customer_name, d.investment?.product_name].filter(Boolean).join(' · ');
  }

  private errText(e: any): string {
    const errs = e.error?.errors;
    if (errs) return Object.values(errs)[0] as string;
    return e.error?.message || 'Request failed';
  }
}
