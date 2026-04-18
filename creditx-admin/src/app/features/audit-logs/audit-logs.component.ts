import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-audit-logs', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Audit Trail" subtitle="{{ totalRecords | number }} events logged">
        <div class="flex items-center gap-2">
          <div class="relative">
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="exportOpen = !exportOpen">
              <lucide-icon name="download" [size]="14"></lucide-icon> Export
              <lucide-icon name="chevron-down" [size]="12"></lucide-icon>
            </button>
            @if (exportOpen) {
              <div class="absolute right-0 top-full mt-1 w-44 bg-[var(--cx-surface)] border border-[var(--cx-border)] rounded-xl shadow-xl z-50 overflow-hidden">
                <button class="w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-[var(--cx-surface-hover)] flex items-center gap-2" (click)="exportData('csv')"><lucide-icon name="file-text" [size]="14"></lucide-icon> Export CSV</button>
                <button class="w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-[var(--cx-surface-hover)] flex items-center gap-2" (click)="exportData('excel')"><lucide-icon name="file-text" [size]="14"></lucide-icon> Export Excel</button>
                <button class="w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-[var(--cx-surface-hover)] flex items-center gap-2" (click)="exportData('pdf')"><lucide-icon name="file-text" [size]="14"></lucide-icon> Export PDF</button>
              </div>
            }
          </div>
        </div>
      </cx-page-header>

      <!-- Filters -->
      <div class="cx-card !p-4 mb-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div class="lg:col-span-2">
            <div class="relative">
              <lucide-icon name="search" class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" [size]="16"></lucide-icon>
              <input type="text" class="cx-input !pl-8 w-full" placeholder="Search by user, entity, description..." [(ngModel)]="filters.search" (input)="onFilterChange()" />
            </div>
          </div>
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
          <input type="date" class="cx-input" [(ngModel)]="filters.date_from" (change)="onFilterChange()" />
          <input type="date" class="cx-input" [(ngModel)]="filters.date_to" (change)="onFilterChange()" />
        </div>
      </div>

      <!-- Table -->
      <div class="cx-card !p-4 overflow-hidden">
        @if (loading()) {
          <div class="flex items-center justify-center py-16">
            <div class="flex flex-col items-center gap-3">
              <div class="w-8 h-8 border-3 border-[var(--cx-primary)] border-t-transparent rounded-full animate-spin"></div>
              <span class="text-sm text-[var(--cx-text-muted)]">Loading audit trail...</span>
            </div>
          </div>
        } @else if (rows().length === 0) {
          <div class="flex flex-col items-center justify-center py-16">
            <lucide-icon name="scroll-text" [size]="48" class="text-[var(--cx-text-muted)] opacity-30 mb-3"></lucide-icon>
            <h3 class="text-base font-semibold text-[var(--cx-text)]">No audit events found</h3>
            <p class="text-sm text-[var(--cx-text-muted)] mt-1">Try adjusting your filters or date range</p>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-[var(--cx-border)]">
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider cursor-pointer" (click)="sort('createdAt')">
                    <div class="flex items-center gap-1">Timestamp @if (filters.sort_by==='createdAt') { <lucide-icon [name]="filters.sort_dir==='ASC'?'arrow-up':'arrow-down'" [size]="12"></lucide-icon> }</div>
                  </th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">User</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Action</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Entity</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Details</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">IP Address</th>
                  <th class="px-4 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.id) {
                  <tr class="border-b border-[var(--cx-border)] transition-colors hover:bg-[var(--cx-surface-hover)]">
                    <td class="px-4 py-3">
                      <div class="text-xs font-mono text-[var(--cx-text-muted)]">{{ row.created_at | date:'medium' }}</div>
                    </td>
                    <td class="px-4 py-3">
                      <div class="text-sm font-medium text-[var(--cx-text)]">{{ row.user_name || 'System' }}</div>
                    </td>
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" [class]="actionClass(row.action)">
                        {{ row.action | titlecase }}
                      </span>
                    </td>
                    <td class="px-4 py-3">
                      <div class="text-sm text-[var(--cx-text-secondary)]">{{ row.entity_type }}</div>
                      <div class="text-xs text-[var(--cx-text-muted)] font-mono">{{ row.entity_id | slice:0:8 }}...</div>
                    </td>
                    <td class="px-4 py-3">
                      <div class="text-xs text-[var(--cx-text-muted)] max-w-[200px] truncate">{{ row.description || summarize(row) }}</div>
                    </td>
                    <td class="px-4 py-3 text-xs text-[var(--cx-text-muted)] font-mono">{{ row.ip_address || '—' }}</td>
                    <td class="px-4 py-3">
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
          <div class="flex items-center justify-between px-4 py-3 border-t border-[var(--cx-border)]">
            <div class="text-xs text-[var(--cx-text-muted)]">
              Showing {{ (page - 1) * perPage + 1 }}–{{ min(page * perPage, totalRecords) }} of {{ totalRecords | number }}
            </div>
            <div class="flex items-center gap-1">
              <button class="cx-btn cx-btn-ghost cx-btn-sm" [disabled]="page <= 1" (click)="goPage(page - 1)"><lucide-icon name="chevron-left" [size]="14"></lucide-icon></button>
              @for (p of pageNumbers(); track p) {
                <button class="cx-btn cx-btn-sm min-w-[32px]" [class]="p === page ? 'cx-btn-primary' : 'cx-btn-ghost'" (click)="goPage(p)">{{ p }}</button>
              }
              <button class="cx-btn cx-btn-ghost cx-btn-sm" [disabled]="page >= totalPages" (click)="goPage(page + 1)"><lucide-icon name="chevron-right" [size]="14"></lucide-icon></button>
            </div>
          </div>
        }
      </div>
    </div>

    <!-- Detail Modal -->
    @if (detailRow) {
      <div class="fixed inset-0 z-50 flex items-center justify-center" (click)="detailRow = null">
        <div class="fixed inset-0 bg-black/40"></div>
        <div class="relative bg-[var(--cx-surface)] rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between px-6 py-4 border-b border-[var(--cx-border)]">
            <h3 class="text-sm font-semibold text-[var(--cx-text)]">Audit Detail</h3>
            <button class="cx-btn cx-btn-ghost cx-btn-icon" (click)="detailRow = null"><lucide-icon name="x" [size]="18"></lucide-icon></button>
          </div>
          <div class="px-6 py-4 overflow-y-auto max-h-[65vh] space-y-3">
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div><span class="text-[var(--cx-text-muted)] text-xs block">User</span>{{ detailRow.user_name || 'System' }}</div>
              <div><span class="text-[var(--cx-text-muted)] text-xs block">Action</span>{{ detailRow.action }}</div>
              <div><span class="text-[var(--cx-text-muted)] text-xs block">Entity</span>{{ detailRow.entity_type }}</div>
              <div><span class="text-[var(--cx-text-muted)] text-xs block">Entity ID</span><span class="font-mono text-xs">{{ detailRow.entity_id }}</span></div>
              <div><span class="text-[var(--cx-text-muted)] text-xs block">IP Address</span>{{ detailRow.ip_address || '—' }}</div>
              <div><span class="text-[var(--cx-text-muted)] text-xs block">Timestamp</span>{{ detailRow.created_at }}</div>
            </div>
            @if (detailRow.old_values) {
              <div><h4 class="text-xs font-semibold text-[var(--cx-text-muted)] uppercase mb-1">Previous Values</h4>
              <pre class="text-xs bg-[var(--cx-surface-hover)] p-3 rounded-lg overflow-x-auto font-mono">{{ detailRow.old_values | json }}</pre></div>
            }
            @if (detailRow.new_values) {
              <div><h4 class="text-xs font-semibold text-[var(--cx-text-muted)] uppercase mb-1">New Values</h4>
              <pre class="text-xs bg-[var(--cx-surface-hover)] p-3 rounded-lg overflow-x-auto font-mono">{{ detailRow.new_values | json }}</pre></div>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class AuditLogsComponent implements OnInit {
  rows = signal<any[]>([]); loading = signal(true);
  filters: any = { search: '', action: '', entity_type: '', date_from: '', date_to: '', sort_by: 'createdAt', sort_dir: 'DESC' };
  page = 1; perPage = 50; totalRecords = 0; totalPages = 0;
  exportOpen = false; detailRow: any = null;
  private filterTimeout: any;

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    const params: any = { page: this.page, per_page: this.perPage, sort_by: this.filters.sort_by, sort_dir: this.filters.sort_dir };
    if (this.filters.search) params.search = this.filters.search;
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
