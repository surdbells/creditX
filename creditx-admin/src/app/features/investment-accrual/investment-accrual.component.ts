import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { SearchableSelectDirective } from '../../shared/directives/searchable-select.directive';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

/**
 * Investment Interest Run — recognise interest on every active investment up
 * to a date. Preview computes and posts nothing; Run posts the journals.
 *
 * The run is all-or-nothing: if one investment fails (usually an unmapped GL)
 * the whole batch aborts and names it, because a half-applied interest run is
 * far harder to reconcile than a failed one.
 *
 * Gated by investments.interest.
 */
@Component({
  selector: 'app-investment-accrual',
  standalone: true,
  imports: [SearchableSelectDirective, CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, MoneyPipe],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Investment Interest Run"
        subtitle="Recognise interest on active investments — preview first, then post"
        eyebrow="Investments"></cx-page-header>

      <div class="cx-card cx-ia-controls">
        <div class="cx-ia-fields">
          <div>
            <label class="cx-label">Accrue up to</label>
            <input class="cx-input" type="date" [(ngModel)]="asOf" />
            <div class="cx-field-hint">Every period boundary on or before this date is recognised.</div>
          </div>
          <div>
            <label class="cx-label">Settlement Account *</label>
            <select class="cx-select" [(ngModel)]="settlementGlId">
              <option value="">Select bank/cash account…</option>
              @for (g of settlementAccounts(); track g.id) {
                <option [value]="g.id">{{ g.account_code }} — {{ g.account_name }}</option>
              }
            </select>
            <div class="cx-field-hint">Periodic-payout investments pay interest out of this account.</div>
          </div>
        </div>
        <div class="cx-ia-actions">
          <button class="cx-btn cx-btn-outline" (click)="preview()" [disabled]="loading() || running()">
            <lucide-icon [name]="loading() ? 'loader-2' : 'search'" [size]="15" [class.cx-ia-spin]="loading()"></lucide-icon>
            <span>{{ loading() ? 'Computing…' : 'Preview' }}</span>
          </button>
          @if (auth.hasPermission('investments.interest')) {
            <button class="cx-btn cx-btn-primary" (click)="run()"
                    [disabled]="running() || loading() || !previewed() || (result()?.investments || 0) === 0">
              <lucide-icon [name]="running() ? 'loader-2' : 'play'" [size]="15" [class.cx-ia-spin]="running()"></lucide-icon>
              <span>{{ running() ? 'Posting…' : 'Run & Post' }}</span>
            </button>
          }
        </div>
      </div>

      @if (result(); as r) {
        <div class="cx-ia-kpis">
          <div class="cx-ia-kpi"><span>Investments</span><strong class="tabular-nums">{{ r.investments }}</strong></div>
          <div class="cx-ia-kpi"><span>Periods</span><strong class="tabular-nums">{{ r.periods }}</strong></div>
          <div class="cx-ia-kpi is-accent"><span>Gross interest</span><strong class="tabular-nums">{{ r.gross | money:2 }}</strong></div>
          <div class="cx-ia-kpi"><span>WHT withheld</span><strong class="tabular-nums">{{ r.wht | money:2 }}</strong></div>
          <div class="cx-ia-kpi"><span>Net to investors</span><strong class="tabular-nums">{{ r.net | money:2 }}</strong></div>
        </div>

        @if (r.preview) {
          <p class="cx-ia-note">
            <lucide-icon name="info" [size]="14"></lucide-icon>
            <span>Preview only — nothing has been posted. Review the lines below, then <strong>Run &amp; Post</strong>.</span>
          </p>
        } @else {
          <p class="cx-ia-note is-done">
            <lucide-icon name="check-circle" [size]="14"></lucide-icon>
            <span>Posted. The journals are on the ledger and each investment's balance is updated.</span>
          </p>
        }

        <div class="cx-card cx-ia-table-wrap">
          <table class="cx-ia-table">
            <thead>
              <tr>
                <th>Investment</th><th>Investor</th><th>Payout</th>
                <th class="right">Periods</th><th class="right">Gross</th>
                <th class="right">WHT</th><th class="right">Net</th><th class="right">Balance after</th>
              </tr>
            </thead>
            <tbody>
              @for (l of r.lines; track l.investment_id) {
                <tr>
                  <td class="cx-ia-mono">{{ l.investment_number }}</td>
                  <td>{{ l.customer_name }}</td>
                  <td>{{ payoutLabel(l.payout_mode) }}</td>
                  <td class="right tabular-nums">{{ l.periods }}</td>
                  <td class="right tabular-nums">{{ l.gross | money:2 }}</td>
                  <td class="right tabular-nums">{{ l.wht | money:2 }}</td>
                  <td class="right tabular-nums">{{ l.net | money:2 }}</td>
                  <td class="right tabular-nums">{{ l.balance_after | money:2 }}</td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="cx-ia-empty">Nothing to accrue up to this date.</td></tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (!loading()) {
        <div class="cx-card cx-ia-idle">
          <lucide-icon name="trending-up" [size]="28"></lucide-icon>
          <p>Pick a date and settlement account, then preview the run.</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .cx-ia-controls { padding: 16px 18px; display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; justify-content: space-between; }
    .cx-ia-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; flex: 1; min-width: 260px; }
    .cx-ia-actions { display: flex; gap: 8px; }
    .cx-ia-spin { animation: cx-ia-spin 1s linear infinite; }
    @keyframes cx-ia-spin { to { transform: rotate(360deg); } }

    .cx-ia-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 16px 0; }
    .cx-ia-kpi { padding: 12px 14px; background: var(--cx-surface); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-xl); }
    .cx-ia-kpi span { display: block; font-size: 11px; color: var(--cx-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .cx-ia-kpi strong { display: block; font-size: 20px; font-weight: 700; margin-top: 4px; }
    .cx-ia-kpi.is-accent strong { color: var(--cx-primary-600); }

    .cx-ia-note { display: flex; gap: 8px; align-items: center; font-size: 13px; padding: 10px 13px; margin: 0 0 14px;
      border-radius: var(--cx-radius-lg, 10px); background: var(--cx-surface-2, var(--cx-stone-100)); color: var(--cx-text-secondary); }
    .cx-ia-note.is-done { background: color-mix(in srgb, var(--cx-success) 10%, transparent); color: var(--cx-success); }

    .cx-ia-table-wrap { overflow-x: auto; padding: 4px; }
    .cx-ia-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .cx-ia-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em;
      color: var(--cx-text-muted); padding: 9px 10px; border-bottom: 1px solid var(--cx-border); white-space: nowrap; }
    .cx-ia-table td { padding: 9px 10px; border-bottom: 1px solid var(--cx-border); }
    .cx-ia-table tr:last-child td { border-bottom: none; }
    .cx-ia-table .right { text-align: right; }
    .cx-ia-mono { font-family: var(--cx-font-mono, ui-monospace, monospace); font-size: 12px; }
    .cx-ia-empty { text-align: center; color: var(--cx-text-muted); padding: 26px 0; }

    .cx-ia-idle { text-align: center; color: var(--cx-text-muted); padding: 44px 12px; }
    .cx-ia-idle p { margin-top: 10px; font-size: 13px; }
  `],
})
export class InvestmentAccrualComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  auth = inject(AuthService);

  asOf = new Date().toISOString().slice(0, 10);
  settlementGlId = '';
  settlementAccounts = signal<any[]>([]);

  loading = signal(false);
  running = signal(false);
  previewed = signal(false);
  result = signal<any | null>(null);

  ngOnInit() {
    this.api.get('/gl-accounts', { account_type: 'asset', per_page: 100, sort_by: 'account_code', sort_dir: 'ASC' }).subscribe({
      next: r => this.settlementAccounts.set((r.data || []).filter((g: any) => g.is_active)),
      error: () => {},
    });
  }

  payoutLabel(v: string): string {
    return ({ at_maturity: 'At maturity', periodic: 'Periodic', compounded: 'Compounded' } as any)[v] ?? v;
  }

  preview() {
    if (!this.settlementGlId) { this.toast.error('Select a settlement account.'); return; }
    this.loading.set(true);
    this.result.set(null);
    this.previewed.set(false);
    this.api.get('/investments/accrual/preview', { as_of: this.asOf, settlement_gl_id: this.settlementGlId }).subscribe({
      next: r => { this.result.set(r.data); this.previewed.set(true); this.loading.set(false); },
      error: e => { this.loading.set(false); this.toast.error(e.error?.message || 'Preview failed'); },
    });
  }

  run() {
    if (!this.settlementGlId) { this.toast.error('Select a settlement account.'); return; }
    const n = this.result()?.investments ?? 0;
    if (!confirm(`Post interest for ${n} investment(s) up to ${this.asOf}? This writes to the ledger.`)) return;

    this.running.set(true);
    this.api.post('/investments/accrual/run', { as_of: this.asOf, settlement_gl_id: this.settlementGlId }).subscribe({
      next: r => {
        this.running.set(false);
        this.result.set(r.data);
        this.previewed.set(false);
        this.toast.success(r.message || 'Interest posted');
      },
      error: e => { this.running.set(false); this.toast.error(e.error?.message || 'Run failed'); },
    });
  }
}
