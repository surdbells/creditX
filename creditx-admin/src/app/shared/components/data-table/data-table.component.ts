import { Component, Input, Output, EventEmitter, signal, computed, ContentChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Search, ChevronLeft, ChevronRight, Columns3, SlidersHorizontal, Download, ChevronUp, ChevronDown } from 'lucide-angular';
import { MoneyPipe } from '../../pipes/money.pipe';
import { SearchableSelectDirective } from '../../directives/searchable-select.directive';

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  visible?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  type?: 'text' | 'date' | 'currency' | 'badge' | 'custom';
  badgeMap?: Record<string, { label: string; class: string }>;
}

export interface TablePagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface TableSortEvent {
  sort_by: string;
  sort_dir: 'ASC' | 'DESC';
}

export interface TableQueryEvent {
  page: number;
  per_page: number;
  search: string;
  sort_by: string;
  sort_dir: 'ASC' | 'DESC';
  [key: string]: any;
}

@Component({
  selector: 'cx-data-table',
  standalone: true,
  imports: [SearchableSelectDirective, CommonModule, FormsModule, LucideAngularModule, MoneyPipe],
  template: `
    <div class="cx-dtable">
      <!-- Toolbar -->
      <div class="cx-dtable-toolbar">
        <div class="cx-dtable-search">
          <lucide-icon name="search" [size]="14" class="cx-dtable-search-icon"></lucide-icon>
          <input type="text" class="cx-dtable-search-input" [placeholder]="searchPlaceholder"
            [ngModel]="searchTerm()" (ngModelChange)="onSearchChange($event)" />
        </div>
        <div class="cx-dtable-actions">
          <div style="position: relative;">
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="showColumnPicker.set(!showColumnPicker())">
              <lucide-icon name="columns-3" [size]="14"></lucide-icon>
              <span class="hidden sm:inline">Columns</span>
            </button>
            @if (showColumnPicker()) {
              <div class="cx-dtable-col-picker">
                <div class="cx-dtable-col-picker-title">Toggle columns</div>
                @for (col of allColumns; track col.key) {
                  <label class="cx-dtable-col-option">
                    <input type="checkbox" [checked]="isColumnVisible(col.key)" (change)="toggleColumn(col.key)" />
                    <span>{{ col.label }}</span>
                  </label>
                }
              </div>
            }
          </div>
          @if (exportable) {
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="onExport.emit()">
              <lucide-icon name="download" [size]="14"></lucide-icon>
              <span class="hidden sm:inline">Export</span>
            </button>
          }
          <ng-content select="[tableActions]"></ng-content>
        </div>
      </div>

      <!-- Table -->
      <div class="cx-dtable-scroll">
        <table class="cx-dtable-table">
          <thead>
            <tr>
              @if (selectable) {
                <th class="cx-dtable-select-col">
                  <input type="checkbox"
                         [checked]="allVisibleSelected()"
                         [indeterminate]="someVisibleSelected()"
                         (change)="toggleAllVisible($event)"
                         aria-label="Select all on this page" />
                </th>
              }
              @for (col of visibleColumns(); track col.key) {
                <th [class.is-sortable]="col.sortable !== false"
                  [class.is-sorted]="currentSort() === col.key"
                  [style.width]="col.width || 'auto'"
                  [style.text-align]="col.align || 'left'"
                  (click)="col.sortable !== false ? onSort(col.key) : null">
                  <div class="cx-dtable-th-inner" [style.justify-content]="col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start'">
                    <span>{{ col.label }}</span>
                    @if (col.sortable !== false) {
                      @if (currentSort() === col.key) {
                        <lucide-icon [name]="currentSortDir() === 'ASC' ? 'arrow-up' : 'arrow-down'" [size]="12" class="cx-dtable-sort-icon is-active"></lucide-icon>
                      } @else {
                        <lucide-icon name="chevrons-up-down" [size]="12" class="cx-dtable-sort-icon"></lucide-icon>
                      }
                    }
                  </div>
                </th>
              }
              @if (hasActions) {
                <th class="cx-dtable-actions-col">Actions</th>
              }
            </tr>
          </thead>
          <tbody>
            @if (loading) {
              <tr>
                <td [attr.colspan]="visibleColumns().length + (hasActions ? 1 : 0) + (selectable ? 1 : 0)" class="cx-dtable-state">
                  <div class="cx-dtable-loading">
                    <div class="cx-dtable-loading-dots"><span></span><span></span><span></span></div>
                    <span>Loading...</span>
                  </div>
                </td>
              </tr>
            } @else if (!rows || rows.length === 0) {
              <tr>
                <td [attr.colspan]="visibleColumns().length + (hasActions ? 1 : 0) + (selectable ? 1 : 0)" class="cx-dtable-state">
                  <div class="cx-dtable-empty">
                    <lucide-icon name="database" [size]="28"></lucide-icon>
                    <span>{{ emptyMessage }}</span>
                  </div>
                </td>
              </tr>
            } @else {
              @for (row of rows; track trackByFn(row)) {
                <tr [class.cx-dtable-row-selected]="selectable && isRowSelected(row)">
                  @if (selectable) {
                    <td class="cx-dtable-select-col" (click)="$event.stopPropagation()">
                      <input type="checkbox"
                             [checked]="isRowSelected(row)"
                             (change)="toggleRow(row, $event)"
                             aria-label="Select row" />
                    </td>
                  }
                  @for (col of visibleColumns(); track col.key) {
                    <td [style.text-align]="col.align || 'left'">
                      @if (col.type === 'badge' && col.badgeMap) {
                        <span class="cx-badge"
                              [ngClass]="col.badgeMap[row[col.key]]?.class || 'cx-badge-neutral'">
                          {{ col.badgeMap[row[col.key]]?.label || row[col.key] }}
                        </span>
                      } @else if (col.type === 'currency') {
                        <span class="cx-dtable-currency tabular-nums">{{ row[col.key] | money }}</span>
                      } @else if (col.type === 'date') {
                        <span class="cx-dtable-date">{{ row[col.key] | date:'mediumDate' }}</span>
                      } @else if (col.type === 'custom' && cellTemplate) {
                        <ng-container *ngTemplateOutlet="cellTemplate; context: { $implicit: row, column: col }"></ng-container>
                      } @else {
                        {{ row[col.key] }}
                      }
                    </td>
                  }
                  @if (hasActions && rowActionsTemplate) {
                    <td class="cx-dtable-row-actions">
                      <ng-container *ngTemplateOutlet="rowActionsTemplate; context: { $implicit: row }"></ng-container>
                    </td>
                  }
                </tr>
              }
            }
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      @if (pagination) {
        <div class="cx-dtable-pagination">
          <div class="cx-dtable-pagination-info">
            Showing <span class="tabular-nums">{{ ((pagination.page - 1) * pagination.per_page) + 1 }}</span>&ndash;<span class="tabular-nums">{{ Math.min(pagination.page * pagination.per_page, pagination.total) }}</span>
            of <span class="tabular-nums">{{ pagination.total | number }}</span>
          </div>
          <div class="cx-dtable-pagination-controls">
            <select class="cx-dtable-per-page" [ngModel]="pagination.per_page" (ngModelChange)="onPerPageChange($event)">
              <option [value]="10">10 / page</option>
              <option [value]="20">20 / page</option>
              <option [value]="50">50 / page</option>
              <option [value]="100">100 / page</option>
            </select>
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" [disabled]="pagination.page <= 1" (click)="onPageChange(pagination.page - 1)" aria-label="Previous page">
              <lucide-icon name="chevron-left" [size]="14"></lucide-icon>
            </button>
            <span class="cx-dtable-page-indicator tabular-nums">{{ pagination.page }} / {{ pagination.total_pages }}</span>
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" [disabled]="pagination.page >= pagination.total_pages" (click)="onPageChange(pagination.page + 1)" aria-label="Next page">
              <lucide-icon name="chevron-right" [size]="14"></lucide-icon>
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .cx-dtable {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      overflow: hidden;
    }
    .cx-dtable-toolbar {
      display: flex; flex-direction: column; gap: 0.75rem;
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--cx-border);
      background: var(--cx-surface);
    }
    @media (min-width: 640px) {
      .cx-dtable-toolbar { flex-direction: row; align-items: center; justify-content: space-between; }
    }
    .cx-dtable-search {
      position: relative; flex: 1; max-width: 24rem;
    }
    .cx-dtable-search-icon {
      position: absolute; left: 0.75rem; top: 50%;
      transform: translateY(-50%);
      color: var(--cx-text-muted); pointer-events: none;
    }
    .cx-dtable-search-input {
      width: 100%;
      padding: 0.45rem 0.75rem 0.45rem 2.15rem;
      background: var(--cx-surface-2);
      border: 1px solid transparent;
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      outline: none;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-dtable-search-input:hover { border-color: var(--cx-border); }
    .cx-dtable-search-input:focus {
      background: var(--cx-surface);
      border-color: var(--cx-primary-600);
      box-shadow: var(--cx-ring-focus);
    }
    .cx-dtable-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }

    .cx-dtable-col-picker {
      position: absolute; right: 0; top: calc(100% + 4px);
      z-index: var(--cx-z-dropdown);
      min-width: 220px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-lg);
      box-shadow: var(--cx-shadow-lg);
      padding: 0.5rem;
      animation: cx-fade-in var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cx-dtable-col-picker-title {
      font-size: var(--cx-text-xs); font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.05em;
      color: var(--cx-text-muted);
      padding: 0.35rem 0.5rem 0.5rem;
    }
    .cx-dtable-col-option {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.4rem 0.5rem;
      border-radius: var(--cx-radius-sm);
      font-size: var(--cx-text-sm);
      cursor: pointer;
      transition: background var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-dtable-col-option:hover { background: var(--cx-surface-hover); }

    .cx-dtable-scroll { overflow-x: auto; }
    .cx-dtable-table { width: 100%; border-collapse: collapse; }

    .cx-dtable-table thead {
      background: var(--cx-surface-2);
      position: sticky; top: 0; z-index: 1;
    }
    .cx-dtable-table thead tr {
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-dtable-table th {
      padding: 0.75rem 1rem;
      font-size: var(--cx-text-xs); font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.05em;
      color: var(--cx-text-muted);
      white-space: nowrap;
      user-select: none;
      transition: color var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-dtable-table th.is-sortable { cursor: pointer; }
    .cx-dtable-table th.is-sortable:hover { color: var(--cx-text); }
    .cx-dtable-table th.is-sorted { color: var(--cx-primary-700); }
    .cx-dtable-th-inner { display: flex; align-items: center; gap: 4px; }
    .cx-dtable-sort-icon {
      color: var(--cx-text-subtle);
      opacity: 0.6;
      transition: opacity var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-dtable-table th:hover .cx-dtable-sort-icon { opacity: 1; }
    .cx-dtable-sort-icon.is-active { color: var(--cx-primary-600); opacity: 1; }

    .cx-dtable-table td {
      padding: 0.75rem 1rem;
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cx-dtable-table tbody tr {
      transition: background var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-dtable-table tbody tr:hover { background: var(--cx-surface-hover); }
    .cx-dtable-table tbody tr:last-child td { border-bottom: none; }

    .cx-dtable-actions-col {
      text-align: right !important;
      width: 100px;
    }
    .cx-dtable-row-actions { text-align: right; }

    /* Selection column — narrow, centered checkbox */
    .cx-dtable-select-col {
      width: 40px;
      text-align: center !important;
      padding: 0 !important;
    }
    .cx-dtable-select-col input[type="checkbox"] {
      cursor: pointer;
      width: 16px;
      height: 16px;
      accent-color: var(--cx-primary-600, #2563eb);
    }
    .cx-dtable-row-selected {
      background: rgba(59, 130, 246, 0.06) !important;
    }
    .cx-dtable-row-selected td {
      border-left: 2px solid var(--cx-primary-600, #2563eb);
    }

    .cx-dtable-currency { font-weight: 500; color: var(--cx-text); }
    .cx-dtable-date { font-size: var(--cx-text-xs); color: var(--cx-text-muted); }

    .cx-dtable-state { padding: 4rem 1rem; text-align: center; }
    .cx-dtable-loading { display: inline-flex; align-items: center; gap: 0.75rem; color: var(--cx-text-muted); }
    .cx-dtable-loading-dots { display: inline-flex; gap: 4px; }
    .cx-dtable-loading-dots span {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--cx-primary-600);
      animation: cx-loading-pulse 1.2s infinite var(--cx-ease-premium);
    }
    .cx-dtable-loading-dots span:nth-child(2) { animation-delay: 0.2s; background: var(--cx-accent-500); }
    .cx-dtable-loading-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes cx-loading-pulse {
      0%, 100% { opacity: 0.3; transform: scale(0.8); }
      50% { opacity: 1; transform: scale(1.15); }
    }
    .cx-dtable-empty {
      display: inline-flex; flex-direction: column; align-items: center; gap: 0.5rem;
      color: var(--cx-text-muted);
      font-size: var(--cx-text-sm);
    }
    .cx-dtable-empty lucide-icon { opacity: 0.3; }

    .cx-dtable-pagination {
      display: flex; flex-direction: column; gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--cx-border);
      background: var(--cx-surface);
    }
    @media (min-width: 640px) {
      .cx-dtable-pagination { flex-direction: row; align-items: center; justify-content: space-between; }
    }
    .cx-dtable-pagination-info {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
    }
    .cx-dtable-pagination-controls { display: flex; align-items: center; gap: 0.35rem; }
    .cx-dtable-per-page {
      padding: 0.3rem 1.75rem 0.3rem 0.65rem;
      background: var(--cx-surface-2);
      border: 1px solid transparent;
      border-radius: var(--cx-radius-sm);
      font-size: var(--cx-text-xs);
      color: var(--cx-text);
      cursor: pointer; outline: none; appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b6965' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 0.5rem center;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-dtable-per-page:hover { background-color: var(--cx-surface); border-color: var(--cx-border); }
    .cx-dtable-page-indicator {
      font-size: var(--cx-text-xs); font-weight: 500;
      color: var(--cx-text-secondary);
      padding: 0 0.5rem;
      min-width: 60px; text-align: center;
    }

    /* Dark mode */
    :host-context(.dark) .cx-dtable-search-input { background: var(--cx-surface-2); }
  `],
})
export class DataTableComponent {
  @Input() allColumns: TableColumn[] = [];
  @Input() rows: any[] = [];
  @Input() loading = false;
  @Input() pagination: TablePagination | null = null;
  @Input() searchPlaceholder = 'Search...';
  @Input() emptyMessage = 'No data found';
  @Input() hasActions = false;
  @Input() exportable = false;
  @Input() trackBy = 'id';
  // Selection — opt-in checkbox column for batch actions on the queues
  // (approval-queue, disbursement-queue, maker-checker). When true:
  //   - A checkbox column renders leftmost
  //   - Header checkbox toggles all visible rows
  //   - selectedIds is a Set<string> owned by the parent component
  //     (persisted across pagination there), passed in + emitted out.
  //
  // When false (default), no checkbox column renders, preserving all
  // existing tables without change.
  @Input() selectable = false;
  @Input() selectedIds: Set<string> = new Set();

  @Output() query = new EventEmitter<TableQueryEvent>();
  @Output() onExport = new EventEmitter<void>();
  @Output() selectedIdsChange = new EventEmitter<Set<string>>();

  @ContentChild('rowActions') rowActionsTemplate?: TemplateRef<any>;
  @ContentChild('cellTemplate') cellTemplate?: TemplateRef<any>;

  Math = Math;
  searchTerm = signal('');
  showColumnPicker = signal(false);
  hiddenColumns = signal<Set<string>>(new Set());
  currentSort = signal('createdAt');
  currentSortDir = signal<'ASC' | 'DESC'>('DESC');

  private searchTimeout: any;

  visibleColumns = computed(() =>
    this.allColumns.filter(c => c.visible !== false && !this.hiddenColumns().has(c.key))
  );

  isColumnVisible(key: string): boolean {
    return !this.hiddenColumns().has(key);
  }

  toggleColumn(key: string): void {
    this.hiddenColumns.update(set => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  onSearchChange(term: string): void {
    this.searchTerm.set(term);
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.emitQuery(), 400);
  }

  onSort(key: string): void {
    if (this.currentSort() === key) {
      this.currentSortDir.update(d => d === 'ASC' ? 'DESC' : 'ASC');
    } else {
      this.currentSort.set(key);
      this.currentSortDir.set('ASC');
    }
    this.emitQuery();
  }

  onPageChange(page: number): void {
    this.emitQuery(page);
  }

  onPerPageChange(perPage: number | string): void {
    this.emitQuery(1, Number(perPage));
  }

  trackByFn(row: any): any {
    return row[this.trackBy] ?? row;
  }

  // ─── Selection ────────────────────────────────────────────────────
  //
  // Selection state is owned by the parent component and passed in as
  // selectedIds (a Set for O(1) membership checks + unique guarantees).
  // We mutate the passed-in Set in place and emit the same reference
  // back. Parent also tracks a separate Set so pagination navigation
  // preserves selections across pages — we only toggle what's visible
  // on the current page.

  /**
   * Is the given row's ID in the current selection?
   * Used for both the row's checkbox state and the selected-row style.
   */
  isRowSelected(row: any): boolean {
    const id = row?.[this.trackBy];
    return id != null && this.selectedIds.has(String(id));
  }

  /**
   * True when every CURRENTLY VISIBLE row is selected. The page-level
   * 'select all' header checkbox uses this to show the full-tick state.
   * Distinct from 'all across pagination selected', which would require
   * knowing the total count — we scope to the visible page for sanity.
   */
  allVisibleSelected(): boolean {
    if (!this.rows || this.rows.length === 0) return false;
    return this.rows.every(r => this.isRowSelected(r));
  }

  /**
   * True when some but not all visible rows are selected. Renders the
   * indeterminate tri-state on the header checkbox so the user knows
   * they have a partial selection on this page.
   */
  someVisibleSelected(): boolean {
    if (!this.rows || this.rows.length === 0) return false;
    const selectedCount = this.rows.filter(r => this.isRowSelected(r)).length;
    return selectedCount > 0 && selectedCount < this.rows.length;
  }

  /**
   * Toggle an individual row's selection. Stops propagation at the
   * click handler (on the <td>) to avoid triggering row-click effects.
   */
  toggleRow(row: any, ev: Event): void {
    const id = row?.[this.trackBy];
    if (id == null) return;
    const next = new Set(this.selectedIds);
    const key = String(id);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this.selectedIds = next;
    this.selectedIdsChange.emit(next);
  }

  /**
   * Toggle all visible rows. When the header checkbox is checked
   * (transitioning to true), add every visible row's ID. When it's
   * unchecked (transitioning to false), remove every visible row's ID.
   * Either way, rows NOT on this page keep their selection state — the
   * header checkbox only operates on what's rendered.
   */
  toggleAllVisible(ev: Event): void {
    const target = ev.target as HTMLInputElement;
    const shouldSelect = target.checked;
    const next = new Set(this.selectedIds);
    for (const row of this.rows) {
      const id = row?.[this.trackBy];
      if (id == null) continue;
      const key = String(id);
      if (shouldSelect) {
        next.add(key);
      } else {
        next.delete(key);
      }
    }
    this.selectedIds = next;
    this.selectedIdsChange.emit(next);
  }

  private emitQuery(page?: number, perPage?: number): void {
    this.query.emit({
      page: page ?? this.pagination?.page ?? 1,
      per_page: perPage ?? this.pagination?.per_page ?? 20,
      search: this.searchTerm(),
      sort_by: this.currentSort(),
      sort_dir: this.currentSortDir(),
    });
  }
}
