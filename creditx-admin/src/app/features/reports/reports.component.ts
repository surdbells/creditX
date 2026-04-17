import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-reports', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Reports & Analytics" subtitle="Portfolio insights and performance metrics"></cx-page-header>

      <!-- Report Selector -->
      <div class="flex gap-1 mb-4 border-b border-[var(--cx-border)] pb-px overflow-x-auto">
        @for (r of reportTabs; track r.key) {
          <button class="px-3 py-2 text-xs font-semibold whitespace-nowrap transition-all rounded-t-lg"
                  [class]="activeReport === r.key ? 'text-[var(--cx-primary)] border-b-2 border-[var(--cx-primary)] bg-[var(--cx-surface)]' : 'text-[var(--cx-text-muted)] hover:text-[var(--cx-text)]'"
                  (click)="loadReport(r.key)">
            {{ r.label }}
          </button>
        }
      </div>

      @if (reportLoading()) {
        <div class="cx-card flex items-center justify-center py-16">
          <div class="w-8 h-8 border-3 border-[var(--cx-primary)] border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else if (!reportData()) {
        <div class="cx-card flex flex-col items-center justify-center py-16">
          <lucide-icon name="bar-chart-3" [size]="48" class="text-[var(--cx-text-muted)] opacity-30 mb-3"></lucide-icon>
          <p class="text-sm text-[var(--cx-text-muted)]">Select a report to view data</p>
        </div>
      } @else {
        <!-- Summary Cards -->
        @if (summaryCards().length) {
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            @for (card of summaryCards(); track card.label) {
              <div class="cx-card !p-4">
                <div class="text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider mb-1">{{ card.label }}</div>
                <div class="text-xl font-bold text-[var(--cx-text)]">{{ card.prefix }}{{ card.value | number:'1.0-0' }}</div>
              </div>
            }
          </div>
        }

        <!-- Data Table -->
        @if (tableRows().length) {
          <div class="cx-card !p-0 overflow-hidden">
            <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--cx-border)]">
              <h3 class="text-sm font-semibold text-[var(--cx-text)]">{{ reportTitle }}</h3>
              <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="exportReport()">
                <lucide-icon name="download" [size]="14"></lucide-icon> Export CSV
              </button>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead><tr class="border-b border-[var(--cx-border)]">
                  @for (col of tableCols(); track col) {
                    <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">{{ col }}</th>
                  }
                </tr></thead>
                <tbody>
                  @for (row of tableRows(); track $index) {
                    <tr class="border-b border-[var(--cx-border)] hover:bg-[var(--cx-surface-hover)]">
                      @for (col of tableCols(); track col) {
                        <td class="px-4 py-3 text-sm">{{ formatCell(row[col] ?? row[toCamel(col)]) }}</td>
                      }
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
})
export class ReportsComponent implements OnInit {
  reportTabs = [
    { key: 'portfolio', label: 'Portfolio Dashboard' },
    { key: 'par', label: 'PAR Report' },
    { key: 'agent-performance', label: 'Agent Performance' },
    { key: 'branch-performance', label: 'Branch Performance' },
    { key: 'product-performance', label: 'Product Performance' },
    { key: 'receivables', label: 'Receivables' },
    { key: 'closed-loans', label: 'Closed Loans' },
  ];
  activeReport = 'portfolio'; reportTitle = '';
  reportData = signal<any>(null); reportLoading = signal(false);
  summaryCards = signal<any[]>([]); tableRows = signal<any[]>([]); tableCols = signal<string[]>([]);

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit() { this.loadReport('portfolio'); }

  loadReport(key: string) {
    this.activeReport = key; this.reportLoading.set(true);
    this.reportTitle = this.reportTabs.find(t => t.key === key)?.label || key;
    this.api.get('/reports/' + key).subscribe({
      next: res => {
        const data = res.data;
        this.reportData.set(data);
        this.buildView(key, data);
        this.reportLoading.set(false);
      },
      error: () => { this.reportData.set(null); this.summaryCards.set([]); this.tableRows.set([]); this.tableCols.set([]); this.reportLoading.set(false); },
    });
  }

  private buildView(key: string, data: any) {
    if (!data) { this.summaryCards.set([]); this.tableRows.set([]); this.tableCols.set([]); return; }

    // For portfolio: extract summary + breakdown
    if (key === 'portfolio' && typeof data === 'object' && !Array.isArray(data)) {
      const cards: any[] = [];
      if (data.total_loans !== undefined) cards.push({ label: 'Total Loans', value: data.total_loans, prefix: '' });
      if (data.total_disbursed !== undefined) cards.push({ label: 'Total Disbursed', value: data.total_disbursed, prefix: '₦' });
      if (data.total_outstanding !== undefined) cards.push({ label: 'Outstanding', value: data.total_outstanding, prefix: '₦' });
      if (data.total_repaid !== undefined) cards.push({ label: 'Total Repaid', value: data.total_repaid, prefix: '₦' });
      if (data.par_ratio !== undefined) cards.push({ label: 'PAR Ratio', value: data.par_ratio, prefix: '' });
      this.summaryCards.set(cards.slice(0, 4));
      // If there's a breakdown array, show as table
      const breakdown = data.by_product || data.by_status || data.breakdown || [];
      if (Array.isArray(breakdown) && breakdown.length > 0) { this.setTable(breakdown); }
      else { this.tableRows.set([]); this.tableCols.set([]); }
    } else if (Array.isArray(data)) {
      this.summaryCards.set([]);
      this.setTable(data);
    } else if (typeof data === 'object') {
      // Single-object report: turn into summary cards
      const cards = Object.entries(data).filter(([, v]) => typeof v === 'number' || typeof v === 'string').slice(0, 8)
        .map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: v, prefix: String(v).length > 6 ? '₦' : '' }));
      this.summaryCards.set(cards);
      this.tableRows.set([]); this.tableCols.set([]);
    }
  }

  private setTable(arr: any[]) {
    if (!arr.length) { this.tableRows.set([]); this.tableCols.set([]); return; }
    const cols = Object.keys(arr[0]).filter(k => k !== 'id');
    this.tableCols.set(cols);
    this.tableRows.set(arr);
  }

  toCamel(s: string): string { return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); }

  formatCell(v: any): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') return v.toLocaleString('en-NG', { maximumFractionDigits: 2 });
    return String(v);
  }

  exportReport() {
    const rows = this.tableRows();
    const cols = this.tableCols();
    if (!rows.length) { this.toast.error('No data to export'); return; }
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const csvRows = [cols.join(','), ...rows.map(r => cols.map(c => `"${r[c] ?? r[this.toCamel(c)] ?? ''}"`).join(','))];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `CreditX_${this.activeReport}_${ts}.csv`; a.click(); URL.revokeObjectURL(url);
    this.toast.success(`Exported ${rows.length} rows`);
  }
}
