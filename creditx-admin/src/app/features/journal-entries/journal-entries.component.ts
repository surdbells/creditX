import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { SettingsService } from '../../core/services/settings.service';

/**
 * Journal Entries — header-rooted view (Phase-2.5 sub-phase F).
 *
 * Each row is a JournalEntry header (a balanced batch of postings,
 * e.g. one disbursement = one row, one repayment = one row). Clicking
 * a row opens a drawer showing the full DR/CR line table for that
 * journal plus reversal context.
 *
 * Replaces the prior line-rooted view where each row was a single
 * LedgerTransaction and the drawer queried siblings by callback
 * string. The new view is conceptually cleaner — one row per
 * accounting event — and matches how operators reason about the
 * ledger when investigating activity.
 *
 * ─── Endpoints used ───
 * GET /api/accounting/journals          — paginated header list
 * GET /api/accounting/journals/{id}     — single journal + lines
 * GET /api/journal-entries              — flat lines (for CSV export)
 *
 * Other consumers (loan detail, customer detail, GL reconciliation
 * drilldowns) continue to use the legacy /journal-entries endpoint
 * unchanged — they're filtering by callback or GL, not browsing
 * journals as the unit.
 *
 * ─── Filters ───
 * - Search (substring on narration / reference / legacy callback)
 * - Date range (posting_date_from / posting_date_to)
 * - Entry type (DISBURSEMENT, REPAYMENT, etc., or all)
 * - Include reversals toggle (default off — most views want
 *   business activity, not the reversal noise)
 * - Include closing toggle (default off — period-close bookkeeping
 *   is rarely what users want when browsing)
 *
 * Gated by accounting.view permission at both menu + backend layers.
 */
@Component({
  selector: 'app-journal-entries',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, MoneyPipe],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Journal Entries"
        subtitle="Each journal is a balanced posting — disbursement, repayment, write-off, etc."
        eyebrow="Accounting"></cx-page-header>

      <!-- Filter bar -->
      <div class="cx-je-filters">
        <div class="cx-je-filter-group">
          <label class="cx-je-filter-label">From</label>
          <input type="date" class="cx-input cx-je-filter-input"
                 [(ngModel)]="filters.posting_date_from"
                 (change)="applyFilters()" />
        </div>
        <div class="cx-je-filter-group">
          <label class="cx-je-filter-label">To</label>
          <input type="date" class="cx-input cx-je-filter-input"
                 [(ngModel)]="filters.posting_date_to"
                 (change)="applyFilters()" />
        </div>
        <div class="cx-je-filter-group">
          <label class="cx-je-filter-label">Type</label>
          <select class="cx-input cx-je-filter-input"
                  [(ngModel)]="filters.entry_type"
                  (change)="applyFilters()">
            <option value="">All types</option>
            @for (et of entryTypes; track et.value) {
              <option [value]="et.value">{{ et.label }}</option>
            }
          </select>
        </div>
        <div class="cx-je-filter-group">
          <label class="cx-je-filter-label">View</label>
          <div class="cx-je-toggle-row">
            <label class="cx-je-toggle">
              <input type="checkbox"
                     [(ngModel)]="filters.include_reversals"
                     (change)="applyFilters()" />
              <span>Reversals</span>
            </label>
            <label class="cx-je-toggle">
              <input type="checkbox"
                     [(ngModel)]="filters.include_closing"
                     (change)="applyFilters()" />
              <span>Closing</span>
            </label>
          </div>
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

      <!-- Summary strip — totals across the visible page -->
      @if (rows().length > 0 && !loading()) {
        <div class="cx-je-summary">
          <div class="cx-je-summary-cell">
            <div class="cx-je-summary-label">Showing</div>
            <div class="cx-je-summary-value tabular-nums">
              {{ rows().length }} of {{ pagination()?.total || rows().length }}
            </div>
          </div>
          <div class="cx-je-summary-cell">
            <div class="cx-je-summary-label">Total Lines (page)</div>
            <div class="cx-je-summary-value tabular-nums">{{ pageTotalLines() }}</div>
          </div>
          <div class="cx-je-summary-cell">
            <div class="cx-je-summary-label">Total Amount (page)</div>
            <div class="cx-je-summary-value tabular-nums">{{ pageTotalAmount() | money:2 }}</div>
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
          @if (col.key === 'entry_type') {
            <span class="cx-je-type-badge" [attr.data-type]="row.entry_type">
              {{ entryTypeLabel(row.entry_type) }}
            </span>
          } @else if (col.key === 'narration_with_status') {
            <div class="cx-je-narration-cell">
              <span class="cx-je-narration-text">{{ row.narration }}</span>
              @if (row.is_reversal) {
                <span class="cx-je-status-pill cx-je-status-reversal">REVERSAL</span>
              } @else if (row.has_reversal) {
                <span class="cx-je-status-pill cx-je-status-reversed">REVERSED</span>
              }
              @if (row.is_closing_entry) {
                <span class="cx-je-status-pill cx-je-status-closing">CLOSING</span>
              }
            </div>
          } @else if (col.key === 'posted_by') {
            @if (row.posted_by_name) {
              {{ row.posted_by_name }}
            } @else if (row.posted_by) {
              <span class="cx-je-posted-id">{{ row.posted_by }}</span>
            } @else {
              <span class="cx-je-text-muted">system</span>
            }
          } @else {
            {{ row[col.key] }}
          }
        </ng-template>
        <ng-template #rowActions let-row>
          <div class="flex items-center gap-1 justify-end">
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon"
                    (click)="openDetail(row)" title="View details">
              <lucide-icon name="eye" [size]="14"></lucide-icon>
            </button>
          </div>
        </ng-template>
      </cx-data-table>
    </div>

    <!-- Detail drawer — full journal: header + lines + reversal context -->
    @if (drawerOpen()) {
      <div class="cx-je-backdrop" (click)="closeDrawer()"></div>
      <div class="cx-je-drawer" role="dialog" aria-labelledby="je-drawer-title">

        <div class="cx-je-drawer-head">
          <div class="cx-je-drawer-head-main">
            <div class="cx-je-drawer-eyebrow">
              {{ entryTypeLabel(detailHeader()?.entry_type) }}
              @if (detailHeader()?.is_reversal) {
                <span class="cx-je-status-pill cx-je-status-reversal">REVERSAL</span>
              } @else if (detail()?.reversal) {
                <span class="cx-je-status-pill cx-je-status-reversed">REVERSED</span>
              }
              @if (detailHeader()?.is_closing_entry) {
                <span class="cx-je-status-pill cx-je-status-closing">CLOSING</span>
              }
            </div>
            <h2 id="je-drawer-title" class="cx-je-drawer-title">
              {{ detailHeader()?.narration || '—' }}
            </h2>
            <div class="cx-je-drawer-sub tabular-nums">
              {{ detailHeader()?.posting_date }}
              @if (detailHeader()?.reference) { · ref {{ detailHeader()?.reference }} }
              @if (detailHeader()?.legacy_callback) {
                · <span class="cx-je-text-muted">{{ detailHeader()?.legacy_callback }}</span>
              }
            </div>
          </div>
          <button class="cx-je-drawer-close" (click)="closeDrawer()" aria-label="Close">
            <lucide-icon name="x" [size]="18"></lucide-icon>
          </button>
        </div>

        <div class="cx-je-drawer-body">

          @if (detailLoading()) {
            <div class="cx-je-drawer-loading">
              <lucide-icon name="loader-2" [size]="16" class="cx-je-spin"></lucide-icon>
              <span>Loading journal…</span>
            </div>
          } @else if (detail()) {

            <!-- Reversal context: this journal is a reversal of … OR
                 this journal has been reversed by … -->
            @if (detail()?.reverses) {
              <div class="cx-je-reversal-banner cx-je-reversal-banner-rev">
                <lucide-icon name="rotate-ccw" [size]="14"></lucide-icon>
                <div>
                  <div class="cx-je-reversal-banner-label">This is a reversal</div>
                  <div class="cx-je-reversal-banner-value">
                    Reverses
                    <button class="cx-je-link" (click)="loadJournal(detail()?.reverses?.id)">
                      {{ detail()?.reverses?.narration || detail()?.reverses?.id }}
                    </button>
                    posted {{ detail()?.reverses?.posting_date }}
                    @if (detail()?.reverses?.posted_by_name) {
                      by {{ detail()?.reverses?.posted_by_name }}
                    }
                  </div>
                </div>
              </div>
            }
            @if (detail()?.reversal) {
              <div class="cx-je-reversal-banner cx-je-reversal-banner-revd">
                <lucide-icon name="alert-triangle" [size]="14"></lucide-icon>
                <div>
                  <div class="cx-je-reversal-banner-label">This journal has been reversed</div>
                  <div class="cx-je-reversal-banner-value">
                    Reversed by
                    <button class="cx-je-link" (click)="loadJournal(detail()?.reversal?.id)">
                      {{ detail()?.reversal?.narration || detail()?.reversal?.id }}
                    </button>
                    on {{ detail()?.reversal?.posting_date }}
                    @if (detail()?.reversal?.posted_by_name) {
                      by {{ detail()?.reversal?.posted_by_name }}
                    }
                  </div>
                </div>
              </div>
            }

            <!-- Header meta -->
            <section class="cx-je-section">
              <h3 class="cx-je-section-title">Details</h3>
              <div class="cx-je-meta">
                <div class="cx-je-meta-row">
                  <span>Posted by</span>
                  <span>
                    @if (detailHeader()?.posted_by_name) {
                      {{ detailHeader()?.posted_by_name }}
                    } @else if (detailHeader()?.posted_by) {
                      <span class="cx-je-posted-id">{{ detailHeader()?.posted_by }}</span>
                    } @else {
                      <span class="cx-je-text-muted">system</span>
                    }
                  </span>
                </div>
                <div class="cx-je-meta-row">
                  <span>Created at</span>
                  <span class="tabular-nums">{{ detailHeader()?.created_at }}</span>
                </div>
                @if (detailHeader()?.legacy_callback) {
                  <div class="cx-je-meta-row">
                    <span>Legacy callback</span>
                    <span class="tabular-nums cx-je-text-muted">{{ detailHeader()?.legacy_callback }}</span>
                  </div>
                }
              </div>
            </section>

            <!-- Lines: DR/CR ledger view -->
            <section class="cx-je-section">
              <h3 class="cx-je-section-title">
                Postings
                <span class="cx-je-section-count">{{ detail()?.lines?.length || 0 }} lines</span>
              </h3>
              <table class="cx-je-lines-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Narration</th>
                    <th class="cx-je-right">Debit</th>
                    <th class="cx-je-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  @for (l of detail()?.lines || []; track l.id) {
                    <tr>
                      <td>
                        <span class="cx-je-gl-code">{{ l.gl_code }}</span>
                        <span class="cx-je-gl-name">{{ l.gl_name }}</span>
                        @if (l.customer_ledger_no) {
                          <div class="cx-je-sub-line">↳ {{ l.customer_ledger_no }}</div>
                        }
                      </td>
                      <td class="cx-je-narration">{{ l.trans_narration }}</td>
                      <td class="cx-je-right tabular-nums">
                        @if (l.trans_type === 'DR') { {{ l.trans_amount | money:2 }} }
                      </td>
                      <td class="cx-je-right tabular-nums">
                        @if (l.trans_type === 'CR') { {{ l.trans_amount | money:2 }} }
                      </td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr class="cx-je-lines-total">
                    <td colspan="2">Totals</td>
                    <td class="cx-je-right tabular-nums">{{ detail()?.totals?.dr | money:2 }}</td>
                    <td class="cx-je-right tabular-nums">{{ detail()?.totals?.cr | money:2 }}</td>
                  </tr>
                  @if (!detail()?.totals?.balanced) {
                    <tr class="cx-je-lines-unbalanced">
                      <td colspan="4">
                        <lucide-icon name="alert-triangle" [size]="12"></lucide-icon>
                        Lines do not balance — DR and CR sums differ.
                        This shouldn't happen for a journal posted via the
                        new helper. Investigate via direct DB query if seen.
                      </td>
                    </tr>
                  }
                </tfoot>
              </table>
            </section>

          } @else {
            <div class="cx-je-empty">Failed to load journal details.</div>
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
    .cx-je-filter-group { display: flex; flex-direction: column; gap: 4px; }
    .cx-je-filter-label {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-je-filter-input { font-size: 13px; padding: 6px 10px; }
    .cx-je-filter-actions { display: flex; align-items: flex-end; gap: 6px; }

    .cx-je-toggle-row { display: flex; gap: 12px; padding-top: 4px; }
    .cx-je-toggle {
      display: flex; align-items: center; gap: 4px;
      font-size: 12px; color: var(--cx-text-secondary);
      cursor: pointer; user-select: none;
    }
    .cx-je-toggle input { margin: 0; }

    /* ═══ Summary strip ═══ */
    .cx-je-summary {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 10px; padding: 12px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
    }
    .cx-je-summary-cell { display: flex; flex-direction: column; gap: 2px; }
    .cx-je-summary-label {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-je-summary-value {
      font-size: 16px; font-weight: 600; color: var(--cx-text);
    }

    /* ═══ Type badges ═══ */
    .cx-je-type-badge {
      display: inline-flex; align-items: center;
      padding: 2px 8px;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.04em;
      border-radius: 4px;
      background: var(--cx-surface-2);
      color: var(--cx-text-secondary);
      border: 1px solid var(--cx-border);
    }
    /* Per-type tinting — keeps the page scannable when many types
       coexist. Colours kept subtle (not saturated) to avoid noise. */
    .cx-je-type-badge[data-type="DISBURSEMENT"] { background: #eff6ff; color: #1d4ed8; border-color: #dbeafe; }
    .cx-je-type-badge[data-type="REPAYMENT"]    { background: #f0fdf4; color: #166534; border-color: #dcfce7; }
    .cx-je-type-badge[data-type="PENALTY"]      { background: #fef3c7; color: #92400e; border-color: #fde68a; }
    .cx-je-type-badge[data-type="WRITE_OFF"]    { background: #fef2f2; color: #991b1b; border-color: #fee2e2; }
    .cx-je-type-badge[data-type="PROVISION"]    { background: #faf5ff; color: #6b21a8; border-color: #f3e8ff; }
    .cx-je-type-badge[data-type="CLOSE"]        { background: #f1f5f9; color: #334155; border-color: #e2e8f0; }
    .cx-je-type-badge[data-type="REVERSAL"]     { background: #fafafa; color: #525252; border-color: #e5e5e5; }
    .cx-je-type-badge[data-type="MANUAL"]       { background: #fefce8; color: #854d0e; border-color: #fef9c3; }

    .cx-je-narration-cell { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .cx-je-narration-text {
      max-width: 460px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .cx-je-status-pill {
      display: inline-flex; align-items: center;
      padding: 1px 6px;
      font-size: 9px; font-weight: 700;
      letter-spacing: 0.06em;
      border-radius: 3px;
    }
    .cx-je-status-reversal { background: #fafafa; color: #404040; border: 1px solid #d4d4d4; }
    .cx-je-status-reversed { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
    .cx-je-status-closing  { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }

    .cx-je-posted-id { font-family: monospace; font-size: 11px; color: var(--cx-text-muted); }
    .cx-je-text-muted { color: var(--cx-text-muted); font-style: italic; font-size: 12px; }

    /* ═══ Drawer ═══ */
    .cx-je-backdrop {
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.5);
      z-index: 100; backdrop-filter: blur(4px);
    }
    .cx-je-drawer {
      position: fixed; top: 0; right: 0;
      width: min(720px, calc(100vw - 32px));
      height: 100vh;
      background: var(--cx-surface);
      box-shadow: -32px 0 80px rgba(0, 0, 0, 0.2);
      display: flex; flex-direction: column;
      z-index: 101;
      animation: cx-je-drawer-in 240ms var(--cx-ease-premium, cubic-bezier(0.4, 0, 0.2, 1));
    }
    @keyframes cx-je-drawer-in {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    .cx-je-drawer-head {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 12px; padding: 20px 24px;
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-je-drawer-head-main { flex: 1; min-width: 0; }
    .cx-je-drawer-eyebrow {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      font-size: 11px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
      margin-bottom: 6px;
    }
    .cx-je-drawer-title {
      font-size: 18px; font-weight: 600;
      color: var(--cx-text);
      margin: 0; line-height: 1.3;
      word-break: break-word;
    }
    .cx-je-drawer-sub {
      font-size: 12px; color: var(--cx-text-secondary);
      margin-top: 6px;
    }
    .cx-je-drawer-close {
      flex-shrink: 0;
      background: transparent; border: 1px solid var(--cx-border);
      border-radius: 6px; padding: 6px;
      color: var(--cx-text-secondary); cursor: pointer;
    }
    .cx-je-drawer-close:hover { background: var(--cx-surface-2); }
    .cx-je-drawer-body {
      flex: 1; overflow-y: auto;
      padding: 20px 24px;
    }
    .cx-je-drawer-loading {
      display: flex; align-items: center; gap: 8px;
      padding: 16px;
      color: var(--cx-text-secondary); font-size: 13px;
    }
    .cx-je-spin { animation: cx-je-spin 1s linear infinite; }
    @keyframes cx-je-spin { to { transform: rotate(360deg); } }

    /* Reversal banners */
    .cx-je-reversal-banner {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 12px 14px;
      border-radius: var(--cx-radius-md);
      margin-bottom: 16px;
      font-size: 13px;
    }
    .cx-je-reversal-banner-rev {
      background: #f5f5f5; color: #404040;
      border: 1px solid #e5e5e5;
    }
    .cx-je-reversal-banner-revd {
      background: #fef2f2; color: #991b1b;
      border: 1px solid #fee2e2;
    }
    .cx-je-reversal-banner lucide-icon { flex-shrink: 0; margin-top: 2px; }
    .cx-je-reversal-banner-label {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      opacity: 0.7;
      margin-bottom: 2px;
    }
    .cx-je-reversal-banner-value { line-height: 1.4; }
    .cx-je-link {
      background: transparent; border: none;
      padding: 0; font: inherit; color: inherit;
      text-decoration: underline; cursor: pointer;
    }
    .cx-je-link:hover { opacity: 0.7; }

    /* Sections */
    .cx-je-section { margin-bottom: 22px; }
    .cx-je-section-title {
      font-size: 11px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
      margin: 0 0 10px 0;
      display: flex; align-items: center; gap: 8px;
    }
    .cx-je-section-count {
      font-size: 10px; font-weight: 500;
      color: var(--cx-text-muted);
      letter-spacing: 0;
      text-transform: none;
    }

    /* Meta key/value rows */
    .cx-je-meta {
      background: var(--cx-surface-2);
      border-radius: var(--cx-radius-md);
      padding: 4px 0;
    }
    .cx-je-meta-row {
      display: flex; justify-content: space-between; align-items: center;
      gap: 12px;
      padding: 8px 14px;
      font-size: 13px;
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-je-meta-row:last-child { border-bottom: none; }
    .cx-je-meta-row > span:first-child {
      color: var(--cx-text-muted);
      font-size: 12px; font-weight: 500;
    }

    /* Lines table */
    .cx-je-lines-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .cx-je-lines-table th {
      text-align: left;
      padding: 8px 10px;
      background: var(--cx-surface-2);
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--cx-text-muted);
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-je-lines-table th.cx-je-right { text-align: right; }
    .cx-je-lines-table td {
      padding: 8px 10px;
      border-bottom: 1px solid var(--cx-border);
      vertical-align: top;
    }
    .cx-je-lines-table td.cx-je-right { text-align: right; }
    .cx-je-gl-code {
      display: inline-block;
      font-family: monospace;
      font-size: 11px;
      padding: 1px 5px;
      border-radius: 3px;
      background: var(--cx-surface-2);
      color: var(--cx-text-secondary);
      margin-right: 6px;
    }
    .cx-je-gl-name { font-weight: 500; }
    .cx-je-sub-line {
      font-size: 11px;
      color: var(--cx-text-muted);
      margin-top: 2px;
      padding-left: 4px;
    }
    .cx-je-narration { color: var(--cx-text-secondary); }
    .cx-je-lines-total td {
      background: var(--cx-surface-2);
      font-weight: 600;
      border-top: 1px solid var(--cx-border);
    }
    .cx-je-lines-unbalanced td {
      padding: 8px 12px;
      background: rgba(245, 158, 11, 0.08);
      color: #b45309;
      font-size: 11px;
      text-align: center;
    }
    .cx-je-lines-unbalanced lucide-icon { vertical-align: middle; margin-right: 4px; }

    .cx-je-empty {
      padding: 16px;
      background: var(--cx-surface-2);
      border-radius: var(--cx-radius-md);
      text-align: center;
      color: var(--cx-text-muted);
      font-size: 13px;
    }
  `],
})
export class JournalEntriesComponent implements OnInit {
  // Header-rooted columns. 'narration_with_status' is a custom cell
  // that overlays the type pills (REVERSAL/REVERSED/CLOSING) on top
  // of the narration text — saves a column and keeps the table dense.
  columns: TableColumn[] = [
    { key: 'posting_date', label: 'Date' },
    { key: 'entry_type', label: 'Type', type: 'custom' },
    { key: 'narration_with_status', label: 'Narration', type: 'custom' },
    { key: 'line_count', label: 'Lines', align: 'right' },
    { key: 'total_amount', label: 'Amount', type: 'currency', align: 'right' },
    { key: 'posted_by', label: 'Posted By', type: 'custom' },
  ];

  /**
   * Static list of entry types — drives the filter dropdown. Mirrors
   * the backend JournalEntryType enum. Editing here without updating
   * the enum (or vice versa) creates a silent mismatch that the
   * backend will silently ignore (tryFrom returns null → no filter
   * applied). That's a forgiving failure mode but worth noting.
   */
  entryTypes = [
    { value: 'DISBURSEMENT', label: 'Disbursement' },
    { value: 'REPAYMENT',    label: 'Repayment' },
    { value: 'PENALTY',      label: 'Penalty' },
    { value: 'WRITE_OFF',    label: 'Write-off' },
    { value: 'PROVISION',    label: 'Provision' },
    { value: 'CLOSE',        label: 'Period close' },
    { value: 'REVERSAL',     label: 'Reversal' },
    { value: 'MANUAL',       label: 'Manual' },
  ];

  rows = signal<any[]>([]);
  loading = signal(true);
  pagination = signal<TablePagination | null>(null);
  exporting = signal(false);
  q: any = {};

  filters = {
    posting_date_from: '',
    posting_date_to: '',
    entry_type: '',
    include_reversals: false,
    include_closing: false,
  };

  // Drawer state — holds the full detail-fetch response.
  drawerOpen = signal(false);
  detail = signal<any>(null);
  detailLoading = signal(false);

  // Convenience accessor — extracts the header from the detail
  // response. The detail call returns { header, lines, totals,
  // reversal, reverses }; templates use detailHeader() rather
  // than detail()?.header for terseness.
  detailHeader = computed(() => this.detail()?.header);

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService, public settings: SettingsService) {}

  ngOnInit() {
    this.load();
  }

  /**
   * Map an entry_type enum value to a human label. Falls through the
   * dropdown list; unknown values pass through verbatim so future
   * enum additions don't render as blanks.
   */
  entryTypeLabel(value: string | undefined | null): string {
    if (!value) return '—';
    return this.entryTypes.find(et => et.value === value)?.label ?? value;
  }

  load(p?: any) {
    this.loading.set(true);
    const params: any = { ...this.q, ...p };
    Object.entries(this.filters).forEach(([k, v]) => {
      // Booleans always send (true → 'true', false omitted as default
      // matches backend's filter_var FILTER_VALIDATE_BOOLEAN behaviour).
      if (typeof v === 'boolean') {
        if (v) params[k] = 'true';
      } else if (v !== '' && v != null) {
        params[k] = v;
      }
    });
    this.api.get('/accounting/journals', params).subscribe({
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
    this.load({ page: 1, per_page: this.pagination()?.per_page ?? 20 });
  }

  clearFilters() {
    this.filters = {
      posting_date_from: '',
      posting_date_to: '',
      entry_type: '',
      include_reversals: false,
      include_closing: false,
    };
    this.applyFilters();
  }

  hasActiveFilters(): boolean {
    return Object.entries(this.filters).some(([_, v]) => {
      if (typeof v === 'boolean') return v === true;
      return v !== '';
    });
  }

  // ─── Page totals ────────────────────────────────────────────────

  pageTotalLines(): number {
    return this.rows().reduce((s, r) => s + (parseInt(r.line_count, 10) || 0), 0);
  }

  pageTotalAmount(): number {
    return this.rows().reduce((s, r) => s + parseFloat(r.total_amount || '0'), 0);
  }

  // ─── Drawer ─────────────────────────────────────────────────────

  openDetail(row: any) {
    this.drawerOpen.set(true);
    this.loadJournal(row.id);
  }

  /**
   * Load the full detail for a given journal id. Used by openDetail
   * (initial click) and by the reversal-banner links inside the
   * drawer (to navigate from reversal → original or vice versa
   * without closing the drawer).
   */
  loadJournal(id: string | undefined | null) {
    if (!id) return;
    this.detailLoading.set(true);
    this.detail.set(null);
    this.api.get(`/accounting/journals/${id}`).subscribe({
      next: r => {
        this.detail.set(r.data);
        this.detailLoading.set(false);
      },
      error: () => {
        this.detailLoading.set(false);
        this.toast.error('Failed to load journal details');
      },
    });
  }

  closeDrawer() {
    this.drawerOpen.set(false);
    this.detail.set(null);
  }

  // ─── CSV export ─────────────────────────────────────────────────

  /**
   * Export the currently-filtered result set as flat ledger lines.
   *
   * We call the legacy /journal-entries endpoint with the same
   * filters because the export semantics are 'flat lines for a
   * spreadsheet', not 'one row per journal'. The legacy endpoint
   * already handles that shape and was extended in sub-phase F to
   * accept entry_type as a filter (joins through journal_entry_id).
   *
   * Date filters map directly: posting_date_from/to → date_from/to.
   *
   * Reversal/closing toggles don't have a direct equivalent on the
   * legacy endpoint (it surfaces every line). We accept that the
   * exported CSV may include reversal/closing lines that the table
   * view filtered out — for export, that's usually what auditors
   * actually want anyway.
   *
   * Capped at 5000 rows. Larger exports should go through a
   * background-job pattern (future enhancement).
   */
  exportCsv() {
    this.exporting.set(true);
    const params: any = { per_page: 5000, page: 1 };
    if (this.filters.posting_date_from) params.date_from = this.filters.posting_date_from;
    if (this.filters.posting_date_to)   params.date_to = this.filters.posting_date_to;
    if (this.filters.entry_type)        params.entry_type = this.filters.entry_type;

    this.api.get('/journal-entries', params).subscribe({
      next: r => {
        const items = r.data || [];
        if (items.length === 0) {
          this.toast.error('No entries to export');
          this.exporting.set(false);
          return;
        }
        const headers = [
          'Posting Date', 'Account Code', 'Account Name', 'Type',
          'Amount', 'Narration', 'Reference', 'Callback',
          'Customer Ledger', 'Posted By',
        ];
        const escape = (v: any) => {
          if (v == null) return '';
          const s = String(v);
          // RFC 4180: quote + escape if contains comma, quote, or newline.
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
        this.toast.success(`Exported ${items.length} lines`);
        this.exporting.set(false);
      },
      error: () => {
        this.exporting.set(false);
        this.toast.error('Export failed');
      },
    });
  }
}
