import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { SettingsService } from '../../core/services/settings.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { SearchableSelectDirective } from '../../shared/directives/searchable-select.directive';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import { PageGuide } from '../../shared/guide/page-guide.model';

/**
 * Back-office loan origination — capture a complete application from the admin
 * app, the same journey a field agent makes.
 *
 * Deliberately reuses the EXISTING endpoints rather than adding a parallel
 * origination path: POST /loans (which already accepts either an existing
 * customer_id or an inline customer payload), the shared document upload, and
 * POST /loans/{id}/submit. A back-office loan therefore enters the same
 * approval workflow, posts the same journals and audits identically to an
 * agent-captured one — origination channel changes nothing downstream.
 *
 * Gated by loans.originate.
 *
 * The order of steps is forced by the data model: documents attach to a loan,
 * so the application must exist before they can be uploaded. That is why step 2
 * creates the loan and step 3 attaches to it, rather than collecting everything
 * and posting once.
 */
const LOAN_ORIGINATION_GUIDE: PageGuide = {
  id: 'loan-origination',
  titleKey: 'New Loan',
  purposeKey: 'Captures a complete loan application from the back office, on a customer\'s behalf.',
  descriptionKey:
    'The same journey a field agent makes, done from the admin app — for walk-ins, phone '
    + 'applications, or anything an agent cannot capture. The loan it produces is an ordinary loan: '
    + 'it enters the same approval workflow, posts the same journals and is audited identically. '
    + 'Where it was originated changes nothing downstream.',
  actionKeys: [
    'Find an existing customer, or onboard a walk-in inline',
    'Choose a product and enter the terms, with a live quote',
    'Upload the documents the product requires',
    'Submit for approval, or save and finish later',
  ],
  workflowKeys: [
    'Capture the customer',
    'Capture terms — this creates the application',
    'Attach documents',
    'Submit into the approval workflow',
  ],
  dependsOnKeys: ['Loan Products', 'Customers', 'Document Types', 'Approval Workflows'],
  usedByKeys: ['Approval Queue', 'Loans'],
  businessRuleKeys: [
    'Documents attach to a loan, so the application must exist before they can be uploaded — that is why terms come before documents.',
    'Only products available to the back office appear here; a product can be switched off for this channel on the product itself.',
    'The required documents are the product\'s own list, and submission enforces them on the server regardless of what the screen allows.',
    'Leaving before submitting keeps a draft. Nothing is lost, and it can be resumed from the Loans page.',
    'Submitting commits nothing financially — it enters the loan into approval, where the real decision is made.',
  ],
  tipKeys: [
    'Search for the customer before creating one. Walk-ins are often already on file from an earlier loan.',
    'Check the quote with the customer before submitting; fees can make the net they receive lower than the amount they asked for.',
  ],
  permissionKeys: ['loans.originate'],
};

@Component({
  selector: 'app-loan-origination',
  standalone: true,
  imports: [SearchableSelectDirective, CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, MoneyPipe, PageGuideComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="New Loan"
        subtitle="Capture a loan application on behalf of a customer"
        eyebrow="Loans"></cx-page-header>

      <cx-page-guide [guide]="guide"></cx-page-guide>

      @if (!auth.hasPermission('loans.originate')) {
        <div class="cx-card cx-lo-denied">
          <lucide-icon name="lock" [size]="28"></lucide-icon>
          <p>You do not have permission to originate loans from the back office.</p>
        </div>
      } @else {
        <!-- Steps -->
        <div class="cx-lo-steps">
          @for (s of stepLabels; track s; let i = $index) {
            <div class="cx-lo-step" [class.is-active]="step() === i" [class.is-done]="step() > i">
              <span class="cx-lo-step-num">
                @if (step() > i) { <lucide-icon name="check" [size]="12"></lucide-icon> } @else { {{ i + 1 }} }
              </span>
              <span>{{ s }}</span>
            </div>
          }
        </div>

        <!-- 1. Customer -->
        @if (step() === 0) {
          <div class="cx-card cx-lo-panel">
            <div class="cx-lo-tabs">
              <button class="cx-lo-tab" [class.is-active]="mode === 'existing'" (click)="mode = 'existing'">Existing customer</button>
              <button class="cx-lo-tab" [class.is-active]="mode === 'new'" (click)="mode = 'new'">New customer</button>
            </div>

            @if (mode === 'existing') {
              <label class="cx-label">Search customer</label>
              <input class="cx-input" [(ngModel)]="customerSearch" (ngModelChange)="onCustomerSearch($event)"
                     placeholder="Name or staff ID…" />
              @if (customerResults().length) {
                <div class="cx-lo-typeahead">
                  @for (c of customerResults(); track c.id) {
                    <button type="button" class="cx-lo-typeahead-item" (click)="pickCustomer(c)">
                      {{ c.full_name }}
                      @if (c.staff_id) { <span>· {{ c.staff_id }}</span> }
                    </button>
                  }
                </div>
              }
              @if (chosen(); as c) {
                <div class="cx-lo-chosen">
                  <lucide-icon name="user-check" [size]="15"></lucide-icon>
                  <div><strong>{{ c.full_name }}</strong><em>{{ c.staff_id || c.phone || c.email }}</em></div>
                </div>
              }
            } @else {
              <div class="cx-form-row cx-form-row-2">
                <div><label class="cx-label">Full name *</label><input class="cx-input" [(ngModel)]="newCustomer.full_name" /></div>
                <div><label class="cx-label">Staff ID *</label><input class="cx-input" [(ngModel)]="newCustomer.staff_id" /></div>
              </div>
              <div class="cx-form-row cx-form-row-2">
                <div><label class="cx-label">Phone</label><input class="cx-input" [(ngModel)]="newCustomer.phone" /></div>
                <div><label class="cx-label">Email</label><input class="cx-input" type="email" [(ngModel)]="newCustomer.email" /></div>
              </div>
              <p class="cx-field-hint">
                The customer is created with the application. Further KYC can be completed
                afterwards on the Customers page.
              </p>
            }

            <div class="cx-lo-actions">
              <button class="cx-btn cx-btn-primary" (click)="toTerms()">Continue</button>
            </div>
          </div>
        }

        <!-- 2. Product & terms -->
        @if (step() === 1) {
          <div class="cx-card cx-lo-panel">
            <div>
              <label class="cx-label">Product *</label>
              <select class="cx-select" [(ngModel)]="terms.product_id" (ngModelChange)="onProduct($event)">
                <option value="">Select product…</option>
                @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }} ({{ p.code }})</option> }
              </select>
              @if (products().length === 0) {
                <div class="cx-field-hint">
                  No products are enabled for back-office origination. Enable one under
                  Loan Products → Availability.
                </div>
              }
              @if (product(); as p) {
                <div class="cx-field-hint">
                  {{ p.min_amount | money:0 }}–{{ p.max_amount | money:0 }} ·
                  {{ p.min_tenure }}–{{ p.max_tenure }} months
                </div>
              }
            </div>

            <div class="cx-form-row cx-form-row-2">
              <div>
                <label class="cx-label">Amount ({{ settings.currencySymbol() }}) *</label>
                <input class="cx-input" type="number" min="0" [(ngModel)]="terms.amount" (ngModelChange)="recalc()" />
              </div>
              <div>
                <label class="cx-label">Tenure (months) *</label>
                <input class="cx-input" type="number" min="1" [(ngModel)]="terms.tenure" (ngModelChange)="recalc()" />
              </div>
            </div>

            <div><label class="cx-label">Loan purpose</label><input class="cx-input" [(ngModel)]="terms.loan_purpose" /></div>

            @if (calc(); as q) {
              <div class="cx-lo-calc">
                <div><span>Gross loan</span><strong>{{ q.gross_loan | money:2 }}</strong></div>
                <div><span>Net disbursed</span><strong class="cx-lo-accent">{{ q.net_disbursed | money:2 }}</strong></div>
                <div><span>Monthly repayment</span><strong>{{ q.mr_principal_interest | money:2 }}</strong></div>
                <div><span>Total repayable</span><strong>{{ q.total_repayment | money:2 }}</strong></div>
              </div>
            }

            <div class="cx-lo-actions">
              <button class="cx-btn cx-btn-ghost" (click)="step.set(0)">Back</button>
              <button class="cx-btn cx-btn-primary" (click)="createApplication()" [disabled]="busy()">
                <lucide-icon [name]="busy() ? 'loader-2' : 'check'" [size]="15" [class.cx-lo-spin]="busy()"></lucide-icon>
                <span>{{ busy() ? 'Creating…' : 'Create application' }}</span>
              </button>
            </div>
          </div>
        }

        <!-- 3. Documents -->
        @if (step() === 2) {
          <div class="cx-card cx-lo-panel">
            <p class="cx-lo-created">
              <lucide-icon name="check-circle" [size]="15"></lucide-icon>
              <span>Application <strong>{{ loan()?.application_id }}</strong> created. Attach its documents below.</span>
            </p>

            @if (docs().length === 0) {
              <p class="cx-field-hint">This product requires no documents.</p>
            } @else {
              <div class="cx-lo-docs">
                @for (d of docs(); track d.code) {
                  <div class="cx-lo-doc" [class.is-done]="uploaded()[d.code]">
                    <div class="cx-lo-doc-main">
                      <strong>{{ d.label }}</strong>
                      @if (d.is_required) { <span class="cx-lo-req">Required</span> }
                      @else { <span class="cx-lo-opt">Optional</span> }
                    </div>
                    @if (uploaded()[d.code]) {
                      <span class="cx-lo-ok"><lucide-icon name="check" [size]="13"></lucide-icon> Uploaded</span>
                    } @else {
                      <input type="file" [accept]="d.accept || '*/*'" (change)="upload(d, $event)" />
                    }
                  </div>
                }
              </div>
            }

            @if (missingRequired().length) {
              <p class="cx-lo-warn">
                <lucide-icon name="alert-triangle" [size]="13"></lucide-icon>
                <span>Still required: {{ missingRequired().join(', ') }}</span>
              </p>
            }

            <div class="cx-lo-actions">
              <button class="cx-btn cx-btn-ghost" (click)="finishLater()">Finish later</button>
              <button class="cx-btn cx-btn-primary" (click)="step.set(3)">Review</button>
            </div>
          </div>
        }

        <!-- 4. Review & submit -->
        @if (step() === 3) {
          <div class="cx-card cx-lo-panel">
            <h3 class="cx-lo-h">Review</h3>
            <div class="cx-lo-review">
              <div><span>Application</span><strong>{{ loan()?.application_id }}</strong></div>
              <div><span>Customer</span><strong>{{ loan()?.customer_name }}</strong></div>
              <div><span>Product</span><strong>{{ product()?.name }}</strong></div>
              <div><span>Amount</span><strong>{{ loan()?.amount_requested | money:2 }}</strong></div>
              <div><span>Tenure</span><strong>{{ terms.tenure }} months</strong></div>
              <div><span>Documents</span><strong>{{ uploadedCount() }} of {{ docs().length }}</strong></div>
            </div>

            @if (missingRequired().length) {
              <p class="cx-lo-warn">
                <lucide-icon name="alert-triangle" [size]="13"></lucide-icon>
                <span>
                  Cannot submit — these required documents are missing:
                  {{ missingRequired().join(', ') }}.
                </span>
              </p>
            }

            <div class="cx-lo-actions">
              <button class="cx-btn cx-btn-ghost" (click)="step.set(2)">Back</button>
              <button class="cx-btn cx-btn-primary" (click)="submit()"
                      [disabled]="busy() || missingRequired().length > 0">
                <lucide-icon [name]="busy() ? 'loader-2' : 'send'" [size]="15" [class.cx-lo-spin]="busy()"></lucide-icon>
                <span>{{ busy() ? 'Submitting…' : 'Submit for approval' }}</span>
              </button>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .cx-lo-denied { text-align:center; padding:44px 12px; color:var(--cx-text-muted); }
    .cx-lo-denied p { margin-top:10px; font-size:13px; }

    .cx-lo-steps { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px; }
    .cx-lo-step { display:flex; align-items:center; gap:7px; font-size:12.5px; color:var(--cx-text-muted);
      padding:7px 13px; border:1px solid var(--cx-border); border-radius:999px; background:var(--cx-surface); }
    .cx-lo-step.is-active { border-color:var(--cx-primary-600); color:var(--cx-primary-600); font-weight:600; }
    .cx-lo-step.is-done { color:var(--cx-success); border-color:color-mix(in srgb, var(--cx-success) 40%, transparent); }
    .cx-lo-step-num { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px;
      border-radius:50%; background:var(--cx-surface-2, var(--cx-stone-100)); font-size:11px; font-weight:700; }

    .cx-lo-panel { padding:18px; display:flex; flex-direction:column; gap:14px; }
    .cx-lo-h { margin:0; font-size:14px; font-weight:600; }
    .cx-lo-tabs { display:inline-flex; gap:4px; background:var(--cx-surface-2, var(--cx-stone-100)); padding:3px; border-radius:10px; }
    .cx-lo-tab { padding:6px 14px; border:none; background:transparent; border-radius:8px; font-size:13px;
      font-weight:600; color:var(--cx-text-secondary); cursor:pointer; }
    .cx-lo-tab.is-active { background:var(--cx-surface); color:var(--cx-text); box-shadow:0 1px 3px rgba(0,0,0,.08); }

    .cx-lo-typeahead { border:1px solid var(--cx-border); border-radius:var(--cx-radius-md); overflow:hidden; }
    .cx-lo-typeahead-item { display:block; width:100%; text-align:left; padding:8px 12px; border:none;
      background:transparent; cursor:pointer; font-size:13px; }
    .cx-lo-typeahead-item:hover { background:var(--cx-surface-hover, var(--cx-stone-100)); }
    .cx-lo-typeahead-item span { color:var(--cx-text-muted); font-size:12px; }
    .cx-lo-chosen { display:flex; gap:9px; align-items:center; padding:10px 12px; border-radius:var(--cx-radius-md);
      background:color-mix(in srgb, var(--cx-success) 9%, transparent); }
    .cx-lo-chosen strong { display:block; font-size:13px; }
    .cx-lo-chosen em { display:block; font-style:normal; font-size:11.5px; color:var(--cx-text-muted); }

    .cx-lo-calc { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px;
      padding:12px; border-radius:var(--cx-radius-lg,10px); background:var(--cx-surface-2, var(--cx-stone-100)); }
    .cx-lo-calc span { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--cx-text-muted); }
    .cx-lo-calc strong { display:block; font-size:15px; font-weight:700; margin-top:3px; }
    .cx-lo-accent { color:var(--cx-primary-600); }

    .cx-lo-created { display:flex; gap:8px; align-items:center; font-size:13px; margin:0; padding:10px 12px;
      border-radius:var(--cx-radius-md); background:color-mix(in srgb, var(--cx-success) 10%, transparent); color:var(--cx-success); }
    .cx-lo-docs { display:flex; flex-direction:column; gap:8px; }
    .cx-lo-doc { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
      padding:10px 12px; border:1px solid var(--cx-border); border-radius:var(--cx-radius-md); }
    .cx-lo-doc.is-done { border-color:color-mix(in srgb, var(--cx-success) 40%, transparent); }
    .cx-lo-doc-main { display:flex; align-items:center; gap:8px; font-size:13px; }
    .cx-lo-req { font-size:10px; text-transform:uppercase; padding:2px 7px; border-radius:999px;
      background:color-mix(in srgb, var(--cx-warning) 14%, transparent); color:var(--cx-warning); }
    .cx-lo-opt { font-size:10px; text-transform:uppercase; padding:2px 7px; border-radius:999px;
      background:var(--cx-stone-100); color:var(--cx-text-muted); }
    .cx-lo-ok { display:flex; align-items:center; gap:4px; font-size:12px; color:var(--cx-success); }

    .cx-lo-review { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:2px 18px; }
    .cx-lo-review > div { display:flex; justify-content:space-between; padding:6px 0;
      border-bottom:1px dashed var(--cx-border); font-size:13px; }
    .cx-lo-review span { color:var(--cx-text-muted); }

    .cx-lo-warn { display:flex; gap:7px; align-items:flex-start; font-size:12.5px; margin:0; padding:9px 12px;
      border-radius:var(--cx-radius-md); background:color-mix(in srgb, var(--cx-warning) 12%, transparent); color:var(--cx-warning); }
    .cx-lo-actions { display:flex; gap:8px; justify-content:flex-end; border-top:1px solid var(--cx-border); padding-top:12px; }
    .cx-lo-spin { animation:cx-lo-spin 1s linear infinite; }
    @keyframes cx-lo-spin { to { transform:rotate(360deg); } }
  `],
})
export class LoanOriginationComponent implements OnInit {
  readonly guide = LOAN_ORIGINATION_GUIDE;

  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);
  auth = inject(AuthService);
  settings = inject(SettingsService);

  stepLabels = ['Customer', 'Product & terms', 'Documents', 'Review'];
  step = signal(0);
  busy = signal(false);

  // Step 1
  mode: 'existing' | 'new' = 'existing';
  customerSearch = '';
  customerResults = signal<any[]>([]);
  chosen = signal<any | null>(null);
  newCustomer: any = { full_name: '', staff_id: '', phone: '', email: '' };
  private searchTimer: any;

  // Step 2
  products = signal<any[]>([]);
  terms: any = { product_id: '', amount: '', tenure: '', loan_purpose: '' };
  calc = signal<any | null>(null);
  product = computed(() => this.products().find(p => p.id === this.terms.product_id) ?? null);

  // Step 3
  loan = signal<any | null>(null);
  docs = signal<any[]>([]);
  uploaded = signal<Record<string, boolean>>({});

  uploadedCount = computed(() => Object.values(this.uploaded()).filter(Boolean).length);
  missingRequired = computed(() =>
    this.docs().filter(d => d.is_required && !this.uploaded()[d.code]).map(d => d.label));

  ngOnInit(): void {
    // Only products the institution has enabled for back-office origination.
    this.api.get('/loan-products', { per_page: 100, is_active: true, channel: 'back_office' }).subscribe({
      next: r => this.products.set(r.data || []),
      error: () => this.toast.error('Could not load loan products.'),
    });
  }

  // ── Step 1 ──────────────────────────────────────────────────────────────
  onCustomerSearch(term: string): void {
    clearTimeout(this.searchTimer);
    if (!term || term.trim().length < 2) { this.customerResults.set([]); return; }
    this.searchTimer = setTimeout(() => {
      this.api.get('/customers', { search: term.trim(), per_page: 10 }).subscribe({
        next: r => this.customerResults.set(r.data || []),
        error: () => this.customerResults.set([]),
      });
    }, 300);
  }

  pickCustomer(c: any): void {
    this.chosen.set(c);
    this.customerSearch = c.full_name;
    this.customerResults.set([]);
  }

  toTerms(): void {
    if (this.mode === 'existing' && !this.chosen()) { this.toast.error('Select a customer.'); return; }
    if (this.mode === 'new') {
      if (!this.newCustomer.full_name?.trim()) { this.toast.error('Enter the customer\'s full name.'); return; }
      if (!this.newCustomer.staff_id?.trim()) { this.toast.error('Enter a staff ID.'); return; }
    }
    this.step.set(1);
  }

  // ── Step 2 ──────────────────────────────────────────────────────────────
  onProduct(id: string): void {
    const p = this.products().find(x => x.id === id);
    if (p && !this.terms.tenure) this.terms.tenure = p.min_tenure;
    this.recalc();
  }

  recalc(): void {
    const { product_id, amount, tenure } = this.terms;
    if (!product_id || !amount || !tenure) { this.calc.set(null); return; }
    this.api.post('/loan-products/calculate', { product_id, amount: String(amount), tenure: Number(tenure) }).subscribe({
      next: r => this.calc.set(r.data),
      // Non-fatal: the quote is a preview. The authoritative calculation runs
      // server-side when the application is created.
      error: () => this.calc.set(null),
    });
  }

  createApplication(): void {
    const { product_id, amount, tenure } = this.terms;
    if (!product_id) { this.toast.error('Select a product.'); return; }
    if (!amount || !tenure) { this.toast.error('Enter an amount and tenure.'); return; }

    const body: any = {
      product_id, amount: String(amount), tenure: Number(tenure),
      loan_purpose: this.terms.loan_purpose || undefined,
    };
    // The endpoint accepts EITHER an existing id or an inline customer, so a
    // walk-in can be onboarded without leaving this screen.
    if (this.mode === 'existing') body.customer_id = this.chosen()!.id;
    else body.customer = { ...this.newCustomer };

    this.busy.set(true);
    this.api.post('/loans', body).subscribe({
      next: r => {
        this.busy.set(false);
        this.loan.set(r.data);
        this.loadDocs(product_id);
        this.step.set(2);
        this.toast.success('Application created.');
      },
      error: e => {
        this.busy.set(false);
        const errs = e.error?.errors;
        this.toast.error(errs ? (Object.values(errs)[0] as string) : (e.error?.message || 'Could not create the application'));
      },
    });
  }

  // ── Step 3 ──────────────────────────────────────────────────────────────
  /** The product's resolved document list — the same one submit enforces. */
  private loadDocs(productId: string): void {
    this.api.get(`/loan-products/${productId}/documents`).subscribe({
      next: r => this.docs.set(r.data?.documents || []),
      error: () => this.docs.set([]),
    });
  }

  upload(doc: any, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const loan = this.loan();
    if (!loan) return;

    const fd = new FormData();
    fd.append('file', file);
    fd.append('customer_id', loan.customer_id);
    fd.append('loan_id', loan.id);
    fd.append('type', doc.code);

    this.api.upload('/documents/upload', fd).subscribe({
      next: () => {
        this.uploaded.update(u => ({ ...u, [doc.code]: true }));
        this.toast.success(`${doc.label} uploaded`);
      },
      error: e => {
        input.value = '';
        this.toast.error(e.error?.message || `Could not upload ${doc.label}`);
      },
    });
  }

  /** Leave the application in draft — it is already saved and can be resumed. */
  finishLater(): void {
    const loan = this.loan();
    this.toast.info('Application saved. You can finish it from the Loans page.');
    this.router.navigate(loan ? ['/loans', loan.id] : ['/loans']);
  }

  // ── Step 4 ──────────────────────────────────────────────────────────────
  submit(): void {
    const loan = this.loan();
    if (!loan) return;
    this.busy.set(true);
    this.api.post(`/loans/${loan.id}/submit`, {}).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success('Submitted for approval.');
        this.router.navigate(['/loans', loan.id]);
      },
      error: e => {
        this.busy.set(false);
        // The server enforces required documents independently; surface its
        // message verbatim rather than second-guessing it client-side.
        this.toast.error(e.error?.message || 'Could not submit for approval');
      },
    });
  }
}
