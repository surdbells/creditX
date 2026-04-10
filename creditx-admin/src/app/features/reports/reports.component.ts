import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, BarChart3, TrendingUp, Users, Building2, Package, DollarSign, FileDown } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, StatCardComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Reports & Analytics" subtitle="Portfolio analytics, performance, and CBN compliance reports"></cx-page-header>

      <!-- Report Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        @for (report of reports; track report.key) {
          <div class="cx-card cx-card-hover cursor-pointer" (click)="loadReport(report.key)">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" [style.background]="report.bg">
                <lucide-icon [name]="report.icon" [size]="20" [style.color]="report.color"></lucide-icon>
              </div>
              <div>
                <h3 class="text-sm font-semibold text-[var(--cx-text)]">{{ report.label }}</h3>
                <p class="text-xs text-[var(--cx-text-muted)] mt-0.5">{{ report.description }}</p>
              </div>
            </div>
          </div>
        }
      </div>

      <!-- Report Data -->
      @if (activeReport()) {
        <div class="cx-card mt-4">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-semibold text-[var(--cx-text)]">{{ activeReportLabel() }}</h3>
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="activeReport.set(null)">Close</button>
          </div>
          @if (reportLoading()) {
            <div class="flex items-center justify-center py-8">
              <div class="w-5 h-5 border-2 border-[var(--cx-primary)] border-t-transparent rounded-full animate-spin"></div>
            </div>
          } @else {
            <pre class="text-xs bg-[var(--cx-surface-hover)] p-4 rounded-lg overflow-x-auto text-[var(--cx-text)]">{{ reportData() | json }}</pre>
          }
        </div>
      }
    </div>
  `,
})
export class ReportsComponent {
  activeReport = signal<string | null>(null);
  reportData = signal<any>(null);
  reportLoading = signal(false);

  reports = [
    { key: 'portfolio', label: 'Portfolio Dashboard', description: 'Overview of loan portfolio', icon: 'bar-chart-3', bg: 'var(--cx-primary-50)', color: 'var(--cx-primary)' },
    { key: 'par', label: 'Portfolio at Risk', description: 'Aging buckets and PAR ratio', icon: 'trending-up', bg: 'var(--cx-danger-light)', color: 'var(--cx-danger)' },
    { key: 'agent', label: 'Agent Performance', description: 'DSA performance metrics', icon: 'users', bg: 'var(--cx-accent-50)', color: 'var(--cx-accent)' },
    { key: 'branch', label: 'Branch Performance', description: 'Per-branch metrics', icon: 'building-2', bg: 'var(--cx-info-light)', color: 'var(--cx-info)' },
    { key: 'product', label: 'Product Performance', description: 'Per-product metrics', icon: 'package', bg: 'var(--cx-success-light)', color: 'var(--cx-success)' },
    { key: 'receivables', label: 'Expected Repayments', description: 'Expected vs actual collections', icon: 'dollar-sign', bg: 'var(--cx-warning-light)', color: 'var(--cx-warning)' },
    { key: 'cbn-portfolio', label: 'CBN Portfolio Report', description: 'CBN-compliant portfolio', icon: 'file-down', bg: 'var(--cx-primary-50)', color: 'var(--cx-primary)' },
    { key: 'cbn-npl', label: 'CBN NPL Report', description: 'Non-performing loans (90+ DPD)', icon: 'file-down', bg: 'var(--cx-danger-light)', color: 'var(--cx-danger)' },
    { key: 'cbn-aging', label: 'CBN Aging Report', description: 'Aging bucket summary', icon: 'file-down', bg: 'var(--cx-warning-light)', color: 'var(--cx-warning)' },
  ];

  constructor(private api: ApiService) {}

  activeReportLabel(): string {
    return this.reports.find(r => r.key === this.activeReport())?.label || '';
  }

  loadReport(key: string): void {
    this.activeReport.set(key);
    this.reportLoading.set(true);

    const pathMap: Record<string, string> = {
      portfolio: '/reports/portfolio', par: '/reports/par',
      agent: '/reports/agent-performance', branch: '/reports/branch-performance',
      product: '/reports/product-performance', receivables: '/reports/receivables',
      'cbn-portfolio': '/reports/cbn/portfolio', 'cbn-npl': '/reports/cbn/npl',
      'cbn-aging': '/reports/cbn/aging',
    };

    this.api.get(pathMap[key] || '/reports/portfolio').subscribe({
      next: res => { this.reportData.set(res.data); this.reportLoading.set(false); },
      error: () => { this.reportData.set(null); this.reportLoading.set(false); },
    });
  }
}
