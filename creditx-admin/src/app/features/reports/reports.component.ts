import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { CxTabsComponent, CxTab } from '../../shared/components/tabs/tabs.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

interface DrillLevel { label: string; key: string; value?: string; }

@Component({
  selector: 'app-reports', standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, PageHeaderComponent, CxTabsComponent, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Reports & Analytics"
        subtitle="Portfolio insights with drill-down analytics"
        eyebrow="Intelligence"></cx-page-header>

      <!-- Report Tabs -->
      <div class="cx-rpt-tabs-row">
        <cx-tabs [tabs]="cxTabs" [activeId]="activeReport()" (activeIdChange)="switchReport($event)"></cx-tabs>
      </div>

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
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    /* ═══ Tabs + breadcrumb ═══ */
    .cx-rpt-tabs-row { margin-bottom: 1.25rem; }
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
  reportTabs = [
    { key: 'portfolio', label: 'Loan Portfolio' },
    { key: 'par', label: 'Portfolio at Risk' },
    { key: 'agent-performance', label: 'Agent Performance' },
    { key: 'branch-performance', label: 'Branch Performance' },
    { key: 'product-performance', label: 'Product Performance' },
    { key: 'receivables', label: 'Receivables' },
    { key: 'closed-loans', label: 'Closed Loans' },
    { key: 'repayment', label: 'Repayment Performance' },
    { key: 'collection', label: 'Collection Efficiency' },
  ];

  cxTabs: CxTab[] = this.reportTabs.map(r => ({ id: r.key, label: r.label }));

  activeReport = signal('portfolio');
  reportTitle = signal('Loan Portfolio');
  loading = signal(false);
  drillPath = signal<DrillLevel[]>([]);
  
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

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() { this.loadReport(); }

  switchReport(key: string) {
    this.activeReport.set(key);
    this.reportTitle.set(this.reportTabs.find(t => t.key === key)?.label || key);
    this.drillPath.set([]);
    this.currentPage.set(1);
    this.loadReport();
  }

  resetDrill() {
    this.drillPath.set([]);
    this.currentPage.set(1);
    this.loadReport();
  }

  loadReport() {
    this.loading.set(true);
    const path = this.drillPath();
    const params: any = {};
    path.forEach(p => params[p.key] = p.value);

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

    // Extract KPIs
    const kpis: any[] = [];
    if (data.total_loans) kpis.push({ label: 'Total Loans', value: data.total_loans, format: '1.0-0' });
    if (data.total_amount) kpis.push({ label: 'Total Amount', value: data.total_amount, prefix: '₦', format: '1.0-0' });
    if (data.outstanding) kpis.push({ label: 'Outstanding', value: data.outstanding, prefix: '₦', format: '1.0-0' });
    if (data.collection_rate !== undefined) kpis.push({ label: 'Collection Rate', value: data.collection_rate, suffix: '%', format: '1.1-1' });
    if (data.par_ratio !== undefined) kpis.push({ label: 'PAR Ratio', value: data.par_ratio, suffix: '%', format: '1.2-2', color: data.par_ratio > 5 ? '#ef4444' : '#10b981' });
    this.kpis.set(kpis.slice(0, 4));

    // Extract chart data
    const breakdown = data.by_status || data.by_branch || data.by_agent || data.by_product || data.breakdown || [];
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

    // Extract table data
    const details = data.loans || data.payments || data.agents || data.branches || data.details || [];
    if (Array.isArray(details) && details.length) {
      this.tableData.set(details);
      this.tableColumns.set(this.inferColumns(details[0]));
      this.tableTitle.set('Details');
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
    if (report === 'portfolio' && path.length === 0) return true; // Drill to branch
    if (report === 'collection' && path.length === 0) return true; // Drill to agent
    return false;
  }

  drillDown(item: any) {
    const report = this.activeReport();
    const path = this.drillPath();

    if (report === 'portfolio' && path.length === 0) {
      // Drill from status to branch
      this.drillPath.set([{ label: 'Status', key: 'status', value: item.label }]);
    } else if (report === 'portfolio' && path.length === 1 && path[0].key === 'status') {
      // Drill from branch to agent
      this.drillPath.set([...path, { label: 'Branch', key: 'branch_id', value: item.key }]);
    }
    this.currentPage.set(1);
    this.loadReport();
  }

  drillDownRow(row: any) {
    // Row drill logic similar to chart drill
    this.drillDown({ label: row.name || row.branch_name, key: row.id || row.branch_id, item: row });
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

  exportData(format: 'csv' | 'excel') {
    const data = this.tableData();
    if (!data.length) { this.toast.error('No data to export'); return; }
    
    const cols = this.tableColumns();
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    
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
