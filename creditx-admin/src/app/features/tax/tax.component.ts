import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { SearchableSelectDirective } from '../../shared/directives/searchable-select.directive';

/**
 * Tax (VAT/WHT) — rates config, raise a tax liability/reclaim, remit, and a
 * tax summary. Reads gated by accounting.view; writes by accounting.journal.
 */
@Component({
  selector: 'app-tax',
  standalone: true,
  imports: [SearchableSelectDirective, CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, MoneyPipe],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Tax (VAT / WHT)" subtitle="Configure rates, record tax, remit, and report" eyebrow="Accounting"></cx-page-header>

      <!-- Summary -->
      @if (summary(); as s) {
        <div class="cx-tx-summary">
          <div><div class="cx-tx-l">Output VAT</div><div class="cx-tx-v tabular-nums">{{ s.by_kind.VAT_OUTPUT | money:2 }}</div></div>
          <div><div class="cx-tx-l">Input VAT</div><div class="cx-tx-v tabular-nums">{{ s.by_kind.VAT_INPUT | money:2 }}</div></div>
          <div><div class="cx-tx-l">WHT</div><div class="cx-tx-v tabular-nums">{{ s.by_kind.WHT | money:2 }}</div></div>
          <div><div class="cx-tx-l">Net Payable</div><div class="cx-tx-v tabular-nums">{{ s.net_payable | money:2 }}</div></div>
          <div><div class="cx-tx-l">Tax Payable (GL)</div><div class="cx-tx-v tabular-nums">{{ s.taxpay_balance | money:2 }}</div></div>
        </div>
      }

      @if (auth.hasPermission('accounting.journal')) {
        <!-- Record tax -->
        <div class="cx-tx-new">
          <select class="cx-select" [(ngModel)]="rec.kind">
            <option value="VAT_OUTPUT">Output VAT</option>
            <option value="VAT_INPUT">Input VAT (reclaim)</option>
            <option value="WHT">WHT</option>
          </select>
          <select class="cx-select" [(ngModel)]="rec.rate_code">
            <option [ngValue]="''" disabled>Rate…</option>
            @for (r of rates(); track r.id) { <option [ngValue]="r.code">{{ r.name }} ({{ r.rate_pct }}%)</option> }
          </select>
          <input type="number" class="cx-input cx-tx-narrow" [(ngModel)]="rec.base_amount" placeholder="Base amount" />
          <input class="cx-input cx-tx-narrow" [(ngModel)]="rec.counterpart_gl_code" placeholder="Counterpart GL" />
          <input class="cx-input cx-tx-narrow" [(ngModel)]="rec.party" placeholder="Party" />
          <button class="cx-btn cx-btn-primary" (click)="record()" [disabled]="busy()">
            <lucide-icon name="plus" [size]="14"></lucide-icon><span>Record</span></button>
          <button class="cx-btn cx-btn-outline" (click)="remit()" [disabled]="busy()">
            <lucide-icon name="banknote" [size]="14"></lucide-icon><span>Remit</span></button>
        </div>
      }

      <div class="cx-tx-cols">
        <div>
          <h3 class="cx-tx-h">Transactions</h3>
          <div class="cx-tx-table-wrap">
            <table class="cx-tx-table">
              <thead><tr><th>Date</th><th>Kind</th><th class="r">Base</th><th class="r">Tax</th><th>Party</th></tr></thead>
              <tbody>
                @if (txns().length === 0) { <tr><td colspan="5" class="cx-tx-state">No tax transactions.</td></tr> }
                @for (t of txns(); track t.id) {
                  <tr><td class="tabular-nums">{{ t.txn_date }}</td><td>{{ t.kind }}</td>
                    <td class="r tabular-nums">{{ t.base_amount | money:2 }}</td>
                    <td class="r tabular-nums">{{ t.tax_amount | money:2 }}</td><td>{{ t.party || '—' }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 class="cx-tx-h">Rates
            @if (auth.hasPermission('accounting.journal')) {
              <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="showRate.set(!showRate())">+ Add</button>
            }
          </h3>
          @if (showRate()) {
            <div class="cx-tx-new">
              <input class="cx-input cx-tx-narrow" [(ngModel)]="rateForm.name" placeholder="Name" />
              <select class="cx-select" [(ngModel)]="rateForm.type"><option value="VAT">VAT</option><option value="WHT">WHT</option></select>
              <input type="number" step="0.0001" class="cx-input cx-tx-narrow" [(ngModel)]="rateForm.rate" placeholder="Rate (0.075)" />
              <button class="cx-btn cx-btn-primary cx-btn-sm" (click)="createRate()">Save</button>
            </div>
          }
          <div class="cx-tx-table-wrap">
            <table class="cx-tx-table">
              <thead><tr><th>Code</th><th>Name</th><th>Type</th><th class="r">Rate</th></tr></thead>
              <tbody>
                @if (rates().length === 0) { <tr><td colspan="4" class="cx-tx-state">No rates.</td></tr> }
                @for (r of rates(); track r.id) {
                  <tr><td class="tabular-nums">{{ r.code }}</td><td>{{ r.name }}</td><td>{{ r.type }}</td><td class="r tabular-nums">{{ r.rate_pct }}%</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .cx-tx-summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 14px;
      padding: 12px 16px; background: var(--cx-surface); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-md); }
    .cx-tx-l { font-size: 10px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--cx-text-muted); }
    .cx-tx-v { font-size: 15px; font-weight: 600; }
    .cx-tx-new { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; padding: 12px 14px;
      background: var(--cx-surface-2); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-xl, 12px); }
    .cx-tx-narrow { max-width: 150px; }
    .cx-tx-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    @media (max-width: 900px) { .cx-tx-cols { grid-template-columns: 1fr; } .cx-tx-summary { grid-template-columns: repeat(2, 1fr); } }
    .cx-tx-h { font-size: 13px; font-weight: 600; margin: 6px 0 8px; display: flex; justify-content: space-between; align-items: center; }
    .cx-tx-table-wrap { background: var(--cx-surface); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-xl, 12px); overflow: hidden; }
    .cx-tx-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .cx-tx-table th { text-align: left; padding: 9px 12px; background: var(--cx-surface-2); font-size: 10px; font-weight: 600;
      letter-spacing: .06em; text-transform: uppercase; color: var(--cx-text-muted); border-bottom: 1px solid var(--cx-border); }
    .cx-tx-table th.r, .cx-tx-table td.r { text-align: right; }
    .cx-tx-table td { padding: 9px 12px; border-bottom: 1px solid var(--cx-border-subtle); }
    .cx-tx-table tbody tr:last-child td { border-bottom: none; }
    .cx-tx-state { padding: 24px; text-align: center; color: var(--cx-text-muted); }
  `],
})
export class TaxComponent {
  rates = signal<any[]>([]);
  txns = signal<any[]>([]);
  summary = signal<any>(null);
  busy = signal(false);
  showRate = signal(false);
  rec: any = { kind: 'VAT_OUTPUT', rate_code: '', base_amount: 0, counterpart_gl_code: 'OTHINC', party: '' };
  rateForm: any = { name: '', type: 'VAT', rate: 0.075 };

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {
    this.loadRates(); this.loadTxns(); this.loadSummary();
  }

  loadRates() { this.api.get('/accounting/tax/rates', {}).subscribe({ next: r => this.rates.set(r.data?.rates || []), error: () => {} }); }
  loadTxns() { this.api.get('/accounting/tax/transactions', { limit: 100 }).subscribe({ next: r => this.txns.set(r.data?.transactions || []), error: () => {} }); }
  loadSummary() { this.api.get('/reports/tax-summary', {}).subscribe({ next: r => this.summary.set(r.data), error: () => {} }); }

  record() {
    this.busy.set(true);
    this.api.post('/accounting/tax/transactions', this.rec).subscribe({
      next: () => { this.busy.set(false); this.toast.success('Recorded'); this.rec.base_amount = 0; this.loadTxns(); this.loadSummary(); },
      error: e => { this.busy.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }

  remit() {
    const amount = prompt('Remit tax to authority — amount:', this.summary()?.taxpay_balance || '0');
    if (amount === null) return;
    this.busy.set(true);
    this.api.post('/accounting/tax/remit', { amount, remit_date: new Date().toISOString().slice(0, 10) }).subscribe({
      next: () => { this.busy.set(false); this.toast.success('Remitted'); this.loadSummary(); },
      error: e => { this.busy.set(false); this.toast.error(e.error?.message || 'Remit failed'); },
    });
  }

  createRate() {
    this.api.post('/accounting/tax/rates', this.rateForm).subscribe({
      next: () => { this.toast.success('Rate added'); this.showRate.set(false); this.rateForm.name = ''; this.loadRates(); },
      error: e => this.toast.error(e.error?.message || 'Failed'),
    });
  }
}
