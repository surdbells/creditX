import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PortalService } from '../../core/services/portal.service';
import { ToastService } from '../../core/services/toast.service';
import { LoanProduct } from '../../core/models';
import { money } from '../../shared/format';

@Component({
  selector: 'app-apply-loan',
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule],
  template: `
    <div class="flex flex-col gap-6 max-w-2xl">
      <div class="flex items-center gap-2 text-sm" style="color: var(--cx-text-muted)">
        <a routerLink="/loans" class="hover:underline">My loans</a>
        <lucide-icon name="chevron-right" [size]="14"></lucide-icon>
        <span style="color: var(--cx-text)">Apply</span>
      </div>

      <div>
        <h1 class="cx-heading cx-heading-lg mb-1">Apply for a loan</h1>
        <p class="text-sm" style="color: var(--cx-text-secondary)">Choose a product, enter how much you need, and submit.</p>
      </div>

      @if (loadingProducts()) {
        <div class="cx-card flex flex-col gap-3">
          @for (i of [1,2,3]; track i) { <div class="cx-skeleton h-12"></div> }
        </div>
      } @else if (products().length === 0) {
        <div class="cx-card text-center py-10">
          <p class="font-semibold mb-1" style="color: var(--cx-text)">No products available</p>
          <p class="text-sm" style="color: var(--cx-text-muted)">There are no loan products open for application right now.</p>
        </div>
      } @else {
        <form (ngSubmit)="submit()" class="cx-card cx-form-stack">
          <div>
            <label class="cx-label" for="product">Loan product</label>
            <select id="product" name="product" class="cx-select" [(ngModel)]="productId" (ngModelChange)="onProductChange()" required>
              <option value="" disabled>Select a product</option>
              @for (p of products(); track p.id) {
                <option [value]="p.id">{{ p.name }}</option>
              }
            </select>
          </div>

          @if (selected(); as p) {
            <div class="cx-card-premium !p-4 text-sm flex flex-col gap-1.5">
              @if (p.description) { <p style="color: var(--cx-text-secondary)">{{ p.description }}</p> }
              <div class="flex flex-wrap gap-x-6 gap-y-1.5 mt-1" style="color: var(--cx-text-secondary)">
                <span>Amount: <strong style="color: var(--cx-text)">{{ money(p.min_amount) }} – {{ money(p.max_amount) }}</strong></span>
                <span>Tenure: <strong style="color: var(--cx-text)">{{ p.min_tenure }} – {{ p.max_tenure }} months</strong></span>
                @if (p.interest_rate != null) {
                  <span>Rate: <strong style="color: var(--cx-text)">{{ p.interest_rate }}%</strong></span>
                }
              </div>
            </div>

            <div class="cx-form-row cx-form-row-2">
              <div>
                <label class="cx-label" for="amount">Amount needed (₦)</label>
                <input id="amount" name="amount" type="number" class="cx-input" [(ngModel)]="amount"
                  [min]="p.min_amount ?? null" [max]="p.max_amount ?? null" placeholder="0" required />
              </div>
              <div>
                <label class="cx-label" for="tenure">Tenure (months)</label>
                <input id="tenure" name="tenure" type="number" class="cx-input" [(ngModel)]="tenure"
                  [min]="p.min_tenure ?? null" [max]="p.max_tenure ?? null" placeholder="0" required />
              </div>
            </div>
          }

          <div>
            <label class="cx-label" for="purpose">Loan purpose</label>
            <textarea id="purpose" name="purpose" class="cx-input" rows="3" maxlength="500"
              [(ngModel)]="purpose" placeholder="What will you use this loan for?"></textarea>
          </div>

          <div class="flex items-center gap-3 pt-1">
            <button type="submit" class="cx-btn cx-btn-primary cx-btn-lg" [disabled]="submitting() || !productId">
              @if (submitting()) { <lucide-icon name="loader-2" [size]="17" class="animate-spin"></lucide-icon> }
              Submit application
            </button>
            <a routerLink="/loans" class="cx-btn cx-btn-ghost cx-btn-lg">Cancel</a>
          </div>
        </form>
      }
    </div>
  `,
})
export class ApplyLoanComponent implements OnInit {
  private portal = inject(PortalService);
  private toast = inject(ToastService);
  private router = inject(Router);

  money = money;

  loadingProducts = signal(true);
  submitting = signal(false);
  products = signal<LoanProduct[]>([]);

  productId = '';
  amount: number | null = null;
  tenure: number | null = null;
  purpose = '';

  selected = computed(() => this.products().find(p => p.id === this.productId) ?? null);

  ngOnInit(): void {
    this.portal.listProducts().subscribe({
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
  }

  submit(): void {
    const p = this.selected();
    if (!p || this.amount == null || this.tenure == null) {
      this.toast.error('Please complete all required fields.');
      return;
    }
    this.submitting.set(true);
    this.portal.applyLoan({
      product_id: this.productId,
      amount: String(this.amount),
      tenure: this.tenure,
      loan_purpose: this.purpose,
    }).subscribe({
      next: res => {
        this.submitting.set(false);
        if (res.status === 'success') {
          this.toast.success('Your loan application has been submitted.');
          const id = res.data?.id;
          this.router.navigate(id ? ['/loans', id] : ['/loans']);
        } else {
          this.toast.error(res.message || 'Could not submit application.');
        }
      },
      error: err => {
        this.submitting.set(false);
        const body = err?.error;
        if (body?.errors && typeof body.errors === 'object') {
          const first = Object.values(body.errors)[0];
          this.toast.error(typeof first === 'string' ? first : (body.message || 'Submission failed.'));
        } else {
          this.toast.error(body?.message || 'Could not submit application.');
        }
      },
    });
  }
}
