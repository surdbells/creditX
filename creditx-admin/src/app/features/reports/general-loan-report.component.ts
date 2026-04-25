import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

/**
 * General Loan Report — the legacy-compatible monthly export migrated
 * to the platform. One page, three sections:
 *
 *   1. Filter bar — date range, status bucket, branch, product, agent,
 *      loan type. Reset button when any filter is active.
 *   2. Five charts in a 2-column grid (S1 layout): monthly disbursement
 *      trend, status distribution, top agents, product mix, branch
 *      performance. All update in lock-step with table filters.
 *   3. Paginated 44-column table — horizontally scrollable since it's
 *      wide by design (matches MONTHLY_GENERAL_REPORT.csv exactly).
 *      Export-CSV button hits the backend in CSV mode with current
 *      filters applied.
 *
 * URL state preservation follows the same pattern established by the
 * performance reports: filters and pagination round-trip through the
 * URL via replaceUrl: true so refresh / share / bookmark all work.
 */
type ChartLabelValue = { label: string; value: number };
type BranchPerformanceRow = { label: string; value: number; count: number };

@Component({
  selector: 'app-general-loan-report',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="General Loan Report"
        subtitle="Comprehensive loan listing matching the legacy monthly export"
        eyebrow="Reports">
        <button class="cx-btn cx-btn-primary" (click)="exportCsv()" [disabled]="exporting()">
          <lucide-icon [name]="exporting() ? 'loader-2' : 'download'" [size]="14" [class.spin]="exporting()"></lucide-icon>
          <span>{{ exporting() ? 'Exporting...' : 'Export CSV' }}</span>
        </button>
      </cx-page-header>

      <!-- Filter bar -->
      <div class="cx-glr-filter-bar">
        <div class="cx-glr-filter-group">
          <label class="cx-glr-filter-label">From</label>
          <input type="date" class="cx-input cx-input-sm"
            [(ngModel)]="filterDateFrom" (change)="onFilterChange()">
        </div>
        <div class="cx-glr-filter-group">
          <label class="cx-glr-filter-label">To</label>
          <input type="date" class="cx-input cx-input-sm"
            [(ngModel)]="filterDateTo" (change)="onFilterChange()">
        </div>
        <div class="cx-glr-filter-group">
          <label class="cx-glr-filter-label">Status</label>
          <select class="cx-select cx-input-sm"
            [(ngModel)]="filterStatus" (change)="onFilterChange()">
            <option value="">All</option>
            @for (s of statusBuckets; track s.value) {
              <option [value]="s.value">{{ s.label }}</option>
            }
          </select>
        </div>
        <div class="cx-glr-filter-group">
          <label class="cx-glr-filter-label">Branch</label>
          <select class="cx-select cx-input-sm"
            [(ngModel)]="filterBranch" (change)="onFilterChange()">
            <option value="">All branches</option>
            @for (b of branches(); track b.id) {
              <option [value]="b.id">{{ b.name }}</option>
            }
          </select>
        </div>
        <div class="cx-glr-filter-group">
          <label class="cx-glr-filter-label">Product</label>
          <select class="cx-select cx-input-sm"
            [(ngModel)]="filterProduct" (change)="onFilterChange()">
            <option value="">All products</option>
            @for (p of products(); track p.id) {
              <option [value]="p.id">{{ p.name }}</option>
            }
          </select>
        </div>
        <div class="cx-glr-filter-group">
          <label class="cx-glr-filter-label">Agent</label>
          <select class="cx-select cx-input-sm"
            [(ngModel)]="filterAgent" (change)="onFilterChange()">
            <option value="">All agents</option>
            @for (a of agents(); track a.id) {
              <option [value]="a.id">{{ a.label }}</option>
            }
          </select>
        </div>
        <div class="cx-glr-filter-group">
          <label class="cx-glr-filter-label">Loan Type</label>
          <select class="cx-select cx-input-sm"
            [(ngModel)]="filterLoanType" (change)="onFilterChange()">
            <option value="">All types</option>
            <option value="NEW_LOAN">New Loan</option>
            <option value="TOP_UP">Top-up</option>
          </select>
        </div>
        @if (hasActiveFilters()) {
          <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="resetFilters()">
            <lucide-icon name="x" [size]="14"></lucide-icon>
            <span>Reset</span>
          </button>
        }
      </div>

      @if (loading()) {
        <cx-loading message="Loading report..."></cx-loading>
      } @else {
        <!-- Charts grid (2 columns desktop, 1 column mobile) -->
        <div class="cx-glr-charts-grid">
          <!-- 1. Monthly disbursement (line) -->
          <div class="cx-glr-chart-card">
            <h3 class="cx-glr-chart-title">Monthly Disbursement (12-Month Trend)</h3>
            @if (monthlyDisbursement().length) {
              <div class="cx-glr-chart-body" [innerHTML]="monthlyDisbursementSvg()"></div>
            } @else {
              <p class="cx-glr-chart-empty">No data</p>
            }
          </div>

          <!-- 2. Status distribution (donut) -->
          <div class="cx-glr-chart-card">
            <h3 class="cx-glr-chart-title">Status Distribution</h3>
            @if (statusDistribution().length) {
              <div class="cx-glr-chart-body cx-glr-chart-with-legend">
                <div [innerHTML]="statusDistributionSvg()"></div>
                <ul class="cx-glr-chart-legend">
                  @for (s of statusDistribution(); track s.label; let i = $index) {
                    <li>
                      <span class="cx-glr-legend-swatch" [style.background]="palette(i)"></span>
                      <span class="cx-glr-legend-label">{{ s.label }}</span>
                      <span class="cx-glr-legend-value">{{ s.value }}</span>
                    </li>
                  }
                </ul>
              </div>
            } @else {
              <p class="cx-glr-chart-empty">No data</p>
            }
          </div>

          <!-- 3. Top agents (horizontal bars) -->
          <div class="cx-glr-chart-card">
            <h3 class="cx-glr-chart-title">Top 10 Agents</h3>
            @if (topAgents().length) {
              <div class="cx-glr-chart-body" [innerHTML]="topAgentsSvg()"></div>
            } @else {
              <p class="cx-glr-chart-empty">No data</p>
            }
          </div>

          <!-- 4. Product mix (pie) -->
          <div class="cx-glr-chart-card">
            <h3 class="cx-glr-chart-title">Product Mix</h3>
            @if (productMix().length) {
              <div class="cx-glr-chart-body cx-glr-chart-with-legend">
                <div [innerHTML]="productMixSvg()"></div>
                <ul class="cx-glr-chart-legend">
                  @for (p of productMix(); track p.label; let i = $index) {
                    <li>
                      <span class="cx-glr-legend-swatch" [style.background]="palette(i)"></span>
                      <span class="cx-glr-legend-label">{{ p.label }}</span>
                      <span class="cx-glr-legend-value">{{ p.value }}</span>
                    </li>
                  }
                </ul>
              </div>
            } @else {
              <p class="cx-glr-chart-empty">No data</p>
            }
          </div>

          <!-- 5. Branch performance (bar — full row at bottom) -->
          <div class="cx-glr-chart-card cx-glr-chart-card-wide">
            <h3 class="cx-glr-chart-title">Branch Performance</h3>
            @if (branchPerformance().length) {
              <div class="cx-glr-chart-body" [innerHTML]="branchPerformanceSvg()"></div>
            } @else {
              <p class="cx-glr-chart-empty">No data</p>
            }
          </div>
        </div>

        <!-- Data table -->
        @if (tableRows().length) {
          <div class="cx-glr-table-card">
            <div class="cx-glr-table-header">
              <h3 class="cx-glr-table-title">Loans</h3>
              <span class="cx-glr-table-meta">
                Showing <span class="tabular-nums">{{ pagedRowsLow() }}</span>–<span class="tabular-nums">{{ pagedRowsHigh() }}</span>
                of <span class="tabular-nums">{{ totalRows() }}</span>
              </span>
            </div>
            <div class="cx-glr-table-scroll">
              <table class="cx-glr-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Staff ID</th>
                    <th>Customer</th>
                    <th>Mobile</th>
                    <th>Gender</th>
                    <th>DOB</th>
                    <th>Mother Maiden</th>
                    <th>Religion</th>
                    <th>Marital</th>
                    <th>Address</th>
                    <th>State</th>
                    <th>LGA</th>
                    <th class="cx-glr-num">Children</th>
                    <th>BVN</th>
                    <th>NOK Name</th>
                    <th>NOK Address</th>
                    <th>NOK Relationship</th>
                    <th>NOK Phone</th>
                    <th>Employer</th>
                    <th>Branch</th>
                    <th class="cx-glr-num">Salary</th>
                    <th>Employment</th>
                    <th>Retirement</th>
                    <th>ID Type</th>
                    <th>ID No.</th>
                    <th>ID Issued</th>
                    <th>ID Expiry</th>
                    <th>Account Name</th>
                    <th>Account No.</th>
                    <th>Bank</th>
                    <th>Loan Type</th>
                    <th>Date Issued</th>
                    <th class="cx-glr-num">Approved</th>
                    <th class="cx-glr-num">BSA Fee</th>
                    <th class="cx-glr-num">Gross</th>
                    <th class="cx-glr-num">Net Disbursed</th>
                    <th class="cx-glr-num">Top-up Bal.</th>
                    <th class="cx-glr-num">Interest</th>
                    <th class="cx-glr-num">Repayment</th>
                    <th>1st Repay</th>
                    <th class="cx-glr-num">Tenor</th>
                    <th>DSA</th>
                    <th>Channel</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of tableRows(); track r.loan_id) {
                    <tr>
                      <td class="tabular-nums">{{ r.date }}</td>
                      <td>{{ r.staff_id || '—' }}</td>
                      <td class="cx-glr-cell-strong">{{ r.customer_name }}</td>
                      <td>{{ r.mobile || '—' }}</td>
                      <td>{{ r.gender || '—' }}</td>
                      <td class="tabular-nums">{{ r.date_of_birth || '—' }}</td>
                      <td>{{ r.mother_maiden_name || '—' }}</td>
                      <td>{{ r.religion || '—' }}</td>
                      <td>{{ r.marital_status || '—' }}</td>
                      <td class="cx-glr-cell-clip">{{ r.address || '—' }}</td>
                      <td>{{ r.state || '—' }}</td>
                      <td>{{ r.lga || '—' }}</td>
                      <td class="cx-glr-num tabular-nums">{{ r.no_of_children ?? '—' }}</td>
                      <td class="tabular-nums">{{ r.bvn || '—' }}</td>
                      <td>{{ r.name_of_next_of_kin || '—' }}</td>
                      <td class="cx-glr-cell-clip">{{ r.address_of_next_of_kin || '—' }}</td>
                      <td>{{ r.relationship || '—' }}</td>
                      <td>{{ r.phone_no_of_next_of_kin || '—' }}</td>
                      <td>{{ r.group_name_employer || '—' }}</td>
                      <td>{{ r.branch || '—' }}</td>
                      <td class="cx-glr-num tabular-nums">{{ formatMoney(r.salary) }}</td>
                      <td class="tabular-nums">{{ r.employment_date || '—' }}</td>
                      <td class="tabular-nums">{{ r.retirement_date || '—' }}</td>
                      <td>{{ r.means_of_identification || '—' }}</td>
                      <td>{{ r.id_number || '—' }}</td>
                      <td class="tabular-nums">{{ r.id_issued_date || '—' }}</td>
                      <td class="tabular-nums">{{ r.id_expiry_date || '—' }}</td>
                      <td>{{ r.account_name || '—' }}</td>
                      <td class="tabular-nums">{{ r.primary_account_no || '—' }}</td>
                      <td>{{ r.primary_bank_name || '—' }}</td>
                      <td>{{ r.loan_type }}</td>
                      <td class="tabular-nums">{{ r.date_issued || '—' }}</td>
                      <td class="cx-glr-num tabular-nums">{{ formatMoney(r.approved_amount) }}</td>
                      <td class="cx-glr-num tabular-nums">{{ formatMoney(r.bank_statement_fee) }}</td>
                      <td class="cx-glr-num tabular-nums">{{ formatMoney(r.gross_loan_amount) }}</td>
                      <td class="cx-glr-num tabular-nums">{{ formatMoney(r.net_disbursement) }}</td>
                      <td class="cx-glr-num tabular-nums">{{ formatMoney(r.top_up_balance) }}</td>
                      <td class="cx-glr-num tabular-nums">{{ r.interest_rate || '—' }}%</td>
                      <td class="cx-glr-num tabular-nums">{{ formatMoney(r.repayment_amount) }}</td>
                      <td class="tabular-nums">{{ r.first_repayment_date || '—' }}</td>
                      <td class="cx-glr-num tabular-nums">{{ r.tenor || '—' }}</td>
                      <td>{{ r.dsa || '—' }}</td>
                      <td>{{ r.channel }}</td>
                      <td><span class="cx-glr-status" [class]="'cx-glr-status-' + (r.status || '').toLowerCase()">{{ r.status }}</span></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <!-- Pagination -->
            @if (totalPages() > 1) {
              <div class="cx-glr-pagination">
                <button class="cx-btn cx-btn-outline cx-btn-sm"
                  [disabled]="currentPage() === 1"
                  (click)="goToPage(currentPage() - 1)">
                  <lucide-icon name="chevron-left" [size]="14"></lucide-icon>
                  <span>Prev</span>
                </button>
                <span class="cx-glr-page-indicator tabular-nums">
                  Page {{ currentPage() }} of {{ totalPages() }}
                </span>
                <button class="cx-btn cx-btn-outline cx-btn-sm"
                  [disabled]="currentPage() === totalPages()"
                  (click)="goToPage(currentPage() + 1)">
                  <span>Next</span>
                  <lucide-icon name="chevron-right" [size]="14"></lucide-icon>
                </button>
              </div>
            }
          </div>
        } @else {
          <cx-empty-state title="No loans found"
            description="Adjust the filters to see results, or check back once activity is recorded."
            icon="inbox"></cx-empty-state>
        }
      }
    </div>
  `,
  styles: [`
    /* ─── Filter Bar ─── */
    .cx-glr-filter-bar {
      display: flex; flex-wrap: wrap; gap: 0.75rem;
      align-items: flex-end;
      padding: 0.85rem 1rem;
      margin-bottom: 1.25rem;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
    }
    .cx-glr-filter-group {
      display: flex; flex-direction: column; gap: 0.25rem;
      min-width: 130px;
    }
    .cx-glr-filter-label {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      font-weight: 500;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    /* ─── Charts grid (2-col desktop, 1-col mobile — S1 layout) ─── */
    .cx-glr-charts-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.25rem;
      margin-bottom: 1.5rem;
    }
    @media (min-width: 900px) {
      .cx-glr-charts-grid { grid-template-columns: 1fr 1fr; }
      .cx-glr-chart-card-wide { grid-column: 1 / -1; }
    }
    .cx-glr-chart-card {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      padding: 1.25rem;
    }
    .cx-glr-chart-title {
      margin: 0 0 0.85rem;
      font-size: var(--cx-text-md);
      font-weight: 600;
      color: var(--cx-text);
    }
    .cx-glr-chart-body { width: 100%; }
    .cx-glr-chart-body svg { width: 100%; height: auto; display: block; }
    .cx-glr-chart-empty {
      color: var(--cx-text-muted);
      font-size: var(--cx-text-sm);
      text-align: center;
      padding: 2rem 0;
    }
    .cx-glr-chart-with-legend {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(140px, 200px);
      gap: 1rem;
      align-items: center;
    }
    @media (max-width: 600px) {
      .cx-glr-chart-with-legend { grid-template-columns: 1fr; }
    }
    .cx-glr-chart-legend {
      list-style: none; margin: 0; padding: 0;
      max-height: 200px; overflow-y: auto;
      font-size: var(--cx-text-xs);
    }
    .cx-glr-chart-legend li {
      display: grid; grid-template-columns: 12px 1fr auto;
      gap: 0.5rem; align-items: center;
      padding: 0.25rem 0;
    }
    .cx-glr-legend-swatch {
      width: 12px; height: 12px; border-radius: 3px; display: inline-block;
    }
    .cx-glr-legend-label {
      color: var(--cx-text); white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .cx-glr-legend-value {
      color: var(--cx-text-muted); font-variant-numeric: tabular-nums;
    }

    /* ─── Table ─── */
    .cx-glr-table-card {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      overflow: hidden;
    }
    .cx-glr-table-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-glr-table-title {
      margin: 0; font-size: var(--cx-text-md); font-weight: 600;
      color: var(--cx-text);
    }
    .cx-glr-table-meta {
      font-size: var(--cx-text-sm);
      color: var(--cx-text-muted);
    }
    .cx-glr-table-scroll {
      overflow-x: auto;
      max-height: 60vh;
      overflow-y: auto;
    }
    .cx-glr-table {
      width: 100%; border-collapse: collapse;
      font-size: var(--cx-text-xs);
    }
    .cx-glr-table thead th {
      position: sticky; top: 0;
      background: var(--cx-bg);
      padding: 0.65rem 0.75rem;
      text-align: left;
      font-weight: 600;
      color: var(--cx-text);
      border-bottom: 1px solid var(--cx-border);
      white-space: nowrap;
      z-index: 1;
    }
    .cx-glr-table tbody td {
      padding: 0.55rem 0.75rem;
      border-bottom: 1px solid var(--cx-border-subtle, var(--cx-border));
      color: var(--cx-text);
      white-space: nowrap;
    }
    .cx-glr-table tbody tr:hover { background: var(--cx-hover, rgba(0,0,0,0.02)); }
    .cx-glr-num { text-align: right; }
    .cx-glr-cell-strong { font-weight: 600; }
    .cx-glr-cell-clip {
      max-width: 200px; overflow: hidden; text-overflow: ellipsis;
    }
    .cx-glr-status {
      display: inline-block;
      padding: 0.15rem 0.55rem;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      background: var(--cx-bg);
    }
    .cx-glr-status-disbursed, .cx-glr-status-active { background: #d1fae5; color: #065f46; }
    .cx-glr-status-approved { background: #dbeafe; color: #1e40af; }
    .cx-glr-status-rejected { background: #fee2e2; color: #991b1b; }
    .cx-glr-status-overdue { background: #fef3c7; color: #92400e; }
    .cx-glr-status-closed { background: #e5e7eb; color: #374151; }
    .cx-glr-status-pending, .cx-glr-status-submitted, .cx-glr-status-captured, .cx-glr-status-under_review {
      background: #f3f4f6; color: #4b5563;
    }
    .cx-glr-pagination {
      display: flex; align-items: center; justify-content: center;
      gap: 1rem;
      padding: 0.85rem 1.25rem;
      border-top: 1px solid var(--cx-border);
    }
    .cx-glr-page-indicator {
      font-size: var(--cx-text-sm);
      color: var(--cx-text-muted);
    }

    .spin { animation: cx-spin 0.8s linear infinite; }
    @keyframes cx-spin { to { transform: rotate(360deg); } }
  `],
})
export class GeneralLoanReportComponent implements OnInit {
  // ─── Filter state ───
  filterDateFrom = '';
  filterDateTo = '';
  filterStatus = '';
  filterBranch = '';
  filterProduct = '';
  filterAgent = '';
  filterLoanType = '';

  hasActiveFilters = () =>
    this.filterDateFrom !== '' || this.filterDateTo !== '' ||
    this.filterStatus !== '' || this.filterBranch !== '' ||
    this.filterProduct !== '' || this.filterAgent !== '' ||
    this.filterLoanType !== '';

  // ─── Status buckets — same vocabulary as the performance reports ───
  // (StatusBucketResolver mirror, kept inline because importing a
  // backend-shaped constant here would be over-engineering)
  readonly statusBuckets = [
    { value: 'pending',        label: 'Pending' },
    { value: 'approved',       label: 'Approved' },
    { value: 'disbursed',      label: 'Disbursed' },
    { value: 'performing',     label: 'Performing' },
    { value: 'non_performing', label: 'Non-Performing' },
    { value: 'closed',         label: 'Closed' },
    { value: 'rejected',       label: 'Rejected' },
  ];

  // ─── Lookup data (loaded once on init) ───
  branches = signal<Array<{ id: string; name: string }>>([]);
  products = signal<Array<{ id: string; name: string }>>([]);
  agents = signal<Array<{ id: string; label: string }>>([]);

  // ─── Report state ───
  loading = signal(false);
  exporting = signal(false);
  tableRows = signal<any[]>([]);
  totalRows = signal(0);
  currentPage = signal(1);
  readonly pageSize = 50;
  totalPages = computed(() => Math.max(1, Math.ceil(this.totalRows() / this.pageSize)));
  pagedRowsLow = computed(() => (this.currentPage() - 1) * this.pageSize + 1);
  pagedRowsHigh = computed(() =>
    Math.min(this.currentPage() * this.pageSize, this.totalRows())
  );

  // ─── Chart data ───
  monthlyDisbursement = signal<ChartLabelValue[]>([]);
  statusDistribution = signal<ChartLabelValue[]>([]);
  topAgents = signal<ChartLabelValue[]>([]);
  productMix = signal<ChartLabelValue[]>([]);
  branchPerformance = signal<BranchPerformanceRow[]>([]);

  // ─── Palette — used by donut / pie / legends ───
  // Hand-picked accessible colors matching the rest of the app's
  // chart aesthetic. 12 colors covers all 13 LoanStatus values
  // gracefully (the 13th wraps to color 0 which is acceptable).
  private readonly chartPalette = [
    '#0A4F2A', '#C9A227', '#1e40af', '#dc2626', '#7c3aed',
    '#0891b2', '#ea580c', '#16a34a', '#db2777', '#475569',
    '#f59e0b', '#0ea5e9',
  ];
  palette(i: number): string {
    return this.chartPalette[i % this.chartPalette.length];
  }

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private toast: ToastService,
    private route: ActivatedRoute,
    private router: Router,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit() {
    this.loadLookups();
    this.hydrateFromUrl();
    this.loadReport();
  }

  // ─── Lookups ───
  private loadLookups() {
    this.api.get('/locations', { per_page: 200 }).subscribe({
      next: (r: any) => this.branches.set(r.data || []),
      error: () => {},
    });
    this.api.get('/loan-products', { per_page: 100 }).subscribe({
      next: (r: any) => this.products.set(r.data || []),
      error: () => {},
    });
    // 'is_agent: true' filter is the existing convention used by
    // agent-targets.component — see precedent there.
    this.api.get('/users', { is_agent: 'true', per_page: 500 }).subscribe({
      next: (r: any) => {
        const list = (r.data || []).map((u: any) => ({
          id: u.id,
          label: this.formatUserLabel(u),
        }));
        this.agents.set(list);
      },
      error: () => {},
    });
  }

  private formatUserLabel(u: any): string {
    const name = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
    return name !== '' ? name : u.email;
  }

  // ─── URL state preservation (matches Phase 2.2d pattern) ───
  private hydrateFromUrl() {
    const q = this.route.snapshot.queryParamMap;
    this.filterDateFrom = q.get('date_from') || '';
    this.filterDateTo   = q.get('date_to')   || '';
    this.filterStatus   = q.get('status')    || '';
    this.filterBranch   = q.get('branch_id') || '';
    this.filterProduct  = q.get('product_id') || '';
    this.filterAgent    = q.get('agent_id')  || '';
    this.filterLoanType = q.get('loan_type') || '';
    const page = parseInt(q.get('page') || '1', 10);
    if (!isNaN(page) && page > 0) this.currentPage.set(page);
  }

  private syncUrl() {
    const params: Record<string, string | null> = {
      date_from:  this.filterDateFrom || null,
      date_to:    this.filterDateTo   || null,
      status:     this.filterStatus   || null,
      branch_id:  this.filterBranch   || null,
      product_id: this.filterProduct  || null,
      agent_id:   this.filterAgent    || null,
      loan_type:  this.filterLoanType || null,
      page:       this.currentPage() > 1 ? String(this.currentPage()) : null,
    };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  // ─── Filter actions ───
  onFilterChange() {
    // Filter changes always reset to page 1 — pagination is tied to
    // the result set, and the result set is changing.
    this.currentPage.set(1);
    this.syncUrl();
    this.loadReport();
  }

  resetFilters() {
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterStatus = '';
    this.filterBranch = '';
    this.filterProduct = '';
    this.filterAgent = '';
    this.filterLoanType = '';
    this.currentPage.set(1);
    this.syncUrl();
    this.loadReport();
  }

  goToPage(p: number) {
    if (p < 1 || p > this.totalPages()) return;
    this.currentPage.set(p);
    this.syncUrl();
    this.loadReport();
  }

  // ─── Data load ───
  private buildFilterParams(): Record<string, string> {
    const p: Record<string, string> = {};
    if (this.filterDateFrom) p['date_from'] = this.filterDateFrom;
    if (this.filterDateTo)   p['date_to']   = this.filterDateTo;
    if (this.filterStatus)   p['status']    = this.filterStatus;
    if (this.filterBranch)   p['branch_id'] = this.filterBranch;
    if (this.filterProduct)  p['product_id'] = this.filterProduct;
    if (this.filterAgent)    p['agent_id']  = this.filterAgent;
    if (this.filterLoanType) p['loan_type'] = this.filterLoanType;
    return p;
  }

  private loadReport() {
    this.loading.set(true);
    const params = {
      ...this.buildFilterParams(),
      page: String(this.currentPage()),
      per_page: String(this.pageSize),
    };
    this.api.get('/reports/general-loans', params).subscribe({
      next: (res: any) => {
        const d = res.data || {};
        this.tableRows.set(d.rows || []);
        this.totalRows.set(d.total || 0);
        const charts = d.chart_data || {};
        this.monthlyDisbursement.set(charts.monthly_disbursement || []);
        this.statusDistribution.set(charts.status_distribution || []);
        this.topAgents.set(charts.top_agents || []);
        this.productMix.set(charts.product_mix || []);
        this.branchPerformance.set(charts.branch_performance || []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Failed to load report');
      },
    });
  }

  // ─── CSV export ───
  exportCsv() {
    this.exporting.set(true);
    const params = { ...this.buildFilterParams(), format: 'csv' };
    this.api.downloadCsv('/reports/general-loans', params).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        a.href = url;
        a.download = `general_loan_report_${ts}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.exporting.set(false);
        this.toast.success('CSV exported');
      },
      error: () => {
        this.exporting.set(false);
        this.toast.error('Export failed');
      },
    });
  }

  // ─── Number formatting ───
  formatMoney(v: any): string {
    if (v === null || v === undefined || v === '') return '—';
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (isNaN(n)) return '—';
    return n.toLocaleString('en-NG', { maximumFractionDigits: 2 });
  }

  // ─── Chart SVG renderers ───
  // All hand-rolled. ViewBox-based so they scale to container width
  // without external libraries — matches the rest of the platform's
  // pure-SVG approach.

  monthlyDisbursementSvg(): SafeHtml {
    const data = this.monthlyDisbursement();
    if (!data.length) return this.trustSvg('');
    const w = 600, h = 220, padL = 60, padR = 20, padT = 20, padB = 40;
    const max = Math.max(...data.map(d => d.value), 1);
    const stepX = (w - padL - padR) / (data.length - 1 || 1);
    const scaleY = (v: number) => h - padB - (v / max) * (h - padT - padB);

    const points = data.map((d, i) => `${padL + i * stepX},${scaleY(d.value)}`).join(' ');
    const fillPoints = `${padL},${h - padB} ${points} ${padL + (data.length - 1) * stepX},${h - padB}`;

    // Y axis ticks (4 levels)
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => {
      const y = scaleY(t * max);
      const value = this.formatMoney(t * max);
      return `<g><line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5"/>
              <text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#6b7280">${value}</text></g>`;
    }).join('');

    // X axis labels (every other to avoid crowding)
    const xLabels = data.map((d, i) => {
      if (i % 2 !== 0 && i !== data.length - 1) return '';
      return `<text x="${padL + i * stepX}" y="${h - padB + 16}" text-anchor="middle" font-size="10" fill="#6b7280">${d.label}</text>`;
    }).join('');

    const dots = data.map((d, i) =>
      `<circle cx="${padL + i * stepX}" cy="${scaleY(d.value)}" r="3" fill="${this.chartPalette[0]}"/>`
    ).join('');

    return this.trustSvg(`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      ${yTicks}
      <polygon points="${fillPoints}" fill="${this.chartPalette[0]}" fill-opacity="0.12"/>
      <polyline points="${points}" fill="none" stroke="${this.chartPalette[0]}" stroke-width="2" stroke-linejoin="round"/>
      ${dots}
      ${xLabels}
    </svg>`);
  }

  statusDistributionSvg(): SafeHtml {
    return this.trustSvg(this.donutSvg(this.statusDistribution()));
  }

  productMixSvg(): SafeHtml {
    return this.trustSvg(this.donutSvg(this.productMix()));
  }

  /**
   * Donut renderer used by status_distribution and product_mix.
   * Single-arc-per-slice approach — no overlap, no z-index hacks.
   */
  private donutSvg(data: ChartLabelValue[]): string {
    if (!data.length) return '';
    const total = data.reduce((s, d) => s + d.value, 0);
    if (total === 0) return '';

    const cx = 100, cy = 100, r = 75, ir = 45;
    let acc = 0;
    const slices = data.map((d, i) => {
      const start = acc;
      const end = acc + d.value;
      acc = end;
      const a1 = (start / total) * Math.PI * 2 - Math.PI / 2;
      const a2 = (end / total) * Math.PI * 2 - Math.PI / 2;
      const large = end - start > total / 2 ? 1 : 0;
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      const xi1 = cx + ir * Math.cos(a1), yi1 = cy + ir * Math.sin(a1);
      const xi2 = cx + ir * Math.cos(a2), yi2 = cy + ir * Math.sin(a2);
      const path = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${ir} ${ir} 0 ${large} 0 ${xi1} ${yi1} Z`;
      return `<path d="${path}" fill="${this.palette(i)}"/>`;
    }).join('');

    return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      ${slices}
      <text x="100" y="98" text-anchor="middle" font-size="22" font-weight="600" fill="#111827">${total}</text>
      <text x="100" y="115" text-anchor="middle" font-size="10" fill="#6b7280">Total</text>
    </svg>`;
  }

  topAgentsSvg(): SafeHtml {
    const data = this.topAgents();
    if (!data.length) return this.trustSvg('');
    const max = Math.max(...data.map(d => d.value), 1);
    const rowH = 28, padL = 160, padR = 50, padT = 8;
    const w = 600, h = padT + data.length * rowH + 8;
    const barW = w - padL - padR;

    const rows = data.map((d, i) => {
      const y = padT + i * rowH;
      const bw = (d.value / max) * barW;
      const labelTrunc = d.label.length > 22 ? d.label.slice(0, 21) + '…' : d.label;
      return `
        <text x="${padL - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" font-size="11" fill="#374151">${this.escapeXml(labelTrunc)}</text>
        <rect x="${padL}" y="${y + 4}" width="${bw}" height="${rowH - 10}" fill="${this.chartPalette[1]}" rx="3"/>
        <text x="${padL + bw + 6}" y="${y + rowH / 2 + 4}" font-size="11" fill="#6b7280">${d.value}</text>
      `;
    }).join('');

    return this.trustSvg(`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${rows}</svg>`);
  }

  branchPerformanceSvg(): SafeHtml {
    const data = this.branchPerformance();
    if (!data.length) return this.trustSvg('');
    const w = 800, h = 280, padL = 50, padR = 20, padT = 20, padB = 80;
    const max = Math.max(...data.map(d => d.value), 1);
    const barCount = data.length;
    const barW = (w - padL - padR) / barCount * 0.7;
    const gap = (w - padL - padR) / barCount * 0.3;
    const slot = barW + gap;

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => {
      const y = h - padB - t * (h - padT - padB);
      return `<g>
        <line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5"/>
        <text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="9" fill="#6b7280">${this.formatMoney(t * max)}</text>
      </g>`;
    }).join('');

    const bars = data.map((d, i) => {
      const x = padL + i * slot + gap / 2;
      const bh = (d.value / max) * (h - padT - padB);
      const y = h - padB - bh;
      const labelTrunc = d.label.length > 12 ? d.label.slice(0, 11) + '…' : d.label;
      return `
        <rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="${this.chartPalette[2]}" rx="2"/>
        <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="9" fill="#6b7280">${d.count}</text>
        <text x="${x + barW / 2}" y="${h - padB + 14}" text-anchor="middle" font-size="9"
              fill="#374151" transform="rotate(-30 ${x + barW / 2} ${h - padB + 14})">${this.escapeXml(labelTrunc)}</text>
      `;
    }).join('');

    return this.trustSvg(`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      ${yTicks}
      ${bars}
    </svg>`);
  }

  /**
   * Wrap a hand-built SVG string as SafeHtml so Angular's HTML
   * sanitizer (run by [innerHTML]) doesn't strip the geometric
   * elements (line/polygon/circle/rect/path) — those get stripped
   * silently by the default sanitizer because Angular treats SVG
   * children as untrusted HTML, leaving only <text> visible. We
   * own the SVG strings here (no user-controlled content reaches
   * tag/attribute names), and escapeXml() handles user-controlled
   * text inside <text> nodes, so bypassing sanitization is safe.
   */
  private trustSvg(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  /**
   * Escape user-controlled strings before embedding into the SVG
   * innerHTML. Branch names, agent names, etc. could in principle
   * contain & < > characters that would break the markup.
   */
  private escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
