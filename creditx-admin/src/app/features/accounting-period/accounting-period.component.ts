import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { CxViewDialogComponent } from '../../shared/components/view-dialog/view-dialog.component';

/**
 * Accounting Period Management (§12).
 *
 * Shows the server date beside the accounting date — the whole point of the
 * framework is that these differ — plus the calendar status, the next date and
 * the last End-of-Day run. Run EOD, reopen a closed date, and read the
 * backdated-posting log from here.
 *
 * Calendar colours follow the domain, not the template: each day carries a
 * `tone` from BusinessDateStatus, so the UI cannot drift from the enum.
 *   green = open · gray = closed · blue = future · orange = processing
 */
@Component({
  selector: 'app-accounting-period',
  standalone: true,
  // No <select> on this page — dates are pickers and the reason is a textarea —
  // so SearchableSelectDirective is deliberately not imported.
  imports: [
    CommonModule, FormsModule, LucideAngularModule,
    PageHeaderComponent, FormDialogComponent, CxViewDialogComponent,
  ],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Accounting Period"
        subtitle="The accounting date your postings land on, and the End-of-Day that advances it"
        eyebrow="Accounting"></cx-page-header>

      @if (!loading() && status(); as s) {
        @if (!s.enforced) {
          <p class="cx-ap-banner">
            <lucide-icon name="info" [size]="15"></lucide-icon>
            <span>
              <strong>Accounting-date enforcement is off.</strong>
              Postings still use the date each module supplies, and only the monthly period close applies.
              Assign the <code>accounting.*</code> permissions, then enable enforcement in Settings.
            </span>
          </p>
        }

        <!-- Headline -->
        <div class="cx-ap-grid">
          <div class="cx-card cx-ap-kpi">
            <span>Accounting date</span>
            <strong class="cx-ap-accent">{{ s.accounting_date }}</strong>
            <em>Default posting date for every module</em>
          </div>
          <div class="cx-card cx-ap-kpi">
            <span>Server date</span>
            <strong>{{ s.server_date }}</strong>
            <em>{{ s.server_date === s.accounting_date ? 'In step' : behind(s) }}</em>
          </div>
          <div class="cx-card cx-ap-kpi">
            <span>Status</span>
            <strong>
              <span class="cx-ap-dot" [attr.data-tone]="toneOf(s.status)"></span>
              {{ s.status_label }}
            </strong>
            <em>{{ s.open_dates.length }} open date(s)</em>
          </div>
          <div class="cx-card cx-ap-kpi">
            <span>Next accounting date</span>
            <strong>{{ s.next_accounting_date }}</strong>
            <em>Opens when EOD completes</em>
          </div>
          <div class="cx-card cx-ap-kpi">
            <span>Last EOD run</span>
            <strong>{{ s.last_eod_date || '—' }}</strong>
            <em>{{ s.last_eod_completed_at || 'Never run' }}</em>
          </div>
        </div>

        <!-- Actions -->
        <div class="cx-ap-actions">
          @if (s.can.run_eod) {
            <button class="cx-btn cx-btn-outline" (click)="validate()" [disabled]="busy()">
              <lucide-icon [name]="busy() ? 'loader-2' : 'check-circle'" [size]="15" [class.cx-ap-spin]="busy()"></lucide-icon>
              <span>Validate</span>
            </button>
            <button class="cx-btn cx-btn-primary" (click)="confirmEod()" [disabled]="busy()">
              <lucide-icon [name]="busy() ? 'loader-2' : 'play'" [size]="15" [class.cx-ap-spin]="busy()"></lucide-icon>
              <span>Run End-of-Day</span>
            </button>
          }
          @if (s.can.reopen) {
            <button class="cx-btn cx-btn-outline" (click)="openReopen()" [disabled]="busy()">
              <lucide-icon name="undo-2" [size]="15"></lucide-icon><span>Reopen Period</span>
            </button>
          }
          <button class="cx-btn cx-btn-outline" (click)="loadAudit(); showAudit.set(true)">
            <lucide-icon name="scroll-text" [size]="15"></lucide-icon><span>Backdated Postings</span>
          </button>
        </div>

        <!-- EOD result -->
        @if (eodResult(); as r) {
          <div class="cx-card cx-ap-result" [attr.data-state]="r.status">
            <div class="cx-ap-result-head">
              <lucide-icon [name]="r.status === 'completed' ? 'check-circle' : (r.status === 'failed' || r.status === 'would_fail' ? 'alert-triangle' : 'info')" [size]="16"></lucide-icon>
              <strong>{{ resultTitle(r) }}</strong>
              <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="eodResult.set(null)" title="Dismiss">
                <lucide-icon name="x" [size]="14"></lucide-icon>
              </button>
            </div>
            @if (r.errors?.length) {
              <ul class="cx-ap-errors">
                @for (e of r.errors; track e) { <li>{{ e }}</li> }
              </ul>
            }
            <table class="cx-ap-steps">
              <tbody>
                @for (st of r.steps; track st.step) {
                  <tr>
                    <td><span class="cx-ap-step-dot" [attr.data-status]="st.status"></span>{{ stepLabel(st.step) }}</td>
                    <td class="cx-ap-step-status">{{ st.status }}</td>
                    <td class="cx-ap-step-detail">{{ st.detail }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <!-- Calendar -->
        <div class="cx-ap-cal-head">
          <h3>Accounting calendar</h3>
          <div class="cx-ap-cal-nav">
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="shiftMonth(-1)"><lucide-icon name="chevron-left" [size]="15"></lucide-icon></button>
            <span class="cx-ap-cal-month">{{ monthLabel() }}</span>
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="shiftMonth(1)"><lucide-icon name="chevron-right" [size]="15"></lucide-icon></button>
          </div>
          <div class="cx-ap-legend">
            @for (l of legend; track l.tone) {
              <span><i [attr.data-tone]="l.tone"></i>{{ l.label }}</span>
            }
          </div>
        </div>

        <div class="cx-card cx-ap-cal">
          @if (calLoading()) {
            <div class="cx-ap-cal-loading"><lucide-icon name="loader-2" [size]="16" class="cx-ap-spin"></lucide-icon><span>Loading…</span></div>
          } @else {
            <div class="cx-ap-cal-grid">
              @for (w of weekdays; track w) { <div class="cx-ap-cal-dow">{{ w }}</div> }
              @for (b of leadingBlanks(); track b) { <div></div> }
              @for (d of days(); track d.business_date) {
                <button class="cx-ap-day" [attr.data-tone]="d.tone" [class.is-current]="d.is_current"
                        [class.is-derived]="d.derived" (click)="pickDay(d)"
                        [title]="d.business_date + ' — ' + d.status_label + (d.derived ? ' (not yet recorded)' : '')">
                  <span class="cx-ap-day-num">{{ dayNum(d.business_date) }}</span>
                  @if (d.reopen_count > 0) { <span class="cx-ap-reopened" title="Reopened">↻</span> }
                </button>
              }
            </div>
          }
        </div>
      } @else if (loading()) {
        <div class="cx-ap-loading"><lucide-icon name="loader-2" [size]="18" class="cx-ap-spin"></lucide-icon><span>Loading accounting period…</span></div>
      }
    </div>

    <!-- Run EOD confirm -->
    <cx-form-dialog [open]="showEod()" title="Run End-of-Day"
      [subtitle]="'Close ' + (status()?.accounting_date || '') + ' and advance the books'"
      [saving]="busy()" maxWidth="560px" (close)="showEod.set(false)" (save)="runEod()">
      <div class="cx-form-stack">
        <p class="cx-ap-confirm">
          This closes <strong>{{ status()?.accounting_date }}</strong> and opens
          <strong>{{ status()?.next_accounting_date }}</strong>. Postings are locked while it runs.
        </p>
        <p class="cx-ap-note">
          If the trial balance does not balance the run aborts and the date stays open — nothing is sealed.
        </p>
      </div>
    </cx-form-dialog>

    <!-- Reopen -->
    <cx-form-dialog [open]="showReopen()" title="Reopen Accounting Period"
      subtitle="Restores posting to a closed date under the normal backdating rules"
      [saving]="busy()" maxWidth="560px" (close)="showReopen.set(false)" (save)="submitReopen()">
      <div class="cx-form-stack">
        <div>
          <label class="cx-label">Business date *</label>
          <input class="cx-input" type="date" [(ngModel)]="reopen.date" />
        </div>
        <div>
          <label class="cx-label">Reason *</label>
          <textarea class="cx-input" rows="3" [(ngModel)]="reopen.reason"
                    placeholder="Why does this period need to be reopened?"></textarea>
          <div class="cx-field-hint">Recorded against your user, with the date and time, and cannot be edited later.</div>
        </div>
      </div>
    </cx-form-dialog>

    <!-- Backdated posting log -->
    <cx-view-dialog [open]="showAudit()" title="Backdated postings"
      subtitle="Entries that did not land on the accounting date current at the time"
      maxWidth="1040px" (close)="showAudit.set(false)">
      @if (auditLoading()) {
        <div class="cx-ap-loading"><lucide-icon name="loader-2" [size]="16" class="cx-ap-spin"></lucide-icon><span>Loading…</span></div>
      } @else {
        <div class="cx-ap-table-wrap">
          <table class="cx-ap-table">
            <thead>
              <tr><th>Posted to</th><th>Accounting date</th><th>Keyed at</th><th>Type</th><th>Narration</th><th>Reason</th><th>By</th><th>From</th></tr>
            </thead>
            <tbody>
              @for (a of audit(); track a.id) {
                <tr>
                  <td class="cx-ap-mono">{{ a.posting_date }}</td>
                  <td class="cx-ap-mono">{{ a.accounting_date }}<span class="cx-ap-days">−{{ a.backdated_days }}d</span></td>
                  <td class="cx-ap-mono">{{ a.created_timestamp }}</td>
                  <td>{{ a.entry_type }}</td>
                  <td>{{ a.narration }}</td>
                  <td>{{ a.reason || '—' }}</td>
                  <td class="cx-ap-mono">{{ a.user_id || '—' }}</td>
                  <td>{{ a.ip_address || '—' }}<span class="cx-ap-ua">{{ a.browser }} · {{ a.device }}</span></td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="cx-ap-empty">No backdated postings recorded.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </cx-view-dialog>
  `,
  styles: [`
    .cx-ap-banner { display:flex; gap:9px; align-items:flex-start; font-size:13px; padding:11px 13px; margin:0 0 16px;
      border-radius:var(--cx-radius-lg,10px); background:color-mix(in srgb, var(--cx-warning) 10%, transparent); color:var(--cx-text-secondary); }
    .cx-ap-banner code { font-size:12px; }

    .cx-ap-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:14px; }
    .cx-ap-kpi { padding:13px 15px; }
    .cx-ap-kpi span { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--cx-text-muted); }
    .cx-ap-kpi strong { display:flex; align-items:center; gap:7px; font-size:19px; font-weight:700; margin-top:4px; color:var(--cx-text); }
    .cx-ap-kpi em { display:block; font-style:normal; font-size:11.5px; color:var(--cx-text-muted); margin-top:3px; }
    .cx-ap-accent { color:var(--cx-primary-600) !important; }
    .cx-ap-dot { width:9px; height:9px; border-radius:50%; display:inline-block; }

    .cx-ap-actions { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; }
    .cx-ap-spin { animation:cx-ap-spin 1s linear infinite; }
    @keyframes cx-ap-spin { to { transform:rotate(360deg); } }

    .cx-ap-result { padding:14px 16px; margin-bottom:16px; }
    .cx-ap-result[data-state="failed"], .cx-ap-result[data-state="would_fail"] { border-color:var(--cx-danger); }
    .cx-ap-result-head { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
    .cx-ap-result-head strong { flex:1; }
    .cx-ap-errors { margin:0 0 10px; padding-left:18px; color:var(--cx-danger); font-size:13px; }
    .cx-ap-steps { width:100%; border-collapse:collapse; font-size:12.5px; }
    .cx-ap-steps td { padding:6px 8px; border-bottom:1px solid var(--cx-border); vertical-align:top; }
    .cx-ap-steps tr:last-child td { border-bottom:none; }
    .cx-ap-step-dot { display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:7px; background:var(--cx-stone-300,#d6d3d1); }
    .cx-ap-step-dot[data-status="ok"] { background:var(--cx-success); }
    .cx-ap-step-dot[data-status="failed"] { background:var(--cx-danger); }
    .cx-ap-step-status { text-transform:capitalize; color:var(--cx-text-muted); white-space:nowrap; }
    .cx-ap-step-detail { color:var(--cx-text-secondary); }

    .cx-ap-cal-head { display:flex; flex-wrap:wrap; align-items:center; gap:14px; margin:0 0 10px; }
    .cx-ap-cal-head h3 { font-size:14px; font-weight:600; margin:0; flex:1; }
    .cx-ap-cal-nav { display:flex; align-items:center; gap:6px; }
    .cx-ap-cal-month { font-size:13px; font-weight:600; min-width:120px; text-align:center; }
    .cx-ap-legend { display:flex; gap:12px; font-size:11.5px; color:var(--cx-text-muted); }
    .cx-ap-legend span { display:flex; align-items:center; gap:5px; }
    .cx-ap-legend i, .cx-ap-dot { display:inline-block; }
    .cx-ap-legend i { width:9px; height:9px; border-radius:2px; }
    [data-tone="green"]  { background:var(--cx-success); }
    [data-tone="gray"]   { background:var(--cx-stone-400,#a8a29e); }
    [data-tone="blue"]   { background:var(--cx-info,#3b82f6); }
    [data-tone="orange"] { background:var(--cx-warning); }

    .cx-ap-cal { padding:14px; }
    .cx-ap-cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; }
    .cx-ap-cal-dow { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--cx-text-muted); text-align:center; padding-bottom:4px; }
    .cx-ap-day { position:relative; aspect-ratio:1; border:1px solid var(--cx-border); border-radius:8px; background:var(--cx-surface);
      cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:13px; color:var(--cx-text); }
    .cx-ap-day::before { content:''; position:absolute; inset:0; border-radius:7px; opacity:.16; }
    .cx-ap-day[data-tone="green"]::before  { background:var(--cx-success); }
    .cx-ap-day[data-tone="gray"]::before   { background:var(--cx-stone-400,#a8a29e); }
    .cx-ap-day[data-tone="blue"]::before   { background:var(--cx-info,#3b82f6); }
    .cx-ap-day[data-tone="orange"]::before { background:var(--cx-warning); }
    .cx-ap-day.is-current { border-color:var(--cx-primary-600); border-width:2px; font-weight:700; }
    .cx-ap-day.is-derived { border-style:dashed; }
    .cx-ap-day-num { position:relative; }
    .cx-ap-reopened { position:absolute; top:2px; right:4px; font-size:10px; color:var(--cx-warning); }
    .cx-ap-cal-loading, .cx-ap-loading { display:flex; gap:8px; align-items:center; justify-content:center; padding:28px 0; color:var(--cx-text-muted); font-size:13px; }

    .cx-ap-confirm { font-size:13.5px; margin:0; }
    .cx-ap-note { font-size:12px; color:var(--cx-text-muted); margin:0; }

    .cx-ap-table-wrap { overflow-x:auto; }
    .cx-ap-table { width:100%; border-collapse:collapse; font-size:12.5px; }
    .cx-ap-table th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--cx-text-muted);
      padding:7px 8px; border-bottom:1px solid var(--cx-border); white-space:nowrap; }
    .cx-ap-table td { padding:7px 8px; border-bottom:1px solid var(--cx-border); vertical-align:top; }
    .cx-ap-mono { font-family:var(--cx-font-mono,ui-monospace,monospace); font-size:12px; white-space:nowrap; }
    .cx-ap-days { display:block; font-size:10.5px; color:var(--cx-warning); }
    .cx-ap-ua { display:block; font-size:10.5px; color:var(--cx-text-muted); }
    .cx-ap-empty { text-align:center; color:var(--cx-text-muted); padding:22px 0; }
  `],
})
export class AccountingPeriodComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  auth = inject(AuthService);

  loading = signal(true);
  calLoading = signal(false);
  busy = signal(false);
  status = signal<any | null>(null);
  days = signal<any[]>([]);
  eodResult = signal<any | null>(null);

  showEod = signal(false);
  showReopen = signal(false);
  showAudit = signal(false);
  auditLoading = signal(false);
  audit = signal<any[]>([]);

  reopen: any = { date: '', reason: '' };
  cursor = new Date();

  weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  legend = [
    { tone: 'green', label: 'Open' },
    { tone: 'gray', label: 'Closed' },
    { tone: 'blue', label: 'Future' },
    { tone: 'orange', label: 'Processing' },
  ];

  ngOnInit() { this.loadStatus(); this.loadCalendar(); }

  loadStatus() {
    this.loading.set(true);
    this.api.get('/accounting/period/status').subscribe({
      next: r => { this.status.set(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.error('Could not load the accounting period.'); },
    });
  }

  // ── Calendar ────────────────────────────────────────────────────────────
  private monthBounds(): { from: string; to: string } {
    const y = this.cursor.getFullYear(), m = this.cursor.getMonth();
    const pad = (n: number) => String(n).padStart(2, '0');
    const last = new Date(y, m + 1, 0).getDate();
    return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last)}` };
  }
  monthLabel(): string {
    return this.cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  shiftMonth(delta: number) {
    this.cursor = new Date(this.cursor.getFullYear(), this.cursor.getMonth() + delta, 1);
    this.loadCalendar();
  }
  loadCalendar() {
    this.calLoading.set(true);
    this.api.get('/accounting/calendar', this.monthBounds()).subscribe({
      next: r => { this.days.set(r.data?.days || []); this.calLoading.set(false); },
      error: () => this.calLoading.set(false),
    });
  }
  /** Monday-first offset so the 1st sits under the right weekday. */
  leadingBlanks(): number[] {
    const first = this.days()[0];
    if (!first) return [];
    const dow = new Date(first.business_date + 'T00:00:00').getDay(); // 0=Sun
    const mondayFirst = (dow + 6) % 7;
    return Array.from({ length: mondayFirst }, (_, i) => i);
  }
  dayNum(d: string): string { return String(parseInt(d.slice(-2), 10)); }
  toneOf(status: string): string {
    return ({ open: 'green', closed: 'gray', future: 'blue', processing: 'orange' } as any)[status] ?? 'gray';
  }
  behind(s: any): string {
    const a = new Date(s.accounting_date + 'T00:00:00').getTime();
    const b = new Date(s.server_date + 'T00:00:00').getTime();
    const d = Math.round((b - a) / 86400000);
    return d > 0 ? `Books are ${d} day(s) behind` : 'Ahead of the books';
  }
  pickDay(d: any) {
    if (d.status === 'closed' && this.status()?.can?.reopen) {
      this.reopen = { date: d.business_date, reason: '' };
      this.showReopen.set(true);
      return;
    }
    this.toast.info(`${d.business_date} — ${d.status_label}${d.derived ? ' (not yet recorded)' : ''}`);
  }

  // ── EOD ─────────────────────────────────────────────────────────────────
  validate() {
    this.busy.set(true);
    this.eodResult.set(null);
    this.api.post('/accounting/eod/run', { dry_run: true }).subscribe({
      next: r => { this.busy.set(false); this.eodResult.set(r.data); },
      error: e => { this.busy.set(false); this.eodResult.set(e.error?.data ?? null); this.toast.error(e.error?.message || 'Validation failed'); },
    });
  }
  confirmEod() { this.showEod.set(true); }
  runEod() {
    this.busy.set(true);
    this.api.post('/accounting/eod/run', {}).subscribe({
      next: r => {
        this.busy.set(false); this.showEod.set(false);
        this.eodResult.set(r.data);
        this.toast.success(r.message || 'End-of-Day complete');
        this.loadStatus(); this.loadCalendar();
      },
      error: e => {
        this.busy.set(false); this.showEod.set(false);
        // A failed run still carries its step detail — show it rather than a bare toast.
        this.eodResult.set(e.error?.data ?? null);
        this.toast.error(e.error?.message || 'End-of-Day failed');
        this.loadStatus();
      },
    });
  }
  resultTitle(r: any): string {
    return ({
      completed: 'End-of-Day completed',
      failed: 'End-of-Day aborted — the date is still open',
      would_succeed: 'Validation passed — End-of-Day can run',
      would_fail: 'Validation found problems',
    } as any)[r.status] ?? r.status;
  }
  stepLabel(s: string): string {
    return ({
      validate_trial_balance: 'Validate trial balance',
      generate_gl_summaries: 'Generate GL summaries',
      run_overdue_check: 'Overdue detection & penalties',
      run_investment_accrual: 'Investment interest accrual',
      run_month_end_accrual: 'Month-end interest accrual',
      generate_reports: 'Generate reports',
      backup: 'Backup',
      unexpected_error: 'Unexpected error',
    } as any)[s] ?? s;
  }

  // ── Reopen ──────────────────────────────────────────────────────────────
  openReopen() { this.reopen = { date: '', reason: '' }; this.showReopen.set(true); }
  submitReopen() {
    if (!this.reopen.date) { this.toast.error('Pick the business date to reopen.'); return; }
    if (!this.reopen.reason?.trim()) { this.toast.error('A reason is required.'); return; }
    this.busy.set(true);
    this.api.post('/accounting/period/reopen', this.reopen).subscribe({
      next: r => {
        this.busy.set(false); this.showReopen.set(false);
        this.toast.success(r.message || 'Period reopened');
        this.loadStatus(); this.loadCalendar();
      },
      error: e => { this.busy.set(false); this.toast.error(e.error?.message || 'Could not reopen the period'); },
    });
  }

  // ── Audit log ───────────────────────────────────────────────────────────
  loadAudit() {
    this.auditLoading.set(true);
    this.api.get('/accounting/posting-audit', { per_page: 100 }).subscribe({
      next: r => { this.audit.set(r.data || []); this.auditLoading.set(false); },
      error: () => { this.auditLoading.set(false); this.toast.error('Could not load the posting log.'); },
    });
  }
}
