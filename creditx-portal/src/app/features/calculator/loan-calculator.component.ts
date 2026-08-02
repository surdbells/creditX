import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PortalService } from '../../core/services/portal.service';
import { ToastService } from '../../core/services/toast.service';
import { LoanProduct } from '../../core/models';
import { SearchableSelectDirective } from '../../shared/directives/searchable-select.directive';
import { AuthShell } from '../auth/auth-shell';
import { money } from '../../shared/format';

/**
 * Public loan calculator — reachable at /calculator BEFORE authentication.
 * Prospective customers pick a product, enter an amount and tenure, and see
 * the authoritative repayment estimate (monthly, total, net disbursed, fees)
 * computed by the same backend service the authenticated apply flow uses.
 * No customer token required; the two endpoints it calls are public.
 */
@Component({
  selector: 'app-loan-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, AuthShell, SearchableSelectDirective],
  template: `
    <app-auth-shell
      title="Loan calculator"
      subtitle="Estimate your repayments before you apply — no sign-in needed."
    >
      @if (loadingProducts()) {
        <div class="flex items-center justify-center py-8" style="color: var(--cx-text-muted)">
          <lucide-icon name="loader-2" [size]="20" class="animate-spin"></lucide-icon>
        </div>
      } @else if (products().length === 0) {
        <div class="cx-alert cx-alert-info">
          <p class="font-semibold mb-1" style="color: var(--cx-text)">No products available</p>
          <p class="text-sm" style="color: var(--cx-text-muted)">There are no loan products open right now. Please check back later.</p>
        </div>
      } @else {
        <form (ngSubmit)="calculate()" class="cx-form-stack">
          <div>
            <label class="cx-label" for="product">Loan product</label>
            <select id="product" name="product" class="cx-select" [(ngModel)]="productId" (ngModelChange)="onProductChange()" required>
              <option [ngValue]="null" disabled>Select a product</option>
              @for (p of products(); track p.id) {
                <option [ngValue]="p.id">{{ p.name }}</option>
              }
            </select>
            @if (selected(); as p) {
              <p class="text-xs mt-1.5" style="color: var(--cx-text-muted)">
                Amount {{ money(p.min_amount) }} – {{ money(p.max_amount) }} ·
                Tenure {{ p.min_tenure }}–{{ p.max_tenure }} months
                @if (p.interest_rate != null) { · {{ p.interest_rate }}% }
              </p>
            }
          </div>

          <div>
            <label class="cx-label" for="amount">Amount (₦)</label>
            <input id="amount" name="amount" type="number" class="cx-input" placeholder="e.g. 500000"
              [(ngModel)]="amount" [min]="selected()?.min_amount ?? null" [max]="selected()?.max_amount ?? null" required />
          </div>

          <div>
            <label class="cx-label" for="tenure">Tenure (months)</label>
            <input id="tenure" name="tenure" type="number" class="cx-input" placeholder="e.g. 12"
              [(ngModel)]="tenure" [min]="selected()?.min_tenure ?? null" [max]="selected()?.max_tenure ?? null" required />
          </div>

          <button type="submit" class="cx-btn cx-btn-primary cx-btn-lg cx-btn-block" [disabled]="calculating()">
            @if (calculating()) { <lucide-icon name="loader-2" [size]="17" class="animate-spin"></lucide-icon> }
            Calculate
          </button>
        </form>

        @if (result(); as r) {
          <div class="cx-calc-result mt-6">
            <div class="cx-calc-headline">
              <span class="cx-calc-headline-label">Monthly repayment</span>
              <span class="cx-calc-headline-value tabular-nums">{{ money(r.mr_principal_interest) }}</span>
            </div>

            <div class="cx-calc-rows">
              <div class="cx-calc-row">
                <span>Total repayment</span>
                <span class="tabular-nums">{{ money(r.tr_principal_interest) }}</span>
              </div>
              <div class="cx-calc-row">
                <span>Net amount you receive</span>
                <span class="tabular-nums">{{ money(r.net_disbursed) }}</span>
              </div>
              <div class="cx-calc-row">
                <span>Gross loan</span>
                <span class="tabular-nums">{{ money(r.gross_loan) }}</span>
              </div>
              <div class="cx-calc-row">
                <span>Total fees</span>
                <span class="tabular-nums">{{ money(r.total_fees) }}</span>
              </div>
              @for (f of r.fee_details || []; track f.fee_type_id) {
                <div class="cx-calc-row cx-calc-row-sub">
                  <span>{{ f.fee_type_name }}</span>
                  <span class="tabular-nums">{{ money(f.amount) }}</span>
                </div>
              }
            </div>

            <p class="text-xs mt-4" style="color: var(--cx-text-muted)">
              This is an estimate for guidance only. Final figures are confirmed when your application is reviewed.
            </p>

            <a routerLink="/auth/register" class="cx-btn cx-btn-primary cx-btn-block mt-4">Apply for this loan</a>
          </div>
        }
      }

      <p class="text-center text-sm mt-6" style="color: var(--cx-text-secondary)">
        Ready to apply?
        <a routerLink="/auth/login" class="font-semibold" style="color: var(--cx-primary-600)">Sign in</a>
        or
        <a routerLink="/auth/register" class="font-semibold" style="color: var(--cx-primary-600)">create an account</a>
      </p>
    </app-auth-shell>
  `,
  styles: [`
    .cx-calc-result {
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl, 14px);
      background: var(--cx-surface-2, var(--cx-surface));
      padding: 18px;
    }
    .cx-calc-headline {
      display: flex; flex-direction: column; gap: 2px;
      padding-bottom: 14px; margin-bottom: 12px;
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-calc-headline-label {
      font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em;
      color: var(--cx-text-muted); font-weight: 600;
    }
    .cx-calc-headline-value { font-size: 26px; font-weight: 700; color: var(--cx-primary-600); }
    .cx-calc-rows { display: flex; flex-direction: column; gap: 8px; }
    .cx-calc-row {
      display: flex; justify-content: space-between; align-items: baseline;
      font-size: 14px; color: var(--cx-text);
    }
    .cx-calc-row > span:first-child { color: var(--cx-text-secondary); }
    .cx-calc-row-sub { font-size: 12.5px; padding-left: 12px; }
    .cx-calc-row-sub > span { color: var(--cx-text-muted) !important; }
  `],
})
export class LoanCalculatorComponent {
  private portal = inject(PortalService);
  private toast = inject(ToastService);

  money = money;

  products = signal<LoanProduct[]>([]);
  loadingProducts = signal(true);
  calculating = signal(false);
  result = signal<any | null>(null);

  productId: string | null = null;
  amount: number | null = null;
  tenure: number | null = null;

  /**
   * The chosen product.
   *
   * A METHOD, not a computed(). productId is a plain property driven by
   * [(ngModel)], and computed() only re-evaluates when a SIGNAL it read
   * changes — so as a computed this evaluated once (while productId was still
   * null), never updated when the user picked a product, and left calculate()
   * reporting "select a product and enter an amount and tenure" no matter what
   * had been filled in.
   */
  selected(): LoanProduct | null {
    return this.products().find(p => p.id === this.productId) ?? null;
  }

  constructor() {
    this.portal.calculatorProducts().subscribe({
      next: res => {
        this.products.set(res.data ?? []);
        this.loadingProducts.set(false);
      },
      error: () => {
        this.loadingProducts.set(false);
        this.toast.error('Could not load loan products.');
      },
    });
  }

  onProductChange(): void {
    this.amount = null;
    this.tenure = null;
    this.result.set(null);
  }

  calculate(): void {
    const p = this.selected();
    if (!p || this.productId == null || this.amount == null || this.tenure == null) {
      this.toast.error('Please select a product and enter an amount and tenure.');
      return;
    }
    if (this.amount <= 0 || this.tenure <= 0) {
      this.toast.error('Amount and tenure must be greater than zero.');
      return;
    }

    this.calculating.set(true);
    this.portal.calculate({ product_id: this.productId, amount: this.amount, tenure: this.tenure }).subscribe({
      next: res => {
        this.result.set(res.data ?? null);
        this.calculating.set(false);
      },
      error: err => {
        this.calculating.set(false);
        const errors = err?.error?.errors;
        const msg = errors ? Object.values(errors)[0] as string : (err?.error?.message || 'Could not calculate. Check your inputs.');
        this.toast.error(msg);
      },
    });
  }
}
