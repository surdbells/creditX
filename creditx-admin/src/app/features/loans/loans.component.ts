import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import { PageGuide } from '../../shared/guide/page-guide.model';


import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { SettingsService } from '../../core/services/settings.service';
import { SearchableSelectDirective } from '../../shared/directives/searchable-select.directive';

const LOANS_GUIDE: PageGuide = {
  id: 'loans',
  titleKey: 'Loan Portfolio',
  purposeKey: 'The single register of every loan the institution holds, at every stage of its life.',
  descriptionKey:
    'Every application ever captured appears here — whether it is still being reviewed, has been '
    + 'rejected, is being repaid, or closed years ago. Other screens act on loans at one particular '
    + 'moment; this one is the record of all of them, and it is where you come to answer "what is '
    + 'the position of this loan?" rather than "what should I do next?".',
  actionKeys: [
    'Find a loan by application ID, customer name or staff ID',
    'Narrow the register by status, product or branch',
    'Open a loan to see its schedule, repayments, documents and approval history',
    'Export the filtered register for reporting or reconciliation',
  ],
  sections: [
    {
      selector: '.cx-loans-filters',
      titleKey: 'Filters',
      bodyKey:
        'Search and filters combine, so you can hold one branch and one status at the same time. The '
        + 'export takes whatever is currently filtered, not the whole book — check the filters before '
        + 'exporting figures someone will rely on.',
    },
    {
      selector: 'cx-data-table',
      titleKey: 'The register',
      bodyKey:
        'One row per loan. The status badge tells you where it sits in its life; open a row for the '
        + 'full history, repayment schedule and attached documents.',
    },
  ],
  workflowKeys: [
    'Agent or back office captures an application',
    'Approval Queue — reviewed and approved',
    'Disbursement Queue — funds released',
    'Repayments collected against the schedule',
    'Loan closes, or ages into overdue',
  ],
  dependsOnKeys: ['Loan Products', 'Customers', 'Approval Workflows'],
  usedByKeys: ['Approval Queue', 'Disbursement Queue', 'Payments', 'Portfolio at Risk', 'CBN returns'],
  businessRuleKeys: [
    'A loan moves through fixed statuses — draft, submitted, under review, approved, disbursed, active, then closed, overdue or written off. It cannot skip a step.',
    'Rejecting an application does not delete it; it stays in the register with a rejected status, because the attempt is part of the customer\'s history.',
    'Money is only committed at disbursement. An approved loan has cost nothing yet.',
    'Overdue is derived from the repayment schedule, not set by hand — it appears the day an instalment passes its due date unpaid.',
  ],
  tipKeys: [
    'A customer chasing "my loan" is usually asking about one application — search their name and read the status badge before anything else.',
    'Filter to Approved when reconciling what is owed to customers but not yet paid out; those loans are commitments the institution has made.',
    'Figures here are application-level. For accounting positions use the ledger reports, which are posted from journals rather than derived from loan rows.',
  ],
  permissionKeys: ['loans.view'],
  faq: [
    {
      questionKey: 'A loan shows Disbursed but the customer says they have not been paid.',
      answerKey:
        'Disbursed means the disbursement was recorded and journals posted. Confirm the settlement '
        + 'actually left the bank on the Settlements screen — recording and paying are two steps.',
    },
    {
      questionKey: 'Why can I not edit a loan\'s amount here?',
      answerKey:
        'Terms are fixed once an application is submitted, because approvals and journals reference '
        + 'them. A change of terms is a restructure, not an edit.',
    },
    {
      questionKey: 'The totals here do not match my accounting reports.',
      answerKey:
        'They measure different things. This register counts applications and requested amounts; the '
        + 'accounting reports total what was actually posted to the ledger.',
    },
  ],
};

@Component({
  selector: 'app-loans', standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, StatusBadgeComponent, SearchableSelectDirective, PageGuideComponent],
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

      <cx-page-guide [guide]="guide"></cx-page-guide>

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
          <option value="draft">Draft</option>
          <option value="captured">Captured</option>
          <option value="submitted">Submitted</option>
          <option value="under_review">Under Review</option>
          <option value="approved">Approved</option>
          <option value="disbursed">Disbursed</option>
          <option value="active">Active</option>
          <option value="overdue">Overdue</option>
          <option value="restructured">Restructured</option>
          <option value="closed">Closed</option>
          <option value="written_off">Written Off</option>
          <option value="cancelled">Cancelled</option>
          <option value="rejected">Rejected</option>
        </select>
        <select class="cx-select" [(ngModel)]="filters.product_id" (change)="onFilterChange()">
          <option value="">All Products</option>
          @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
        </select>
        <select class="cx-select" [(ngModel)]="filters.branch_id" (change)="onFilterChange()">
          <option value="">All Branches</option>
          @for (b of branches(); track b.id) { <option [value]="b.id">{{ b.name }}</option> }
        </select>
        @if (hasActiveFilters()) {
          <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="clearFilters()">
            <lucide-icon name="x" [size]="14"></lucide-icon>
            <span>Clear</span>
          </button>
        }
      </div>

      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
        [searchPlaceholder]="''" [hasActions]="true" (query)="onQuery($event)">
        <ng-template #cellTemplate let-row let-col="column">
          @if (col.key === 'status') {
            <cx-status-badge [status]="row.status"></cx-status-badge>
          } @else {
            {{ row[col.key] }}
          }
        </ng-template>
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
  readonly guide = LOANS_GUIDE;

  columns: TableColumn[] = [
    { key: 'application_id', label: 'App ID' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'product_name', label: 'Product' },
    { key: 'amount_requested', label: 'Amount', type: 'currency', align: 'right' },
    { key: 'tenure', label: 'Tenor' },
    { key: 'status', label: 'Status', type: 'custom' },
    { key: 'created_at', label: 'Applied', type: 'date' },
  ];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  products = signal<any[]>([]);
  branches = signal<any[]>([]);
  filters: any = { search: '', status: '', product_id: '', branch_id: '' };
  totalRecords = 0; exportOpen = false; private q: any = {}; private filterTimeout: any;

  // Filters persist across navigation (list → detail → back) until the user
  // clears them. sessionStorage survives an in-app navigation and a refresh,
  // and is scoped to the tab. Cleared explicitly via clearFilters().
  private static readonly STATE_KEY = 'cx_loans_filter_state';

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService, public settings: SettingsService) {}
  ngOnInit() {
    this.restoreState();
    this.load();
    this.api.get('/loan-products', { per_page: 50 }).subscribe({ next: r => this.products.set(r.data || []) });
    this.api.get('/locations', { per_page: 200 }).subscribe({ next: r => this.branches.set(r.data || []) });
  }

  hasActiveFilters(): boolean {
    return !!(this.filters.search || this.filters.status || this.filters.product_id || this.filters.branch_id);
  }

  private saveState(): void {
    try {
      sessionStorage.setItem(LoansComponent.STATE_KEY, JSON.stringify({ filters: this.filters, q: this.q }));
    } catch { /* storage may be unavailable; degrade silently */ }
  }

  private restoreState(): void {
    try {
      const raw = sessionStorage.getItem(LoansComponent.STATE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.filters) this.filters = { search: '', status: '', product_id: '', branch_id: '', ...s.filters };
      if (s.q) this.q = s.q;
    } catch { /* ignore corrupt state */ }
  }

  clearFilters(): void {
    this.filters = { search: '', status: '', product_id: '', branch_id: '' };
    this.q = {};
    try { sessionStorage.removeItem(LoansComponent.STATE_KEY); } catch { /* noop */ }
    this.load();
  }

  load(p?: any) {
    this.loading.set(true);
    const params = { ...this.q, ...p };
    if (this.filters.search) params.search = this.filters.search;
    if (this.filters.status) params.status = this.filters.status;
    if (this.filters.product_id) params.product_id = this.filters.product_id;
    if (this.filters.branch_id) params.branch_id = this.filters.branch_id;
    this.saveState();
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
    if (this.filters.product_id) params.product_id = this.filters.product_id;
    if (this.filters.branch_id) params.branch_id = this.filters.branch_id;
    this.api.get('/loans', params).subscribe({
      next: res => {
        const data = res.data || [];
        if (!data.length) { this.toast.error('No data'); return; }
        const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        const fn = `${this.settings.brandSlug()}_Loans_${ts}`;
        const h = ['App ID','Customer','Product','Amount','Tenor','Status','Applied'];
        if (format === 'csv') {
          const rows = [h.join(','), ...data.map((r: any) => [r.application_id, `"${r.customer_name}"`, `"${r.product_name||''}"`, r.amount_requested, r.tenure, r.status, r.created_at].join(','))];
          this.dl(new Blob([rows.join('\n')], { type: 'text/csv' }), fn + '.csv');
        } else if (format === 'excel') {
          let html = '<html><head><meta charset="UTF-8"></head><body><table border="1"><tr>' + h.map(c => `<th>${c}</th>`).join('') + '</tr>';
          for (const r of data) html += `<tr><td>${r.application_id}</td><td>${r.customer_name}</td><td>${r.product_name||''}</td><td>${r.amount_requested}</td><td>${r.tenure}</td><td>${r.status}</td><td>${r.created_at}</td></tr>`;
          this.dl(new Blob([html + '</table></body></html>'], { type: 'application/vnd.ms-excel' }), fn + '.xls');
        } else if (format === 'pdf') {
          const w = window.open('', '_blank'); if (!w) return;
          let html = `<html><head><title>Loans</title><style>body{font-family:Arial;margin:20px}h1{color:#0A4F2A;font-size:16px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ddd;padding:6px;font-size:10px}th{background:#0A4F2A;color:white}.meta{color:#666;font-size:10px}</style></head><body>`;
          html += `<h1>${this.settings.companyName()} — Loan Report</h1><p class="meta">Generated: ${new Date().toLocaleString()} | ${data.length} loans</p><table><tr>` + h.map(c => `<th>${c}</th>`).join('') + '</tr>';
          for (const r of data) html += `<tr><td>${r.application_id}</td><td>${r.customer_name}</td><td>${r.product_name||''}</td><td>${r.amount_requested}</td><td>${r.tenure}</td><td>${r.status}</td><td>${r.created_at}</td></tr>`;
          w.document.write(html + '</table></body></html>'); w.document.close(); w.onload = () => w.print();
        }
        this.toast.success(`Exported ${data.length} loans`);
      },
    });
  }
  private dl(b: Blob, n: string) { const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = n; a.click(); URL.revokeObjectURL(u); }
}
