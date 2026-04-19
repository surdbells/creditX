import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

interface DrillLevel { label: string; key: string; value?: string; }

@Component({
  selector: 'app-reports', standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, PageHeaderComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Reports & Analytics" subtitle="Portfolio insights with drill-down analytics"></cx-page-header>

      <!-- Report Tabs -->
      <div class="flex gap-1 mb-4 border-b border-[var(--cx-border)] pb-px overflow-x-auto">
        @for (r of reportTabs; track r.key) {
          <button class="px-3 py-2 text-xs font-semibold whitespace-nowrap transition-all rounded-t-lg"
                  [class]="activeReport() === r.key ? 'text-[var(--cx-primary)] border-b-2 border-[var(--cx-primary)] bg-[var(--cx-surface)]' : 'text-[var(--cx-text-muted)] hover:text-[var(--cx-text)]'"
                  (click)="switchReport(r.key)">
            {{ r.label }}
          </button>
        }
      </div>

      <!-- Breadcrumb Navigation -->
      @if (drillPath().length > 0) {
        <div class="flex items-center gap-2 mb-4 text-xs">
          <button class="flex items-center gap-1 text-[var(--cx-primary)] hover:underline" (click)="resetDrill()">
            <lucide-icon name="home" [size]="12"></lucide-icon> {{ reportTitle() }}
          </button>
          @for (level of drillPath(); track $index) {
            <lucide-icon name="chevron-right" [size]="12" class="text-[var(--cx-text-muted)]"></lucide-icon>
            <span class="text-[var(--cx-text-secondary)] font-medium">{{ level.label }}: {{ level.value }}</span>
          }
        </div>
      }

      @if (loading()) {
        <div class="cx-card flex items-center justify-center py-16">
          <div class="w-8 h-8 border-3 border-[var(--cx-primary)] border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else {
        <!-- Summary KPIs -->
        @if (kpis().length) {
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            @for (kpi of kpis(); track kpi.label) {
              <div class="cx-card !p-4">
                <div class="text-[10px] font-bold text-[var(--cx-text-muted)] uppercase tracking-wider">{{ kpi.label }}</div>
                <div class="text-2xl font-bold mt-1" [style.color]="kpi.color || 'var(--cx-text)'">
                  {{ kpi.prefix }}{{ kpi.value | number:kpi.format || '1.0-0' }}{{ kpi.suffix }}
                </div>
                @if (kpi.change !== undefined) {
                  <div class="text-[10px] mt-1" [class]="kpi.change > 0 ? 'text-green-600' : 'text-red-600'">
                    {{ kpi.change > 0 ? '↑' : '↓' }} {{ Math.abs(kpi.change) }}% vs last period
                  </div>
                }
              </div>
            }
          </div>
        }

        <!-- Chart Section -->
        @if (chartData().length) {
          <div class="cx-card !p-6 mb-4">
            <h3 class="text-sm font-bold text-[var(--cx-text)] mb-4">{{ chartTitle() }}</h3>
            @if (chartType() === 'bar') {
              <div class="h-64">
                <svg viewBox="0 0 800 300" class="w-full h-full">
                  @for (item of chartData(); track $index; let i = $index) {
                    <g [attr.transform]="'translate(' + (i * barWidth() + 40) + ', 0)'">
                      <rect [attr.y]="300 - barHeight(item.value)" [attr.width]="barWidth() - 10"
                            [attr.height]="barHeight(item.value)" [attr.fill]="barColor(i)"
                            class="cursor-pointer transition-opacity hover:opacity-80"
                            (click)="drillDown(item)"></rect>
                      <text [attr.x]="(barWidth() - 10) / 2" y="295" text-anchor="middle" class="text-[10px] fill-[var(--cx-text-muted)]">
                        {{ truncate(item.label, 12) }}
                      </text>
                      <text [attr.x]="(barWidth() - 10) / 2" [attr.y]="290 - barHeight(item.value)" text-anchor="middle" 
                            class="text-xs font-bold fill-[var(--cx-text)]">
                        {{ formatNumber(item.value) }}
                      </text>
                    </g>
                  }
                </svg>
              </div>
            } @else if (chartType() === 'pie') {
              <div class="flex items-center gap-6">
                <svg viewBox="0 0 200 200" class="w-48 h-48">
                  @for (slice of pieSlices(); track $index) {
                    <path [attr.d]="slice.path" [attr.fill]="slice.color" class="cursor-pointer transition-opacity hover:opacity-80"
                          (click)="drillDown(slice.item)"></path>
                  }
                </svg>
                <div class="flex-1 space-y-2">
                  @for (item of chartData(); track $index; let i = $index) {
                    <div class="flex items-center justify-between gap-3 cursor-pointer hover:bg-[var(--cx-surface-hover)] p-2 rounded-lg transition-colors"
                         (click)="drillDown(item)">
                      <div class="flex items-center gap-2 flex-1 min-w-0">
                        <div class="w-3 h-3 rounded-sm flex-shrink-0" [style.background]="barColor(i)"></div>
                        <span class="text-sm text-[var(--cx-text)] truncate">{{ item.label }}</span>
                      </div>
                      <span class="text-sm font-medium text-[var(--cx-text-secondary)]">{{ formatNumber(item.value) }}</span>
                      <span class="text-xs text-[var(--cx-text-muted)]">{{ item.percent?.toFixed(1) }}%</span>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }

        <!-- Data Table -->
        @if (tableData().length) {
          <div class="cx-card !p-0 overflow-hidden">
            <div class="flex items-center justify-between px-6 py-4 border-b border-[var(--cx-border)]">
              <h3 class="text-sm font-semibold text-[var(--cx-text)]">{{ tableTitle() }}</h3>
              <div class="flex gap-2">
                <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="exportData('csv')">
                  <lucide-icon name="download" [size]="14"></lucide-icon> CSV
                </button>
                <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="exportData('excel')">
                  <lucide-icon name="file-spreadsheet" [size]="14"></lucide-icon> Excel
                </button>
              </div>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead><tr class="border-b border-[var(--cx-border)]">
                  @for (col of tableColumns(); track col.key) {
                    <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">
                      {{ col.label }}
                    </th>
                  }
                  @if (allowDrill()) { <th class="px-4 py-3 w-16"></th> }
                </tr></thead>
                <tbody>
                  @for (row of paginatedData(); track row.id || $index) {
                    <tr class="border-b border-[var(--cx-border)] hover:bg-[var(--cx-surface-hover)] transition-colors">
                      @for (col of tableColumns(); track col.key) {
                        <td class="px-4 py-3 text-sm">
                          {{ formatTableCell(row[col.key], col.type) }}
                        </td>
                      }
                      @if (allowDrill()) {
                        <td class="px-4 py-3">
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
              <div class="flex items-center justify-between px-6 py-3 border-t border-[var(--cx-border)]">
                <div class="text-xs text-[var(--cx-text-muted)]">
                  Showing {{ (currentPage() - 1) * pageSize + 1 }} to {{ Math.min(currentPage() * pageSize, tableData().length) }} of {{ tableData().length }}
                </div>
                <div class="flex gap-1">
                  <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" [disabled]="currentPage() === 1" (click)="currentPage.set(currentPage() - 1)">
                    <lucide-icon name="chevron-left" [size]="14"></lucide-icon>
                  </button>
                  @for (p of pageNumbers(); track p) {
                    <button class="cx-btn cx-btn-sm" [class.cx-btn-primary]="p === currentPage()" [class.cx-btn-ghost]="p !== currentPage()"
                            (click)="currentPage.set(p)">{{ p }}</button>
                  }
                  <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" [disabled]="currentPage() === totalPages()" (click)="currentPage.set(currentPage() + 1)">
                    <lucide-icon name="chevron-right" [size]="14"></lucide-icon>
                  </button>
                </div>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
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
