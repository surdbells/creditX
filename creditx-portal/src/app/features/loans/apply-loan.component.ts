import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PortalService } from '../../core/services/portal.service';
import { ToastService } from '../../core/services/toast.service';
import { EmploymentType, LoanProduct } from '../../core/models';
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

          <!-- Employment & income (affordability basis) -->
          <div class="pt-2 border-t flex flex-col gap-4" style="border-color: var(--cx-border-subtle)">
            <div>
              <h2 class="cx-heading cx-heading-sm">Employment & income</h2>
              <p class="text-sm" style="color: var(--cx-text-muted)">Tells us your ability to repay. Required for all applicants.</p>
            </div>

            <div>
              <label class="cx-label" for="employment_type">Employment type</label>
              <select id="employment_type" name="employment_type" class="cx-select"
                [(ngModel)]="employmentType" required>
                <option value="" disabled>Select your employment type</option>
                @for (e of employmentTypes; track e.value) {
                  <option [value]="e.value">{{ e.label }}</option>
                }
              </select>
            </div>

            @if (employmentType === 'EMPLOYED') {
              <div class="cx-form-row cx-form-row-2">
                <div>
                  <label class="cx-label" for="employer">Employer</label>
                  <input id="employer" name="employer" type="text" class="cx-input" maxlength="200"
                    [(ngModel)]="employer" placeholder="Company / institution name" required />
                </div>
                <div>
                  <label class="cx-label" for="job_title">Job title <span style="color: var(--cx-text-muted)">(optional)</span></label>
                  <input id="job_title" name="job_title" type="text" class="cx-input" maxlength="100"
                    [(ngModel)]="jobTitle" placeholder="e.g. Accountant" />
                </div>
              </div>
            } @else if (employmentType === 'SELF_EMPLOYED' || employmentType === 'BUSINESS_OWNER') {
              <div class="cx-form-row cx-form-row-2">
                <div>
                  <label class="cx-label" for="business_name">Business name</label>
                  <input id="business_name" name="business_name" type="text" class="cx-input" maxlength="200"
                    [(ngModel)]="businessName" placeholder="Your business / trading name" required />
                </div>
                <div>
                  <label class="cx-label" for="occupation">Occupation / trade <span style="color: var(--cx-text-muted)">(optional)</span></label>
                  <input id="occupation" name="occupation" type="text" class="cx-input" maxlength="100"
                    [(ngModel)]="jobTitle" placeholder="e.g. Trader, Consultant" />
                </div>
              </div>
            }

            <div>
              <label class="cx-label" for="monthly_income">Monthly income (₦)</label>
              <input id="monthly_income" name="monthly_income" type="number" min="0" class="cx-input"
                [(ngModel)]="monthlyIncome" placeholder="Your average monthly income" required />
              <p class="cx-field-hint">Take-home pay or average monthly business income.</p>
            </div>

            @if (estMonthly() !== null && monthlyIncome) {
              <div class="cx-card-premium !p-4 flex flex-col gap-1.5 text-sm">
                <div class="flex items-center gap-2" style="color: var(--cx-text-secondary)">
                  <lucide-icon name="calculator" [size]="16" style="color: var(--cx-primary-600)"></lucide-icon>
                  <span>Estimated monthly repayment</span>
                  <strong class="tabular-nums" style="color: var(--cx-text)">{{ money(estMonthly()) }}</strong>
                </div>
                @if (estDsr() !== null) {
                  <p [style.color]="estDsr()! <= dsrHint ? 'var(--cx-success-600, #16a34a)' : 'var(--cx-warning-700, #b45309)'">
                    That's about <strong>{{ (estDsr()! * 100) | number: '1.0-0' }}%</strong> of your monthly income.
                    @if (estDsr()! > dsrHint) { <span>This is on the high side — your application will be reviewed carefully.</span> }
                  </p>
                }
                <p class="text-xs" style="color: var(--cx-text-muted)">Estimate only — the final figure is confirmed when you submit.</p>
              </div>
            }
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

  employmentType: EmploymentType | '' = '';
  monthlyIncome: number | null = null;
  employer = '';
  jobTitle = '';
  businessName = '';

  /** Advisory threshold for the client-side preview only. The authoritative
   *  DSR limit lives server-side (system setting affordability.max_dsr). */
  readonly dsrHint = 0.4;

  employmentTypes: { value: EmploymentType; label: string }[] = [
    { value: 'EMPLOYED', label: 'Employed' },
    { value: 'SELF_EMPLOYED', label: 'Self-employed' },
    { value: 'BUSINESS_OWNER', label: 'Business owner' },
    { value: 'OTHER', label: 'Other' },
  ];

  selected = computed(() => this.products().find(p => p.id === this.productId) ?? null);

  /** Rough flat-rate estimate of the monthly repayment (principal/tenure +
   *  monthly-rate × amount). Fees and amortised schedules aren't modelled —
   *  this is a preview; the backend computes the authoritative figure. */
  estMonthly = computed<number | null>(() => {
    const p = this.selected();
    if (!p || this.amount == null || this.tenure == null || this.tenure <= 0) {
      return null;
    }
    const amt = Number(this.amount);
    if (!amt || amt <= 0) {
      return null;
    }
    const rate = p.interest_rate != null ? Number(p.interest_rate) : 0;
    return Math.ceil(amt / this.tenure + (rate / 100) * amt);
  });

  estDsr = computed<number | null>(() => {
    const m = this.estMonthly();
    const inc = this.monthlyIncome;
    if (m == null || !inc || inc <= 0) {
      return null;
    }
    return m / inc;
  });

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

    // Prefill employment/income from the saved profile so returning
    // applicants don't re-enter it each time.
    this.portal.me().subscribe({
      next: res => {
        const c = res.data;
        if (!c) {
          return;
        }
        const t = (c.employment_type ?? '') as string;
        if (this.employmentTypes.some(e => e.value === t)) {
          this.employmentType = t as EmploymentType;
        }
        this.employer = c.employer ?? '';
        this.jobTitle = c.job_title ?? '';
        this.businessName = c.business_name ?? '';
        const income = c.gross_pay != null ? Number(c.gross_pay) : null;
        if (income && income > 0) {
          this.monthlyIncome = income;
        }
      },
      error: () => {},
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
    if (!this.employmentType) {
      this.toast.error('Please select your employment type.');
      return;
    }
    if (this.monthlyIncome == null || this.monthlyIncome <= 0) {
      this.toast.error('Please enter your monthly income.');
      return;
    }
    if (this.employmentType === 'EMPLOYED' && !this.employer.trim()) {
      this.toast.error('Please enter your employer.');
      return;
    }
    if ((this.employmentType === 'SELF_EMPLOYED' || this.employmentType === 'BUSINESS_OWNER') && !this.businessName.trim()) {
      this.toast.error('Please enter your business name.');
      return;
    }
    this.submitting.set(true);
    this.portal.applyLoan({
      product_id: this.productId,
      amount: String(this.amount),
      tenure: this.tenure,
      loan_purpose: this.purpose,
      employment_type: this.employmentType,
      monthly_income: String(this.monthlyIncome),
      employer: this.employer.trim() || undefined,
      job_title: this.jobTitle.trim() || undefined,
      business_name: this.businessName.trim() || undefined,
    }).subscribe({
      next: res => {
        this.submitting.set(false);
        if (res.status === 'success') {
          const aff = res.data?.affordability;
          if (aff && !aff.within_limit) {
            this.toast.success('Application submitted. It will be reviewed for affordability.');
          } else {
            this.toast.success('Your loan application has been submitted.');
          }
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
