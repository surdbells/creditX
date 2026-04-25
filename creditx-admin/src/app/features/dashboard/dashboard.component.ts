import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

/**
 * Home dashboard with five SVG chart visualisations.
 *
 * Sections (top to bottom):
 *   1. Hero greeting + agent-accepting toggle (preserved from prior version)
 *   2. KPI tiles (Active Loans / Disbursed / Collected / Collection Rate)
 *   3. Charts grid — five SVG charts in a responsive 2-col layout
 *   4. Recent applications table — last 5 loans
 *
 * Charts (J decision):
 *   - Portfolio by status (donut, full-width hero)
 *   - Disbursement trend (12-month bar)
 *   - Collection trend (12-month line)
 *   - Overdue aging buckets (horizontal bar)
 *   - Top 5 products (horizontal bar)
 *
 * Data sources:
 *   - /reports/portfolio (KPI tiles — unchanged)
 *   - /reports/dashboard-charts (5 chart series — new in Phase 3.3.a)
 *   - /loans?per_page=5 (recent applications — trimmed from 10)
 *   - /settings (agent-accepting toggle — unchanged)
 *
 * SVG renderers are hand-rolled and intentionally local — they share
 * the visual aesthetic of general-loan-report.component.ts but the two
 * components stay independent. If a third chart-heavy view ever lands,
 * the patterns will get extracted into a shared service.
 */
type StatusChartItem = { label: string; value: number; amount: number };
type AgingChartItem = { label: string; value: number; count: number };
type TrendChartItem = { label: string; value: number; count?: number };
type ProductChartItem = { label: string; value: number; amount: number };

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, StatCardComponent, StatusBadgeComponent, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <div class="cx-dash cx-animate-in">
      <!-- ─── Hero greeting + agent-accepting toggle ─── -->
      <div class="cx-dash-hero">
        <div class="cx-dash-hero-main">
          <div class="cx-dash-hero-eyebrow">
            <span class="cx-dash-hero-date">{{ today }}</span>
            <span class="cx-dash-hero-dot">•</span>
            <span class="cx-dash-hero-role">{{ auth.user()?.roles?.[0]?.name || 'Admin' }}</span>
          </div>
          <h1 class="cx-dash-hero-title">
            Good {{ greeting }}, <span class="cx-dash-hero-name">{{ auth.user()?.first_name }}</span>.
          </h1>
          <p class="cx-dash-hero-subtitle">Here's your portfolio pulse for today.</p>
        </div>
        <div class="cx-dash-toggle-wrap">
          <div class="cx-dash-toggle">
            <div class="cx-dash-toggle-state">
              <div class="cx-dash-toggle-dot" [class.is-on]="agentAccepting()"></div>
              <div class="cx-dash-toggle-meta">
                <div class="cx-dash-toggle-label">Agent Loan Intake</div>
                <div class="cx-dash-toggle-value">{{ agentAccepting() ? 'Open' : 'Paused' }}</div>
              </div>
            </div>
            <button class="cx-dash-switch" [class.is-on]="agentAccepting()"
              (click)="toggleAgentAccepting()" aria-label="Toggle agent loan intake">
              <span class="cx-dash-switch-thumb"></span>
            </button>
          </div>
        </div>
      </div>

      <!-- ─── KPI tiles ─── -->
      <div class="cx-dash-stats cx-stagger">
        <cx-stat-card
          label="Active Loans"
          [value]="loading() ? '—' : (getStatusCount('active') + getStatusCount('overdue'))"
          icon="file-text"
          iconBg="var(--cx-primary-50)" iconColor="var(--cx-primary-600)"
          [subtext]="loading() ? '' : getStatusCount('overdue') + ' overdue'"
          [subtextColor]="getStatusCount('overdue') > 0 ? 'var(--cx-danger)' : 'var(--cx-text-muted)'">
        </cx-stat-card>
        <cx-stat-card
          label="Total Disbursed"
          [value]="loading() ? '—' : '₦' + formatNum(portfolio?.total_disbursed)"
          icon="banknote"
          iconBg="var(--cx-success-50)" iconColor="var(--cx-primary-700)">
        </cx-stat-card>
        <cx-stat-card
          label="Total Collected"
          [value]="loading() ? '—' : '₦' + formatNum(portfolio?.total_collected)"
          icon="credit-card"
          iconBg="var(--cx-info-50)" iconColor="var(--cx-info)">
        </cx-stat-card>
        <cx-stat-card
          label="Collection Rate"
          [value]="loading() ? '—' : (portfolio?.collection_rate || 0) + '%'"
          icon="trending-up"
          iconBg="var(--cx-accent-50)" iconColor="var(--cx-accent-700)">
        </cx-stat-card>
      </div>

      <!-- ─── Charts grid ─── -->
      <div class="cx-dash-charts">
        <!-- 1. Portfolio by status (donut, wide) -->
        <div class="cx-dash-chart-card cx-dash-chart-wide">
          <div class="cx-dash-chart-head">
            <h3 class="cx-dash-chart-title">Portfolio by Status</h3>
            <span class="cx-dash-chart-sub">Breakdown of all loan applications</span>
          </div>
          @if (chartsLoading()) {
            <cx-loading size="sm" message="Loading..."></cx-loading>
          } @else if (portfolioByStatus().length) {
            <div class="cx-dash-chart-with-legend">
              <div class="cx-dash-chart-svg" [innerHTML]="portfolioDonutSvg()"></div>
              <ul class="cx-dash-chart-legend">
                @for (s of portfolioByStatus(); track s.label; let i = $index) {
                  <li>
                    <span class="cx-dash-legend-swatch" [style.background]="palette(i)"></span>
                    <span class="cx-dash-legend-label">{{ s.label }}</span>
                    <span class="cx-dash-legend-value tabular-nums">{{ s.value }}</span>
                  </li>
                }
              </ul>
            </div>
          } @else {
            <cx-empty-state title="No data" description="Loans will appear once captured." icon="inbox"></cx-empty-state>
          }
        </div>

        <!-- 2. Disbursement trend (bar) -->
        <div class="cx-dash-chart-card">
          <div class="cx-dash-chart-head">
            <h3 class="cx-dash-chart-title">Disbursement Trend</h3>
            <span class="cx-dash-chart-sub">Last 12 months · Net amount</span>
          </div>
          @if (chartsLoading()) {
            <cx-loading size="sm" message="Loading..."></cx-loading>
          } @else if (disbursementTrend().length) {
            <div class="cx-dash-chart-svg" [innerHTML]="disbursementTrendSvg()"></div>
          } @else {
            <p class="cx-dash-chart-empty">No data</p>
          }
        </div>

        <!-- 3. Collection trend (line) -->
        <div class="cx-dash-chart-card">
          <div class="cx-dash-chart-head">
            <h3 class="cx-dash-chart-title">Collection Trend</h3>
            <span class="cx-dash-chart-sub">Last 12 months · Successful payments</span>
          </div>
          @if (chartsLoading()) {
            <cx-loading size="sm" message="Loading..."></cx-loading>
          } @else if (collectionTrend().length) {
            <div class="cx-dash-chart-svg" [innerHTML]="collectionTrendSvg()"></div>
          } @else {
            <p class="cx-dash-chart-empty">No data</p>
          }
        </div>

        <!-- 4. Overdue aging (horizontal bar) -->
        <div class="cx-dash-chart-card">
          <div class="cx-dash-chart-head">
            <h3 class="cx-dash-chart-title">Overdue Aging</h3>
            <span class="cx-dash-chart-sub">Outstanding by age</span>
          </div>
          @if (chartsLoading()) {
            <cx-loading size="sm" message="Loading..."></cx-loading>
          } @else if (overdueAging().length) {
            <div class="cx-dash-chart-svg" [innerHTML]="overdueAgingSvg()"></div>
          } @else {
            <p class="cx-dash-chart-empty">No data</p>
          }
        </div>

        <!-- 5. Top products (horizontal bar) -->
        <div class="cx-dash-chart-card">
          <div class="cx-dash-chart-head">
            <h3 class="cx-dash-chart-title">Top Products</h3>
            <span class="cx-dash-chart-sub">By disbursed loan count</span>
          </div>
          @if (chartsLoading()) {
            <cx-loading size="sm" message="Loading..."></cx-loading>
          } @else if (topProducts().length) {
            <div class="cx-dash-chart-svg" [innerHTML]="topProductsSvg()"></div>
          } @else {
            <p class="cx-dash-chart-empty">No data</p>
          }
        </div>
      </div>

      <!-- ─── Recent applications ─── -->
      <div class="cx-dash-panel">
        <div class="cx-dash-panel-header">
          <div>
            <h2 class="cx-dash-panel-title">Recent Applications</h2>
            <span class="cx-dash-panel-subtitle">Latest 5 loans captured</span>
          </div>
          <a routerLink="/loans" class="cx-dash-link">
            <span>View all</span>
            <lucide-icon name="chevron-right" [size]="14"></lucide-icon>
          </a>
        </div>
        @if (recentLoans.length) {
          <div class="cx-dash-recent-table-wrap">
            <table class="cx-dash-recent-table">
              <thead>
                <tr>
                  <th>App ID</th>
                  <th>Customer</th>
                  <th class="cx-dash-right">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (loan of recentLoans; track loan.id) {
                  <tr>
                    <td><span class="cx-dash-app-id">{{ loan.application_id }}</span></td>
                    <td class="cx-dash-customer">{{ loan.customer_name }}</td>
                    <td class="cx-dash-right tabular-nums cx-dash-amount">₦{{ loan.amount_requested | number:'1.0-0' }}</td>
                    <td><cx-status-badge [status]="loan.status"></cx-status-badge></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <cx-empty-state title="No applications yet" description="New captures from agents will appear here." icon="file-text"></cx-empty-state>
        }
      </div>
    </div>
  `,
  styles: [`
    .cx-dash { display: flex; flex-direction: column; gap: 1.5rem; }

    /* ─── Hero ─── */
    .cx-dash-hero {
      display: grid; grid-template-columns: 1fr auto;
      gap: 1.5rem;
      align-items: center;
      padding: 1.5rem 1.75rem;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
    }
    @media (max-width: 700px) {
      .cx-dash-hero { grid-template-columns: 1fr; }
    }
    .cx-dash-hero-eyebrow {
      display: flex; align-items: center; gap: 0.5rem;
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 0.4rem;
    }
    .cx-dash-hero-dot { opacity: 0.5; }
    .cx-dash-hero-title {
      margin: 0;
      font-size: var(--cx-text-2xl, 1.5rem);
      font-weight: 700;
      color: var(--cx-text);
      line-height: 1.2;
    }
    .cx-dash-hero-name { color: var(--cx-accent, #0A4F2A); }
    .cx-dash-hero-subtitle {
      margin: 0.35rem 0 0;
      color: var(--cx-text-muted);
      font-size: var(--cx-text-sm);
    }
    .cx-dash-toggle {
      display: flex; align-items: center; gap: 1rem;
      padding: 0.85rem 1.1rem;
      background: var(--cx-bg);
      border-radius: var(--cx-radius-xl);
      border: 1px solid var(--cx-border);
    }
    .cx-dash-toggle-state {
      display: flex; align-items: center; gap: 0.6rem;
    }
    .cx-dash-toggle-dot {
      width: 9px; height: 9px;
      border-radius: 50%;
      background: var(--cx-text-muted);
      transition: background var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cx-dash-toggle-dot.is-on { background: #16a34a; box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.15); }
    .cx-dash-toggle-label {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .cx-dash-toggle-value {
      font-size: var(--cx-text-sm);
      font-weight: 600;
      color: var(--cx-text);
    }
    .cx-dash-switch {
      position: relative;
      width: 42px; height: 24px;
      border-radius: 999px;
      background: var(--cx-border);
      border: none;
      cursor: pointer;
      padding: 0;
      transition: background var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cx-dash-switch.is-on { background: #16a34a; }
    .cx-dash-switch-thumb {
      position: absolute;
      top: 3px; left: 3px;
      width: 18px; height: 18px;
      border-radius: 50%;
      background: white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.15);
      transition: left var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cx-dash-switch.is-on .cx-dash-switch-thumb { left: 21px; }

    /* ─── KPI tiles ─── */
    .cx-dash-stats {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem;
    }
    @media (max-width: 1100px) { .cx-dash-stats { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 600px) { .cx-dash-stats { grid-template-columns: 1fr; } }

    /* ─── Charts grid ─── */
    .cx-dash-charts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    @media (max-width: 900px) { .cx-dash-charts { grid-template-columns: 1fr; } }
    .cx-dash-chart-wide { grid-column: 1 / -1; }

    .cx-dash-chart-card {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      padding: 1.25rem;
      min-height: 280px;
    }
    .cx-dash-chart-head {
      margin-bottom: 1rem;
      display: flex; flex-direction: column; gap: 0.15rem;
    }
    .cx-dash-chart-title {
      margin: 0;
      font-size: var(--cx-text-md);
      font-weight: 600;
      color: var(--cx-text);
    }
    .cx-dash-chart-sub {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
    }
    .cx-dash-chart-svg svg { width: 100%; height: auto; display: block; }
    .cx-dash-chart-empty {
      color: var(--cx-text-muted);
      font-size: var(--cx-text-sm);
      text-align: center;
      padding: 2rem 0;
      margin: 0;
    }
    .cx-dash-chart-with-legend {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(160px, 220px);
      gap: 1.5rem;
      align-items: center;
    }
    @media (max-width: 700px) {
      .cx-dash-chart-with-legend { grid-template-columns: 1fr; }
    }
    .cx-dash-chart-legend {
      list-style: none; margin: 0; padding: 0;
      max-height: 220px; overflow-y: auto;
      font-size: var(--cx-text-sm);
    }
    .cx-dash-chart-legend li {
      display: grid; grid-template-columns: 12px 1fr auto;
      gap: 0.6rem; align-items: center;
      padding: 0.3rem 0;
    }
    .cx-dash-legend-swatch {
      width: 12px; height: 12px; border-radius: 3px; display: inline-block;
    }
    .cx-dash-legend-label {
      color: var(--cx-text); white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .cx-dash-legend-value {
      color: var(--cx-text-muted);
      font-weight: 500;
    }

    /* ─── Recent loans panel ─── */
    .cx-dash-panel {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      padding: 1.5rem;
    }
    .cx-dash-panel-header {
      display: flex; align-items: center; justify-content: space-between;
      gap: 1rem; margin-bottom: 1rem;
    }
    .cx-dash-panel-title {
      margin: 0;
      font-size: var(--cx-text-md);
      font-weight: 600;
      color: var(--cx-text);
    }
    .cx-dash-panel-subtitle {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
    }
    .cx-dash-link {
      display: flex; align-items: center; gap: 0.25rem;
      font-size: var(--cx-text-sm);
      color: var(--cx-accent, #0A4F2A);
      text-decoration: none;
    }
    .cx-dash-link:hover { text-decoration: underline; }
    .cx-dash-recent-table-wrap { overflow-x: auto; }
    .cx-dash-recent-table {
      width: 100%; border-collapse: collapse;
      font-size: var(--cx-text-sm);
    }
    .cx-dash-recent-table th {
      text-align: left;
      padding: 0.5rem 0.75rem;
      font-weight: 600;
      color: var(--cx-text-muted);
      font-size: var(--cx-text-xs);
      text-transform: uppercase;
      letter-spacing: 0.03em;
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-dash-recent-table td {
      padding: 0.6rem 0.75rem;
      border-bottom: 1px solid var(--cx-border-subtle, var(--cx-border));
      color: var(--cx-text);
    }
    .cx-dash-recent-table tr:last-child td { border-bottom: none; }
    .cx-dash-app-id {
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: var(--cx-text-xs);
    }
    .cx-dash-customer { font-weight: 500; }
    .cx-dash-right { text-align: right; }
    .cx-dash-amount { color: var(--cx-text); }
  `],
})
export class DashboardComponent implements OnInit {
  loading = signal(true);
  chartsLoading = signal(true);
  agentAccepting = signal(true);
  portfolio: any = null;
  recentLoans: any[] = [];
  greeting = '';
  today = '';

  // Chart signals — populated from /reports/dashboard-charts
  portfolioByStatus = signal<StatusChartItem[]>([]);
  disbursementTrend = signal<TrendChartItem[]>([]);
  collectionTrend = signal<TrendChartItem[]>([]);
  overdueAging = signal<AgingChartItem[]>([]);
  topProducts = signal<ProductChartItem[]>([]);

  // Same 12-color palette as general-loan-report.component.ts so the
  // app's chart aesthetic stays consistent.
  private readonly chartPalette = [
    '#0A4F2A', '#C9A227', '#1e40af', '#dc2626', '#7c3aed',
    '#0891b2', '#ea580c', '#16a34a', '#db2777', '#475569',
    '#f59e0b', '#0ea5e9',
  ];
  palette(i: number): string {
    return this.chartPalette[i % this.chartPalette.length];
  }

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {
    const h = new Date().getHours();
    this.greeting = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
    this.today = new Date().toLocaleDateString('en-NG', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  ngOnInit(): void {
    // KPI portfolio (existing endpoint)
    this.api.get('/reports/portfolio').subscribe({
      next: res => { this.portfolio = res.data; this.loading.set(false); },
      error: () => this.loading.set(false),
    });

    // Charts (new endpoint from Phase 3.3.a)
    this.api.get('/reports/dashboard-charts').subscribe({
      next: res => {
        const d = res.data || {};
        this.portfolioByStatus.set(d.portfolio_by_status || []);
        this.disbursementTrend.set(d.disbursement_trend || []);
        this.collectionTrend.set(d.collection_trend || []);
        this.overdueAging.set(d.overdue_aging || []);
        this.topProducts.set(d.top_products || []);
        this.chartsLoading.set(false);
      },
      error: () => this.chartsLoading.set(false),
    });

    // Agent-accepting toggle setting (preserved)
    this.api.get('/settings', { per_page: 200 }).subscribe({
      next: res => {
        const settings = res.data || [];
        const s = settings.find((x: any) => x.key === 'agent.accepting_loans');
        if (s) this.agentAccepting.set(s.value === 'true' || s.value === '1');
      },
    });

    // Recent applications (X3a: trimmed from 10 to 5)
    this.api.get('/loans', { per_page: 5, sort_by: 'createdAt', sort_dir: 'DESC' }).subscribe({
      next: res => this.recentLoans = res.data || [],
    });
  }

  getStatusCount(status: string): number {
    return this.portfolio?.status_breakdown?.find((s: any) => s.status === status)?.count || 0;
  }

  formatNum(v: any): string {
    if (!v) return '0';
    return Number(v).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  }

  /**
   * Compact money formatter for chart axis labels — ₦1.2M / ₦450K /
   * ₦8,500. Y-axis labels need to fit in narrow gutters so abbreviated
   * forms keep them readable across all magnitudes.
   */
  formatMoney(v: any): string {
    if (v === null || v === undefined || v === 0) return '0';
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (isNaN(n)) return '0';
    if (n >= 1_000_000) return '₦' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return '₦' + (n / 1_000).toFixed(0) + 'K';
    return '₦' + Math.round(n).toLocaleString();
  }

  toggleAgentAccepting(): void {
    const newVal = !this.agentAccepting();
    this.api.get('/settings', { per_page: 200 }).subscribe({
      next: res => {
        const settings = res.data || [];
        const existing = settings.find((s: any) => s.key === 'agent.accepting_loans');
        if (existing) {
          this.api.put('/settings/' + existing.id, { value: String(newVal) }).subscribe({
            next: () => { this.agentAccepting.set(newVal); this.toast.success(newVal ? 'Agents can now accept loans' : 'Agent loan acceptance stopped'); },
            error: () => this.toast.error('Failed to update'),
          });
        } else {
          this.api.post('/settings', { key: 'agent.accepting_loans', value: String(newVal), type: 'boolean', category: 'general', description: 'Controls whether agents can submit new loan applications' }).subscribe({
            next: () => { this.agentAccepting.set(newVal); this.toast.success(newVal ? 'Agents can now accept loans' : 'Agent loan acceptance stopped'); },
            error: () => this.toast.error('Failed to create setting'),
          });
        }
      },
    });
  }

  // ─── Chart SVG renderers ───
  // Hand-rolled, viewBox-based, no external libraries. Same aesthetic
  // as general-loan-report.component.ts. Independent today; will be
  // extracted into a shared service when a third chart-heavy view lands.

  /** Portfolio donut — center shows total count. */
  portfolioDonutSvg(): string {
    const data = this.portfolioByStatus();
    if (!data.length) return '';
    const total = data.reduce((s, d) => s + d.value, 0);
    if (total === 0) return '';

    const cx = 110, cy = 110, r = 90, ir = 55;
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

    return `<svg viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg">
      ${slices}
      <text x="110" y="106" text-anchor="middle" font-size="28" font-weight="700" fill="#111827">${total}</text>
      <text x="110" y="124" text-anchor="middle" font-size="11" fill="#6b7280">Total Loans</text>
    </svg>`;
  }

  /** Disbursement trend — bar chart, 12 months oldest-first. */
  disbursementTrendSvg(): string {
    const data = this.disbursementTrend();
    if (!data.length) return '';
    const w = 600, h = 220, padL = 60, padR = 20, padT = 20, padB = 40;
    const max = Math.max(...data.map(d => d.value), 1);
    const stepX = (w - padL - padR) / data.length;
    const barW = stepX * 0.65;
    const scaleY = (v: number) => h - padB - (v / max) * (h - padT - padB);

    const yTicks = [0, 0.5, 1].map(t => {
      const y = scaleY(t * max);
      return `<g>
        <line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5"/>
        <text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="9" fill="#6b7280">${this.formatMoney(t * max)}</text>
      </g>`;
    }).join('');

    const bars = data.map((d, i) => {
      const x = padL + i * stepX + (stepX - barW) / 2;
      const y = scaleY(d.value);
      const bh = (h - padB) - y;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="${this.chartPalette[0]}" rx="2"/>`;
    }).join('');

    // Show every 2nd label to avoid crowding; always show first & last.
    const xLabels = data.map((d, i) => {
      const showLabel = i % 2 === 0 || i === data.length - 1;
      if (!showLabel) return '';
      const cx = padL + i * stepX + stepX / 2;
      return `<text x="${cx}" y="${h - padB + 16}" text-anchor="middle" font-size="9" fill="#6b7280">${this.escapeXml(d.label)}</text>`;
    }).join('');

    return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      ${yTicks}
      ${bars}
      ${xLabels}
    </svg>`;
  }

  /** Collection trend — line chart with area fill. */
  collectionTrendSvg(): string {
    const data = this.collectionTrend();
    if (!data.length) return '';
    const w = 600, h = 220, padL = 60, padR = 20, padT = 20, padB = 40;
    const max = Math.max(...data.map(d => d.value), 1);
    const stepX = (w - padL - padR) / (data.length - 1 || 1);
    const scaleY = (v: number) => h - padB - (v / max) * (h - padT - padB);

    const points = data.map((d, i) => `${padL + i * stepX},${scaleY(d.value)}`).join(' ');
    const fillPoints = `${padL},${h - padB} ${points} ${padL + (data.length - 1) * stepX},${h - padB}`;

    const yTicks = [0, 0.5, 1].map(t => {
      const y = scaleY(t * max);
      return `<g>
        <line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5"/>
        <text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="9" fill="#6b7280">${this.formatMoney(t * max)}</text>
      </g>`;
    }).join('');

    const dots = data.map((d, i) =>
      `<circle cx="${padL + i * stepX}" cy="${scaleY(d.value)}" r="3" fill="${this.chartPalette[5]}"/>`
    ).join('');

    const xLabels = data.map((d, i) => {
      const showLabel = i % 2 === 0 || i === data.length - 1;
      if (!showLabel) return '';
      return `<text x="${padL + i * stepX}" y="${h - padB + 16}" text-anchor="middle" font-size="9" fill="#6b7280">${this.escapeXml(d.label)}</text>`;
    }).join('');

    return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      ${yTicks}
      <polygon points="${fillPoints}" fill="${this.chartPalette[5]}" fill-opacity="0.12"/>
      <polyline points="${points}" fill="none" stroke="${this.chartPalette[5]}" stroke-width="2" stroke-linejoin="round"/>
      ${dots}
      ${xLabels}
    </svg>`;
  }

  /**
   * Overdue aging — horizontal bars with severity-driven colors.
   * 1-30 amber, 31-60 deeper amber, 61-90 red, 90+ darker red. Picks
   * the eye toward older buckets which matter most for collections.
   */
  overdueAgingSvg(): string {
    const data = this.overdueAging();
    if (!data.length) return '';
    const bucketColors = ['#f59e0b', '#ea580c', '#dc2626', '#991b1b'];
    const max = Math.max(...data.map(d => d.value), 1);
    const rowH = 38, padL = 100, padR = 100, padT = 10;
    const w = 600, h = padT + data.length * rowH + 8;
    const barMaxW = w - padL - padR;

    const rows = data.map((d, i) => {
      const y = padT + i * rowH;
      const bw = (d.value / max) * barMaxW;
      return `
        <text x="${padL - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" font-size="11" fill="#374151">${this.escapeXml(d.label)}</text>
        <rect x="${padL}" y="${y + 8}" width="${Math.max(2, bw)}" height="${rowH - 18}" fill="${bucketColors[i] || '#dc2626'}" rx="3"/>
        <text x="${padL + bw + 6}" y="${y + rowH / 2 + 4}" font-size="10" fill="#6b7280">${this.formatMoney(d.value)} <tspan fill="#9ca3af">· ${d.count}</tspan></text>
      `;
    }).join('');

    return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${rows}</svg>`;
  }

  /** Top products — horizontal bars, count-driven. */
  topProductsSvg(): string {
    const data = this.topProducts();
    if (!data.length) return '';
    const max = Math.max(...data.map(d => d.value), 1);
    const rowH = 38, padL = 140, padR = 60, padT = 10;
    const w = 600, h = padT + data.length * rowH + 8;
    const barMaxW = w - padL - padR;

    const rows = data.map((d, i) => {
      const y = padT + i * rowH;
      const bw = (d.value / max) * barMaxW;
      const labelTrunc = d.label.length > 20 ? d.label.slice(0, 19) + '…' : d.label;
      return `
        <text x="${padL - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" font-size="11" fill="#374151">${this.escapeXml(labelTrunc)}</text>
        <rect x="${padL}" y="${y + 8}" width="${Math.max(2, bw)}" height="${rowH - 18}" fill="${this.chartPalette[1]}" rx="3"/>
        <text x="${padL + bw + 6}" y="${y + rowH / 2 + 4}" font-size="11" fill="#6b7280">${d.value}</text>
      `;
    }).join('');

    return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${rows}</svg>`;
  }

  /**
   * XML escape for user-controlled strings before embedding into SVG
   * via [innerHTML]. Product/branch names could contain &<>"' chars.
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
