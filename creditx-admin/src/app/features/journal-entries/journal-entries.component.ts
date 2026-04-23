import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';

/**
 * Journal Entries — global view of every LedgerTransaction across the
 * accounting system. Complements the GL-scoped and customer-ledger-
 * scoped transaction views by letting users answer questions that
 * don't start with 'which account?':
 *
 *   - 'Show me every journal entry over ₦500k this month'
 *   - 'What were all the postings for callback DISB-LN0042-...?'
 *   - 'List every reversal today' (trans_narration LIKE '%REVERSAL%')
 *
 * Filters:
 *   - Search (narration, reference, callback)
 *   - Date range (from/to)
 *   - Account (GL dropdown)
 *   - Transaction type (CR/DR/all)
 *   - Amount range (min/max)
 *
 * Row click → drawer showing the full entry + all sibling entries
 * sharing the same callback (i.e. the complete journal that this
 * transaction is part of). A disbursement posts 5-6 entries under
 * one callback ref; seeing them together clarifies the accounting.
 *
 * Gated by accounting.view permission at both menu + backend layers.
 */
@Component({
  selector: 'app-journal-entries',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Journal Entries"
        subtitle="Every posting across the general ledger — filterable + exportable"
        eyebrow="Accounting"></cx-page-header>

      <!-- Filter bar -->
      <div class="cx-je-filters">
        <div class="cx-je-filter-group">
          <label class="cx-je-filter-label">From</label>
          <input type="date" class="cx-input cx-je-filter-input"
                 [(ngModel)]="filters.date_from"
                 (change)="applyFilters()" />
        </div>
        <div class="cx-je-filter-group">
          <label class="cx-je-filter-label">To</label>
          <input type="date" class="cx-input cx-je-filter-input"
                 [(ngModel)]="filters.date_to"
                 (change)="applyFilters()" />
        </div>
        <div class="cx-je-filter-group">
          <label class="cx-je-filter-label">Account</label>
          <select class="cx-input cx-je-filter-input"
                  [(ngModel)]="filters.gl_id"
                  (change)="applyFilters()">
            <option value="">All accounts</option>
            @for (gl of glAccounts(); track gl.id) {
              <option [value]="gl.id">{{ gl.account_code }} — {{ gl.account_name }}</option>
            }
          </select>
        </div>
        <div class="cx-je-filter-group">
          <label class="cx-je-filter-label">Type</label>
          <select class="cx-input cx-je-filter-input"
                  [(ngModel)]="filters.trans_type"
                  (change)="applyFilters()">
            <option value="">Both</option>
            <option value="DR">Debit</option>
            <option value="CR">Credit</option>
          </select>
        </div>
        <div class="cx-je-filter-group">
          <label class="cx-je-filter-label">Min Amount (₦)</label>
          <input type="number" class="cx-input cx-je-filter-input tabular-nums"
                 [(ngModel)]="filters.min_amount"
                 (change)="applyFilters()"
                 placeholder="0" />
        </div>
        <div class="cx-je-filter-group">
          <label class="cx-je-filter-label">Max Amount (₦)</label>
          <input type="number" class="cx-input cx-je-filter-input tabular-nums"
                 [(ngModel)]="filters.max_amount"
                 (change)="applyFilters()"
                 placeholder="∞" />
        </div>
        <div class="cx-je-filter-actions">
          @if (hasActiveFilters()) {
            <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="clearFilters()">
              <lucide-icon name="x" [size]="12"></lucide-icon>
              <span>Clear</span>
            </button>
          }
          <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="exportCsv()" [disabled]="exporting()">
            <lucide-icon name="download" [size]="12"></lucide-icon>
            <span>{{ exporting() ? 'Exporting…' : 'Export CSV' }}</span>
          </button>
        </div>
      </div>

      <!-- Summary strip — shows totals for the current filtered view -->
      @if (rows().length > 0 && !loading()) {
        <div class="cx-je-summary">
          <div class="cx-je-summary-cell">
            <div class="cx-je-summary-label">Showing</div>
            <div class="cx-je-summary-value tabular-nums">{{ rows().length }} of {{ pagination()?.total || rows().length }}</div>
          </div>
          <div class="cx-je-summary-cell">
            <div class="cx-je-summary-label">Total Debit (page)</div>
            <div class="cx-je-summary-value cx-je-summary-dr tabular-nums">₦{{ pageTotalDr() | number:'1.2-2' }}</div>
          </div>
          <div class="cx-je-summary-cell">
            <div class="cx-je-summary-label">Total Credit (page)</div>
            <div class="cx-je-summary-value cx-je-summary-cr tabular-nums">₦{{ pageTotalCr() | number:'1.2-2' }}</div>
          </div>
        </div>
      }

      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()"
                     [pagination]="pagination()"
                     searchPlaceholder="Search narration, reference, or callback..."
                     [hasActions]="true"
                     trackBy="id"
                     (query)="onQuery($event)">
        <ng-template #cellTemplate let-row let-col="column">
          @if (col.key === 'posted_by') {
            @if (row.posted_by_name) {
              {{ row.posted_by_name }}
            } @else if (row.posted_by) {
              <span class="cx-je-posted-id">{{ row.posted_by }}</span>
            } @else {
              —
            }
          } @else {
            {{ row[col.key] }}
          }
        </ng-template>
        <ng-template #rowActions let-row>
          <div class="flex items-center gap-1 justify-end">
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openDetail(row)" title="View details">
              <lucide-icon name="eye" [size]="14"></lucide-icon>
            </button>
          </div>
        </ng-template>
      </cx-data-table>
    </div>

    <!-- Detail drawer — full entry + siblings under the same callback -->
    @if (drawerOpen()) {
      <div class="cx-je-backdrop" (click)="closeDrawer()"></div>
      <div class="cx-je-drawer" role="dialog" aria-labelledby="je-drawer-title">
        <div class="cx-je-drawer-head">
          <div>
            <div class="cx-je-drawer-eyebrow">Journal Entry</div>
            <h2 id="je-drawer-title" class="cx-je-drawer-title tabular-nums">
              {{ activeRow()?.trans_callback || activeRow()?.trans_reference || '—' }}
            </h2>
            <div class="cx-je-drawer-sub">{{ activeRow()?.trans_date }} · posted {{ activeRow()?.created_at }}</div>
          </div>
          <button class="cx-je-drawer-close" (click)="closeDrawer()" aria-label="Close">
            <lucide-icon name="x" [size]="18"></lucide-icon>
          </button>
        </div>

        <div class="cx-je-drawer-body">

          <!-- Active row details -->
          <section class="cx-je-section">
            <h3 class="cx-je-section-title">This Entry</h3>
            <div class="cx-je-meta">
              <div class="cx-je-meta-row">
                <span>Account</span>
                <span class="tabular-nums">
                  <span class="cx-je-gl-code">{{ activeRow()?.gl_code }}</span>
                  {{ activeRow()?.gl_name }}
                </span>
              </div>
              <div class="cx-je-meta-row">
                <span>Type</span>
                <span>
                  <span class="cx-je-type-pill" [attr.data-type]="activeRow()?.trans_type">
                    {{ activeRow()?.trans_type }}
                  </span>
                </span>
              </div>
              <div class="cx-je-meta-row">
                <span>Amount</span>
                <span class="tabular-nums cx-je-amount-big">₦{{ activeRow()?.trans_amount | number:'1.2-2' }}</span>
              </div>
              <div class="cx-je-meta-row">
                <span>Narration</span>
                <span>{{ activeRow()?.trans_narration }}</span>
              </div>
              @if (activeRow()?.trans_reference) {
                <div class="cx-je-meta-row">
                  <span>Reference</span>
                  <span class="tabular-nums">{{ activeRow()?.trans_reference }}</span>
                </div>
              }
              @if (activeRow()?.customer_ledger_no) {
                <div class="cx-je-meta-row">
                  <span>Customer Ledger</span>
                  <span class="tabular-nums">{{ activeRow()?.customer_ledger_no }}</span>
                </div>
              }
              @if (activeRow()?.reversal_of_id) {
                <div class="cx-je-meta-row">
                  <span>Status</span>
                  <span class="cx-je-reversal-tag">REVERSAL ENTRY</span>
                </div>
              } @else if (activeRow()?.reversal_status === 'reversed') {
                <div class="cx-je-meta-row">
                  <span>Status</span>
                  <span class="cx-je-reversed-tag">REVERSED</span>
                </div>
                @if (activeRow()?.reversed_by_name) {
                  <div class="cx-je-meta-row">
                    <span>Reversed by</span>
                    <span>{{ activeRow()?.reversed_by_name }}</span>
                  </div>
                }
                @if (activeRow()?.reversed_at) {
                  <div class="cx-je-meta-row">
                    <span>Reversed at</span>
                    <span>{{ activeRow()?.reversed_at }}</span>
                  </div>
                }
              }
              <div class="cx-je-meta-row">
                <span>Posted by</span>
                <span>
                  @if (activeRow()?.posted_by_name) {
                    {{ activeRow()?.posted_by_name }}
                  } @else if (activeRow()?.posted_by) {
                    <span class="cx-je-posted-id">{{ activeRow()?.posted_by }}</span>
                  } @else {
                    —
                  }
                </span>
              </div>
            </div>
          </section>

          <!-- Siblings — all entries sharing the same callback -->
          @if (activeRow()?.trans_callback) {
            <section class="cx-je-section">
              <h3 class="cx-je-section-title">
                Full Journal
                @if (siblings().length) {
                  <span class="cx-je-section-count">{{ siblings().length }} entries</span>
                }
              </h3>
              @if (siblingsLoading()) {
                <div class="cx-je-drawer-loading">
                  <lucide-icon name="loader-2" [size]="16" class="cx-je-spin"></lucide-icon>
                  <span>Loading siblings…</span>
                </div>
              } @else if (siblings().length === 0) {
                <div class="cx-je-empty">No other entries under this callback.</div>
              } @else {
                <!--
                  Siblings rendered as a DR/CR two-column ledger so the
                  checker can see debits balance credits at a glance.
                  A journal is always balanced — total DR == total CR
                  for the same callback ref (barring partial postings,
                  which shouldn't happen in this system).
                -->
                <table class="cx-je-siblings-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Narration</th>
                      <th class="cx-je-right">Debit</th>
                      <th class="cx-je-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (s of siblings(); track s.id) {
                      <tr [class.cx-je-siblings-row-active]="s.id === activeRow()?.id">
                        <td>
                          <span class="cx-je-gl-code">{{ s.gl_code }}</span>
                          <span class="cx-je-gl-name">{{ s.gl_name }}</span>
                        </td>
                        <td class="cx-je-narration">{{ s.trans_narration }}</td>
                        <td class="cx-je-right tabular-nums">
                          @if (s.trans_type === 'DR') { ₦{{ s.trans_amount | number:'1.2-2' }} }
                        </td>
                        <td class="cx-je-right tabular-nums">
                          @if (s.trans_type === 'CR') { ₦{{ s.trans_amount | number:'1.2-2' }} }
                        </td>
                      </tr>
                    }
                  </tbody>
                  <tfoot>
                    <tr class="cx-je-siblings-total">
                      <td colspan="2">Totals</td>
                      <td class="cx-je-right tabular-nums">₦{{ siblingsTotalDr() | number:'1.2-2' }}</td>
                      <td class="cx-je-right tabular-nums">₦{{ siblingsTotalCr() | number:'1.2-2' }}</td>
                    </tr>
                    @if (!isBalanced()) {
                      <tr class="cx-je-siblings-unbalanced">
                        <td colspan="4">
                          <lucide-icon name="info" [size]="12"></lucide-icon>
                          Entries in view do not balance — ₦{{ imbalance() | number:'1.2-2' }}
                          difference. This may indicate the journal is still
                          being posted or this query hides some entries.
                        </td>
                      </tr>
                    }
                  </tfoot>
                </table>
              }
            </section>
          }

        </div>
      </div>
    }
  `,
  styles: [`
    /* ═══ Filter bar ═══ */
    .cx-je-filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 10px;
      padding: 14px 16px;
      background: var(--cx-surface-2, #f5f5f4);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl, 12px);
      margin-bottom: 14px;
    }
    .cx-je-filter-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .cx-je-filter-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-je-filter-input {
      font-size: 13px;
      padding: 6px 10px;
    }
    .cx-je-filter-actions {
      display: flex;
      align-items: flex-end;
      gap: 6px;
    }

    /* ═══ Summary strip ═══ */
    .cx-je-summary {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      padding: 12px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
    }
    .cx-je-summary-cell { display: flex; flex-direction: column; gap: 2px; }
    .cx-je-summary-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-je-summary-value {
      font-size: 16px;
      font-weight: 600;
      color: var(--cx-text);
    }
    .cx-je-summary-dr { color: var(--cx-danger, #dc2626); }
    .cx-je-summary-cr { color: var(--cx-success, #16a34a); }

    /* ═══ Drawer ═══ */
    .cx-je-backdrop {
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.5);
      z-index: 100;
      backdrop-filter: blur(4px);
    }
    .cx-je-drawer {
      position: fixed;
      top: 0; right: 0;
      width: min(640px, calc(100vw - 32px));
      height: 100vh;
      background: var(--cx-surface);
      box-shadow: -32px 0 80px rgba(0, 0, 0, 0.2);
      display: flex;
      flex-direction: column;
      z-index: 101;
      animation: cx-je-drawer-in 240ms var(--cx-ease-premium, cubic-bezier(0.4, 0, 0.2, 1));
    }
    @keyframes cx-je-drawer-in {
      from { transform: translateX(100%); }
      to   { transform: translateX(0); }
    }
    @media (max-width: 640px) {
      .cx-je-drawer { width: 100vw; }
    }

    .cx-je-drawer-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 20px 24px 16px;
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-je-drawer-eyebrow {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-je-drawer-title {
      margin: 4px 0 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.01em;
      word-break: break-all;
    }
    .cx-je-drawer-sub {
      font-size: 12px;
      color: var(--cx-text-secondary);
      margin-top: 4px;
    }
    .cx-je-drawer-close {
      width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      background: var(--cx-surface-2); border: none; border-radius: 50%;
      color: var(--cx-text-secondary); cursor: pointer; flex-shrink: 0;
    }

    .cx-je-drawer-body { flex: 1; overflow-y: auto; padding: 20px 24px; }

    .cx-je-section { margin-bottom: 24px; }
    .cx-je-section-title {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cx-text-muted);
      margin: 0 0 10px;
    }
    .cx-je-section-count {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 8px;
      background: var(--cx-primary-50, rgba(59, 130, 246, 0.1));
      color: var(--cx-primary-600, #2563eb);
      border-radius: 999px;
      font-size: 10px;
      font-weight: 600;
    }

    .cx-je-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
      background: var(--cx-surface-2);
      border-radius: var(--cx-radius-md);
      padding: 4px;
    }
    .cx-je-meta-row {
      display: grid;
      grid-template-columns: 140px 1fr;
      gap: 12px;
      padding: 8px 12px;
      font-size: 13px;
    }
    .cx-je-meta-row > span:first-child {
      color: var(--cx-text-muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      align-self: center;
    }
    .cx-je-meta-row > span:last-child { color: var(--cx-text); }

    .cx-je-amount-big {
      font-size: 18px;
      font-weight: 600;
    }
    .cx-je-gl-code {
      display: inline-block;
      padding: 1px 6px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      color: var(--cx-text-secondary);
      margin-right: 6px;
    }
    .cx-je-gl-name { font-size: 12px; color: var(--cx-text-secondary); }

    .cx-je-type-pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .cx-je-type-pill[data-type="DR"] {
      background: rgba(239, 68, 68, 0.12);
      color: var(--cx-danger, #dc2626);
    }
    .cx-je-type-pill[data-type="CR"] {
      background: rgba(22, 163, 74, 0.12);
      color: var(--cx-success, #16a34a);
    }
    .cx-je-reversal-tag {
      display: inline-block;
      padding: 2px 8px;
      background: rgba(239, 68, 68, 0.12);
      color: var(--cx-danger, #dc2626);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      border-radius: 4px;
    }
    /* 'Reversed' = an entry that has been reversed (original row).
       Distinct tone from the reversal entry itself to avoid confusion. */
    .cx-je-reversed-tag {
      display: inline-block;
      padding: 2px 8px;
      background: rgba(245, 158, 11, 0.12);
      color: #b45309;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      border-radius: 4px;
    }
    /* Fallback when posted_by_name resolution failed — still show the
       raw user ID so it's traceable, but subdued to indicate it's not
       a display name. */
    .cx-je-posted-id {
      font-family: var(--cx-font-mono, monospace);
      font-size: 11px;
      color: var(--cx-text-muted);
    }

    /* Siblings table */
    .cx-je-siblings-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      overflow: hidden;
    }
    .cx-je-siblings-table th {
      background: var(--cx-surface-2);
      padding: 10px 12px;
      text-align: left;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--cx-text-muted);
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-je-siblings-table td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--cx-border-subtle, var(--cx-border));
      vertical-align: top;
    }
    .cx-je-siblings-table tbody tr:last-child td { border-bottom: none; }
    .cx-je-siblings-row-active {
      background: rgba(59, 130, 246, 0.06);
    }
    .cx-je-siblings-row-active td {
      border-left: 2px solid var(--cx-primary-600, #2563eb);
    }
    .cx-je-right { text-align: right; }
    .cx-je-narration {
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--cx-text-secondary);
    }
    .cx-je-siblings-total td {
      background: var(--cx-surface-2);
      font-weight: 600;
      border-top: 1px solid var(--cx-border);
    }
    .cx-je-siblings-unbalanced td {
      padding: 8px 12px;
      background: rgba(245, 158, 11, 0.08);
      color: #b45309;
      font-size: 11px;
      text-align: center;
    }
    .cx-je-siblings-unbalanced lucide-icon { vertical-align: middle; margin-right: 4px; }

    .cx-je-empty {
      padding: 16px;
      background: var(--cx-surface-2);
      border-radius: var(--cx-radius-md);
      text-align: center;
      color: var(--cx-text-muted);
      font-size: 13px;
    }
    .cx-je-drawer-loading {
      display: flex; align-items: center; gap: 8px;
      padding: 16px;
      color: var(--cx-text-secondary);
      font-size: 13px;
    }
    .cx-je-spin { animation: cx-je-spin 1s linear infinite; }
    @keyframes cx-je-spin { to { transform: rotate(360deg); } }
  `],
})
export class JournalEntriesComponent implements OnInit {
  columns: TableColumn[] = [
    { key: 'trans_date', label: 'Date' },
    { key: 'gl_code', label: 'Account' },
    { key: 'trans_type', label: 'Type' },
    { key: 'trans_amount', label: 'Amount', type: 'currency', align: 'right' },
    { key: 'trans_narration', label: 'Narration' },
    { key: 'trans_callback', label: 'Reference' },
    { key: 'posted_by', label: 'Posted By', type: 'custom' },
  ];

  rows = signal<any[]>([]);
  loading = signal(true);
  pagination = signal<TablePagination | null>(null);
  glAccounts = signal<any[]>([]);
  exporting = signal(false);
  q: any = {};

  filters = {
    date_from: '',
    date_to: '',
    gl_id: '',
    trans_type: '',
    min_amount: '',
    max_amount: '',
  };

  // Drawer state
  drawerOpen = signal(false);
  activeRow = signal<any>(null);
  siblings = signal<any[]>([]);
  siblingsLoading = signal(false);

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() {
    this.loadGlAccounts();
    this.load();
  }

  /**
   * Load GL accounts for the filter dropdown. 500 upper bound covers
   * every realistic chart of accounts without extra pagination UI.
   */
  loadGlAccounts() {
    this.api.get('/gl-accounts', { per_page: 500 }).subscribe({
      next: r => this.glAccounts.set(r.data || []),
    });
  }

  load(p?: any) {
    this.loading.set(true);
    const params: any = { ...this.q, ...p };
    // Merge in active filters (empty-string values are sent as-is;
    // the backend treats empty as 'no filter' via !empty() checks).
    Object.entries(this.filters).forEach(([k, v]) => {
      if (v !== '' && v != null) params[k] = v;
    });
    this.api.get('/journal-entries', params).subscribe({
      next: r => {
        this.rows.set(r.data || []);
        this.pagination.set(r.meta || null);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onQuery(e: TableQueryEvent) { this.q = e; this.load(e); }

  applyFilters() {
    // Reset to page 1 when filters change; otherwise user could be on
    // page 5 of an unfiltered list then apply a filter that only has
    // 2 pages of results, landing on an empty page 5.
    this.load({ page: 1, per_page: this.pagination()?.per_page ?? 20 });
  }

  clearFilters() {
    this.filters = {
      date_from: '',
      date_to: '',
      gl_id: '',
      trans_type: '',
      min_amount: '',
      max_amount: '',
    };
    this.applyFilters();
  }

  hasActiveFilters(): boolean {
    return Object.values(this.filters).some(v => v !== '');
  }

  // ─── Page totals (subset displayed) ────────────────────────────────

  pageTotalDr(): number {
    return this.rows().reduce(
      (s, r) => s + (r.trans_type === 'DR' ? parseFloat(r.trans_amount || '0') : 0),
      0,
    );
  }

  pageTotalCr(): number {
    return this.rows().reduce(
      (s, r) => s + (r.trans_type === 'CR' ? parseFloat(r.trans_amount || '0') : 0),
      0,
    );
  }

  // ─── Drawer ────────────────────────────────────────────────────────

  openDetail(row: any) {
    this.activeRow.set(row);
    this.siblings.set([]);
    this.drawerOpen.set(true);

    // Fetch siblings only if this entry has a callback ref (anonymous
    // one-off postings without a callback don't have siblings).
    if (row.trans_callback) {
      this.siblingsLoading.set(true);
      this.api.get('/journal-entries', {
        callback: row.trans_callback,
        per_page: 100,
      }).subscribe({
        next: r => {
          this.siblings.set(r.data || []);
          this.siblingsLoading.set(false);
        },
        error: () => this.siblingsLoading.set(false),
      });
    }
  }

  closeDrawer() {
    this.drawerOpen.set(false);
    this.activeRow.set(null);
    this.siblings.set([]);
  }

  siblingsTotalDr(): number {
    return this.siblings().reduce(
      (s, r) => s + (r.trans_type === 'DR' ? parseFloat(r.trans_amount || '0') : 0),
      0,
    );
  }

  siblingsTotalCr(): number {
    return this.siblings().reduce(
      (s, r) => s + (r.trans_type === 'CR' ? parseFloat(r.trans_amount || '0') : 0),
      0,
    );
  }

  /**
   * A journal is balanced when total debits equal total credits.
   * In double-entry accounting this is always true for a complete
   * journal — any imbalance means some entries were excluded by the
   * current query or the journal is incomplete.
   */
  isBalanced(): boolean {
    // Use toFixed(2) to avoid JS float-precision false positives
    // (e.g. 1000.00 vs 999.9999999 due to accumulator drift).
    return this.siblingsTotalDr().toFixed(2) === this.siblingsTotalCr().toFixed(2);
  }

  imbalance(): number {
    return Math.abs(this.siblingsTotalDr() - this.siblingsTotalCr());
  }

  // ─── CSV export ────────────────────────────────────────────────────

  /**
   * Export the currently-filtered result set as CSV. Fetches with a
   * large per_page so the export covers the whole filtered view in
   * one pass, not just the current page.
   *
   * Cap at 5000 rows to protect memory on both ends. Larger exports
   * should go through a background-job / download-link pattern
   * (future enhancement).
   */
  exportCsv() {
    this.exporting.set(true);
    const params: any = { per_page: 5000, page: 1 };
    Object.entries(this.filters).forEach(([k, v]) => {
      if (v !== '' && v != null) params[k] = v;
    });

    this.api.get('/journal-entries', params).subscribe({
      next: r => {
        const items = r.data || [];
        if (items.length === 0) {
          this.toast.error('No entries to export');
          this.exporting.set(false);
          return;
        }
        const headers = [
          'Date', 'Account Code', 'Account Name', 'Type',
          'Amount', 'Narration', 'Reference', 'Callback',
          'Customer Ledger', 'Posted By',
        ];
        const escape = (v: any) => {
          if (v == null) return '';
          const s = String(v);
          // RFC 4180: if contains comma, quote, or newline, wrap in
          // quotes and escape embedded quotes by doubling.
          if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
          return s;
        };
        const rows = items.map((t: any) => [
          t.trans_date, t.gl_code, t.gl_name, t.trans_type,
          t.trans_amount, t.trans_narration, t.trans_reference,
          t.trans_callback, t.customer_ledger_no, t.posted_by_name || t.posted_by,
        ].map(escape).join(','));
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `journal-entries-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.toast.success(`Exported ${items.length} entries`);
        this.exporting.set(false);
      },
      error: () => {
        this.exporting.set(false);
        this.toast.error('Export failed');
      },
    });
  }
}
