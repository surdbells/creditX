import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../core/services/toast.service';

/**
 * Renders a credit-bureau enquiry in full: our own record fields, the
 * normalized score summary, and EVERY section of the provider's raw report.
 *
 * The bureau report is a list of blocks — [{"Scoring":[{…}]}, {"SubjectList":[…]}, …]
 * — and the set of sections differs per product (iScore vs Commercial Full
 * Credit) and per subject. So nothing here is hard-coded against a known
 * shape: we walk whatever arrives and render it, using LABELS/SECTIONS purely
 * to give known keys human wording. Unknown keys fall back to camel/snake
 * splitting, which means a new bureau field shows up labelled rather than
 * silently dropped.
 *
 * Nested values render through a self-referencing ng-template so arbitrarily
 * deep report structures (account histories, address lists) are all shown.
 * A raw JSON panel is kept at the bottom as the audit-grade fallback.
 */

interface Field {
  key: string;
  label: string;
  display: string;
  kind: 'scalar' | 'nested';
  numeric: boolean;
  /** For "181/192"-style component scores. */
  frac?: { num: number; den: number; pct: number };
  /** Nested rows, each a field list. */
  rows?: Field[][];
}

interface Section {
  key: string;
  label: string;
  rows: Field[][];
}

@Component({
  selector: 'cx-credit-report-view',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <!-- Recursive field renderer: a nested field re-enters this same template. -->
    <ng-template #fieldList let-fields>
      <div class="cx-cr-grid">
        @for (f of fields; track f.key) {
          @if (f.kind === 'nested') {
            <div class="cx-cr-nested">
              <div class="cx-cr-nested-head">{{ f.label }}</div>
              @for (r of f.rows; track $index) {
                @if (f.rows.length > 1) {
                  <div class="cx-cr-nested-idx">{{ $index + 1 }} of {{ f.rows.length }}</div>
                }
                <ng-container *ngTemplateOutlet="fieldList; context: { $implicit: r }"></ng-container>
              }
            </div>
          } @else {
            <div class="cx-cr-item">
              <span class="cx-cr-k">{{ f.label }}</span>
              <span class="cx-cr-v" [class.tabular-nums]="f.numeric" [class.is-empty]="f.display === '—'">{{ f.display }}</span>
              @if (f.frac) {
                <span class="cx-cr-bar" [attr.aria-label]="f.frac.pct + '%'"><i [style.width.%]="f.frac.pct"></i></span>
              }
            </div>
          }
        }
      </div>
    </ng-template>

    @if (check) {
      <div class="cx-cr">
        <!-- Headline: status + score + band -->
        <div class="cx-cr-head">
          <div class="cx-cr-head-main">
            <div class="cx-cr-eyebrow">{{ subjectLabel() }} enquiry &middot; {{ providerLabel() }}</div>
            <div class="cx-cr-subject">{{ check.identifier || '—' }}</div>
            @if (check.customer_name) { <div class="cx-cr-sub">Customer: {{ check.customer_name }}</div> }
            @if (check.application_id) { <div class="cx-cr-sub">Loan: {{ check.application_id }}</div> }
          </div>
          <div class="cx-cr-head-right">
            <span class="cx-cr-status" [attr.data-status]="check.status">{{ statusLabel(check.status) }}</span>
            @if (check.score != null) {
              <div class="cx-cr-score">
                <span class="cx-cr-score-num tabular-nums">{{ check.score }}</span>
                <span class="cx-cr-band" [attr.data-band]="bandTone(check.risk_band)">{{ check.risk_band || 'No band' }}</span>
              </div>
            }
          </div>
        </div>

        @if (check.error_message) {
          <p class="cx-cr-note" [class.is-error]="check.status === 'error' || check.status === 'not_configured'">
            <lucide-icon name="info" [size]="14"></lucide-icon>
            <span>{{ check.error_message }}</span>
          </p>
        }
        @if (check.status === 'no_hit') {
          <p class="cx-cr-note">
            <lucide-icon name="info" [size]="14"></lucide-icon>
            <span>No record found at the bureau for this subject. The enquiry itself is still recorded below.</span>
          </p>
        }

        <!-- Our record -->
        <section class="cx-cr-sec">
          <h4 class="cx-cr-sec-title">Enquiry record</h4>
          <ng-container *ngTemplateOutlet="fieldList; context: { $implicit: recordFields() }"></ng-container>
        </section>

        <!-- Normalized summary -->
        @if (summaryFields().length) {
          <section class="cx-cr-sec">
            <h4 class="cx-cr-sec-title">Score summary</h4>
            <ng-container *ngTemplateOutlet="fieldList; context: { $implicit: summaryFields() }"></ng-container>
          </section>
        }

        <!-- Every section of the provider report -->
        @for (s of sections(); track s.key) {
          <section class="cx-cr-sec">
            <h4 class="cx-cr-sec-title">
              {{ s.label }}
              @if (s.rows.length > 1) { <span class="cx-cr-count">{{ s.rows.length }} records</span> }
            </h4>
            @for (r of s.rows; track $index) {
              @if (s.rows.length > 1) { <div class="cx-cr-rowidx">Record {{ $index + 1 }}</div> }
              <ng-container *ngTemplateOutlet="fieldList; context: { $implicit: r }"></ng-container>
            }
          </section>
        }

        @if (!sections().length && check.raw_response) {
          <p class="cx-cr-note">
            <lucide-icon name="info" [size]="14"></lucide-icon>
            <span>The provider returned no report sections for this enquiry.</span>
          </p>
        }

        <!-- Audit fallback: the untouched payload -->
        @if (check.raw_response) {
          <section class="cx-cr-sec">
            <div class="cx-cr-raw-head">
              <button class="cx-cr-raw-toggle" (click)="showRaw.set(!showRaw())">
                <lucide-icon [name]="showRaw() ? 'chevron-down' : 'chevron-right'" [size]="14"></lucide-icon>
                <span>Raw provider response</span>
              </button>
              <div class="cx-cr-raw-actions">
                <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="copyRaw()">
                  <lucide-icon name="copy" [size]="13"></lucide-icon><span>Copy</span>
                </button>
                <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="downloadRaw()">
                  <lucide-icon name="download" [size]="13"></lucide-icon><span>JSON</span>
                </button>
              </div>
            </div>
            @if (showRaw()) {
              <pre class="cx-cr-raw">{{ rawJson() }}</pre>
            }
          </section>
        }
      </div>
    }
  `,
  styles: [`
    .cx-cr { display: flex; flex-direction: column; gap: 16px; }
    .cx-cr-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
    .cx-cr-eyebrow { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--cx-text-muted); }
    .cx-cr-subject { font-size: 18px; font-weight: 700; color: var(--cx-text); margin-top: 3px; word-break: break-word; }
    .cx-cr-sub { font-size: 12px; color: var(--cx-text-muted); margin-top: 2px; }
    .cx-cr-head-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .cx-cr-status { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 3px 10px; border-radius: 999px; background: var(--cx-stone-100); color: var(--cx-text-secondary); }
    .cx-cr-status[data-status="hit"] { background: color-mix(in srgb, var(--cx-success) 12%, transparent); color: var(--cx-success); }
    .cx-cr-status[data-status="no_hit"] { background: color-mix(in srgb, var(--cx-warning) 14%, transparent); color: var(--cx-warning); }
    .cx-cr-status[data-status="error"], .cx-cr-status[data-status="not_configured"] { background: color-mix(in srgb, var(--cx-danger) 12%, transparent); color: var(--cx-danger); }
    .cx-cr-score { display: flex; align-items: baseline; gap: 10px; }
    .cx-cr-score-num { font-size: 34px; font-weight: 800; line-height: 1; color: var(--cx-primary-600); }
    .cx-cr-band { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 3px 10px; border-radius: 999px; background: var(--cx-stone-100); color: var(--cx-text-secondary); }
    .cx-cr-band[data-band="low"] { background: color-mix(in srgb, var(--cx-success) 14%, transparent); color: var(--cx-success); }
    .cx-cr-band[data-band="high"] { background: color-mix(in srgb, var(--cx-danger) 12%, transparent); color: var(--cx-danger); }

    .cx-cr-note { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: var(--cx-text-secondary); background: var(--cx-surface-2, var(--cx-stone-100)); border-radius: var(--cx-radius-lg, 10px); padding: 10px 12px; margin: 0; }
    .cx-cr-note.is-error { color: var(--cx-danger); background: color-mix(in srgb, var(--cx-danger) 8%, transparent); }
    .cx-cr-note lucide-icon { flex-shrink: 0; margin-top: 1px; }

    .cx-cr-sec { border-top: 1px solid var(--cx-border); padding-top: 12px; }
    .cx-cr-sec-title { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--cx-text-muted); margin: 0 0 10px; }
    .cx-cr-count { font-size: 10px; font-weight: 600; letter-spacing: 0; text-transform: none; background: var(--cx-stone-100); color: var(--cx-text-secondary); padding: 1px 7px; border-radius: 999px; }
    .cx-cr-rowidx { font-size: 11px; font-weight: 700; color: var(--cx-text-muted); margin: 10px 0 4px; }

    .cx-cr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 2px 18px; }
    .cx-cr-item { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; padding: 5px 0; border-bottom: 1px dashed var(--cx-border); min-width: 0; }
    .cx-cr-k { font-size: 12px; color: var(--cx-text-muted); flex-shrink: 0; }
    .cx-cr-v { font-size: 13px; font-weight: 600; color: var(--cx-text); text-align: right; word-break: break-word; min-width: 0; }
    .cx-cr-v.is-empty { color: var(--cx-text-muted); font-weight: 400; }
    /* Component-score bar sits on its own line under the label/value pair. */
    .cx-cr-bar { flex: 0 0 100%; height: 3px; border-radius: 999px; background: var(--cx-stone-100); overflow: hidden; }
    .cx-cr-bar > i { display: block; height: 100%; border-radius: 999px; background: var(--cx-primary-600); }

    .cx-cr-nested { grid-column: 1 / -1; border-left: 2px solid var(--cx-border); padding-left: 12px; margin: 8px 0; }
    .cx-cr-nested-head { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--cx-text-secondary); margin-bottom: 6px; }
    .cx-cr-nested-idx { font-size: 11px; color: var(--cx-text-muted); margin: 6px 0 2px; }

    .cx-cr-raw-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .cx-cr-raw-toggle { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--cx-text-muted); }
    .cx-cr-raw-actions { display: flex; gap: 4px; }
    .cx-cr-raw { margin-top: 10px; max-height: 340px; overflow: auto; font-size: 11.5px; line-height: 1.55; background: var(--cx-surface-2, var(--cx-stone-100)); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-lg, 10px); padding: 12px; white-space: pre; }
  `],
})
export class CreditReportViewComponent {
  private toast = inject(ToastService);

  /** A CreditCheck record as returned by the API (raw_response optional). */
  @Input({ required: true }) set data(v: any) { this._check.set(v); }
  private _check = signal<any | null>(null);
  get check(): any | null { return this._check(); }

  showRaw = signal(false);

  // ── Known wording. Unknown keys still render, just auto-labelled. ────────
  private static readonly SECTIONS: Record<string, string> = {
    SubjectList: 'Subject match',
    MatchedConsumer: 'Matched consumers',
    ConnectCommercialMatch: 'Matched businesses',
    Scoring: 'Credit score breakdown',
    EnquiryDetails: 'Enquiry details',
    PersonalDetailsSummary: 'Personal details',
    CreditAccountSummary: 'Credit account summary',
    CreditAccountRating: 'Credit account rating',
    CreditAgreementSummary: 'Credit agreements',
    AccountMonthlyPaymentHistory: 'Monthly payment history',
    AccountMonthlyPaymentHistoryHeader: 'Monthly payment history (header)',
    GuarantorDetails: 'Guarantors',
    GuarantorCount: 'Guarantor count',
    AddressHistory: 'Address history',
    EmploymentHistory: 'Employment history',
    TelephoneHistory: 'Telephone history',
    IdentificationHistory: 'Identification history',
    DishonouredChequeInformation: 'Dishonoured cheques',
    BouncedCheques: 'Bounced cheques',
    EnquiryHistoryTop: 'Recent enquiries',
    Directors: 'Directors',
    Shareholders: 'Shareholders',
    CompanyDetails: 'Company details',
    DeliquencyInformation: 'Delinquency information',
    NanoStatus: 'Nano status',
    ScoreSummary: 'Score summary',
  };

  private static readonly LABELS: Record<string, string> = {
    ConsumerID: 'Consumer ID',
    CommercialID: 'Commercial ID',
    SearchOutput: 'Search output',
    Reference: 'Reference',
    Surname: 'Surname',
    FirstName: 'First name',
    OtherNames: 'Other names',
    Gender: 'Gender',
    BirthDate: 'Date of birth',
    BankVerificationNo: 'BVN',
    RepaymentHistoryScore: 'Repayment history score',
    TotalAmountOwedScore: 'Total amount owed score',
    TypesOfCreditScore: 'Types of credit score',
    LengthOfCreditHistoryScore: 'Length of credit history score',
    NoOfAcctScore: 'Number of accounts score',
    TotalConsumerScore: 'Total consumer score',
    Description: 'Risk band',
    ScoreDate: 'Score date',
    TotalOutstandingDebt: 'Total outstanding debt',
    TotalForeignOutstandingDebt: 'Total foreign outstanding debt',
    TotalAccountarrear: 'Accounts in arrears',
    TotalAmountOverdue: 'Total amount overdue',
    TotalAccounts: 'Total accounts',
    TotalForeignAccounts: 'Total foreign accounts',
    TotalaccountinGoodcondition: 'Accounts in good condition',
    TotalaccountinBadcondition: 'Accounts in bad condition',
    SubscriberEnquiryResultID: 'Subscriber enquiry result ID',
    SubscriberEnquiryEngineID: 'Subscriber enquiry engine ID',
    SubscriberEnquiryID: 'Subscriber enquiry ID',
    MatchingEngineID: 'Matching engine ID',
    ProductID: 'Product ID',
    EnquiryID: 'Enquiry ID',
    MatchingRate: 'Matching rate',
    BusinessName: 'Business name',
    BusinessRegistrationNumber: 'RC number',
    AccountNo: 'Account number',
    AccountNumber: 'Account number',
    OpeningBalanceAmt: 'Opening balance',
    CurrentBalanceAmt: 'Current balance',
    AmountOverdue: 'Amount overdue',
    InstalmentAmount: 'Instalment amount',
    LastUpdatedDate: 'Last updated',
    DateAccountOpened: 'Date account opened',
    ClosedDate: 'Date closed',
    LoanDuration: 'Loan duration',
    RepaymentFrequency: 'Repayment frequency',
    SubscriberName: 'Lender',
    AccountStatus: 'Account status',
    PerformanceStatus: 'Performance status',
  };

  /** Our own stored record — everything we persisted about the enquiry. */
  recordFields = computed<Field[]>(() => {
    const c = this._check();
    if (!c) return [];
    const rows: [string, any][] = [
      ['Check ID', c.id],
      ['Checked at', c.created_at],
      ['Provider', this.providerLabel()],
      ['Subject type', this.subjectLabel()],
      ['Searched value', c.identifier],
      ['Result', this.statusLabel(c.status)],
      ['Score', c.score],
      ['Risk band', c.risk_band],
      ['Provider reference', c.provider_ref],
      ['Workflow decision', this.decisionLabel(c.decision)],
      ['Initiated by', c.initiated_by],
      ['Customer', c.customer_name],
      ['Customer ID', c.customer_id],
      ['Loan application', c.application_id],
      ['Loan ID', c.loan_id],
      ['Message', c.error_message],
    ];
    return rows.map(([label, v]) => this.scalarField(label, label, v));
  });

  /** The normalized summary we store alongside the record. */
  summaryFields = computed<Field[]>(() => this.toFields(this._check()?.summary));

  /** Every block of the provider payload, in the order the provider sent it. */
  sections = computed<Section[]>(() => {
    const raw = this._check()?.raw_response;
    if (!raw) return [];
    const blocks = Array.isArray(raw) ? raw : [raw];
    const out: Section[] = [];

    blocks.forEach((block: any, bi: number) => {
      if (block === null || typeof block !== 'object') return;
      Object.entries(block).forEach(([name, value]) => {
        const list = Array.isArray(value) ? value : [value];
        const rows = list
          .filter(r => r !== null && r !== undefined)
          .map(r => (typeof r === 'object' ? this.toFields(r) : [this.scalarField(name, this.label(name), r)]));
        if (!rows.length) return;
        out.push({ key: `${bi}:${name}`, label: CreditReportViewComponent.SECTIONS[name] || this.label(name), rows });
      });
    });
    return out;
  });

  rawJson = computed(() => JSON.stringify(this._check()?.raw_response ?? null, null, 2));

  // ── Field building ───────────────────────────────────────────────────────

  private toFields(obj: any): Field[] {
    if (obj === null || obj === undefined || typeof obj !== 'object') return [];
    return Object.entries(obj).map(([k, v]) => this.toField(k, v));
  }

  private toField(key: string, value: any): Field {
    const label = CreditReportViewComponent.LABELS[key] || this.label(key);

    if (Array.isArray(value)) {
      if (value.some(v => v !== null && typeof v === 'object')) {
        return { key, label, display: '', kind: 'nested', numeric: false, rows: value.map(v => this.toFields(v)) };
      }
      // Scalar list — join, keeping empties visible as blanks.
      const joined = value.map(v => (v === null || v === '' ? '—' : String(v))).join(', ');
      return { key, label, display: value.length ? joined : '—', kind: 'scalar', numeric: false };
    }
    if (value !== null && typeof value === 'object') {
      return { key, label, display: '', kind: 'nested', numeric: false, rows: [this.toFields(value)] };
    }
    return this.scalarField(key, label, value);
  }

  private scalarField(key: string, label: string, value: any): Field {
    if (value === null || value === undefined || value === '') {
      return { key, label, display: '—', kind: 'scalar', numeric: false };
    }
    if (typeof value === 'boolean') {
      return { key, label, display: value ? 'Yes' : 'No', kind: 'scalar', numeric: false };
    }
    const s = String(value);
    const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
    if (frac) {
      const num = +frac[1], den = +frac[2];
      return {
        key, label, display: `${num} / ${den}`, kind: 'scalar', numeric: true,
        frac: { num, den, pct: den > 0 ? Math.max(0, Math.min(100, Math.round((num / den) * 100))) : 0 },
      };
    }
    return { key, label, display: s, kind: 'scalar', numeric: /^-?[\d,.]+$/.test(s) };
  }

  /** camelCase / PascalCase / snake_case → spaced sentence case. */
  private label(k: string): string {
    const spaced = k
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
    return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : k;
  }

  // ── Display helpers ──────────────────────────────────────────────────────

  statusLabel(s: string): string {
    return ({ hit: 'Hit', no_hit: 'No hit', error: 'Error', not_configured: 'Not configured' } as any)[s] || s || '—';
  }
  decisionLabel(d: string | null): string | null {
    return d ? (({ auto_pass: 'Auto-passed', auto_fail: 'Auto-failed', manual: 'Sent to manual review' } as any)[d] || d) : null;
  }
  subjectLabel(): string {
    return this._check()?.subject_type === 'commercial' ? 'Commercial' : 'Consumer';
  }
  providerLabel(): string {
    const p = this._check()?.provider;
    return p === 'firstcentral' ? 'FirstCentral' : (p || '—');
  }
  bandTone(band?: string | null): string {
    const b = (band || '').toLowerCase();
    if (b.includes('low')) return 'low';
    if (b.includes('high')) return 'high';
    return '';
  }

  copyRaw(): void {
    navigator.clipboard?.writeText(this.rawJson()).then(
      () => this.toast.success('Raw response copied'),
      () => this.toast.error('Could not copy to clipboard'),
    );
  }

  downloadRaw(): void {
    const c = this._check();
    const blob = new Blob([this.rawJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credit-check-${c?.identifier || c?.id || 'report'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
