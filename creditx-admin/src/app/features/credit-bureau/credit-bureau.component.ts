import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { CxViewDialogComponent } from '../../shared/components/view-dialog/view-dialog.component';
import { SearchableSelectDirective } from '../../shared/directives/searchable-select.directive';
import { CreditReportViewComponent } from './credit-report-view.component';
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import { PageGuide } from '../../shared/guide/page-guide.model';

const CREDIT_BUREAU_GUIDE: PageGuide = {
  id: 'credit-bureau',
  titleKey: 'Credit Bureau',
  purposeKey: 'Check a borrower\'s credit history with FirstCentral before lending to them.',
  descriptionKey:
    'Run a bureau check on a person or a business without starting a loan application. The full '
    + 'report comes back — score, risk band and every section the bureau returns — and each enquiry '
    + 'is recorded so you can show what was known at the time a decision was made.',
  actionKeys: [
    'Check a consumer by BVN, or by name and date of birth',
    'Check a business by name or RC number',
    'Read the complete bureau report, every field labelled',
    'Search past enquiries and reopen any of them',
    'Download the raw provider response for an audit file',
  ],
  sections: [
    {
      selector: '.cx-cb-form',
      titleKey: 'Running a check',
      bodyKey:
        'For a person, BVN gives the most reliable match; name plus date of birth is the fallback. '
        + 'For a business, use the RC number where you have it.',
    },
    {
      selector: '.cx-cb-filters',
      titleKey: 'Enquiry history',
      bodyKey:
        'Every check ever run is kept here. Filter by result, subject, risk band, or whether it came '
        + 'from this page or from a loan workflow — then open any row to see the full report again.',
    },
  ],
  workflowKeys: ['Customer applies', 'Credit check', 'Underwriting', 'Approval decision'],
  dependsOnKeys: ['FirstCentral credentials', 'Credit bureau enabled in Settings'],
  usedByKeys: ['Loan approval workflow', 'Underwriting decisions'],
  businessRuleKeys: [
    'Every enquiry is stored with its full report — a check can be evidenced long after the fact.',
    'A "no hit" means the bureau holds no record for that subject; it is not the same as a poor score.',
    'Commercial reports carry no numeric score, so they always go to a human for judgement.',
    'Running a check is gated by its own permission, separate from the loan module.',
  ],
  tipKeys: [
    'BVN gives a far more reliable match than name and date of birth — use it whenever you have it.',
    'A credit-check step can be built into a product\'s approval workflow so it runs automatically.',
    'The raw response download is the thing to attach to an audit or dispute file.',
  ],
  permissionKeys: ['credit_bureau.check'],
  faq: [
    {
      questionKey: 'The check returned no score — why?',
      answerKey: 'Either the bureau holds no record for that subject, or it is a commercial report, which does not carry a numeric score.',
    },
    {
      questionKey: 'Does running a check here affect a loan application?',
      answerKey: 'No. This is a standalone enquiry. Checks that gate an application are run by the approval workflow itself.',
    },
  ],
};

/**
 * Credit Bureau (FirstCentral) — standalone check module, gated by
 * credit_bureau.check. Run a consumer (BVN / name+DOB) or commercial
 * (business name / RC) check without a loan, see the FULL bureau report, and
 * browse/filter the enquiry history with a detail modal per enquiry.
 *
 * Both the live result and the history modal render through
 * cx-credit-report-view, so there is exactly one place that decides how a
 * bureau payload is displayed.
 */
@Component({
  selector: 'app-credit-bureau',
  standalone: true,
  imports: [
    CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent,
    DataTableComponent, CxViewDialogComponent, SearchableSelectDirective, CreditReportViewComponent,
    PageGuideComponent,
  ],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Credit Bureau" subtitle="Run a FirstCentral credit check" eyebrow="Risk"></cx-page-header>

      <cx-page-guide [guide]="guide"></cx-page-guide>

      <div class="cx-cb-grid">
        <!-- Check form -->
        <div class="cx-card cx-cb-form">
          <div class="cx-cb-tabs">
            <button class="cx-cb-tab" [class.is-active]="subject === 'consumer'" (click)="subject = 'consumer'; result.set(null)">Consumer</button>
            <button class="cx-cb-tab" [class.is-active]="subject === 'commercial'" (click)="subject = 'commercial'; result.set(null)">Commercial</button>
          </div>

          @if (subject === 'consumer') {
            <label class="cx-label">BVN</label>
            <input class="cx-input" [(ngModel)]="bvn" placeholder="11-digit BVN" maxlength="11" inputmode="numeric" />
            <div class="cx-cb-or">or search by name + date of birth</div>
            <div class="cx-cb-row">
              <div><label class="cx-label">Full name</label><input class="cx-input" [(ngModel)]="name" placeholder="Surname Firstname" /></div>
              <div><label class="cx-label">Date of birth</label><input class="cx-input" [(ngModel)]="dob" placeholder="dd/mm/yyyy" /></div>
            </div>
          } @else {
            <label class="cx-label">Business name</label>
            <input class="cx-input" [(ngModel)]="businessName" placeholder="Registered business name" />
            <div class="cx-cb-or">or</div>
            <label class="cx-label">RC number</label>
            <input class="cx-input" [(ngModel)]="rcNumber" placeholder="RC / registration number" />
          }

          <button class="cx-btn cx-btn-primary cx-btn-block" style="margin-top:14px" (click)="runCheck()" [disabled]="checking()">
            <lucide-icon [name]="checking() ? 'loader-2' : 'search'" [size]="15" [class.cx-spin]="checking()"></lucide-icon>
            <span>{{ checking() ? 'Checking…' : 'Run Check' }}</span>
          </button>
        </div>

        <!-- Result: the complete bureau response, every field labelled -->
        <div class="cx-card cx-cb-result">
          @if (result(); as r) {
            <div class="cx-cb-result-bar">
              <span class="cx-eyebrow">Result</span>
              <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="openDetail(r)">
                <lucide-icon name="external-link" [size]="13"></lucide-icon><span>Expand</span>
              </button>
            </div>
            <cx-credit-report-view [data]="r"></cx-credit-report-view>
          } @else {
            <div class="cx-cb-empty">
              <lucide-icon name="shield-check" [size]="28"></lucide-icon>
              <p>Run a check to see the full bureau report — score, risk band and every section the provider returns.</p>
            </div>
          }
        </div>
      </div>

      <!-- History -->
      <div class="cx-cb-history-head">
        <h3 class="cx-cb-history-title">Recent checks</h3>
        @if (activeFilterCount()) {
          <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="clearFilters()">
            <lucide-icon name="x" [size]="13"></lucide-icon>
            <span>Clear {{ activeFilterCount() }} filter{{ activeFilterCount() > 1 ? 's' : '' }}</span>
          </button>
        }
      </div>

      <div class="cx-cb-filters">
        <select class="cx-select" [(ngModel)]="filters.status" (change)="onFilterChange()" aria-label="Result">
          <option value="">All results</option>
          @for (s of facets().statuses; track s) { <option [value]="s">{{ statusLabel(s) }}</option> }
        </select>
        <select class="cx-select" [(ngModel)]="filters.subject_type" (change)="onFilterChange()" aria-label="Subject type">
          <option value="">All subjects</option>
          @for (s of facets().subject_types; track s) { <option [value]="s">{{ titleCase(s) }}</option> }
        </select>
        <select class="cx-select" [(ngModel)]="filters.risk_band" (change)="onFilterChange()" aria-label="Risk band">
          <option value="">All risk bands</option>
          @for (b of facets().risk_bands; track b) { <option [value]="b">{{ b }}</option> }
        </select>
        <select class="cx-select" [(ngModel)]="filters.linked" (change)="onFilterChange()" aria-label="Source">
          <option value="">All sources</option>
          <option value="standalone">Standalone check</option>
          <option value="loan">Raised on a loan</option>
        </select>
        @if (facets().decisions.length) {
          <select class="cx-select" [(ngModel)]="filters.decision" (change)="onFilterChange()" aria-label="Workflow decision">
            <option value="">All decisions</option>
            @for (d of facets().decisions; track d) { <option [value]="d">{{ decisionLabel(d) }}</option> }
          </select>
        }
        <input type="date" class="cx-input" [(ngModel)]="filters.date_from" (change)="onFilterChange()" aria-label="From date" />
        <input type="date" class="cx-input" [(ngModel)]="filters.date_to" (change)="onFilterChange()" aria-label="To date" />
      </div>

      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
                     searchPlaceholder="Search by BVN, customer, app id, reference or user…" [hasActions]="true"
                     trackBy="id" (query)="onQuery($event)">
        <ng-template #rowActions let-row>
          <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openDetail(row)" title="View full report" aria-label="View full report">
            <lucide-icon name="eye" [size]="15"></lucide-icon>
          </button>
        </ng-template>
      </cx-data-table>

      <!-- Detail modal -->
      <cx-view-dialog [open]="detailOpen()" title="Credit check" [subtitle]="detailSubtitle()" maxWidth="1060px" (close)="closeDetail()">
        @if (detailLoading()) {
          <div class="cx-cb-detail-loading">
            <lucide-icon name="loader-2" [size]="15" class="cx-spin"></lucide-icon>
            <span>Loading the full bureau report…</span>
          </div>
        }
        @if (detail(); as d) {
          <cx-credit-report-view [data]="d"></cx-credit-report-view>
        }
      </cx-view-dialog>
    </div>
  `,
  styles: [`
    .cx-cb-grid { display: grid; grid-template-columns: minmax(280px, 360px) minmax(300px, 1fr); gap: 16px; align-items: start; }
    @media (max-width: 900px) { .cx-cb-grid { grid-template-columns: 1fr; } }
    .cx-cb-form, .cx-cb-result { padding: 18px; }
    .cx-cb-form { position: sticky; top: 12px; }
    @media (max-width: 900px) { .cx-cb-form { position: static; } }
    .cx-cb-tabs { display: inline-flex; gap: 4px; background: var(--cx-surface-2, var(--cx-stone-100)); padding: 3px; border-radius: 10px; margin-bottom: 16px; }
    .cx-cb-tab { padding: 6px 14px; border: none; background: transparent; border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--cx-text-secondary); cursor: pointer; }
    .cx-cb-tab.is-active { background: var(--cx-surface); color: var(--cx-text); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .cx-cb-or { text-align: center; font-size: 12px; color: var(--cx-text-muted); margin: 12px 0; }
    .cx-cb-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .cx-cb-result-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .cx-cb-empty { text-align: center; color: var(--cx-text-muted); padding: 42px 12px; }
    .cx-cb-empty p { margin-top: 10px; font-size: 13px; max-width: 42ch; margin-inline: auto; }

    .cx-cb-history-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 26px 0 10px; }
    .cx-cb-history-title { font-size: 14px; font-weight: 600; margin: 0; color: var(--cx-text); }
    .cx-cb-filters {
      display: grid; grid-template-columns: 1fr; gap: 0.65rem;
      padding: 0.85rem; background: var(--cx-surface);
      border: 1px solid var(--cx-border); border-radius: var(--cx-radius-xl);
      margin-bottom: 1rem;
    }
    @media (min-width: 700px) { .cx-cb-filters { grid-template-columns: repeat(2, 1fr); } }
    @media (min-width: 1100px) { .cx-cb-filters { grid-template-columns: repeat(4, 1fr); } }

    .cx-cb-detail-loading { display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin-bottom: 12px; border-radius: var(--cx-radius-lg, 10px); background: var(--cx-surface-2, var(--cx-stone-100)); color: var(--cx-text-muted); font-size: 12.5px; }
    .cx-spin { animation: cx-cb-spin 1s linear infinite; }
    @keyframes cx-cb-spin { to { transform: rotate(360deg); } }
  `],
})
export class CreditBureauComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly guide = CREDIT_BUREAU_GUIDE;

  subject: 'consumer' | 'commercial' = 'consumer';
  bvn = ''; name = ''; dob = ''; businessName = ''; rcNumber = '';
  checking = signal(false);
  result = signal<any | null>(null);

  columns: TableColumn[] = [
    { key: 'created_at', label: 'When', type: 'date' },
    { key: 'subject_type', label: 'Type', type: 'badge', badgeMap: {
      consumer: { label: 'Consumer', class: 'cx-badge-neutral' },
      commercial: { label: 'Commercial', class: 'cx-badge-info' },
    } },
    { key: 'identifier', label: 'Subject' },
    { key: 'customer_name', label: 'Customer', sortable: false },
    { key: 'application_id', label: 'Loan', sortable: false },
    { key: 'score', label: 'Score', align: 'right' },
    { key: 'risk_band', label: 'Band' },
    { key: 'status', label: 'Result', type: 'badge', badgeMap: {
      hit: { label: 'Hit', class: 'cx-badge-success' },
      no_hit: { label: 'No hit', class: 'cx-badge-warning' },
      error: { label: 'Error', class: 'cx-badge-danger' },
      not_configured: { label: 'Not configured', class: 'cx-badge-danger' },
    } },
    // Plain text, not a badge: most rows have no workflow decision (standalone
    // checks), and a badge column would render an empty pill on every one.
    { key: 'decision_label', label: 'Decision', sortable: false },
    { key: 'provider_ref', label: 'Reference', sortable: false },
    { key: 'initiated_by', label: 'By' },
  ];
  rows = signal<any[]>([]);
  loading = signal(true);
  pagination = signal<TablePagination | null>(null);

  /** Options come from what the history actually contains — risk bands are provider text. */
  facets = signal<{ statuses: string[]; subject_types: string[]; risk_bands: string[]; decisions: string[] }>(
    { statuses: [], subject_types: [], risk_bands: [], decisions: [] },
  );

  filters = { status: '', subject_type: '', risk_band: '', linked: '', decision: '', date_from: '', date_to: '' };

  detailOpen = signal(false);
  detailLoading = signal(false);
  detail = signal<any | null>(null);

  private q: any = {};

  ngOnInit(): void { this.load(); this.loadFacets(); }

  // ── Check ────────────────────────────────────────────────────────────────

  runCheck(): void {
    if (this.checking()) return;
    const body: any = { subject_type: this.subject };
    if (this.subject === 'consumer') {
      body.bvn = this.bvn.trim(); body.name = this.name.trim(); body.dob = this.dob.trim();
      if (!body.bvn && !body.name) { this.toast.error('Enter a BVN, or a name and date of birth.'); return; }
    } else {
      body.business_name = this.businessName.trim(); body.rc_number = this.rcNumber.trim();
      if (!body.business_name && !body.rc_number) { this.toast.error('Enter a business name or RC number.'); return; }
    }
    this.checking.set(true);
    this.api.post('/credit-bureau/check', body).subscribe({
      next: r => { this.checking.set(false); this.result.set(r.data); this.load(); this.loadFacets(); },
      error: e => { this.checking.set(false); this.toast.error(e.error?.message || 'Check failed.'); },
    });
  }

  // ── History ──────────────────────────────────────────────────────────────

  onQuery(e: TableQueryEvent) { this.q = e; this.load(); }

  onFilterChange(): void {
    this.q = { ...this.q, page: 1 };
    this.load();
  }

  clearFilters(): void {
    this.filters = { status: '', subject_type: '', risk_band: '', linked: '', decision: '', date_from: '', date_to: '' };
    this.onFilterChange();
  }

  activeFilterCount(): number {
    return Object.values(this.filters).filter(v => v !== '').length;
  }

  load(): void {
    this.loading.set(true);
    const params: any = { ...this.q };
    Object.entries(this.filters).forEach(([k, v]) => { if (v !== '') params[k] = v; });
    this.api.get('/credit-bureau/checks', params).subscribe({
      next: r => {
        this.rows.set((r.data || []).map((row: any) => ({
          ...row,
          decision_label: row.decision ? this.decisionLabel(row.decision) : '',
        })));
        this.pagination.set(r.meta || null);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private loadFacets(): void {
    this.api.get('/credit-bureau/checks/facets').subscribe({
      // Non-fatal: without facets the dropdowns just show "All …".
      next: r => this.facets.set({ statuses: [], subject_types: [], risk_bands: [], decisions: [], ...(r.data || {}) }),
      error: () => {},
    });
  }

  // ── Detail modal ─────────────────────────────────────────────────────────

  /**
   * List rows carry no raw_response (it is heavy), so fetch the full record.
   * The row we already have renders immediately so the modal is never blank.
   */
  openDetail(row: any): void {
    this.detail.set(row);
    this.detailOpen.set(true);
    if (row?.raw_response !== undefined || !row?.id) return;
    this.detailLoading.set(true);
    this.api.get(`/credit-bureau/checks/${row.id}`).subscribe({
      next: r => { this.detail.set(r.data); this.detailLoading.set(false); },
      error: () => { this.detailLoading.set(false); this.toast.error('Could not load the full report.'); },
    });
  }

  closeDetail(): void { this.detailOpen.set(false); this.detail.set(null); }

  detailSubtitle(): string {
    const d = this.detail();
    if (!d) return '';
    return [d.identifier, this.titleCase(d.subject_type), d.created_at].filter(Boolean).join(' · ');
  }

  // ── Labels ───────────────────────────────────────────────────────────────

  statusLabel(s: string): string {
    return ({ hit: 'Hit', no_hit: 'No hit', error: 'Error', not_configured: 'Not configured' } as any)[s] || s;
  }
  decisionLabel(d: string): string {
    return ({ auto_pass: 'Auto-passed', auto_fail: 'Auto-failed', manual: 'Manual review' } as any)[d] || d;
  }
  titleCase(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }
}
