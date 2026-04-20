import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { SearchableSelectComponent, SelectOption } from '../../shared/components/searchable-select/searchable-select.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-audit-logs', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, SearchableSelectComponent, EmptyStateComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Audit Trail"
        [subtitle]="(totalRecords | number) + ' events logged across the system'"
        eyebrow="Compliance">
        <div class="relative">
          <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="exportOpen = !exportOpen">
            <lucide-icon name="download" [size]="14"></lucide-icon>
            <span>Export</span>
            <lucide-icon name="chevron-down" [size]="12"></lucide-icon>
          </button>
          @if (exportOpen) {
            <div class="cx-audit-export-menu cx-animate-in">
              <button class="cx-audit-export-option" (click)="exportData('csv')">
                <lucide-icon name="file-spreadsheet" [size]="14"></lucide-icon>
                <span>CSV</span>
              </button>
              <button class="cx-audit-export-option" (click)="exportData('excel')">
                <lucide-icon name="file-spreadsheet" [size]="14"></lucide-icon>
                <span>Excel</span>
              </button>
              <button class="cx-audit-export-option" (click)="exportData('pdf')">
                <lucide-icon name="file-text" [size]="14"></lucide-icon>
                <span>PDF</span>
              </button>
            </div>
          }
        </div>
      </cx-page-header>

      <!-- Filters -->
      <div class="cx-audit-filters">
        <div class="cx-audit-filter-search">
          <lucide-icon name="search" [size]="14" class="cx-audit-filter-search-icon"></lucide-icon>
          <input type="text" class="cx-audit-filter-search-input"
            placeholder="Search by user, entity, description..."
            [(ngModel)]="filters.search" (input)="onFilterChange()" />
        </div>
        <cx-searchable-select [options]="userOptions()" placeholder="All Users" [clearable]="true"
          [(ngModel)]="filters.user_id" (ngModelChange)="onFilterChange()"></cx-searchable-select>
        <select class="cx-select" [(ngModel)]="filters.action" (change)="onFilterChange()">
          <option value="">All Actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="login">Login</option>
          <option value="logout">Logout</option>
          <option value="approve">Approve</option>
          <option value="reject">Reject</option>
        </select>
        <select class="cx-select" [(ngModel)]="filters.entity_type" (change)="onFilterChange()">
          <option value="">All Entities</option>
          <option value="User">User</option>
          <option value="Loan">Loan</option>
          <option value="Customer">Customer</option>
          <option value="Payment">Payment</option>
          <option value="GovernmentRecord">Gov. Record</option>
          <option value="LoanProduct">Loan Product</option>
          <option value="Disbursement">Disbursement</option>
          <option value="JournalReversal">Reversal</option>
        </select>
        <input type="date" class="cx-input" [(ngModel)]="filters.date_from" (change)="onFilterChange()" title="From date" />
        <input type="date" class="cx-input" [(ngModel)]="filters.date_to" (change)="onFilterChange()" title="To date" />
      </div>

      <!-- Table -->
      <div class="cx-audit-table-wrap">
        @if (loading()) {
          <div class="cx-audit-state">
            <div class="cx-audit-loading">
              <div class="cx-audit-loading-dots"><span></span><span></span><span></span></div>
              <span>Loading audit trail...</span>
            </div>
          </div>
        } @else if (rows().length === 0) {
          <div class="cx-audit-state">
            <cx-empty-state title="No audit events found" description="Try adjusting your filters or date range." icon="scroll-text"></cx-empty-state>
          </div>
        } @else {
          <div class="cx-audit-table-scroll">
            <table class="cx-audit-table">
              <thead>
                <tr>
                  <th class="cx-audit-th-sortable" (click)="sort('createdAt')">
                    <div class="cx-audit-th-inner">
                      <span>Timestamp</span>
                      @if (filters.sort_by === 'createdAt') {
                        <lucide-icon [name]="filters.sort_dir === 'ASC' ? 'arrow-up' : 'arrow-down'" [size]="12" class="cx-audit-sort-icon is-active"></lucide-icon>
                      } @else {
                        <lucide-icon name="chevrons-up-down" [size]="12" class="cx-audit-sort-icon"></lucide-icon>
                      }
                    </div>
                  </th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Details</th>
                  <th>IP Address</th>
                  <th class="cx-audit-actions-col"></th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.id) {
                  <tr>
                    <td>
                      <div class="cx-audit-timestamp">
                        <div class="cx-audit-time">{{ row.created_at | date:'MMM d, HH:mm' }}</div>
                        <div class="cx-audit-time-sec">{{ row.created_at | date:'yyyy' }}</div>
                      </div>
                    </td>
                    <td>
                      <div class="cx-audit-user">{{ row.user_name || 'System' }}</div>
                    </td>
                    <td>
                      <span class="cx-status-badge" [attr.data-tone]="actionTone(row.action)">
                        <span class="cx-status-dot"></span>
                        <span>{{ row.action | titlecase }}</span>
                      </span>
                    </td>
                    <td>
                      <div class="cx-audit-entity">{{ row.entity_type }}</div>
                      <div class="cx-audit-entity-id">{{ row.entity_id | slice:0:8 }}…</div>
                    </td>
                    <td>
                      <div class="cx-audit-desc">{{ row.description || summarize(row) }}</div>
                    </td>
                    <td class="cx-audit-ip">{{ row.ip_address || '—' }}</td>
                    <td class="cx-audit-actions-col">
                      <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="viewDetail(row)" title="View Changes">
                        <lucide-icon name="eye" [size]="14"></lucide-icon>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <!-- Pagination -->
          <div class="cx-audit-pagination">
            <div class="cx-audit-pagination-info">
              Showing <span class="tabular-nums">{{ (page - 1) * perPage + 1 }}</span>&ndash;<span class="tabular-nums">{{ min(page * perPage, totalRecords) }}</span>
              of <span class="tabular-nums">{{ totalRecords | number }}</span>
            </div>
            <div class="cx-audit-pagination-controls">
              <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" [disabled]="page <= 1" (click)="goPage(page - 1)" aria-label="Previous">
                <lucide-icon name="chevron-left" [size]="14"></lucide-icon>
              </button>
              @for (p of pageNumbers(); track p) {
                <button class="cx-btn cx-btn-sm cx-audit-page-btn" [class]="p === page ? 'cx-btn-primary' : 'cx-btn-ghost'" (click)="goPage(p)">{{ p }}</button>
              }
              <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" [disabled]="page >= totalPages" (click)="goPage(page + 1)" aria-label="Next">
                <lucide-icon name="chevron-right" [size]="14"></lucide-icon>
              </button>
            </div>
          </div>
        }
      </div>
    </div>

    <!-- Detail Modal -->
    @if (detailRow) {
      <div class="cx-audit-detail-root" (click)="detailRow = null">
        <div class="cx-audit-detail-backdrop"></div>
        <div class="cx-audit-detail-panel" (click)="$event.stopPropagation()">
          <header class="cx-audit-detail-header">
            <div>
              <div class="cx-eyebrow">Audit Event</div>
              <h3 class="cx-audit-detail-title">{{ detailRow.action | titlecase }} · {{ detailRow.entity_type }}</h3>
            </div>
            <button class="cx-btn cx-btn-ghost cx-btn-icon" (click)="detailRow = null" aria-label="Close">
              <lucide-icon name="x" [size]="18"></lucide-icon>
            </button>
          </header>
          <div class="cx-audit-detail-body">
            <div class="cx-audit-detail-grid">
              <div class="cx-audit-detail-field">
                <div class="cx-audit-detail-label">User</div>
                <div class="cx-audit-detail-value">{{ detailRow.user_name || 'System' }}</div>
              </div>
              <div class="cx-audit-detail-field">
                <div class="cx-audit-detail-label">Action</div>
                <div class="cx-audit-detail-value">
                  <span class="cx-status-badge" [attr.data-tone]="actionTone(detailRow.action)">
                    <span class="cx-status-dot"></span>
                    <span>{{ detailRow.action | titlecase }}</span>
                  </span>
                </div>
              </div>
              <div class="cx-audit-detail-field">
                <div class="cx-audit-detail-label">Entity Type</div>
                <div class="cx-audit-detail-value">{{ detailRow.entity_type }}</div>
              </div>
              <div class="cx-audit-detail-field">
                <div class="cx-audit-detail-label">Entity ID</div>
                <div class="cx-audit-detail-value cx-audit-detail-mono">{{ detailRow.entity_id }}</div>
              </div>
              <div class="cx-audit-detail-field">
                <div class="cx-audit-detail-label">IP Address</div>
                <div class="cx-audit-detail-value cx-audit-detail-mono">{{ detailRow.ip_address || '—' }}</div>
              </div>
              <div class="cx-audit-detail-field">
                <div class="cx-audit-detail-label">Timestamp</div>
                <div class="cx-audit-detail-value">{{ detailRow.created_at | date:'medium' }}</div>
              </div>
            </div>
            @if (detailRow.old_values) {
              <div class="cx-audit-detail-section">
                <h4 class="cx-audit-detail-section-title">Previous Values</h4>
                <pre class="cx-audit-detail-pre">{{ detailRow.old_values | json }}</pre>
              </div>
            }
            @if (detailRow.new_values) {
              <div class="cx-audit-detail-section">
                <h4 class="cx-audit-detail-section-title">New Values</h4>
                <pre class="cx-audit-detail-pre cx-audit-detail-pre-new">{{ detailRow.new_values | json }}</pre>
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .cx-audit-export-menu {
      position: absolute; right: 0; top: calc(100% + 4px);
      z-index: var(--cx-z-dropdown);
      min-width: 180px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-lg);
      box-shadow: var(--cx-shadow-lg);
      padding: 0.35rem;
      display: flex; flex-direction: column;
    }
    .cx-audit-export-option {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.5rem 0.65rem;
      background: transparent; border: none;
      border-radius: var(--cx-radius-sm);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      cursor: pointer;
      text-align: left;
      transition: background var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-audit-export-option:hover { background: var(--cx-surface-hover); }
    .cx-audit-export-option lucide-icon { color: var(--cx-text-muted); }

    /* Filters */
    .cx-audit-filters {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.65rem;
      padding: 0.85rem;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      margin-bottom: 1rem;
    }
    @media (min-width: 900px) {
      .cx-audit-filters { grid-template-columns: 2fr 1.2fr 1fr 1fr 1fr 1fr; }
    }
    .cx-audit-filter-search { position: relative; }
    .cx-audit-filter-search-icon {
      position: absolute; left: 0.75rem; top: 50%;
      transform: translateY(-50%);
      color: var(--cx-text-muted);
      pointer-events: none;
    }
    .cx-audit-filter-search-input {
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
    .cx-audit-filter-search-input:hover { border-color: var(--cx-border); }
    .cx-audit-filter-search-input:focus {
      background: var(--cx-surface);
      border-color: var(--cx-primary-600);
      box-shadow: var(--cx-ring-focus);
    }

    /* Table */
    .cx-audit-table-wrap {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      overflow: hidden;
    }
    .cx-audit-state { padding: 4rem 1rem; text-align: center; }
    .cx-audit-loading {
      display: inline-flex; align-items: center; gap: 0.75rem;
      color: var(--cx-text-muted);
      font-size: var(--cx-text-sm);
    }
    .cx-audit-loading-dots { display: inline-flex; gap: 4px; }
    .cx-audit-loading-dots span {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--cx-primary-600);
      animation: cx-loading-pulse 1.2s infinite var(--cx-ease-premium);
    }
    .cx-audit-loading-dots span:nth-child(2) { animation-delay: 0.2s; background: var(--cx-accent-500); }
    .cx-audit-loading-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes cx-loading-pulse {
      0%, 100% { opacity: 0.3; transform: scale(0.8); }
      50% { opacity: 1; transform: scale(1.15); }
    }

    .cx-audit-table-scroll { overflow-x: auto; }
    .cx-audit-table { width: 100%; border-collapse: collapse; }
    .cx-audit-table thead { background: var(--cx-surface-2); }
    .cx-audit-table thead tr { border-bottom: 1px solid var(--cx-border); }
    .cx-audit-table th {
      padding: 0.75rem 1rem;
      font-size: var(--cx-text-xs); font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.05em;
      color: var(--cx-text-muted);
      white-space: nowrap;
      text-align: left;
    }
    .cx-audit-th-sortable { cursor: pointer; user-select: none; }
    .cx-audit-th-sortable:hover { color: var(--cx-text); }
    .cx-audit-th-inner { display: flex; align-items: center; gap: 4px; }
    .cx-audit-sort-icon { color: var(--cx-text-subtle); opacity: 0.6; }
    .cx-audit-sort-icon.is-active { color: var(--cx-primary-600); opacity: 1; }

    .cx-audit-table tbody td {
      padding: 0.75rem 1rem;
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      border-bottom: 1px solid var(--cx-border-subtle);
      vertical-align: middle;
    }
    .cx-audit-table tbody tr { transition: background var(--cx-dur-fast) var(--cx-ease-premium); }
    .cx-audit-table tbody tr:hover { background: var(--cx-surface-hover); }
    .cx-audit-table tbody tr:last-child td { border-bottom: none; }

    .cx-audit-timestamp { display: flex; flex-direction: column; }
    .cx-audit-time {
      font-size: var(--cx-text-xs); font-weight: 500;
      color: var(--cx-text);
      font-variant-numeric: tabular-nums;
    }
    .cx-audit-time-sec {
      font-size: 11px;
      color: var(--cx-text-muted);
      font-variant-numeric: tabular-nums;
    }
    .cx-audit-user {
      font-size: var(--cx-text-sm); font-weight: 500;
      color: var(--cx-text);
    }
    .cx-audit-entity {
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      font-weight: 500;
    }
    .cx-audit-entity-id {
      font-family: var(--cx-font-mono);
      font-size: 11px;
      color: var(--cx-text-muted);
      margin-top: 2px;
    }
    .cx-audit-desc {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      max-width: 260px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .cx-audit-ip {
      font-family: var(--cx-font-mono);
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
    }
    .cx-audit-actions-col { width: 60px; text-align: right; }

    /* Pagination */
    .cx-audit-pagination {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--cx-border);
      background: var(--cx-surface);
    }
    .cx-audit-pagination-info {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
    }
    .cx-audit-pagination-controls { display: flex; align-items: center; gap: 0.35rem; }
    .cx-audit-page-btn { min-width: 32px; font-variant-numeric: tabular-nums; }

    /* Detail modal */
    .cx-audit-detail-root {
      position: fixed; inset: 0;
      z-index: var(--cx-z-modal);
      display: flex; align-items: center; justify-content: center;
      padding: 1rem;
    }
    .cx-audit-detail-backdrop {
      position: fixed; inset: 0;
      background: rgba(15, 28, 22, 0.52);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      animation: cx-fade-in var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cx-audit-detail-panel {
      position: relative;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-2xl);
      box-shadow: var(--cx-shadow-xl);
      max-width: 640px; width: 100%;
      max-height: 85vh;
      display: flex; flex-direction: column;
      overflow: hidden;
      animation: cx-dialog-in var(--cx-dur-slow) var(--cx-ease-premium);
    }
    @keyframes cx-dialog-in {
      from { opacity: 0; transform: translateY(12px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .cx-audit-detail-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 1rem;
      padding: 1.25rem 1.5rem 1rem;
      border-bottom: 1px solid var(--cx-border);
      flex-shrink: 0;
    }
    .cx-audit-detail-title {
      margin: 2px 0 0;
      font-size: var(--cx-text-md); font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
    }
    .cx-audit-detail-body {
      padding: 1.25rem 1.5rem;
      overflow-y: auto;
      flex: 1; min-height: 0;
      display: flex; flex-direction: column; gap: 1.25rem;
    }
    .cx-audit-detail-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
    }
    .cx-audit-detail-field { min-width: 0; }
    .cx-audit-detail-label {
      font-size: var(--cx-text-xs); font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.05em;
      color: var(--cx-text-muted);
      margin-bottom: 4px;
    }
    .cx-audit-detail-value {
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
    }
    .cx-audit-detail-mono {
      font-family: var(--cx-font-mono);
      font-size: var(--cx-text-xs);
      color: var(--cx-text-secondary);
      word-break: break-all;
    }
    .cx-audit-detail-section { display: flex; flex-direction: column; gap: 0.5rem; }
    .cx-audit-detail-section-title {
      margin: 0;
      font-size: var(--cx-text-xs); font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.05em;
      color: var(--cx-text-muted);
    }
    .cx-audit-detail-pre {
      margin: 0;
      padding: 0.85rem;
      background: var(--cx-stone-50);
      border: 1px solid var(--cx-border-subtle);
      border-radius: var(--cx-radius-md);
      font-family: var(--cx-font-mono);
      font-size: var(--cx-text-xs);
      color: var(--cx-text);
      overflow-x: auto;
      line-height: 1.5;
    }
    .cx-audit-detail-pre-new {
      background: var(--cx-success-50);
      border-color: rgba(26, 122, 69, 0.2);
    }
  `],
})
export class AuditLogsComponent implements OnInit {
  rows = signal<any[]>([]); loading = signal(true);
  users = signal<any[]>([]);
  userOptions = computed<SelectOption[]>(() =>
    this.users().map(u => ({ value: u.id, label: u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'Unknown' }))
  );
  filters: any = { search: '', user_id: '', action: '', entity_type: '', date_from: '', date_to: '', sort_by: 'createdAt', sort_dir: 'DESC' };
  page = 1; perPage = 50; totalRecords = 0; totalPages = 0;
  exportOpen = false; detailRow: any = null;
  private filterTimeout: any;

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit(): void {
    this.load();
    this.api.get('/users', { per_page: 500, sort_by: 'firstName', sort_dir: 'ASC' }).subscribe({ next: r => this.users.set(r.data || []) });
  }

  load(): void {
    this.loading.set(true);
    const params: any = { page: this.page, per_page: this.perPage, sort_by: this.filters.sort_by, sort_dir: this.filters.sort_dir };
    if (this.filters.search) params.search = this.filters.search;
    if (this.filters.user_id) params.user_id = this.filters.user_id;
    if (this.filters.action) params.action = this.filters.action;
    if (this.filters.entity_type) params.entity_type = this.filters.entity_type;
    if (this.filters.date_from) params.date_from = this.filters.date_from;
    if (this.filters.date_to) params.date_to = this.filters.date_to;
    this.api.get('/audit-logs', params).subscribe({
      next: res => { this.rows.set(res.data || []); this.totalRecords = res.meta?.total || 0; this.totalPages = Math.ceil(this.totalRecords / this.perPage); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  onFilterChange(): void { clearTimeout(this.filterTimeout); this.filterTimeout = setTimeout(() => { this.page = 1; this.load(); }, 400); }
  sort(key: string): void { if (this.filters.sort_by === key) this.filters.sort_dir = this.filters.sort_dir === 'ASC' ? 'DESC' : 'ASC'; else { this.filters.sort_by = key; this.filters.sort_dir = 'ASC'; } this.load(); }
  goPage(p: number): void { if (p >= 1 && p <= this.totalPages) { this.page = p; this.load(); } }
  pageNumbers(): number[] { const p: number[] = []; const s = Math.max(1, this.page - 2); for (let i = s; i <= Math.min(this.totalPages, s + 4); i++) p.push(i); return p; }
  min(a: number, b: number): number { return Math.min(a, b); }

  actionClass(action: string): string {
    const a = (action || '').toLowerCase();
    if (a === 'create') return 'bg-[var(--cx-success-light)] text-[var(--cx-success)]';
    if (a === 'update') return 'bg-[var(--cx-info-light)] text-[var(--cx-info)]';
    if (a === 'delete') return 'bg-[var(--cx-danger-light)] text-[var(--cx-danger)]';
    if (a === 'login') return 'bg-blue-50 text-blue-600';
    if (a === 'approve') return 'bg-[var(--cx-success-light)] text-[var(--cx-success)]';
    if (a === 'reject') return 'bg-[var(--cx-danger-light)] text-[var(--cx-danger)]';
    return 'bg-gray-100 text-gray-600';
  }

  actionTone(action: string): string {
    const a = (action || '').toLowerCase();
    if (a === 'create' || a === 'approve') return 'success';
    if (a === 'update') return 'info';
    if (a === 'delete' || a === 'reject') return 'danger';
    if (a === 'login' || a === 'logout') return 'info';
    return 'neutral';
  }

  summarize(row: any): string {
    if (row.new_values && typeof row.new_values === 'object') {
      const keys = Object.keys(row.new_values).slice(0, 3);
      return keys.join(', ') + (Object.keys(row.new_values).length > 3 ? '...' : '');
    }
    return row.entity_type + ' ' + (row.action || '');
  }

  viewDetail(row: any): void { this.detailRow = row; }

  exportData(format: string): void {
    this.exportOpen = false;
    const params: any = { per_page: 10000, sort_by: this.filters.sort_by, sort_dir: this.filters.sort_dir };
    if (this.filters.search) params.search = this.filters.search;
    if (this.filters.action) params.action = this.filters.action;
    if (this.filters.entity_type) params.entity_type = this.filters.entity_type;
    if (this.filters.date_from) params.date_from = this.filters.date_from;
    if (this.filters.date_to) params.date_to = this.filters.date_to;

    this.api.get('/audit-logs', params).subscribe({
      next: res => {
        const data = res.data || [];
        if (!data.length) { this.toast.error('No data to export'); return; }
        const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        const filename = `CreditX_AuditTrail_${ts}`;

        if (format === 'csv') {
          const h = ['Timestamp', 'User', 'Action', 'Entity Type', 'Entity ID', 'IP Address', 'Description'];
          const rows = [h.join(','), ...data.map((r: any) => [r.created_at, `"${r.user_name || 'System'}"`, r.action, r.entity_type, r.entity_id, r.ip_address || '', `"${r.description || ''}"`].join(','))];
          this.downloadBlob(new Blob([rows.join('\n')], { type: 'text/csv' }), filename + '.csv');
        } else if (format === 'excel') {
          let html = '<html><head><meta charset="UTF-8"></head><body><table border="1"><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Entity</th><th>Entity ID</th><th>IP</th></tr>';
          for (const r of data) html += `<tr><td>${r.created_at}</td><td>${r.user_name || 'System'}</td><td>${r.action}</td><td>${r.entity_type}</td><td>${r.entity_id}</td><td>${r.ip_address || ''}</td></tr>`;
          this.downloadBlob(new Blob([html + '</table></body></html>'], { type: 'application/vnd.ms-excel' }), filename + '.xls');
        } else if (format === 'pdf') {
          const w = window.open('', '_blank'); if (!w) return;
          let html = `<html><head><title>Audit Trail</title><style>body{font-family:Arial;margin:20px}h1{color:#0A4F2A;font-size:16px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ddd;padding:6px;font-size:10px}th{background:#0A4F2A;color:white}.meta{color:#666;font-size:10px}</style></head><body>`;
          html += `<h1>CreditX — Audit Trail Report</h1><p class="meta">Generated: ${new Date().toLocaleString()} | Records: ${data.length}</p>`;
          html += '<table><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Entity</th><th>Entity ID</th><th>IP</th></tr>';
          for (const r of data) html += `<tr><td>${r.created_at}</td><td>${r.user_name || 'System'}</td><td>${r.action}</td><td>${r.entity_type}</td><td>${r.entity_id}</td><td>${r.ip_address || ''}</td></tr>`;
          w.document.write(html + '</table></body></html>'); w.document.close(); w.onload = () => w.print();
        }
        this.toast.success(`Exported ${data.length} records (${format.toUpperCase()})`);
      },
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }
}
