import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

/**
 * Accounts Payable — vendors, bills, approve/pay, and AP aging.
 * Reads gated by accounting.view; writes by accounting.journal.
 */
@Component({
  selector: 'app-accounts-payable',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, MoneyPipe],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Accounts Payable"
        subtitle="Vendors, bills, payments, and AP aging"
        eyebrow="Accounting"></cx-page-header>

      <div class="cx-ap-tabs">
        <button class="cx-ap-tab" [class.on]="tab() === 'bills'" (click)="tab.set('bills')">Bills</button>
        <button class="cx-ap-tab" [class.on]="tab() === 'vendors'" (click)="tab.set('vendors')">Vendors</button>
        <button class="cx-ap-tab" [class.on]="tab() === 'aging'" (click)="loadAging()">Aging</button>
      </div>

      @if (tab() === 'bills') {
        @if (auth.hasPermission('accounting.journal')) {
          <div class="cx-ap-new">
            <select class="cx-select" [(ngModel)]="billForm.vendor_id">
              <option [ngValue]="''" disabled>Vendor…</option>
              @for (v of vendors(); track v.id) { <option [ngValue]="v.id">{{ v.name }}</option> }
            </select>
            <input class="cx-input" [(ngModel)]="billForm.bill_number" placeholder="Bill #" />
            <input type="date" class="cx-input" [(ngModel)]="billForm.bill_date" />
            <input type="date" class="cx-input" [(ngModel)]="billForm.due_date" />
            <input class="cx-input cx-ap-narrow" [(ngModel)]="billForm.expense_gl_code" placeholder="Expense GL (e.g. RENT)" />
            <input type="number" class="cx-input cx-ap-narrow" [(ngModel)]="billForm.amount" placeholder="Amount" />
            <button class="cx-btn cx-btn-primary" (click)="createBill()" [disabled]="busy()">
              <lucide-icon name="plus" [size]="14"></lucide-icon><span>Capture</span></button>
          </div>
        }
        <div class="cx-ap-table-wrap">
          <table class="cx-ap-table">
            <thead><tr><th>Bill #</th><th>Vendor</th><th>Due</th><th class="r">Amount</th><th class="r">Outstanding</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @if (bills().length === 0) { <tr><td colspan="7" class="cx-ap-state">No bills.</td></tr> }
              @for (b of bills(); track b.id) {
                <tr>
                  <td class="tabular-nums">{{ b.bill_number }}</td>
                  <td>{{ b.vendor_name }}</td>
                  <td class="tabular-nums">{{ b.due_date }}</td>
                  <td class="r tabular-nums">{{ b.amount | money:2 }}</td>
                  <td class="r tabular-nums">{{ b.outstanding | money:2 }}</td>
                  <td><span class="cx-ap-badge" [class.paid]="b.status === 'paid'" [class.part]="b.status === 'partially_paid'">{{ pretty(b.status) }}</span></td>
                  <td class="r">
                    @if (auth.hasPermission('accounting.journal')) {
                      @if (b.status === 'draft') { <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="approve(b)">Approve</button> }
                      @if (b.status === 'approved' || b.status === 'partially_paid') { <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="openPay(b)">Pay</button> }
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (tab() === 'vendors') {
        @if (auth.hasPermission('accounting.journal')) {
          <div class="cx-ap-new">
            <input class="cx-input" [(ngModel)]="vendorForm.name" placeholder="Vendor name" />
            <input class="cx-input" [(ngModel)]="vendorForm.contact_email" placeholder="Email" />
            <input class="cx-input" [(ngModel)]="vendorForm.bank_account" placeholder="Bank account" />
            <input class="cx-input" [(ngModel)]="vendorForm.bank_name" placeholder="Bank name" />
            <button class="cx-btn cx-btn-primary" (click)="createVendor()" [disabled]="busy()">
              <lucide-icon name="plus" [size]="14"></lucide-icon><span>Add</span></button>
          </div>
        }
        <div class="cx-ap-table-wrap">
          <table class="cx-ap-table">
            <thead><tr><th>Code</th><th>Name</th><th>Email</th><th>Bank</th><th>Account</th></tr></thead>
            <tbody>
              @if (vendors().length === 0) { <tr><td colspan="5" class="cx-ap-state">No vendors.</td></tr> }
              @for (v of vendors(); track v.id) {
                <tr><td class="tabular-nums">{{ v.code }}</td><td>{{ v.name }}</td><td>{{ v.contact_email || '—' }}</td>
                  <td>{{ v.bank_name || '—' }}</td><td class="tabular-nums">{{ v.bank_account || '—' }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Pay modal (with optional WHT) -->
      @if (payTarget(); as b) {
        <div class="cx-ap-modal-backdrop" (click)="payTarget.set(null)">
          <div class="cx-ap-modal" (click)="$event.stopPropagation()">
            <h3 class="cx-ap-modal-title">Pay {{ b.vendor_name }} — #{{ b.bill_number }}</h3>
            <label class="cx-label">Amount to settle (outstanding {{ b.outstanding | money:2 }})</label>
            <input type="number" class="cx-input" [(ngModel)]="payForm.amount" />
            <label class="cx-label">Withholding tax (optional)</label>
            <select class="cx-select" [(ngModel)]="payForm.wht_rate_code">
              <option [ngValue]="''">No WHT</option>
              @for (r of whtRates(); track r.id) { <option [ngValue]="r.code">{{ r.name }} ({{ r.rate_pct }}%)</option> }
            </select>
            <div class="cx-ap-net">
              WHT: <span class="tabular-nums">{{ whtAmount() | money:2 }}</span> ·
              Net to vendor: <span class="tabular-nums">{{ netAmount() | money:2 }}</span>
            </div>
            <div class="cx-ap-modal-actions">
              <button class="cx-btn cx-btn-ghost" (click)="payTarget.set(null)">Cancel</button>
              <button class="cx-btn cx-btn-primary" (click)="submitPay()" [disabled]="busy()">Post Payment</button>
            </div>
          </div>
        </div>
      }

      @if (tab() === 'aging' && aging(); as a) {
        <div class="cx-ap-aging">
          <div><div class="cx-ap-al">Current</div><div class="cx-ap-av tabular-nums">{{ a.buckets.current | money:2 }}</div></div>
          <div><div class="cx-ap-al">1–30</div><div class="cx-ap-av tabular-nums">{{ a.buckets['1_30'] | money:2 }}</div></div>
          <div><div class="cx-ap-al">31–60</div><div class="cx-ap-av tabular-nums">{{ a.buckets['31_60'] | money:2 }}</div></div>
          <div><div class="cx-ap-al">61–90</div><div class="cx-ap-av tabular-nums">{{ a.buckets['61_90'] | money:2 }}</div></div>
          <div><div class="cx-ap-al">Over 90</div><div class="cx-ap-av tabular-nums">{{ a.buckets.over_90 | money:2 }}</div></div>
          <div><div class="cx-ap-al">Total</div><div class="cx-ap-av tabular-nums">{{ a.total_outstanding | money:2 }}</div></div>
        </div>
      }
    </div>
  `,
  styles: [`
    .cx-ap-tabs { display: flex; gap: 6px; margin-bottom: 14px; }
    .cx-ap-tab { padding: 7px 14px; border: 1px solid var(--cx-border); background: var(--cx-surface); border-radius: var(--cx-radius-md);
      font-size: 13px; cursor: pointer; color: var(--cx-text-secondary); }
    .cx-ap-tab.on { background: var(--cx-primary-600); color: #fff; border-color: var(--cx-primary-600); }
    .cx-ap-new { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; padding: 12px 14px;
      background: var(--cx-surface-2); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-xl, 12px); }
    .cx-ap-narrow { max-width: 130px; }
    .cx-ap-table-wrap { background: var(--cx-surface); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-xl, 12px); overflow: hidden; }
    .cx-ap-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .cx-ap-table th { text-align: left; padding: 9px 12px; background: var(--cx-surface-2); font-size: 10px; font-weight: 600;
      letter-spacing: .06em; text-transform: uppercase; color: var(--cx-text-muted); border-bottom: 1px solid var(--cx-border); }
    .cx-ap-table th.r, .cx-ap-table td.r { text-align: right; }
    .cx-ap-table td { padding: 9px 12px; border-bottom: 1px solid var(--cx-border-subtle); }
    .cx-ap-table tbody tr:last-child td { border-bottom: none; }
    .cx-ap-state { padding: 28px; text-align: center; color: var(--cx-text-muted); }
    .cx-ap-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;
      background: var(--cx-surface-2); color: var(--cx-text-muted); }
    .cx-ap-badge.paid { background: #f0fdf4; color: #166534; }
    .cx-ap-badge.part { background: #fffbeb; color: #b45309; }
    .cx-ap-aging { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px;
      padding: 14px 16px; background: var(--cx-surface); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-md); }
    .cx-ap-al { font-size: 10px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--cx-text-muted); }
    .cx-ap-av { font-size: 15px; font-weight: 600; }
    @media (max-width: 800px) { .cx-ap-aging { grid-template-columns: repeat(3, 1fr); } }

    .cx-ap-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 50; }
    .cx-ap-modal { background: var(--cx-surface); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-xl, 12px);
      padding: 20px; width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 8px; }
    .cx-ap-modal-title { font-size: 15px; font-weight: 600; margin: 0 0 6px; }
    .cx-ap-net { font-size: 13px; color: var(--cx-text-secondary); margin-top: 6px; }
    .cx-ap-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  `],
})
export class AccountsPayableComponent {
  tab = signal<'bills' | 'vendors' | 'aging'>('bills');
  vendors = signal<any[]>([]);
  bills = signal<any[]>([]);
  aging = signal<any>(null);
  busy = signal(false);
  vendorForm: any = { name: '', contact_email: '', bank_account: '', bank_name: '' };
  billForm: any = { vendor_id: '', bill_number: '', bill_date: new Date().toISOString().slice(0, 10), due_date: new Date().toISOString().slice(0, 10), expense_gl_code: 'GENADMIN', amount: 0 };

  // Pay modal + WHT
  whtRates = signal<any[]>([]);
  payTarget = signal<any>(null);
  payForm: any = { amount: 0, wht_rate_code: '' };
  whtAmount = computed(() => {
    const code = this.payForm.wht_rate_code;
    const rate = this.whtRates().find(r => r.code === code);
    const amt = Number(this.payForm.amount) || 0;
    return rate ? +(amt * Number(rate.rate)).toFixed(2) : 0;
  });
  netAmount = computed(() => +((Number(this.payForm.amount) || 0) - this.whtAmount()).toFixed(2));

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {
    this.loadVendors();
    this.loadBills();
    this.loadWhtRates();
  }

  loadWhtRates() {
    this.api.get('/accounting/tax/rates', {}).subscribe({
      next: r => this.whtRates.set((r.data?.rates || []).filter((x: any) => x.type === 'WHT')),
      error: () => {},
    });
  }

  pretty(s: string): string {
    return { draft: 'Draft', approved: 'Approved', partially_paid: 'Part Paid', paid: 'Paid', void: 'Void' }[s] ?? s;
  }

  loadVendors() { this.api.get('/accounting/vendors', { limit: 300 }).subscribe({ next: r => this.vendors.set(r.data?.vendors || []), error: () => {} }); }
  loadBills() { this.api.get('/accounting/bills', { limit: 300 }).subscribe({ next: r => this.bills.set(r.data?.bills || []), error: () => {} }); }
  loadAging() { this.tab.set('aging'); this.api.get('/reports/ap-aging', {}).subscribe({ next: r => this.aging.set(r.data), error: e => this.toast.error(e.error?.message || 'Failed') }); }

  createVendor() {
    this.busy.set(true);
    this.api.post('/accounting/vendors', this.vendorForm).subscribe({
      next: () => { this.busy.set(false); this.toast.success('Vendor added'); this.vendorForm.name = ''; this.loadVendors(); },
      error: e => { this.busy.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }

  createBill() {
    this.busy.set(true);
    this.api.post('/accounting/bills', this.billForm).subscribe({
      next: () => { this.busy.set(false); this.toast.success('Bill captured'); this.billForm.amount = 0; this.billForm.bill_number = ''; this.loadBills(); },
      error: e => { this.busy.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }

  approve(b: any) {
    this.api.post(`/accounting/bills/${b.id}/approve`, {}).subscribe({
      next: () => { this.toast.success('Approved'); this.loadBills(); },
      error: e => this.toast.error(e.error?.message || 'Approve failed'),
    });
  }

  openPay(b: any) {
    this.payForm = { amount: Number(b.outstanding) || 0, wht_rate_code: '' };
    this.payTarget.set(b);
  }

  submitPay() {
    const b = this.payTarget();
    if (!b) return;
    this.busy.set(true);
    this.api.post(`/accounting/bills/${b.id}/pay`, {
      amount: this.payForm.amount,
      wht_rate_code: this.payForm.wht_rate_code || null,
      payment_date: new Date().toISOString().slice(0, 10),
    }).subscribe({
      next: () => { this.busy.set(false); this.payTarget.set(null); this.toast.success('Payment posted'); this.loadBills(); },
      error: e => { this.busy.set(false); this.toast.error(e.error?.message || 'Payment failed'); },
    });
  }
}
