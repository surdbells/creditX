import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-loans', standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, StatusBadgeComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Loan Portfolio"
        subtitle="{{ totalRecords | number }} total loans in system"
        eyebrow="Loans">
        <div class="relative">
          <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="exportOpen = !exportOpen">
            <lucide-icon name="download" [size]="14"></lucide-icon>
            <span>Export</span>
            <lucide-icon name="chevron-down" [size]="12"></lucide-icon>
          </button>
          @if (exportOpen) {
            <div class="cx-loans-export-menu cx-animate-in">
              <button class="cx-loans-export-option" (click)="exportData('csv')">
                <lucide-icon name="file-spreadsheet" [size]="14"></lucide-icon>
                <span>CSV</span>
              </button>
              <button class="cx-loans-export-option" (click)="exportData('excel')">
                <lucide-icon name="file-spreadsheet" [size]="14"></lucide-icon>
                <span>Excel</span>
              </button>
              <button class="cx-loans-export-option" (click)="exportData('pdf')">
                <lucide-icon name="file-text" [size]="14"></lucide-icon>
                <span>PDF</span>
              </button>
            </div>
          }
        </div>
      </cx-page-header>

      <!-- Filters -->
      <div class="cx-loans-filters">
        <div class="cx-loans-filter-search">
          <lucide-icon name="search" [size]="14" class="cx-loans-filter-search-icon"></lucide-icon>
          <input type="text" class="cx-loans-filter-search-input"
            placeholder="Search by App ID, customer name, staff ID..."
            [(ngModel)]="filters.search" (input)="onFilterChange()" />
        </div>
        <select class="cx-select" [(ngModel)]="filters.status" (change)="onFilterChange()">
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="disbursed">Disbursed</option>
          <option value="active">Active</option>
          <option value="overdue">Overdue</option>
          <option value="closed">Closed</option>
          <option value="rejected">Rejected</option>
        </select>
        <select class="cx-select" [(ngModel)]="filters.product_id" (change)="onFilterChange()">
          <option value="">All Products</option>
          @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
        </select>
      </div>

      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
        [searchPlaceholder]="''" [hasActions]="true" (query)="onQuery($event)">
        <ng-template #rowActions let-row>
          <a [routerLink]="['/loans', row.id]" class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" title="View">
            <lucide-icon name="eye" [size]="14"></lucide-icon>
          </a>
        </ng-template>
      </cx-data-table>
    </div>
  `,
  styles: [`
    .cx-loans-export-menu {
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
    .cx-loans-export-option {
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
    .cx-loans-export-option:hover { background: var(--cx-surface-hover); }
    .cx-loans-export-option lucide-icon { color: var(--cx-text-muted); }

    .cx-loans-filters {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.65rem;
      padding: 0.85rem;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      margin-bottom: 1rem;
    }
    @media (min-width: 768px) {
      .cx-loans-filters {
        grid-template-columns: 2fr 1fr 1fr;
      }
    }
    .cx-loans-filter-search { position: relative; }
    .cx-loans-filter-search-icon {
      position: absolute; left: 0.75rem; top: 50%;
      transform: translateY(-50%);
      color: var(--cx-text-muted);
      pointer-events: none;
    }
    .cx-loans-filter-search-input {
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
    .cx-loans-filter-search-input:hover { border-color: var(--cx-border); }
    .cx-loans-filter-search-input:focus {
      background: var(--cx-surface);
      border-color: var(--cx-primary-600);
      box-shadow: var(--cx-ring-focus);
    }
  `],
})
export class LoansComponent implements OnInit {
  columns: TableColumn[] = [
    { key: 'application_id', label: 'App ID' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'product_name', label: 'Product' },
    { key: 'amount_requested', label: 'Amount', type: 'currency', align: 'right' },
    { key: 'tenor', label: 'Tenor' },
    { key: 'status', label: 'Status' },
    { key: 'created_at', label: 'Applied', type: 'date' },
  ];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  products = signal<any[]>([]);
  filters: any = { search: '', status: '', product_id: '' };
  totalRecords = 0; exportOpen = false; private q: any = {}; private filterTimeout: any;

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit() {
    this.load();
    this.api.get('/loan-products', { per_page: 50 }).subscribe({ next: r => this.products.set(r.data || []) });
  }

  load(p?: any) {
    this.loading.set(true);
    const params = { ...this.q, ...p };
    if (this.filters.search) params.search = this.filters.search;
    if (this.filters.status) params.status = this.filters.status;
    if (this.filters.product_id) params.product_id = this.filters.product_id;
    this.api.get('/loans', params).subscribe({
      next: r => { this.rows.set(r.data || []); this.pagination.set(r.meta || null); this.totalRecords = r.meta?.total || 0; this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
  onQuery(e: TableQueryEvent) { this.q = e; this.load(e); }
  onFilterChange() { clearTimeout(this.filterTimeout); this.filterTimeout = setTimeout(() => { this.q.page = 1; this.load(this.q); }, 400); }

  exportData(format: string) {
    this.exportOpen = false;
    const params: any = { per_page: 10000 };
    if (this.filters.search) params.search = this.filters.search;
    if (this.filters.status) params.status = this.filters.status;
    this.api.get('/loans', params).subscribe({
      next: res => {
        const data = res.data || [];
        if (!data.length) { this.toast.error('No data'); return; }
        const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        const fn = `CreditX_Loans_${ts}`;
        const h = ['App ID','Customer','Product','Amount','Tenor','Status','Applied'];
        if (format === 'csv') {
          const rows = [h.join(','), ...data.map((r: any) => [r.application_id, `"${r.customer_name}"`, `"${r.product_name||''}"`, r.amount_requested, r.tenor, r.status, r.created_at].join(','))];
          this.dl(new Blob([rows.join('\n')], { type: 'text/csv' }), fn + '.csv');
        } else if (format === 'excel') {
          let html = '<html><head><meta charset="UTF-8"></head><body><table border="1"><tr>' + h.map(c => `<th>${c}</th>`).join('') + '</tr>';
          for (const r of data) html += `<tr><td>${r.application_id}</td><td>${r.customer_name}</td><td>${r.product_name||''}</td><td>${r.amount_requested}</td><td>${r.tenor}</td><td>${r.status}</td><td>${r.created_at}</td></tr>`;
          this.dl(new Blob([html + '</table></body></html>'], { type: 'application/vnd.ms-excel' }), fn + '.xls');
        } else if (format === 'pdf') {
          const w = window.open('', '_blank'); if (!w) return;
          let html = `<html><head><title>Loans</title><style>body{font-family:Arial;margin:20px}h1{color:#0A4F2A;font-size:16px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ddd;padding:6px;font-size:10px}th{background:#0A4F2A;color:white}.meta{color:#666;font-size:10px}</style></head><body>`;
          html += `<h1>CreditX — Loan Report</h1><p class="meta">Generated: ${new Date().toLocaleString()} | ${data.length} loans</p><table><tr>` + h.map(c => `<th>${c}</th>`).join('') + '</tr>';
          for (const r of data) html += `<tr><td>${r.application_id}</td><td>${r.customer_name}</td><td>${r.product_name||''}</td><td>${r.amount_requested}</td><td>${r.tenor}</td><td>${r.status}</td><td>${r.created_at}</td></tr>`;
          w.document.write(html + '</table></body></html>'); w.document.close(); w.onload = () => w.print();
        }
        this.toast.success(`Exported ${data.length} loans`);
      },
    });
  }
  private dl(b: Blob, n: string) { const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = n; a.click(); URL.revokeObjectURL(u); }
}
