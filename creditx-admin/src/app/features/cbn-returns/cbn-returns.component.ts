import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import { PageGuide } from '../../shared/guide/page-guide.model';

/**
 * CBN Regulatory Returns — tabbed page exposing four production-grade
 * regulatory reports required by the Central Bank of Nigeria:
 *
 *   Tab 1: CRMS Returns          — every live loan with borrower BVN/NIN
 *   Tab 2: NPL Schedule          — loans ≥90 DPD with provisioning
 *   Tab 3: Insider-Related       — loans to directors/employees/affiliates
 *   Tab 4: Monthly Returns       — aggregate metrics for a month
 *
 * Each tab has its own date/period control, its own table, and its own
 * CSV export. Switching tabs does not auto-fetch — the user clicks
 * 'Refresh' on each tab to avoid unnecessary queries against the full
 * portfolio. Tab 1 loads automatically on first visit as the default.
 *
 * Monetary values render with the configured currency at 2dp. Dates render as-is in ISO.
 * CSV exports use headers matching the CBN field ordering convention.
 *
 * Gated by reports.cbn.
 */
const CBN_RETURNS_GUIDE: PageGuide = {
  id: 'cbn-returns',
  titleKey: 'CBN Regulatory Returns',
  purposeKey: 'The statutory returns submitted to the Central Bank of Nigeria.',
  descriptionKey:
    'Returns are produced from the same posted ledger the financial statements come from, in the '
    + 'formats the CBN prescribes. Because they are a regulatory filing rather than internal '
    + 'reporting, they must be produced from closed, reconciled periods — a return built on figures '
    + 'that later move is a correction you have to file.',
  actionKeys: [
    'Generate a return for a period',
    'Review the figures before filing',
    'Export in the prescribed format',
  ],
  workflowKeys: [
    'Month\'s postings complete',
    'Accruals, provisions and reconciliations done',
    'Period closed',
    'Return generated and filed',
  ],
  dependsOnKeys: ['Period Close', 'Provisions', 'Portfolio at Risk', 'GL Reconciliation'],
  businessRuleKeys: [
    'Generate from CLOSED periods. An open period can still receive postings, which would change a figure you have already filed.',
    'Returns are derived, never typed. If a figure looks wrong the cause is in the ledger, and that is what must be corrected.',
    'Filing deadlines and formats are set by the regulator, and late or incorrect filing carries penalties.',
    'Provisioning and classification must follow prudential guidelines for the return to be right.',
  ],
  tipKeys: [
    'Reconcile control accounts and complete provisioning before generating. Both feed the return directly.',
    'Keep the exported file you actually filed. Regenerating later can give a different figure if anything was reopened.',
  ],
  permissionKeys: ['reports.cbn'],
};

@Component({
  selector: 'app-cbn-returns',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, MoneyPipe, PageGuideComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="CBN Regulatory Returns"
        subtitle="Production-grade returns for Central Bank of Nigeria submission"
        eyebrow="Compliance">
      </cx-page-header>

      <cx-page-guide [guide]="guide"></cx-page-guide>

      <!-- Tab strip -->
      <div class="cx-cbn-tabs" role="tablist">
        <button class="cx-cbn-tab" [class.active]="activeTab() === 'crms'"
                (click)="setTab('crms')" role="tab">
          <lucide-icon name="users" [size]="14"></lucide-icon>
          <span>CRMS Returns</span>
        </button>
        <button class="cx-cbn-tab" [class.active]="activeTab() === 'npl'"
                (click)="setTab('npl')" role="tab">
          <lucide-icon name="alert-triangle" [size]="14"></lucide-icon>
          <span>NPL Schedule</span>
        </button>
        <button class="cx-cbn-tab" [class.active]="activeTab() === 'insider'"
                (click)="setTab('insider')" role="tab">
          <lucide-icon name="user-check" [size]="14"></lucide-icon>
          <span>Insider-Related</span>
        </button>
        <button class="cx-cbn-tab" [class.active]="activeTab() === 'monthly'"
                (click)="setTab('monthly')" role="tab">
          <lucide-icon name="calendar" [size]="14"></lucide-icon>
          <span>Monthly Returns</span>
        </button>
      </div>

      <!-- Controls bar (differs by tab — date vs year_month) -->
      <div class="cx-cbn-controls">
        @if (activeTab() === 'monthly') {
          <label>
            <span>Reporting Month</span>
            <input type="month" class="cx-input" [(ngModel)]="yearMonth" />
          </label>
        } @else {
          <label>
            <span>As of</span>
            <input type="date" class="cx-input" [(ngModel)]="asOf" />
          </label>
        }
        <button class="cx-btn cx-btn-primary cx-btn-sm" (click)="load()" [disabled]="loading()">
          <lucide-icon name="refresh-cw" [size]="14"></lucide-icon>
          <span>{{ loading() ? 'Loading…' : 'Run Report' }}</span>
        </button>
        <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="exportCsv()"
                [disabled]="!hasData()">
          <lucide-icon name="download" [size]="14"></lucide-icon>
          <span>Export CSV</span>
        </button>
      </div>

      @if (loading()) {
        <div class="cx-cbn-loading">
          <lucide-icon name="loader-2" [size]="20" class="cx-cbn-spin"></lucide-icon>
          <span>Running report…</span>
        </div>
      } @else if (!hasData()) {
        <div class="cx-cbn-empty">
          <lucide-icon name="file-spreadsheet" [size]="32"></lucide-icon>
          <div>Click <strong>Run Report</strong> to fetch data for this return.</div>
        </div>
      } @else {
        <!-- ─── CRMS Returns tab ─── -->
        @if (activeTab() === 'crms' && crmsData(); as d) {
          <div class="cx-cbn-summary">
            <div class="cx-cbn-summary-cell">
              <div class="cx-cbn-summary-label">Total Facilities</div>
              <div class="cx-cbn-summary-value tabular-nums">{{ d.summary.total_facilities | number }}</div>
            </div>
            <div class="cx-cbn-summary-cell">
              <div class="cx-cbn-summary-label">Total Outstanding</div>
              <div class="cx-cbn-summary-value tabular-nums">{{ d.summary.total_outstanding | money:2 }}</div>
            </div>
          </div>
          <div class="cx-cbn-table-wrap">
            <table class="cx-cbn-table">
              <thead><tr>
                <th>Application ID</th><th>Borrower</th><th>BVN</th><th>NIN</th>
                <th>Product</th><th class="cx-cbn-right">Amount</th>
                <th class="cx-cbn-right">Outstanding</th><th>Disbursed</th>
                <th>Maturity</th><th>Status</th><th>Insider</th>
              </tr></thead>
              <tbody>
                @for (r of d.records; track r.loan_id) {
                  <tr>
                    <td class="cx-cbn-mono">{{ r.application_id }}</td>
                    <td>{{ r.borrower_name }}</td>
                    <td class="cx-cbn-mono">{{ r.bvn || '—' }}</td>
                    <td class="cx-cbn-mono">{{ r.nin || '—' }}</td>
                    <td>{{ r.product_name }}</td>
                    <td class="cx-cbn-right tabular-nums">{{ r.amount_requested | money }}</td>
                    <td class="cx-cbn-right tabular-nums">{{ r.outstanding_balance | money }}</td>
                    <td>{{ formatDate(r.disbursed_at) }}</td>
                    <td>{{ r.maturity_date || '—' }}</td>
                    <td><span class="cx-cbn-badge">{{ r.status }}</span></td>
                    <td>{{ r.is_insider ? 'Yes' : 'No' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <!-- ─── NPL Schedule tab ─── -->
        @if (activeTab() === 'npl' && nplData(); as d) {
          <div class="cx-cbn-summary cx-cbn-summary-4">
            <div class="cx-cbn-summary-cell">
              <div class="cx-cbn-summary-label">NPL Loans</div>
              <div class="cx-cbn-summary-value tabular-nums">{{ d.summary.total_npl_loans }}</div>
            </div>
            <div class="cx-cbn-summary-cell">
              <div class="cx-cbn-summary-label">Total Outstanding</div>
              <div class="cx-cbn-summary-value tabular-nums">{{ d.summary.total_npl_outstanding | money:2 }}</div>
            </div>
            <div class="cx-cbn-summary-cell">
              <div class="cx-cbn-summary-label">Provision Estimate</div>
              <div class="cx-cbn-summary-value tabular-nums cx-cbn-danger">{{ d.summary.total_provision_estimate | money:2 }}</div>
            </div>
            <div class="cx-cbn-summary-cell">
              <div class="cx-cbn-summary-label">By Category</div>
              <div class="cx-cbn-summary-value cx-cbn-split-cat tabular-nums">
                <span>SS: {{ d.summary.by_category.substandard }}</span>
                <span>D: {{ d.summary.by_category.doubtful }}</span>
                <span>L: {{ d.summary.by_category.lost }}</span>
              </div>
            </div>
          </div>
          <div class="cx-cbn-hint">
            <strong>Provisioning:</strong> Substandard (90-179 DPD) 25% · Doubtful (180-364 DPD) 50% · Lost (365+ DPD) 100%
          </div>
          <div class="cx-cbn-table-wrap">
            <table class="cx-cbn-table">
              <thead><tr>
                <th>Application ID</th><th>Borrower</th><th>BVN</th>
                <th class="cx-cbn-right">DPD</th><th>Category</th>
                <th class="cx-cbn-right">Outstanding</th>
                <th class="cx-cbn-right">Provision</th>
                <th>Insider</th><th>Product</th>
              </tr></thead>
              <tbody>
                @for (r of d.records; track r.loan_id) {
                  <tr>
                    <td class="cx-cbn-mono">{{ r.application_id }}</td>
                    <td>{{ r.borrower_name }}</td>
                    <td class="cx-cbn-mono">{{ r.bvn || '—' }}</td>
                    <td class="cx-cbn-right tabular-nums cx-cbn-danger">{{ r.max_days_overdue }}</td>
                    <td>
                      <span class="cx-cbn-category" [attr.data-cat]="r.provision_category">
                        {{ r.provision_category }}
                      </span>
                    </td>
                    <td class="cx-cbn-right tabular-nums">{{ r.outstanding_balance | money }}</td>
                    <td class="cx-cbn-right tabular-nums cx-cbn-danger">{{ r.provision_amount | money }}</td>
                    <td>{{ r.is_insider ? 'Yes' : 'No' }}</td>
                    <td>{{ r.product_name }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <!-- ─── Insider-Related tab ─── -->
        @if (activeTab() === 'insider' && insiderData(); as d) {
          <div class="cx-cbn-summary cx-cbn-summary-3">
            <div class="cx-cbn-summary-cell">
              <div class="cx-cbn-summary-label">Insider Loans</div>
              <div class="cx-cbn-summary-value tabular-nums">{{ d.summary.total_insider_loans }}</div>
            </div>
            <div class="cx-cbn-summary-cell">
              <div class="cx-cbn-summary-label">Total Outstanding</div>
              <div class="cx-cbn-summary-value tabular-nums">{{ d.summary.total_outstanding | money:2 }}</div>
            </div>
            <div class="cx-cbn-summary-cell">
              <div class="cx-cbn-summary-label">By Relationship</div>
              <div class="cx-cbn-summary-value cx-cbn-split-cat tabular-nums">
                <span>Dir: {{ d.summary.by_relationship.director }}</span>
                <span>Emp: {{ d.summary.by_relationship.employee }}</span>
                <span>Aff: {{ d.summary.by_relationship.affiliate }}</span>
              </div>
            </div>
          </div>
          @if (d.records.length === 0) {
            <div class="cx-cbn-empty-tab">
              <lucide-icon name="info" [size]="24"></lucide-icon>
              <div>
                <strong>No insider-related loans found.</strong>
                <div class="cx-cbn-empty-hint">
                  Customers must have <code>is_insider</code> flag set to true to appear here.
                  Edit customer records to mark directors, employees, or affiliates.
                </div>
              </div>
            </div>
          } @else {
            <div class="cx-cbn-table-wrap">
              <table class="cx-cbn-table">
                <thead><tr>
                  <th>Application ID</th><th>Borrower</th><th>BVN</th>
                  <th>Relationship</th><th>Product</th>
                  <th class="cx-cbn-right">Amount</th>
                  <th class="cx-cbn-right">Outstanding</th>
                  <th>Disbursed</th><th>Maturity</th><th>Overdue?</th>
                </tr></thead>
                <tbody>
                  @for (r of d.records; track r.loan_id) {
                    <tr>
                      <td class="cx-cbn-mono">{{ r.application_id }}</td>
                      <td>{{ r.borrower_name }}</td>
                      <td class="cx-cbn-mono">{{ r.bvn || '—' }}</td>
                      <td>{{ r.insider_relationship || '—' }}</td>
                      <td>{{ r.product_name }}</td>
                      <td class="cx-cbn-right tabular-nums">{{ r.amount_requested | money }}</td>
                      <td class="cx-cbn-right tabular-nums">{{ r.outstanding_balance | money }}</td>
                      <td>{{ formatDate(r.disbursed_at) }}</td>
                      <td>{{ r.maturity_date || '—' }}</td>
                      <td>
                        @if (r.is_overdue) {
                          <span class="cx-cbn-danger">{{ r.max_days_overdue }}d</span>
                        } @else {
                          <span class="cx-cbn-ok">No</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }

        <!-- ─── Monthly Returns tab (single aggregate card) ─── -->
        @if (activeTab() === 'monthly' && monthlyData(); as d) {
          <div class="cx-cbn-monthly">
            <div class="cx-cbn-monthly-head">
              <h3>Monthly Returns — {{ d.year_month }}</h3>
              <div class="cx-cbn-monthly-period">
                Period: {{ d.period.from }} to {{ d.period.to }}
              </div>
            </div>
            <div class="cx-cbn-monthly-grid">
              <div class="cx-cbn-monthly-card">
                <div class="cx-cbn-monthly-label">New Disbursements</div>
                <div class="cx-cbn-monthly-value tabular-nums">{{ d.new_disbursements.total_amount | money:2 }}</div>
                <div class="cx-cbn-monthly-meta">{{ d.new_disbursements.count }} loan{{ d.new_disbursements.count === 1 ? '' : 's' }}</div>
              </div>
              <div class="cx-cbn-monthly-card">
                <div class="cx-cbn-monthly-label">Repayments Collected</div>
                <div class="cx-cbn-monthly-value tabular-nums">{{ d.repayments.total_amount | money:2 }}</div>
                <div class="cx-cbn-monthly-meta">{{ d.repayments.count }} payment{{ d.repayments.count === 1 ? '' : 's' }}</div>
              </div>
              <div class="cx-cbn-monthly-card">
                <div class="cx-cbn-monthly-label">Portfolio Outstanding</div>
                <div class="cx-cbn-monthly-value tabular-nums">{{ d.portfolio_as_of_end.total_outstanding | money:2 }}</div>
                <div class="cx-cbn-monthly-meta">{{ d.portfolio_as_of_end.total_loans }} loan{{ d.portfolio_as_of_end.total_loans === 1 ? '' : 's' }}</div>
              </div>
              <div class="cx-cbn-monthly-card">
                <div class="cx-cbn-monthly-label">PAR30</div>
                <div class="cx-cbn-monthly-value tabular-nums"
                     [class.cx-cbn-danger]="d.portfolio_as_of_end.par30_pct > 10"
                     [class.cx-cbn-warn]="d.portfolio_as_of_end.par30_pct > 5 && d.portfolio_as_of_end.par30_pct <= 10">
                  {{ d.portfolio_as_of_end.par30_pct | number:'1.2-2' }}%
                </div>
                <div class="cx-cbn-monthly-meta tabular-nums">
                  {{ d.portfolio_as_of_end.par30_outstanding | money }}
                </div>
              </div>
              <div class="cx-cbn-monthly-card">
                <div class="cx-cbn-monthly-label">PAR90 / NPL</div>
                <div class="cx-cbn-monthly-value tabular-nums"
                     [class.cx-cbn-danger]="d.portfolio_as_of_end.npl_pct > 5">
                  {{ d.portfolio_as_of_end.npl_pct | number:'1.2-2' }}%
                </div>
                <div class="cx-cbn-monthly-meta tabular-nums">
                  {{ d.portfolio_as_of_end.npl_outstanding | money }}
                </div>
              </div>
            </div>
          </div>
        }

        <div class="cx-cbn-footer">
          Generated {{ generatedAt() }}
        </div>
      }
    </div>
  `,
  styles: [`
    .cx-cbn-tabs {
      display: flex;
      gap: 4px;
      border-bottom: 1px solid var(--cx-border);
      margin-bottom: 14px;
      overflow-x: auto;
    }
    .cx-cbn-tab {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 14px;
      border: none;
      background: transparent;
      color: var(--cx-text-muted);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      white-space: nowrap;
      transition: color 0.15s, border-color 0.15s;
    }
    .cx-cbn-tab:hover { color: var(--cx-text-secondary); }
    .cx-cbn-tab.active {
      color: var(--cx-primary-600);
      border-bottom-color: var(--cx-primary-600);
    }

    .cx-cbn-controls {
      display: flex;
      gap: 10px;
      align-items: flex-end;
      padding: 14px 16px;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .cx-cbn-controls label {
      display: flex; flex-direction: column; gap: 4px;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-cbn-controls input { font-size: 13px; padding: 6px 10px; min-width: 160px; }

    .cx-cbn-summary {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      padding: 14px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
    }
    .cx-cbn-summary-3 { grid-template-columns: repeat(3, 1fr); }
    .cx-cbn-summary-4 { grid-template-columns: repeat(4, 1fr); }
    @media (max-width: 720px) {
      .cx-cbn-summary, .cx-cbn-summary-3, .cx-cbn-summary-4 {
        grid-template-columns: 1fr 1fr;
      }
    }
    .cx-cbn-summary-cell { display: flex; flex-direction: column; gap: 2px; }
    .cx-cbn-summary-label {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-cbn-summary-value {
      font-size: 17px; font-weight: 600;
      color: var(--cx-text);
    }
    .cx-cbn-split-cat {
      display: flex; gap: 8px;
      font-size: 13px; font-weight: 500;
    }
    .cx-cbn-danger { color: var(--cx-danger, #dc2626); }
    .cx-cbn-warn { color: #b45309; }
    .cx-cbn-ok { color: var(--cx-success, #16a34a); }

    .cx-cbn-hint {
      padding: 10px 14px;
      background: rgba(59, 130, 246, 0.06);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
      font-size: 12px;
      color: var(--cx-text-secondary);
    }

    .cx-cbn-table-wrap {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      overflow-x: auto;
      margin-bottom: 10px;
    }
    .cx-cbn-table { width: 100%; border-collapse: collapse; min-width: 800px; }
    .cx-cbn-table th {
      background: var(--cx-surface-2);
      padding: 10px 12px;
      text-align: left;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--cx-text-muted);
      border-bottom: 1px solid var(--cx-border);
      white-space: nowrap;
    }
    .cx-cbn-table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--cx-border);
      font-size: 13px;
      color: var(--cx-text);
      white-space: nowrap;
    }
    .cx-cbn-table tbody tr:last-child td { border-bottom: none; }
    .cx-cbn-right { text-align: right; }
    .cx-cbn-mono {
      font-family: 'SF Mono', Menlo, monospace;
      font-size: 12px;
    }
    .cx-cbn-badge {
      display: inline-block;
      padding: 1px 8px;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: 999px;
      font-size: 11px;
      font-weight: 500;
      text-transform: capitalize;
    }
    .cx-cbn-category {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
    }
    .cx-cbn-category[data-cat="Substandard"] {
      background: rgba(245, 158, 11, 0.15);
      color: #b45309;
    }
    .cx-cbn-category[data-cat="Doubtful"] {
      background: rgba(234, 88, 12, 0.15);
      color: #c2410c;
    }
    .cx-cbn-category[data-cat="Lost"] {
      background: rgba(220, 38, 38, 0.15);
      color: var(--cx-danger, #dc2626);
    }

    /* Monthly returns — aggregate card layout */
    .cx-cbn-monthly {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      overflow: hidden;
      margin-bottom: 14px;
    }
    .cx-cbn-monthly-head {
      padding: 18px 24px;
      background: var(--cx-surface-2);
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-cbn-monthly-head h3 {
      margin: 0 0 4px;
      font-size: 18px;
      font-weight: 600;
      color: var(--cx-text);
    }
    .cx-cbn-monthly-period {
      font-size: 12px;
      color: var(--cx-text-secondary);
    }
    .cx-cbn-monthly-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 0;
    }
    @media (max-width: 900px) {
      .cx-cbn-monthly-grid { grid-template-columns: repeat(2, 1fr); }
    }
    .cx-cbn-monthly-card {
      padding: 18px 20px;
      border-right: 1px solid var(--cx-border);
      border-bottom: 1px solid var(--cx-border);
      display: flex; flex-direction: column; gap: 4px;
    }
    .cx-cbn-monthly-card:last-child { border-right: none; }
    .cx-cbn-monthly-label {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-cbn-monthly-value {
      font-size: 20px; font-weight: 600;
      color: var(--cx-text);
    }
    .cx-cbn-monthly-meta {
      font-size: 11px;
      color: var(--cx-text-secondary);
    }

    .cx-cbn-footer {
      font-size: 11px;
      color: var(--cx-text-muted);
      padding: 4px 2px;
    }
    .cx-cbn-loading, .cx-cbn-empty {
      display: flex; align-items: center; justify-content: center;
      gap: 10px;
      padding: 48px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      color: var(--cx-text-secondary);
      font-size: 13px;
    }
    .cx-cbn-empty { flex-direction: column; }
    .cx-cbn-empty-tab {
      display: flex; align-items: flex-start; gap: 14px;
      padding: 20px 24px;
      background: rgba(59, 130, 246, 0.06);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
    }
    .cx-cbn-empty-tab lucide-icon { margin-top: 2px; color: var(--cx-primary-600); }
    .cx-cbn-empty-hint {
      margin-top: 4px;
      font-size: 12px;
      color: var(--cx-text-secondary);
    }
    .cx-cbn-empty-tab code {
      padding: 1px 5px;
      background: var(--cx-surface-2);
      border-radius: 3px;
    }
    .cx-cbn-spin { animation: cx-cbn-spin 1s linear infinite; }
    @keyframes cx-cbn-spin { to { transform: rotate(360deg); } }
  `],
})
export class CbnReturnsComponent implements OnInit {
  readonly guide = CBN_RETURNS_GUIDE;

  // Tab + control state
  activeTab = signal<'crms' | 'npl' | 'insider' | 'monthly'>('crms');
  asOf = '';
  yearMonth = '';
  loading = signal(false);

  // Per-tab data signals. Kept separate so switching tabs doesn't
  // clobber previously-loaded data — each tab remembers its last result.
  crmsData = signal<any>(null);
  nplData = signal<any>(null);
  insiderData = signal<any>(null);
  monthlyData = signal<any>(null);

  // Is there data for the active tab?
  hasData = computed(() => {
    switch (this.activeTab()) {
      case 'crms':    return this.crmsData() !== null;
      case 'npl':     return this.nplData() !== null;
      case 'insider': return this.insiderData() !== null;
      case 'monthly': return this.monthlyData() !== null;
    }
  });

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private toast: ToastService,
  ) {}

  ngOnInit() {
    const today = new Date();
    this.asOf = today.toISOString().slice(0, 10);
    // Default reporting month = last month (typical CBN submission pattern)
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    this.yearMonth = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
    // Auto-fetch the default CRMS tab on first load
    this.load();
  }

  setTab(tab: 'crms' | 'npl' | 'insider' | 'monthly') {
    this.activeTab.set(tab);
  }

  /**
   * Fetch data for the currently-active tab. Each tab hits its own
   * endpoint; the response is stashed in the per-tab signal.
   */
  load() {
    const tab = this.activeTab();
    let url: string;
    let params: any;

    if (tab === 'monthly') {
      url = '/reports/cbn/monthly-returns';
      params = { year_month: this.yearMonth };
    } else {
      params = { as_of: this.asOf };
      switch (tab) {
        case 'crms':    url = '/reports/cbn/crms-returns';    break;
        case 'npl':     url = '/reports/cbn/npl-schedule';    break;
        case 'insider': url = '/reports/cbn/insider-related'; break;
      }
    }

    this.loading.set(true);
    this.api.get(url!, params).subscribe({
      next: r => {
        this.loading.set(false);
        switch (tab) {
          case 'crms':    this.crmsData.set(r.data);    break;
          case 'npl':     this.nplData.set(r.data);     break;
          case 'insider': this.insiderData.set(r.data); break;
          case 'monthly': this.monthlyData.set(r.data); break;
        }
      },
      error: e => {
        this.loading.set(false);
        this.toast.error(e.error?.message || 'Failed to run report');
      },
    });
  }

  formatDate(iso: string | null): string {
    if (!iso) return '—';
    try { return iso.slice(0, 10); } catch { return iso; }
  }

  generatedAt(): string {
    let ts: string | null = null;
    switch (this.activeTab()) {
      case 'crms':    ts = this.crmsData()?.generated_at;    break;
      case 'npl':     ts = this.nplData()?.generated_at;     break;
      case 'insider': ts = this.insiderData()?.generated_at; break;
      case 'monthly': ts = this.monthlyData()?.generated_at; break;
    }
    if (!ts) return '—';
    try { return new Date(ts).toLocaleString(); } catch { return ts; }
  }

  /**
   * CSV export per tab. Headers match the CBN field-order convention
   * — edit the header arrays below if your CBN contact prescribes a
   * different layout.
   */
  exportCsv() {
    const escape = (v: any) => {
      if (v == null) return '';
      const s = String(v);
      if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const tab = this.activeTab();
    const rows: string[] = [];
    let filename = '';

    switch (tab) {
      case 'crms': {
        const d = this.crmsData(); if (!d) return;
        rows.push(escape(`CRMS Returns as of ${d.as_of}`));
        rows.push('');
        rows.push([
          'Application ID', 'Borrower Name', 'BVN', 'NIN', 'Gender',
          'Date of Birth', 'Phone', 'Product', 'Branch',
          'Amount Requested', 'Tenure (months)', 'Interest Rate',
          'Disbursed At', 'Maturity Date', 'Purpose',
          'Outstanding Balance', 'Status', 'Is Insider',
        ].join(','));
        for (const r of d.records) {
          rows.push([
            r.application_id, r.borrower_name, r.bvn, r.nin, r.gender,
            r.date_of_birth, r.phone, r.product_name, r.branch_name,
            r.amount_requested, r.tenure, r.interest_rate,
            r.disbursed_at, r.maturity_date, r.purpose,
            r.outstanding_balance, r.status, r.is_insider ? 'Y' : 'N',
          ].map(escape).join(','));
        }
        filename = `cbn-crms-returns-${d.as_of}.csv`;
        break;
      }
      case 'npl': {
        const d = this.nplData(); if (!d) return;
        rows.push(escape(`NPL Schedule as of ${d.as_of}`));
        rows.push('');
        rows.push([
          'Application ID', 'Borrower Name', 'BVN', 'NIN',
          'Is Insider', 'Insider Relationship',
          'Product', 'Branch', 'Amount Requested',
          'Disbursed At', 'Maturity Date',
          'Max Days Past Due', 'Outstanding Balance',
          'Provision Category', 'Provision Rate', 'Provision Amount',
        ].join(','));
        for (const r of d.records) {
          rows.push([
            r.application_id, r.borrower_name, r.bvn, r.nin,
            r.is_insider ? 'Y' : 'N', r.insider_relationship,
            r.product_name, r.branch_name, r.amount_requested,
            r.disbursed_at, r.maturity_date,
            r.max_days_overdue, r.outstanding_balance,
            r.provision_category, r.provision_rate, r.provision_amount,
          ].map(escape).join(','));
        }
        rows.push('');
        rows.push([
          '', 'TOTAL', '', '', '', '', '', '', '', '', '',
          '', d.summary.total_npl_outstanding, '', '', d.summary.total_provision_estimate,
        ].map(escape).join(','));
        filename = `cbn-npl-schedule-${d.as_of}.csv`;
        break;
      }
      case 'insider': {
        const d = this.insiderData(); if (!d) return;
        rows.push(escape(`Insider-Related Credit as of ${d.as_of}`));
        rows.push('');
        rows.push([
          'Application ID', 'Borrower Name', 'BVN', 'NIN',
          'Relationship', 'Product', 'Branch',
          'Amount Requested', 'Tenure (months)', 'Interest Rate',
          'Disbursed At', 'Maturity Date', 'Purpose',
          'Outstanding Balance', 'Status',
          'Max Days Past Due', 'Overdue',
        ].join(','));
        for (const r of d.records) {
          rows.push([
            r.application_id, r.borrower_name, r.bvn, r.nin,
            r.insider_relationship, r.product_name, r.branch_name,
            r.amount_requested, r.tenure, r.interest_rate,
            r.disbursed_at, r.maturity_date, r.purpose,
            r.outstanding_balance, r.status,
            r.max_days_overdue, r.is_overdue ? 'Y' : 'N',
          ].map(escape).join(','));
        }
        filename = `cbn-insider-related-${d.as_of}.csv`;
        break;
      }
      case 'monthly': {
        const d = this.monthlyData(); if (!d) return;
        rows.push(escape(`Monthly Returns — ${d.year_month}`));
        rows.push(escape(`Period: ${d.period.from} to ${d.period.to}`));
        rows.push('');
        rows.push(['Metric', 'Value'].join(','));
        rows.push(['New Disbursements Count', d.new_disbursements.count].map(escape).join(','));
        rows.push(['New Disbursements Amount', d.new_disbursements.total_amount].map(escape).join(','));
        rows.push(['Repayments Count', d.repayments.count].map(escape).join(','));
        rows.push(['Repayments Amount', d.repayments.total_amount].map(escape).join(','));
        rows.push(['Portfolio Total Loans', d.portfolio_as_of_end.total_loans].map(escape).join(','));
        rows.push(['Portfolio Total Outstanding', d.portfolio_as_of_end.total_outstanding].map(escape).join(','));
        rows.push(['PAR30 Outstanding', d.portfolio_as_of_end.par30_outstanding].map(escape).join(','));
        rows.push(['PAR30 %', d.portfolio_as_of_end.par30_pct].map(escape).join(','));
        rows.push(['PAR90 / NPL Outstanding', d.portfolio_as_of_end.npl_outstanding].map(escape).join(','));
        rows.push(['PAR90 / NPL %', d.portfolio_as_of_end.npl_pct].map(escape).join(','));
        filename = `cbn-monthly-returns-${d.year_month}.csv`;
        break;
      }
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.toast.success(`Exported ${filename}`);
  }
}
