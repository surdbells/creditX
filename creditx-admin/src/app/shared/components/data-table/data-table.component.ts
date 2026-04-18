import { Component, Input, Output, EventEmitter, signal, computed, ContentChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Search, ChevronLeft, ChevronRight, Columns3, SlidersHorizontal, Download, ChevronUp, ChevronDown } from 'lucide-angular';

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
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <!-- Toolbar -->
    <div class="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <div class="relative flex-1 max-w-sm">
          <lucide-icon name="search" class="absolute left-1 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" [size]="16"></lucide-icon>
          <input type="text" class="cx-input !pl-8" [placeholder]="searchPlaceholder"
            [ngModel]="searchTerm()" (ngModelChange)="onSearchChange($event)" />
        </div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <div class="relative">
          <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="showColumnPicker.set(!showColumnPicker())">
            <lucide-icon name="columns-3" [size]="14"></lucide-icon>
            <span class="hidden sm:inline">Columns</span>
          </button>
          @if (showColumnPicker()) {
            <div class="absolute right-0 top-full mt-1 z-50 bg-[var(--cx-surface)] border border-[var(--cx-border)] rounded-xl p-3 min-w-[200px] shadow-xl cx-animate-in">
              @for (col of allColumns; track col.key) {
                <label class="flex items-center gap-2 py-1.5 cursor-pointer text-xs font-medium">
                  <input type="checkbox" [checked]="isColumnVisible(col.key)" (change)="toggleColumn(col.key)" class="rounded" />
                  <span class="text-[var(--cx-text)]">{{ col.label }}</span>
                </label>
              }
            </div>
          }
        </div>
        @if (exportable) {
          <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="onExport.emit()">
            <lucide-icon name="download" [size]="14"></lucide-icon> <span class="hidden sm:inline">Export</span>
          </button>
        }
        <ng-content select="[tableActions]"></ng-content>
      </div>
    </div>

    <!-- Table -->
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b border-[var(--cx-border)]">
            @for (col of visibleColumns(); track col.key) {
              <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider whitespace-nowrap select-none"
                [class.cursor-pointer]="col.sortable !== false"
                [style.width]="col.width || 'auto'" [style.text-align]="col.align || 'left'"
                (click)="col.sortable !== false ? onSort(col.key) : null">
                <div class="flex items-center gap-1">
                  {{ col.label }}
                  @if (col.sortable !== false && currentSort() === col.key) {
                    <lucide-icon [name]="currentSortDir() === 'ASC' ? 'arrow-up' : 'arrow-down'" [size]="12"></lucide-icon>
                  }
                </div>
              </th>
            }
            @if (hasActions) {
              <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider w-[100px]">Actions</th>
            }
          </tr>
        </thead>
        <tbody>
          @if (loading) {
            <tr>
              <td [attr.colspan]="visibleColumns().length + (hasActions ? 1 : 0)" class="px-4 py-16 text-center">
                <div class="flex flex-col items-center gap-3">
                  <div class="w-8 h-8 border-3 border-[var(--cx-primary)] border-t-transparent rounded-full animate-spin"></div>
                  <span class="text-sm text-[var(--cx-text-muted)]">Loading...</span>
                </div>
              </td>
            </tr>
          } @else if (!rows || rows.length === 0) {
            <tr>
              <td [attr.colspan]="visibleColumns().length + (hasActions ? 1 : 0)" class="px-4 py-16 text-center">
                <div class="flex flex-col items-center gap-2">
                  <lucide-icon name="database" [size]="36" class="text-[var(--cx-text-muted)] opacity-30"></lucide-icon>
                  <span class="text-sm text-[var(--cx-text-muted)]">{{ emptyMessage }}</span>
                </div>
              </td>
            </tr>
          } @else {
            @for (row of rows; track trackByFn(row)) {
              <tr class="border-b border-[var(--cx-border)] hover:bg-[var(--cx-surface-hover)] transition-colors">
                @for (col of visibleColumns(); track col.key) {
                  <td class="px-4 py-3 text-sm" [style.text-align]="col.align || 'left'">
                    @if (col.type === 'badge' && col.badgeMap) {
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                            [ngClass]="col.badgeMap[row[col.key]]?.class || 'bg-gray-100 text-gray-700'">
                        {{ col.badgeMap[row[col.key]]?.label || row[col.key] }}
                      </span>
                    } @else if (col.type === 'currency') {
                      <span class="font-medium">₦{{ row[col.key] | number:'1.0-0' }}</span>
                    } @else if (col.type === 'date') {
                      <span class="text-xs text-[var(--cx-text-muted)]">{{ row[col.key] | date:'mediumDate' }}</span>
                    } @else if (col.type === 'custom' && cellTemplate) {
                      <ng-container *ngTemplateOutlet="cellTemplate; context: { $implicit: row, column: col }"></ng-container>
                    } @else {
                      {{ row[col.key] }}
                    }
                  </td>
                }
                @if (hasActions && rowActionsTemplate) {
                  <td class="px-4 py-3 text-right">
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
      <div class="flex flex-col gap-3 mt-0 px-4 py-3 border-t border-[var(--cx-border)] sm:flex-row sm:items-center sm:justify-between">
        <div class="text-xs text-[var(--cx-text-muted)]">
          Showing {{ ((pagination.page - 1) * pagination.per_page) + 1 }}–{{ Math.min(pagination.page * pagination.per_page, pagination.total) }}
          of {{ pagination.total | number }} entries
        </div>
        <div class="flex items-center gap-1">
          <select class="cx-select !w-auto !py-1 !text-xs !rounded-lg" [ngModel]="pagination.per_page" (ngModelChange)="onPerPageChange($event)">
            <option [value]="10">10</option><option [value]="20">20</option><option [value]="50">50</option><option [value]="100">100</option>
          </select>
          <button class="cx-btn cx-btn-ghost cx-btn-sm" [disabled]="pagination.page <= 1" (click)="onPageChange(pagination.page - 1)">
            <lucide-icon name="chevron-left" [size]="14"></lucide-icon>
          </button>
          <span class="text-xs px-2 font-medium text-[var(--cx-text-muted)]">{{ pagination.page }} / {{ pagination.total_pages }}</span>
          <button class="cx-btn cx-btn-ghost cx-btn-sm" [disabled]="pagination.page >= pagination.total_pages" (click)="onPageChange(pagination.page + 1)">
            <lucide-icon name="chevron-right" [size]="14"></lucide-icon>
          </button>
        </div>
      </div>
    }
  `,
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

  @Output() query = new EventEmitter<TableQueryEvent>();
  @Output() onExport = new EventEmitter<void>();

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
