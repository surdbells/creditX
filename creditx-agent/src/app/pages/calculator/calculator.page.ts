import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonSpinner, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { calculatorOutline } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonHeader, IonToolbar, IonTitle, IonSpinner, IonIcon],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar><ion-title>Calculator</ion-title></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="cxm-page-header cx-animate-in">
        <div class="cxm-eyebrow cxm-eyebrow-primary">Quick Estimate</div>
        <h1 class="cxm-title">Loan Calculator</h1>
        <p class="cxm-subtitle">Model repayments and fees before capturing an application</p>
      </div>

      <div class="px-4 pb-6 flex flex-col gap-3">
        <!-- Input Card -->
        <div class="cxm-calc-inputs">
          <div>
            <label class="cxm-calc-label">Loan Product</label>
            <select class="cxm-calc-select" [(ngModel)]="productId">
              <option value="">Select a product...</option>
              @for (p of products(); track p.id) {
                <option [value]="p.id">{{ p.name }} ({{ p.interest_rate }}%)</option>
              }
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="cxm-calc-label">Amount (₦)</label>
              <input type="number" class="cxm-calc-input tabular-nums" [(ngModel)]="amount" placeholder="500,000" />
            </div>
            <div>
              <label class="cxm-calc-label">Tenure (months)</label>
              <input type="number" class="cxm-calc-input tabular-nums" [(ngModel)]="tenure" placeholder="12" />
            </div>
          </div>
          <button class="cxm-calc-cta"
                  [disabled]="loading() || !productId || !amount || !tenure" (click)="calculate()">
            @if (loading()) {
              <ion-spinner name="crescent" style="width: 16px; height: 16px"></ion-spinner>
              <span>Calculating...</span>
            } @else {
              <ion-icon name="calculator-outline" style="font-size: 16px"></ion-icon>
              <span>Calculate</span>
            }
          </button>
        </div>

        <!-- Results -->
        @if (result()) {
          <div class="flex flex-col gap-3 cx-animate-in">
            <!-- Summary hero cards -->
            <div class="grid grid-cols-2 gap-3">
              <div class="cxm-calc-hero cxm-calc-hero-primary">
                <div class="cxm-eyebrow">Net Disbursed</div>
                <div class="cxm-calc-hero-value tabular-nums">₦{{ result()?.net_disbursed | number:'1.0-0' }}</div>
                <div class="cxm-calc-hero-sub">Cash into account</div>
              </div>
              <div class="cxm-calc-hero cxm-calc-hero-gold">
                <div class="cxm-eyebrow cxm-eyebrow-gold">Monthly</div>
                <div class="cxm-calc-hero-value tabular-nums">₦{{ result()?.mr_principal_interest | number:'1.0-0' }}</div>
                <div class="cxm-calc-hero-sub">Recurring payment</div>
              </div>
            </div>

            <!-- Breakdown -->
            <div class="cxm-card">
              <div class="cxm-section-header" style="margin-bottom: 10px">
                <h3 class="cxm-section-title">Breakdown</h3>
              </div>
              <div class="cxm-calc-fields">
                @for (field of breakdownFields(); track field.label) {
                  <div class="cxm-calc-field">
                    <span class="cxm-calc-field-label">{{ field.label }}</span>
                    <span class="cxm-calc-field-value tabular-nums">₦{{ field.value | number:'1.2-2' }}</span>
                  </div>
                }
              </div>
            </div>

            <!-- Fee Details -->
            @if (result()?.fee_breakdown?.length) {
              <div class="cxm-card">
                <div class="cxm-section-header" style="margin-bottom: 10px">
                  <h3 class="cxm-section-title">Fee Details</h3>
                </div>
                <div class="cxm-calc-fields">
                  @for (fee of result()?.fee_breakdown; track fee.fee_name) {
                    <div class="cxm-calc-field">
                      <span class="cxm-calc-field-label">{{ fee.fee_name }}</span>
                      <span class="cxm-calc-field-value tabular-nums">₦{{ fee.amount | number:'1.2-2' }}</span>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Schedule Preview -->
            @if (result()?.schedule_preview?.length) {
              <div class="cxm-card" style="padding: 0; overflow: hidden">
                <div class="cxm-section-header" style="padding: 12px 14px 6px; margin: 0">
                  <h3 class="cxm-section-title">Repayment Schedule</h3>
                </div>
                <div class="cxm-calc-schedule-wrap">
                  <table class="cxm-calc-schedule">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th class="cxm-calc-right">Principal</th>
                        <th class="cxm-calc-right">Interest</th>
                        <th class="cxm-calc-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (s of result()?.schedule_preview; track s.month) {
                        <tr>
                          <td class="tabular-nums">{{ s.month }}</td>
                          <td class="cxm-calc-right tabular-nums">₦{{ s.principal | number:'1.0-0' }}</td>
                          <td class="cxm-calc-right tabular-nums">₦{{ s.interest | number:'1.0-0' }}</td>
                          <td class="cxm-calc-right tabular-nums cxm-calc-schedule-total">₦{{ s.total | number:'1.0-0' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    .cxm-calc-inputs {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .cxm-calc-label {
      display: block;
      font-size: var(--cx-text-xs);
      font-weight: 500;
      color: var(--cx-text-secondary);
      margin-bottom: 5px;
    }
    .cxm-calc-input, .cxm-calc-select {
      width: 100%;
      padding: 10px 14px;
      background: var(--cx-surface-2);
      border: 1px solid transparent;
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      outline: none;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-calc-select {
      appearance: none;
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b6965' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
      background-repeat: no-repeat;
      background-position: right 12px center;
      padding-right: 36px;
    }
    .cxm-calc-input:focus, .cxm-calc-select:focus {
      background: var(--cx-surface);
      border-color: var(--cx-primary-600);
    }

    .cxm-calc-cta {
      margin-top: 2px;
      padding: 12px;
      background: var(--cx-primary-600);
      color: #fff;
      border: none;
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm);
      font-weight: 600;
      letter-spacing: -0.005em;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: var(--cx-shadow-sm);
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-calc-cta:disabled { opacity: 0.5; box-shadow: none; }
    .cxm-calc-cta:not(:disabled):active {
      transform: scale(0.99);
      background: var(--cx-primary-700);
    }

    /* Hero result cards */
    .cxm-calc-hero {
      padding: 14px;
      border-radius: var(--cx-radius-xl);
      border: 1px solid transparent;
    }
    .cxm-calc-hero-primary {
      background: linear-gradient(135deg, var(--cx-primary-600), var(--cx-primary-500));
      color: #fff;
      border-color: var(--cx-primary-600);
      box-shadow: var(--cx-shadow-md);
    }
    .cxm-calc-hero-primary .cxm-eyebrow { color: rgba(255, 255, 255, 0.75); }
    .cxm-calc-hero-gold {
      background: var(--cx-accent-50);
      border-color: rgba(201, 162, 39, 0.2);
    }
    .cxm-calc-hero-value {
      font-size: var(--cx-text-xl);
      font-weight: 700;
      letter-spacing: -0.015em;
      margin-top: 6px;
      line-height: 1.1;
    }
    .cxm-calc-hero-primary .cxm-calc-hero-value { color: #fff; }
    .cxm-calc-hero-gold .cxm-calc-hero-value { color: var(--cx-accent-700); }
    .cxm-calc-hero-sub {
      font-size: 10px;
      opacity: 0.8;
      margin-top: 3px;
    }
    .cxm-calc-hero-gold .cxm-calc-hero-sub { color: var(--cx-text-muted); opacity: 1; }

    /* Breakdown field list */
    .cxm-calc-fields { display: flex; flex-direction: column; }
    .cxm-calc-field {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cxm-calc-field:last-child { border-bottom: none; }
    .cxm-calc-field-label {
      font-size: var(--cx-text-sm);
      color: var(--cx-text-muted);
    }
    .cxm-calc-field-value {
      font-size: var(--cx-text-sm);
      font-weight: 500;
      color: var(--cx-text);
    }

    /* Schedule table */
    .cxm-calc-schedule-wrap { overflow-x: auto; }
    .cxm-calc-schedule {
      width: 100%;
      border-collapse: collapse;
    }
    .cxm-calc-schedule thead {
      background: var(--cx-surface-2);
    }
    .cxm-calc-schedule thead tr {
      border-top: 1px solid var(--cx-border-subtle);
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cxm-calc-schedule th {
      padding: 8px 10px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--cx-text-muted);
      text-align: left;
      white-space: nowrap;
    }
    .cxm-calc-schedule tbody td {
      padding: 8px 10px;
      font-size: var(--cx-text-xs);
      color: var(--cx-text);
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cxm-calc-schedule tbody tr:last-child td { border-bottom: none; }
    .cxm-calc-right { text-align: right; }
    .cxm-calc-schedule-total { font-weight: 600; color: var(--cx-primary-700); }
  `],
})
export class CalculatorPage implements OnInit {
  products = signal<any[]>([]);
  productId = '';
  amount = '';
  tenure = '';
  loading = signal(false);
  result = signal<any>(null);

  constructor(private api: ApiService) { addIcons({ calculatorOutline }); }

  ngOnInit(): void {
    this.api.get('/loan-products', { per_page: 50, is_active: true }).subscribe({
      next: res => this.products.set(res.data || []),
    });
  }

  calculate(): void {
    this.loading.set(true); this.result.set(null);
    this.api.post('/loan-products/calculate', { product_id: this.productId, amount: this.amount, tenure: Number(this.tenure) }).subscribe({
      next: res => { this.result.set(res.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  breakdownFields(): {label:string;value:any}[] {
    const r = this.result();
    if (!r) return [];
    return [
      { label: 'Application Amount', value: r.app_amount },
      { label: 'Interest', value: r.total_interest },
      { label: 'Gross Loan', value: r.gross_loan },
      { label: 'Total Fees', value: r.total_fees },
      { label: 'Net Disbursed', value: r.net_disbursed },
      { label: 'Monthly Principal', value: r.mr_principal },
      { label: 'Monthly Interest', value: r.mr_interest },
      { label: 'Monthly Payment', value: r.mr_principal_interest },
    ];
  }
}
