import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { SearchableSelectDirective } from '../../shared/directives/searchable-select.directive';

/**
 * Credit Bureau (FirstCentral) — standalone check module, gated by
 * credit_bureau.check. Run a consumer (BVN / name+DOB) or commercial
 * (business name / RC) check without a loan, see the score + risk band, and
 * browse the enquiry history.
 */
@Component({
  selector: 'app-credit-bureau',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, PageHeaderComponent, DataTableComponent, SearchableSelectDirective],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Credit Bureau" subtitle="Run a FirstCentral credit check" eyebrow="Risk"></cx-page-header>

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

        <!-- Result -->
        <div class="cx-card cx-cb-result">
          @if (result(); as r) {
            <div class="cx-cb-result-head">
              <div>
                <div class="cx-eyebrow">Result</div>
                <div class="cx-cb-subject">{{ r.identifier }}</div>
              </div>
              <span class="cx-cb-status" [attr.data-status]="r.status">{{ statusLabel(r.status) }}</span>
            </div>

            @if (r.status === 'hit') {
              @if (r.score != null) {
                <div class="cx-cb-score">
                  <div class="cx-cb-score-num tabular-nums">{{ r.score }}</div>
                  <div class="cx-cb-score-band" [attr.data-band]="bandTone(r.risk_band)">{{ r.risk_band || '—' }}</div>
                </div>
              } @else {
                <p class="cx-cb-note">Report retrieved — no numeric score for this product (manual review).</p>
              }
              @if (r.summary) {
                <div class="cx-cb-summary">
                  @for (kv of summaryRows(r.summary); track kv[0]) {
                    <div class="cx-cb-summary-row"><span>{{ prettyKey(kv[0]) }}</span><span class="tabular-nums">{{ kv[1] }}</span></div>
                  }
                </div>
              }
            } @else if (r.status === 'no_hit') {
              <p class="cx-cb-note">No record found at the bureau for this subject.</p>
            } @else {
              <p class="cx-cb-note cx-cb-note-err">{{ r.error_message || 'The check could not be completed.' }}</p>
            }
          } @else {
            <div class="cx-cb-empty">
              <lucide-icon name="shield-check" [size]="28"></lucide-icon>
              <p>Run a check to see the credit score and risk band.</p>
            </div>
          }
        </div>
      </div>

      <!-- History -->
      <h3 class="cx-cb-history-title">Recent checks</h3>
      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
                     searchPlaceholder="Search by BVN, customer or app id…" [hasActions]="false"
                     trackBy="id" (query)="onQuery($event)"></cx-data-table>
    </div>
  `,
  styles: [`
    .cx-cb-grid { display: grid; grid-template-columns: minmax(300px, 1fr) minmax(300px, 1.2fr); gap: 16px; }
    @media (max-width: 860px) { .cx-cb-grid { grid-template-columns: 1fr; } }
    .cx-cb-form, .cx-cb-result { padding: 18px; }
    .cx-cb-tabs { display: inline-flex; gap: 4px; background: var(--cx-surface-2, var(--cx-stone-100)); padding: 3px; border-radius: 10px; margin-bottom: 16px; }
    .cx-cb-tab { padding: 6px 14px; border: none; background: transparent; border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--cx-text-secondary); cursor: pointer; }
    .cx-cb-tab.is-active { background: var(--cx-surface); color: var(--cx-text); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .cx-cb-or { text-align: center; font-size: 12px; color: var(--cx-text-muted); margin: 12px 0; }
    .cx-cb-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .cx-cb-result-head { display: flex; justify-content: space-between; align-items: flex-start; }
    .cx-cb-subject { font-size: 16px; font-weight: 600; color: var(--cx-text); margin-top: 2px; }
    .cx-cb-status { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 3px 10px; border-radius: 999px; background: var(--cx-stone-100); color: var(--cx-text-secondary); }
    .cx-cb-status[data-status="hit"] { background: color-mix(in srgb, var(--cx-success) 12%, transparent); color: var(--cx-success); }
    .cx-cb-status[data-status="no_hit"] { background: color-mix(in srgb, var(--cx-warning) 14%, transparent); color: var(--cx-warning); }
    .cx-cb-status[data-status="error"], .cx-cb-status[data-status="not_configured"] { background: color-mix(in srgb, var(--cx-danger) 12%, transparent); color: var(--cx-danger); }
    .cx-cb-score { display: flex; align-items: baseline; gap: 14px; margin: 18px 0; }
    .cx-cb-score-num { font-size: 44px; font-weight: 800; color: var(--cx-primary-600); line-height: 1; }
    .cx-cb-score-band { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 4px 12px; border-radius: 999px; background: var(--cx-stone-100); color: var(--cx-text-secondary); }
    .cx-cb-score-band[data-band="low"] { background: color-mix(in srgb, var(--cx-success) 14%, transparent); color: var(--cx-success); }
    .cx-cb-score-band[data-band="high"] { background: color-mix(in srgb, var(--cx-danger) 12%, transparent); color: var(--cx-danger); }
    .cx-cb-summary { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--cx-border); padding-top: 12px; margin-top: 6px; }
    .cx-cb-summary-row { display: flex; justify-content: space-between; font-size: 13px; }
    .cx-cb-summary-row > span:first-child { color: var(--cx-text-muted); }
    .cx-cb-note { font-size: 14px; color: var(--cx-text-secondary); margin: 18px 0; }
    .cx-cb-note-err { color: var(--cx-danger); }
    .cx-cb-empty { text-align: center; color: var(--cx-text-muted); padding: 32px 0; }
    .cx-cb-empty p { margin-top: 10px; font-size: 13px; }
    .cx-cb-history-title { font-size: 14px; font-weight: 600; margin: 24px 0 12px; color: var(--cx-text); }
    .cx-spin { animation: cx-cb-spin 1s linear infinite; }
    @keyframes cx-cb-spin { to { transform: rotate(360deg); } }
  `],
})
export class CreditBureauComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  subject: 'consumer' | 'commercial' = 'consumer';
  bvn = ''; name = ''; dob = ''; businessName = ''; rcNumber = '';
  checking = signal(false);
  result = signal<any | null>(null);

  columns: TableColumn[] = [
    { key: 'created_at', label: 'When', type: 'date' },
    { key: 'subject_type', label: 'Type' },
    { key: 'identifier', label: 'Subject' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'score', label: 'Score', align: 'right' },
    { key: 'risk_band', label: 'Band' },
    { key: 'status', label: 'Status', type: 'badge', badgeMap: {
      hit: { label: 'Hit', class: 'cx-badge-success' },
      no_hit: { label: 'No hit', class: 'cx-badge-warning' },
      error: { label: 'Error', class: 'cx-badge-danger' },
      not_configured: { label: 'Not configured', class: 'cx-badge-danger' },
    } },
    { key: 'initiated_by', label: 'By' },
  ];
  rows = signal<any[]>([]);
  loading = signal(true);
  pagination = signal<TablePagination | null>(null);
  private q: any = {};

  ngOnInit(): void { this.load(); }

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
      next: r => { this.checking.set(false); this.result.set(r.data); this.load(); },
      error: e => { this.checking.set(false); this.toast.error(e.error?.message || 'Check failed.'); },
    });
  }

  onQuery(e: TableQueryEvent) { this.q = e; this.load(); }
  load(): void {
    this.loading.set(true);
    this.api.get('/credit-bureau/checks', { ...this.q }).subscribe({
      next: r => { this.rows.set(r.data || []); this.pagination.set(r.meta || null); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  statusLabel(s: string): string {
    return { hit: 'Hit', no_hit: 'No hit', error: 'Error', not_configured: 'Not configured' }[s] || s;
  }
  bandTone(band?: string | null): string {
    const b = (band || '').toLowerCase();
    if (b.includes('low')) return 'low';
    if (b.includes('high')) return 'high';
    return '';
  }
  prettyKey(k: string): string { return k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' '); }
  summaryRows(s: any): [string, any][] { return Object.entries(s || {}); }
}
