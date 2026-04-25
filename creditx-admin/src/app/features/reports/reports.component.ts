import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

interface DrillLevel { label: string; key: string; value?: string; }

@Component({
  selector: 'app-reports', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Reports & Analytics"
        subtitle="Portfolio insights with drill-down analytics"
        eyebrow="Intelligence"></cx-page-header>

      <!-- Phase 4.1: tab strip removed. Each report has its own
           dedicated route in the sidebar; ReportsComponent reads
           route.data.tab to know which to render. The previous
           cx-tabs UI inside the page was redundant with sidebar nav. -->

      <!-- Breadcrumb Navigation -->
      @if (drillPath().length > 0) {
        <div class="cx-rpt-breadcrumb">
          <button class="cx-rpt-crumb cx-rpt-crumb-link" (click)="resetDrill()">
            <lucide-icon name="home" [size]="12"></lucide-icon>
            <span>{{ reportTitle() }}</span>
          </button>
          @for (level of drillPath(); track $index) {
            <lucide-icon name="chevron-right" [size]="12" class="cx-rpt-crumb-sep"></lucide-icon>
            <span class="cx-rpt-crumb-current">
              <span class="cx-rpt-crumb-key">{{ level.label }}:</span>
              <span>{{ level.value }}</span>
            </span>
          }
        </div>
      }

      @if (loading()) {
        <cx-loading message="Generating report..."></cx-loading>
      } @else {
        <!-- Performance Filter Bar (performance tabs only) -->
        @if (isPerformanceTab()) {
          <div class="cx-rpt-filter-bar">
            <div class="cx-rpt-filter-group">
              <label class="cx-rpt-filter-label">From</label>
              <input type="date" class="cx-input cx-input-sm"
                [(ngModel)]="filterDateFrom" (change)="onFilterChange()">
            </div>
            <div class="cx-rpt-filter-group">
              <label class="cx-rpt-filter-label">To</label>
              <input type="date" class="cx-input cx-input-sm"
                [(ngModel)]="filterDateTo" (change)="onFilterChange()">
            </div>
            <div class="cx-rpt-filter-group">
              <label class="cx-rpt-filter-label">Branch</label>
              <select class="cx-select cx-input-sm"
                [(ngModel)]="filterBranch" (change)="onFilterChange()">
                <option value="">All branches</option>
                @for (b of branches(); track b.id) {
                  <option [value]="b.id">{{ b.name }}</option>
                }
              </select>
            </div>
            <div class="cx-rpt-filter-group">
              <label class="cx-rpt-filter-label">Status</label>
              <select class="cx-select cx-input-sm"
                [(ngModel)]="filterStatus" (change)="onFilterChange()">
                <option value="">All</option>
                @for (s of statusBuckets; track s.value) {
                  <option [value]="s.value">{{ s.label }}</option>
                }
              </select>
            </div>
            @if (isApproverTab()) {
              <div class="cx-rpt-filter-group">
                <label class="cx-rpt-filter-label">Granularity</label>
                <select class="cx-select cx-input-sm"
                  [(ngModel)]="filterGranularity" (change)="onFilterChange()">
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                </select>
              </div>
            }
            @if (hasActiveFilters()) {
              <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="resetFilters()">
                <lucide-icon name="x" [size]="14"></lucide-icon>
                <span>Reset</span>
              </button>
            }
          </div>
        }

        <!-- Summary KPIs -->
        @if (kpis().length) {
          <div class="cx-rpt-kpis cx-stagger">
            @for (kpi of kpis(); track kpi.label) {
              <div class="cx-rpt-kpi">
                <div class="cx-eyebrow">{{ kpi.label }}</div>
                <div class="cx-rpt-kpi-value tabular-nums" [style.color]="kpi.color || 'var(--cx-text)'">
                  {{ kpi.prefix }}{{ kpi.value | number:kpi.format || '1.0-0' }}{{ kpi.suffix }}
                </div>
                @if (kpi.change !== undefined) {
                  <div class="cx-rpt-kpi-change" [class.is-up]="kpi.change > 0" [class.is-down]="kpi.change < 0">
                    <lucide-icon [name]="kpi.change > 0 ? 'trending-up' : 'trending-down'" [size]="11"></lucide-icon>
                    <span>{{ Math.abs(kpi.change) }}% vs last period</span>
                  </div>
                }
              </div>
            }
          </div>
        }

        <!-- Chart Section -->
        @if (chartData().length) {
          <div class="cx-card cx-rpt-chart">
            <div class="cx-rpt-chart-header">
              <h3 class="cx-rpt-chart-title">{{ chartTitle() }}</h3>
              <span class="cx-eyebrow">Visualization</span>
            </div>
            @if (chartType() === 'bar') {
              <div class="cx-rpt-chart-body">
                <svg viewBox="0 0 800 300" class="cx-rpt-chart-svg">
                  @for (item of chartData(); track $index; let i = $index) {
                    <g [attr.transform]="'translate(' + (i * barWidth() + 40) + ', 0)'">
                      <rect [attr.y]="300 - barHeight(item.value)" [attr.width]="barWidth() - 10"
                            [attr.height]="barHeight(item.value)" [attr.fill]="barColor(i)"
                            class="cx-rpt-chart-bar"
                            (click)="drillDown(item)"></rect>
                      <text [attr.x]="(barWidth() - 10) / 2" y="295" text-anchor="middle" class="cx-rpt-chart-bar-label">
                        {{ truncate(item.label, 12) }}
                      </text>
                      <text [attr.x]="(barWidth() - 10) / 2" [attr.y]="290 - barHeight(item.value)" text-anchor="middle"
                            class="cx-rpt-chart-bar-value">
                        {{ formatNumber(item.value) }}
                      </text>
                    </g>
                  }
                </svg>
              </div>
            } @else if (chartType() === 'pie') {
              <div class="cx-rpt-pie-wrap">
                <svg viewBox="0 0 200 200" class="cx-rpt-pie-svg">
                  @for (slice of pieSlices(); track $index) {
                    <path [attr.d]="slice.path" [attr.fill]="slice.color" class="cx-rpt-pie-slice"
                          (click)="drillDown(slice.item)"></path>
                  }
                </svg>
                <div class="cx-rpt-pie-legend">
                  @for (item of chartData(); track $index; let i = $index) {
                    <button class="cx-rpt-pie-legend-row" (click)="drillDown(item)">
                      <div class="cx-rpt-pie-swatch" [style.background]="barColor(i)"></div>
                      <span class="cx-rpt-pie-legend-label">{{ item.label }}</span>
                      <span class="cx-rpt-pie-legend-value tabular-nums">{{ formatNumber(item.value) }}</span>
                      <span class="cx-rpt-pie-legend-pct tabular-nums">{{ item.percent?.toFixed(1) }}%</span>
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        }

        <!-- Data Table -->
        @if (tableData().length) {
          <div class="cx-rpt-table-wrap">
            <div class="cx-rpt-table-header">
              <h3 class="cx-rpt-table-title">{{ tableTitle() }}</h3>
              <div class="flex gap-2">
                <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="exportData('csv')">
                  <lucide-icon name="file-spreadsheet" [size]="14"></lucide-icon>
                  <span>CSV</span>
                </button>
                <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="exportData('excel')">
                  <lucide-icon name="file-spreadsheet" [size]="14"></lucide-icon>
                  <span>Excel</span>
                </button>
              </div>
            </div>
            <div class="cx-rpt-table-scroll">
              <table class="cx-rpt-table">
                <thead>
                  <tr>
                    @for (col of tableColumns(); track col.key) {
                      <th>{{ col.label }}</th>
                    }
                    @if (allowDrill()) { <th class="cx-rpt-table-drill-col"></th> }
                  </tr>
                </thead>
                <tbody>
                  @for (row of paginatedData(); track row.id || $index) {
                    <tr>
                      @for (col of tableColumns(); track col.key) {
                        <td>{{ formatTableCell(row[col.key], col.type) }}</td>
                      }
                      @if (allowDrill()) {
                        <td class="cx-rpt-table-drill-col">
                          <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="drillDownRow(row)" title="Drill down">
                            <lucide-icon name="chevron-right" [size]="14"></lucide-icon>
                          </button>
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (totalPages() > 1) {
              <div class="cx-rpt-pagination">
                <div class="cx-rpt-pagination-info">
                  Showing <span class="tabular-nums">{{ (currentPage() - 1) * pageSize + 1 }}</span> to
                  <span class="tabular-nums">{{ Math.min(currentPage() * pageSize, tableData().length) }}</span>
                  of <span class="tabular-nums">{{ tableData().length }}</span>
                </div>
                <div class="cx-rpt-pagination-controls">
                  <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" [disabled]="currentPage() === 1" (click)="currentPage.set(currentPage() - 1)">
                    <lucide-icon name="chevron-left" [size]="14"></lucide-icon>
                  </button>
                  @for (p of pageNumbers(); track p) {
                    <button class="cx-btn cx-btn-sm cx-rpt-page-btn" [class.cx-btn-primary]="p === currentPage()" [class.cx-btn-ghost]="p !== currentPage()"
                            (click)="currentPage.set(p)">{{ p }}</button>
                  }
                  <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" [disabled]="currentPage() === totalPages()" (click)="currentPage.set(currentPage() + 1)">
                    <lucide-icon name="chevron-right" [size]="14"></lucide-icon>
                  </button>
                </div>
              </div>
            }
          </div>
        } @else if (!loading() && kpis().length === 0 && chartData().length === 0) {
          <cx-empty-state title="No data available" description="Once activity happens on the platform, reports will populate here." icon="bar-chart-3"></cx-empty-state>
        }

        <!-- Approver time-series table — BB1 submissions + decisions per bucket -->
        @if (isApproverTab() && approverTimeSeries().length && drillPath().length === 0) {
          <div class="cx-rpt-card" style="margin-top: 1.25rem;">
            <div class="cx-rpt-card-header">
              <div>
                <h3 class="cx-rpt-card-title">Approval Timeline</h3>
                <p class="cx-rpt-card-sub">
                  {{ filterGranularity === 'day' ? 'Daily' : filterGranularity === 'week' ? 'Weekly' : 'Monthly' }}
                  submissions vs. decisions
                </p>
              </div>
              <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="exportTimeSeries()">
                <lucide-icon name="download" [size]="14"></lucide-icon>
                <span>Export CSV</span>
              </button>
            </div>
            <div class="cx-rpt-table-wrap">
              <table class="cx-rpt-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th class="cx-rpt-num">Submissions</th>
                    <th class="cx-rpt-num">Approvals</th>
                    <th class="cx-rpt-num">Rejections</th>
                    <th class="cx-rpt-num">Approval %</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of approverTimeSeries(); track r.period) {
                    <tr>
                      <td>{{ r.period }}</td>
                      <td class="cx-rpt-num tabular-nums">{{ r.submissions }}</td>
                      <td class="cx-rpt-num tabular-nums">{{ r.approvals }}</td>
                      <td class="cx-rpt-num tabular-nums">{{ r.rejections }}</td>
                      <td class="cx-rpt-num tabular-nums">
                        {{ (r.approvals + r.rejections) > 0
                           ? ((r.approvals / (r.approvals + r.rejections)) * 100 | number:'1.1-1') + '%'
                           : '—' }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    /* ═══ Breadcrumb ═══ */
    .cx-rpt-breadcrumb {
      display: flex; align-items: center; gap: 0.45rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
      padding: 0.5rem 0.85rem;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border-subtle);
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-xs);
    }
    .cx-rpt-crumb-link {
      display: inline-flex; align-items: center; gap: 4px;
      background: transparent; border: none;
      color: var(--cx-primary-600);
      font-weight: 500;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: var(--cx-radius-xs);
      transition: background var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-rpt-crumb-link:hover { background: var(--cx-primary-50); }
    .cx-rpt-crumb-sep { color: var(--cx-text-subtle); }
    .cx-rpt-crumb-current {
      display: inline-flex; align-items: center; gap: 4px;
      color: var(--cx-text);
      font-weight: 500;
    }
    .cx-rpt-crumb-key {
      color: var(--cx-text-muted);
      font-weight: 400;
    }

    /* ═══ Filter Bar (performance tabs) ═══ */
    .cx-rpt-filter-bar {
      display: flex; flex-wrap: wrap; gap: 0.75rem;
      align-items: flex-end;
      padding: 0.85rem 1rem;
      margin-bottom: 1.25rem;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
    }
    .cx-rpt-filter-group {
      display: flex; flex-direction: column; gap: 0.25rem;
      min-width: 140px;
    }
    .cx-rpt-filter-label {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      font-weight: 500;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    /* ═══ KPI Grid ═══ */
    .cx-rpt-kpis {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.85rem;
      margin-bottom: 1.25rem;
    }
    @media (min-width: 1024px) {
      .cx-rpt-kpis { grid-template-columns: repeat(4, 1fr); }
    }
    .cx-rpt-kpi {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      padding: 0.95rem 1rem;
      transition: box-shadow var(--cx-dur-base) var(--cx-ease-premium), transform var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cx-rpt-kpi:hover { box-shadow: var(--cx-shadow-sm); transform: translateY(-1px); }
    .cx-rpt-kpi .cx-eyebrow { margin-bottom: 0.45rem; }
    .cx-rpt-kpi-value {
      font-size: var(--cx-text-2xl);
      font-weight: 600;
      letter-spacing: -0.015em;
      line-height: 1.1;
    }
    .cx-rpt-kpi-change {
      display: inline-flex; align-items: center; gap: 3px;
      margin-top: 0.4rem;
      padding: 2px 8px;
      background: var(--cx-stone-100);
      border-radius: var(--cx-radius-pill);
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
    }
    .cx-rpt-kpi-change.is-up { background: var(--cx-success-50); color: var(--cx-primary-700); }
    .cx-rpt-kpi-change.is-down { background: var(--cx-danger-50); color: var(--cx-danger); }

    /* ═══ Chart card ═══ */
    .cx-rpt-chart { margin-bottom: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
    .cx-rpt-chart-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cx-rpt-chart-title {
      margin: 0;
      font-size: var(--cx-text-md); font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
    }
    .cx-rpt-chart-body { height: 16rem; }
    .cx-rpt-chart-svg { width: 100%; height: 100%; }
    .cx-rpt-chart-bar {
      cursor: pointer;
      transition: opacity var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-rpt-chart-bar:hover { opacity: 0.85; }
    .cx-rpt-chart-bar-label { font-size: 10px; fill: var(--cx-text-muted); }
    .cx-rpt-chart-bar-value { font-size: 11px; font-weight: 600; fill: var(--cx-text); }

    /* Pie */
    .cx-rpt-pie-wrap {
      display: flex; flex-direction: column; gap: 1.5rem;
      align-items: center;
    }
    @media (min-width: 768px) {
      .cx-rpt-pie-wrap { flex-direction: row; gap: 2rem; align-items: center; }
    }
    .cx-rpt-pie-svg { width: 12rem; height: 12rem; flex-shrink: 0; }
    .cx-rpt-pie-slice { cursor: pointer; transition: opacity var(--cx-dur-fast) var(--cx-ease-premium); }
    .cx-rpt-pie-slice:hover { opacity: 0.85; }
    .cx-rpt-pie-legend {
      flex: 1; width: 100%;
      display: flex; flex-direction: column;
    }
    .cx-rpt-pie-legend-row {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.55rem 0.65rem;
      background: transparent; border: none;
      border-radius: var(--cx-radius-md);
      cursor: pointer; text-align: left;
      transition: background var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-rpt-pie-legend-row:hover { background: var(--cx-surface-hover); }
    .cx-rpt-pie-swatch {
      width: 10px; height: 10px;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .cx-rpt-pie-legend-label {
      flex: 1;
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .cx-rpt-pie-legend-value {
      font-size: var(--cx-text-sm); font-weight: 500;
      color: var(--cx-text-secondary);
    }
    .cx-rpt-pie-legend-pct {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      min-width: 3.5rem; text-align: right;
    }

    /* ═══ Data Table ═══ */
    .cx-rpt-table-wrap {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      overflow: hidden;
    }
    .cx-rpt-table-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--cx-border);
      background: var(--cx-surface);
    }
    .cx-rpt-table-title {
      margin: 0;
      font-size: var(--cx-text-md); font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
    }
    .cx-rpt-table-scroll { overflow-x: auto; }
    .cx-rpt-table { width: 100%; border-collapse: collapse; }
    .cx-rpt-table thead { background: var(--cx-surface-2); }
    .cx-rpt-table thead tr { border-bottom: 1px solid var(--cx-border); }
    .cx-rpt-table th {
      padding: 0.75rem 1rem;
      font-size: var(--cx-text-xs); font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.05em;
      color: var(--cx-text-muted);
      text-align: left;
      white-space: nowrap;
    }
    .cx-rpt-table-drill-col { width: 48px; }
    .cx-rpt-table tbody td {
      padding: 0.75rem 1rem;
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cx-rpt-table tbody tr { transition: background var(--cx-dur-fast) var(--cx-ease-premium); }
    .cx-rpt-table tbody tr:hover { background: var(--cx-surface-hover); }
    .cx-rpt-table tbody tr:last-child td { border-bottom: none; }

    .cx-rpt-pagination {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--cx-border);
      background: var(--cx-surface);
    }
    .cx-rpt-pagination-info {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
    }
    .cx-rpt-pagination-controls { display: flex; align-items: center; gap: 0.35rem; }
    .cx-rpt-page-btn { min-width: 32px; font-variant-numeric: tabular-nums; }
  `],
})
export class ReportsComponent implements OnInit {
  // Performance tab keys — used by permission gating, filter visibility,
  // and drill/export routing. Keep the list here as the canonical source
  // so adding a new performance report later is a single-line change.
  private readonly PERFORMANCE_TABS = new Set([
    'agent-performance',
    'branch-performance',
    'product-performance',
    'approver-performance',
  ]);

  // Permission slug required for each performance tab. Aligns with the
  // granular permissions introduced in Phase 2.1 (see migrate-performance-
  // permissions.php and seed-lite.php).
  private readonly TAB_PERMISSION_MAP: Record<string, string> = {
    'agent-performance':    'reports.performance.agents',
    'branch-performance':   'reports.performance.branches',
    'product-performance':  'reports.performance.products',
    'approver-performance': 'reports.performance.approvers',
  };

  // Friendly status buckets for the performance filter dropdown. These
  // map to the StatusBucketResolver on the backend. Order matters — shown
  // top-to-bottom in the dropdown.
  readonly statusBuckets = [
    { value: 'pending',        label: 'Pending' },
    { value: 'approved',       label: 'Approved' },
    { value: 'disbursed',      label: 'Disbursed' },
    { value: 'performing',     label: 'Performing' },
    { value: 'non_performing', label: 'Non-Performing' },
    { value: 'closed',         label: 'Closed' },
    { value: 'rejected',       label: 'Rejected' },
  ];

  private allReportTabs = [
    { key: 'portfolio', label: 'Loan Portfolio' },
    { key: 'par', label: 'Portfolio at Risk' },
    { key: 'agent-performance', label: 'Agent Performance' },
    { key: 'branch-performance', label: 'Branch Performance' },
    { key: 'product-performance', label: 'Product Performance' },
    { key: 'approver-performance', label: 'Approver Performance' },
    { key: 'receivables', label: 'Receivables' },
    { key: 'closed-loans', label: 'Closed Loans' },
    { key: 'repayment', label: 'Repayment Performance' },
    { key: 'collection', label: 'Collection Efficiency' },
  ];

  // Filter hide performance tabs from users who lack their specific permission.
  // Non-performance tabs remain unfiltered (they have their own permission
  // gating via RBAC middleware on the backend routes — a user hitting them
  // without the permission sees an empty error state, not the tab missing,
  // which is how the existing UI already works).
  visibleReportTabs = computed(() => {
    return this.allReportTabs.filter(t => {
      const perm = this.TAB_PERMISSION_MAP[t.key];
      if (!perm) return true;
      return this.auth.hasPermission(perm);
    });
  });

  activeReport = signal('portfolio');
  reportTitle = signal('Loan Portfolio');
  loading = signal(false);
  drillPath = signal<DrillLevel[]>([]);

  // Performance filter state. Shown only when isPerformanceTab() is true.
  // Empty string === unset; this is what <input type="date"> naturally
  // round-trips, and our query-param serialization treats empty as omitted.
  filterDateFrom = '';
  filterDateTo = '';
  filterStatus = '';
  filterBranch = '';
  // Granularity control — only surfaced on approver-performance tab.
  // Backend defaults to 'day' when unset, so omit from query params
  // while the default is selected to keep URLs cleaner.
  filterGranularity: 'day' | 'week' | 'month' = 'day';
  branches = signal<Array<{ id: string; name: string }>>([]);

  isPerformanceTab = computed(() => this.PERFORMANCE_TABS.has(this.activeReport()));
  // Approver tab has bespoke UI affordances (granularity selector, time-
  // series table) that don't apply to the other performance reports.
  isApproverTab = computed(() => this.activeReport() === 'approver-performance');

  // Approver time-series data — populated from data.time_series on load.
  // Rendered as a small table under the main content when on approver tab.
  approverTimeSeries = signal<Array<{ period: string; submissions: number; approvals: number; rejections: number }>>([]);

  hasActiveFilters = () =>
    this.filterDateFrom !== '' ||
    this.filterDateTo !== '' ||
    this.filterStatus !== '' ||
    this.filterBranch !== '' ||
    (this.isApproverTab() && this.filterGranularity !== 'day');

  kpis = signal<any[]>([]);
  chartData = signal<any[]>([]);
  chartTitle = signal('');
  chartType = signal<'bar' | 'pie'>('bar');
  tableData = signal<any[]>([]);
  tableColumns = signal<any[]>([]);
  tableTitle = signal('');
  allowDrill = signal(false);

  currentPage = signal(1);
  pageSize = 20;
  Math = Math;

  totalPages = computed(() => Math.ceil(this.tableData().length / this.pageSize));
  paginatedData = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.tableData().slice(start, start + this.pageSize);
  });
  pageNumbers = computed(() => {
    const total = this.totalPages();
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const curr = this.currentPage();
    if (curr <= 4) return [1, 2, 3, 4, 5, -1, total];
    if (curr >= total - 3) return [1, -1, total - 4, total - 3, total - 2, total - 1, total];
    return [1, -1, curr - 1, curr, curr + 1, -1, total];
  });

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private toast: ToastService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    this.loadBranches();

    // Route-driven tab (Phase 4.1). The 10 dedicated /reports/<tab> routes
    // each pass a 'tab' value via route.data. Backward-compat: if someone
    // hits an old /reports?tab=X URL we redirect them to the new
    // /reports/X route instead of trying to render in-place.
    const routeTab = this.route.snapshot.data['tab'] as string | undefined;
    const q = this.route.snapshot.queryParamMap;
    const legacyTab = q.get('tab');

    if (!routeTab && legacyTab) {
      // Old bookmark hit /reports?tab=X — redirect to new path. Preserve
      // any other query params (filters, drill keys) so deep-links keep
      // their context after the upgrade.
      const otherParams: Record<string, string> = {};
      q.keys.forEach(k => {
        if (k === 'tab') return;
        const v = q.get(k);
        if (v !== null) otherParams[k] = v;
      });
      this.router.navigate([`/reports/${legacyTab}`], {
        queryParams: otherParams,
        replaceUrl: true,
      });
      return;
    }

    // Determine the active tab. Priority: route.data (canonical), then
    // any visible default. activeReport's initial 'portfolio' value is
    // a fallback for the (currently impossible) case where neither is
    // present — the /reports root redirects to /reports/portfolio so
    // this branch is essentially defensive.
    const visible = this.visibleReportTabs();
    if (routeTab && visible.some(t => t.key === routeTab)) {
      this.activeReport.set(routeTab);
      this.reportTitle.set(this.allReportTabs.find(t => t.key === routeTab)?.label || routeTab);
    } else if (visible.length && !visible.some(t => t.key === this.activeReport())) {
      // Fall back to first visible tab if the requested one isn't
      // accessible under the user's permissions. This can happen if a
      // user shares a deep-link to a report the recipient can't see.
      this.activeReport.set(visible[0].key);
      this.reportTitle.set(visible[0].label);
    }

    // Filters (performance tabs only — the URL schema doesn't attempt to
    // represent non-performance reports' filters since they don't exist).
    if (this.isPerformanceTab()) {
      this.filterDateFrom = q.get('date_from') || '';
      this.filterDateTo   = q.get('date_to')   || '';
      this.filterStatus   = q.get('status')    || '';
      this.filterBranch   = q.get('branch_id') || '';
      const g = q.get('granularity');
      if (g === 'day' || g === 'week' || g === 'month') this.filterGranularity = g;
    }

    // Drill path: which drill key is present decides the shape. For
    // branch-performance we may have two levels (branch_id + agent_id).
    const path: DrillLevel[] = [];
    const report = this.activeReport();
    if (report === 'agent-performance' && q.get('agent_id')) {
      path.push({ label: 'Agent', key: 'agent_id', value: q.get('agent_id')! });
    } else if (report === 'product-performance' && q.get('product_id')) {
      path.push({ label: 'Product', key: 'product_id', value: q.get('product_id')! });
    } else if (report === 'approver-performance' && q.get('approver_id')) {
      path.push({ label: 'Approver', key: 'approver_id', value: q.get('approver_id')! });
    } else if (report === 'branch-performance') {
      if (q.get('branch_id')) path.push({ label: 'Branch', key: 'branch_id', value: q.get('branch_id')! });
      if (q.get('branch_id') && q.get('agent_id')) path.push({ label: 'Agent', key: 'agent_id', value: q.get('agent_id')! });
    }
    if (path.length) this.drillPath.set(path);

    this.loadReport();
  }

  /**
   * Mirror current state to the URL so refresh preserves context and
   * users can bookmark/share deep links. Called on every action that
   * would otherwise cause loadReport() to fire.
   *
   * Uses replaceUrl to avoid polluting browser history — each filter
   * tweak pushing a history entry would turn the back button into a
   * mess of intermediate states.
   *
   * Phase 4.1: tab is no longer a query param — it's encoded in the
   * route path (e.g., /reports/portfolio). syncUrl only writes the
   * filters and drill keys; navigate() with relativeTo: this.route
   * preserves the path so the user stays on /reports/<currentTab>.
   */
  private syncUrl(): void {
    const params: Record<string, string | null> = {};

    if (this.isPerformanceTab()) {
      params['date_from'] = this.filterDateFrom || null;
      params['date_to']   = this.filterDateTo   || null;
      params['status']    = this.filterStatus   || null;
      params['branch_id'] = this.filterBranch   || null;
      // Granularity persists only on the approver tab. When default ('day')
      // or on a non-approver perf tab, omit from URL so the querystring
      // stays compact and doesn't falsely suggest granularity affects the
      // other reports.
      params['granularity'] = (this.isApproverTab() && this.filterGranularity !== 'day')
        ? this.filterGranularity
        : null;
    } else {
      // Clear any performance-only params from the URL when leaving
      // the performance group so the URL accurately represents what
      // the page is showing.
      params['date_from']   = null;
      params['date_to']     = null;
      params['status']      = null;
      params['branch_id']   = this.filterBranch ? this.filterBranch : null;
      params['granularity'] = null;
    }

    // Drill keys — only emit ones applicable to the current report
    // so the URL stays clean. branch_id set via filter vs drill would
    // collide for branch-performance; we give drill precedence since
    // the branch filter is disabled/irrelevant there anyway.
    const path = this.drillPath();
    const report = this.activeReport();
    const drillKeys: Record<string, string | null> = {
      agent_id: null, product_id: null, approver_id: null,
    };
    if (report === 'branch-performance') drillKeys['branch_id'] = null; // drill owns it here
    path.forEach(p => {
      if (p.key === 'agent_id')    drillKeys['agent_id']    = p.value ?? null;
      if (p.key === 'product_id')  drillKeys['product_id']  = p.value ?? null;
      if (p.key === 'approver_id') drillKeys['approver_id'] = p.value ?? null;
      if (p.key === 'branch_id' && report === 'branch-performance') drillKeys['branch_id'] = p.value ?? null;
    });
    Object.assign(params, drillKeys);

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private loadBranches() {
    // per_page=100 matches the pattern used in users.component.ts for the
    // same dropdown — we're not paginating branches in the UI so pulling
    // a larger chunk keeps things simple. If a tenant ever exceeds 100
    // branches this becomes a typeahead problem, not a paging problem.
    this.api.get('/locations', { per_page: 100 }).subscribe({
      next: (r: any) => this.branches.set(r.data || []),
      error: () => { /* silently ignore — filter just stays at "All branches" */ },
    });
  }

  onFilterChange() {
    this.currentPage.set(1);
    this.syncUrl();
    this.loadReport();
  }

  resetFilters() {
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterStatus = '';
    this.filterBranch = '';
    this.filterGranularity = 'day';
    this.currentPage.set(1);
    this.syncUrl();
    this.loadReport();
  }

  resetDrill() {
    this.drillPath.set([]);
    this.currentPage.set(1);
    this.syncUrl();
    this.loadReport();
  }

  loadReport() {
    this.loading.set(true);
    const path = this.drillPath();
    const params: any = {};
    path.forEach(p => params[p.key] = p.value);

    // Performance filters: only attached when the active tab is a
    // performance report. The backend Actions (AgentPerformanceAction etc.)
    // silently ignore params they don't expect, but we keep other reports
    // clean so the request URL matches operator intent.
    if (this.isPerformanceTab()) {
      if (this.filterDateFrom) params['date_from'] = this.filterDateFrom;
      if (this.filterDateTo)   params['date_to']   = this.filterDateTo;
      if (this.filterStatus)   params['status']    = this.filterStatus;
      if (this.filterBranch)   params['branch_id'] = this.filterBranch;
      // Granularity only affects the approver report; sending it on
      // other performance endpoints is harmless (backend ignores unknown
      // query params) but keeping the request URLs clean helps debugging.
      if (this.isApproverTab() && this.filterGranularity !== 'day') {
        params['granularity'] = this.filterGranularity;
      }
    }

    this.api.get(`/reports/${this.activeReport()}`, params).subscribe({
      next: res => {
        this.processReportData(res.data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Failed to load report');
      }
    });
  }

  private processReportData(data: any) {
    if (!data) return;

    // ─── KPIs ───
    // Performance reports put numbers under data.summary; other reports
    // put them at the root. We merge the two so a single extraction pass
    // handles both — performance summary keys just override anything with
    // the same name at the root (they shouldn't collide in practice).
    const k = { ...data, ...(data.summary || {}) };
    const kpis: any[] = [];

    // Generic (portfolio, PAR, etc.)
    if (k.total_loans !== undefined)       kpis.push({ label: 'Total Loans', value: k.total_loans, format: '1.0-0' });
    if (k.total_amount !== undefined)      kpis.push({ label: 'Total Amount', value: k.total_amount, prefix: '₦', format: '1.0-0' });
    if (k.outstanding !== undefined)       kpis.push({ label: 'Outstanding', value: k.outstanding, prefix: '₦', format: '1.0-0' });
    if (k.collection_rate !== undefined)   kpis.push({ label: 'Collection Rate', value: k.collection_rate, suffix: '%', format: '1.1-1' });
    if (k.par_ratio !== undefined)         kpis.push({ label: 'PAR Ratio', value: k.par_ratio, suffix: '%', format: '1.2-2', color: k.par_ratio > 5 ? '#ef4444' : '#10b981' });

    // Performance-specific
    if (k.total_disbursed !== undefined && kpis.length < 4) kpis.push({ label: 'Total Disbursed', value: k.total_disbursed, prefix: '₦', format: '1.0-0' });
    if (k.approval_rate !== undefined && kpis.length < 4)   kpis.push({ label: 'Approval Rate', value: k.approval_rate, suffix: '%', format: '1.1-1' });
    if (k.avg_ticket_size !== undefined && kpis.length < 4) kpis.push({ label: 'Avg Ticket', value: k.avg_ticket_size, prefix: '₦', format: '1.0-0' });
    if (k.active_agents !== undefined && kpis.length < 4)   kpis.push({ label: 'Active Agents', value: k.active_agents, format: '1.0-0' });
    if (k.active_branches !== undefined && kpis.length < 4) kpis.push({ label: 'Active Branches', value: k.active_branches, format: '1.0-0' });
    if (k.active_products !== undefined && kpis.length < 4) kpis.push({ label: 'Active Products', value: k.active_products, format: '1.0-0' });

    // Approver-specific — these win priority on the approver tab because
    // they answer the report's core question. Checked before the slice(0,4)
    // truncation so they're guaranteed to surface.
    if (this.isApproverTab()) {
      // Reset and build the approver-specific KPI set directly — avoids
      // mixing loan-centric KPIs (disbursed, active agents, etc) that
      // don't apply to approver throughput.
      kpis.length = 0;
      kpis.push({ label: 'Decisions', value: k.decisions || 0, format: '1.0-0' });
      kpis.push({ label: 'Approval Rate', value: k.approval_rate || 0, suffix: '%', format: '1.1-1' });
      // Hours read naturally to most operators; switch to days once
      // we're past 48h to keep labels compact.
      const clockFmt = (v: number | null): { value: number; suffix: string } => {
        if (v === null || v === undefined) return { value: 0, suffix: 'h' };
        return v >= 48 ? { value: Math.round(v / 24 * 10) / 10, suffix: 'd' } : { value: v, suffix: 'h' };
      };
      const apprClock = clockFmt(k.avg_approver_clock_hours);
      const loanClock = clockFmt(k.avg_loan_clock_hours);
      kpis.push({ label: 'Avg Approver Time', value: apprClock.value, suffix: apprClock.suffix, format: '1.1-1' });
      kpis.push({ label: 'Avg Loan Wait',     value: loanClock.value, suffix: loanClock.suffix, format: '1.1-1' });
      // HH: on-desk snapshot as a bonus KPI-row item via pushing beyond 4
      // would be cut off by slice — swap avg_loan_wait for on_desk when the
      // loan_clock average is unavailable (no completed decisions yet).
      if (k.avg_loan_clock_hours === null || k.avg_loan_clock_hours === undefined) {
        kpis[3] = { label: 'Currently On Desk', value: k.currently_on_desk || 0, format: '1.0-0' };
      }
    }

    this.kpis.set(kpis.slice(0, 4));

    // ─── Chart ───
    // Performance reports: when NOT drilled, chart uses by_{agent,branch,product}.
    // When drilled, chart either stays as the parent rollup (preserving context)
    // or goes blank — we blank it to keep the drill view focused on details.
    const drilled = this.drillPath().length > 0;
    const breakdown = drilled
      ? []
      : (data.by_status || data.by_branch || data.by_agent || data.by_product || data.by_approver || data.breakdown || []);

    if (Array.isArray(breakdown) && breakdown.length) {
      const chartItems = breakdown.map((item: any) => ({
        label: item.name || item.status || item.branch_name || item.agent_name || item.product_name || 'Unknown',
        value: item.count || item.total || item.amount || 0,
        key: item.id || item.status || item.branch_id || item.agent_id || item.product_id,
        item: item,
      }));
      const total = chartItems.reduce((sum: number, i: any) => sum + i.value, 0);
      chartItems.forEach((i: any) => i.percent = total > 0 ? (i.value / total) * 100 : 0);
      this.chartData.set(chartItems);
      this.chartType.set(chartItems.length <= 6 ? 'pie' : 'bar');
      this.chartTitle.set(this.getChartTitle());
    } else {
      this.chartData.set([]);
    }

    // ─── Table ───
    // Priority order:
    //   1. Drilled view -> data.details (always what the user wants after drilling)
    //   2. Performance top rollup -> data.by_* (so the rollup table mirrors the chart)
    //   3. Anything else -> legacy data.loans/payments/agents/branches/details fallback
    let tableRows: any[] = [];
    if (drilled && Array.isArray(data.details)) {
      tableRows = data.details;
    } else if (this.isPerformanceTab()) {
      tableRows = data.by_agent || data.by_branch || data.by_product || data.by_approver || [];
    } else {
      tableRows = data.loans || data.payments || data.agents || data.branches || data.details || [];
    }

    // Approver time-series is a side-panel that lives below the main
    // content. Empty array when not on the approver tab so the @if in the
    // template cleanly hides the section.
    this.approverTimeSeries.set(
      this.isApproverTab() && Array.isArray(data.time_series) ? data.time_series : []
    );

    if (Array.isArray(tableRows) && tableRows.length) {
      this.tableData.set(tableRows);
      this.tableColumns.set(this.inferColumns(tableRows[0]));
      this.tableTitle.set(drilled ? 'Drill Details' : 'Details');
      this.allowDrill.set(this.canDrillFromTable());
    } else {
      this.tableData.set([]);
      this.tableColumns.set([]);
      this.allowDrill.set(false);
    }
  }

  private getChartTitle(): string {
    const report = this.activeReport();
    const path = this.drillPath();
    if (path.length === 0) {
      if (report === 'portfolio') return 'Loans by Status';
      if (report === 'repayment') return 'Repayment by Period';
      if (report === 'collection') return 'Collection by Agent';
      if (report === 'par') return 'PAR by Aging Bucket';
      if (report === 'agent-performance')   return 'Top Agents by Volume';
      if (report === 'branch-performance')  return 'Branches by Volume';
      if (report === 'product-performance') return 'Products by Volume';
      if (report === 'approver-performance') return 'Approvers by Decision Count';
    }
    return 'Breakdown';
  }

  private inferColumns(sample: any): any[] {
    const keys = Object.keys(sample).filter(k => !k.startsWith('_') && k !== 'id');
    return keys.slice(0, 6).map(k => ({
      key: k,
      label: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      type: typeof sample[k] === 'number' ? 'number' : 'string',
    }));
  }

  private canDrillFromTable(): boolean {
    const report = this.activeReport();
    const path = this.drillPath();

    // Performance-report drill rules:
    //   agent-performance:    rollup -> agent_id (1 level), stop
    //   branch-performance:   rollup -> branch_id (level 1) -> agent_id (level 2)
    //   product-performance:  rollup -> product_id (1 level), stop
    if (report === 'agent-performance')    return path.length === 0;
    if (report === 'product-performance')  return path.length === 0;
    if (report === 'approver-performance') return path.length === 0;
    if (report === 'branch-performance')   return path.length < 2;

    // Existing portfolio/collection behaviour preserved.
    if (report === 'portfolio' && path.length === 0) return true;
    if (report === 'collection' && path.length === 0) return true;
    return false;
  }

  drillDown(item: any) {
    const report = this.activeReport();
    const path = this.drillPath();

    // ── Performance reports ──
    if (report === 'agent-performance' && path.length === 0) {
      this.drillPath.set([{ label: 'Agent', key: 'agent_id', value: item.key }]);
    } else if (report === 'product-performance' && path.length === 0) {
      this.drillPath.set([{ label: 'Product', key: 'product_id', value: item.key }]);
    } else if (report === 'approver-performance' && path.length === 0) {
      this.drillPath.set([{ label: 'Approver', key: 'approver_id', value: item.key }]);
    } else if (report === 'branch-performance' && path.length === 0) {
      // Level 1: branch -> agents-in-branch
      this.drillPath.set([{ label: 'Branch', key: 'branch_id', value: item.key }]);
    } else if (report === 'branch-performance' && path.length === 1 && path[0].key === 'branch_id') {
      // Level 2: agent within that branch -> that agent's loans
      this.drillPath.set([...path, { label: 'Agent', key: 'agent_id', value: item.key }]);
    }
    // ── Existing portfolio/collection behaviour ──
    else if (report === 'portfolio' && path.length === 0) {
      this.drillPath.set([{ label: 'Status', key: 'status', value: item.label }]);
    } else if (report === 'portfolio' && path.length === 1 && path[0].key === 'status') {
      this.drillPath.set([...path, { label: 'Branch', key: 'branch_id', value: item.key }]);
    }

    this.currentPage.set(1);
    this.syncUrl();
    this.loadReport();
  }

  drillDownRow(row: any) {
    // Pick the right id field based on the active report so row-drill
    // agrees with chart-drill. Falls back to the generic 'id' field.
    const report = this.activeReport();
    let key = row.id;
    let label = row.name;
    if (report === 'agent-performance')        { key = row.agent_id;   label = row.agent_name; }
    else if (report === 'approver-performance') { key = row.approver_id; label = row.approver_name; }
    else if (report === 'branch-performance' && this.drillPath().length === 0) {
                                                 key = row.branch_id;  label = row.branch_name; }
    else if (report === 'branch-performance' && this.drillPath().length === 1) {
                                                 key = row.agent_id;   label = row.agent_name; }
    else if (report === 'product-performance') { key = row.product_id; label = row.product_name; }
    else                                       { key = row.id || row.branch_id; label = row.name || row.branch_name; }

    this.drillDown({ label, key, item: row });
  }

  barWidth = computed(() => Math.min(800 / Math.max(this.chartData().length, 1), 100));
  barHeight(value: number): number {
    const max = Math.max(...this.chartData().map(d => d.value), 1);
    return (value / max) * 250;
  }
  barColor(index: number): string {
    const colors = ['#0A4F2A', '#C9A227', '#0e7490', '#f59e0b', '#06b6d4', '#ef4444', '#8b5cf6', '#ec4899'];
    return colors[index % colors.length];
  }

  pieSlices = computed(() => {
    const data = this.chartData();
    const total = data.reduce((sum, d) => sum + d.value, 0);
    let startAngle = 0;
    return data.map((d, i) => {
      const angle = (d.value / total) * 2 * Math.PI;
      const x1 = 100 + 80 * Math.cos(startAngle);
      const y1 = 100 + 80 * Math.sin(startAngle);
      const x2 = 100 + 80 * Math.cos(startAngle + angle);
      const y2 = 100 + 80 * Math.sin(startAngle + angle);
      const largeArc = angle > Math.PI ? 1 : 0;
      const path = `M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} Z`;
      startAngle += angle;
      return { path, color: this.barColor(i), item: d.item };
    });
  });

  truncate(s: string, len: number): string {
    return s.length > len ? s.substring(0, len - 1) + '…' : s;
  }

  formatNumber(n: number): string {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(0);
  }

  formatTableCell(value: any, type: string): string {
    if (value === null || value === undefined) return '—';
    if (type === 'number') return Number(value).toLocaleString('en-NG', { maximumFractionDigits: 2 });
    return String(value);
  }

  /**
   * Export the time-series panel as its own CSV — distinct from the
   * main export which targets rollup or drill details. Backend
   * `view=time_series` returns period/submissions/approvals/rejections
   * rows. Only meaningful on the approver tab.
   */
  exportTimeSeries() {
    if (!this.isApproverTab()) return;
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const params: any = {
      format: 'csv',
      view: 'time_series',
      granularity: this.filterGranularity,
    };
    if (this.filterDateFrom) params.date_from = this.filterDateFrom;
    if (this.filterDateTo)   params.date_to   = this.filterDateTo;
    if (this.filterBranch)   params.branch_id = this.filterBranch;

    this.api.downloadCsv('/reports/approver-performance', params).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CreditX_approver-timeline_${this.filterGranularity}_${ts}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.toast.success('Timeline CSV exported');
      },
      error: () => this.toast.error('Export failed'),
    });
  }

  exportData(format: 'csv' | 'excel') {
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

    // Performance reports: call the backend CSV endpoint so the export
    // respects the user's exact filter + drill context (rollup vs details)
    // rather than just dumping whatever rows happen to be in memory. Keeps
    // the filename meaningful and the data authoritative.
    if (format === 'csv' && this.isPerformanceTab()) {
      const params: any = { format: 'csv', view: this.drillPath().length > 0 ? 'details' : 'rollup' };
      if (this.filterDateFrom) params.date_from = this.filterDateFrom;
      if (this.filterDateTo)   params.date_to   = this.filterDateTo;
      if (this.filterStatus)   params.status    = this.filterStatus;
      if (this.filterBranch)   params.branch_id = this.filterBranch;
      // Include granularity when approver report — downstream service uses
      // it only for time_series view, but passing it on details/rollup is
      // harmless and keeps the param set consistent with the current UI.
      if (this.isApproverTab() && this.filterGranularity !== 'day') {
        params.granularity = this.filterGranularity;
      }
      // Pass drill keys so the backend knows which slice to export.
      this.drillPath().forEach(p => { if (p.value !== undefined) params[p.key] = p.value; });

      this.api.downloadCsv(`/reports/${this.activeReport()}`, params).subscribe({
        next: (blob: Blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `CreditX_${this.activeReport()}_${params.view}_${ts}.csv`;
          a.click();
          URL.revokeObjectURL(url);
          this.toast.success('CSV exported');
        },
        error: () => this.toast.error('Export failed'),
      });
      return;
    }

    // Non-performance reports (or Excel requests): fall back to the
    // in-memory export of whatever is currently in the data table. Keeps
    // behaviour unchanged for portfolio/PAR/collection/etc.
    const data = this.tableData();
    if (!data.length) { this.toast.error('No data to export'); return; }

    const cols = this.tableColumns();
    if (format === 'csv') {
      const csvRows = [
        cols.map(c => c.label).join(','),
        ...data.map(r => cols.map(c => `"${r[c.key] ?? ''}"`).join(','))
      ];
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CreditX_${this.activeReport()}_${ts}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      this.toast.success('CSV exported');
    }
  }
}
