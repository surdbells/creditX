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
      <ion-toolbar><ion-title>Loan Calculator</ion-title></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true" class="ion-padding">
      <div class="space-y-4">
        <!-- Product Selection -->
        <div>
          <label class="text-xs font-medium text-gray-500 mb-1 block">Loan Product</label>
          <select class="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white appearance-none" [(ngModel)]="productId">
            <option value="">Select a product</option>
            @for (p of products(); track p.id) {
              <option [value]="p.id">{{ p.name }} ({{ p.interest_rate }}%)</option>
            }
          </select>
        </div>
        <div>
          <label class="text-xs font-medium text-gray-500 mb-1 block">Loan Amount (₦)</label>
          <input type="number" class="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm" [(ngModel)]="amount" placeholder="e.g. 500000" />
        </div>
        <div>
          <label class="text-xs font-medium text-gray-500 mb-1 block">Tenure (months)</label>
          <input type="number" class="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm" [(ngModel)]="tenure" placeholder="e.g. 12" />
        </div>

        <button class="w-full py-3 rounded-xl bg-[#0A4F2A] text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                [disabled]="loading() || !productId || !amount || !tenure" (click)="calculate()">
          @if (loading()) { <ion-spinner name="crescent" class="w-4 h-4"></ion-spinner> Calculating... }
          @else { <ion-icon name="calculator-outline"></ion-icon> Calculate }
        </button>

        <!-- Results -->
        @if (result()) {
          <div class="space-y-3 mt-2">
            <!-- Summary Cards -->
            <div class="grid grid-cols-2 gap-3">
              <div class="p-4 rounded-2xl bg-[#0A4F2A]/5 border border-[#0A4F2A]/10 text-center">
                <div class="text-xs text-gray-500">Net Disbursed</div>
                <div class="text-lg font-bold text-[#0A4F2A]">₦{{ result()?.net_disbursed | number:'1.2-2' }}</div>
              </div>
              <div class="p-4 rounded-2xl bg-[#C9A227]/5 border border-[#C9A227]/10 text-center">
                <div class="text-xs text-gray-500">Monthly Payment</div>
                <div class="text-lg font-bold text-[#C9A227]">₦{{ result()?.mr_principal_interest | number:'1.2-2' }}</div>
              </div>
            </div>

            <!-- Breakdown -->
            <div class="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
              <h3 class="text-sm font-semibold text-gray-800 mb-3">Full Breakdown</h3>
              @for (field of breakdownFields(); track field.label) {
                <div class="flex justify-between py-1.5 border-b border-gray-50 last:border-0 text-sm">
                  <span class="text-gray-500">{{ field.label }}</span>
                  <span class="font-medium text-gray-800">₦{{ field.value | number:'1.2-2' }}</span>
                </div>
              }
            </div>

            <!-- Fee Details -->
            @if (result()?.fee_breakdown?.length) {
              <div class="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
                <h3 class="text-sm font-semibold text-gray-800 mb-3">Fee Details</h3>
                @for (fee of result()?.fee_breakdown; track fee.fee_name) {
                  <div class="flex justify-between py-1.5 border-b border-gray-50 last:border-0 text-sm">
                    <span class="text-gray-500">{{ fee.fee_name }}</span>
                    <span class="font-medium text-gray-800">₦{{ fee.amount | number:'1.2-2' }}</span>
                  </div>
                }
              </div>
            }

            <!-- Schedule Preview -->
            @if (result()?.schedule_preview?.length) {
              <div class="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
                <h3 class="text-sm font-semibold text-gray-800 mb-3">Repayment Schedule</h3>
                <div class="overflow-x-auto">
                  <table class="w-full text-xs">
                    <thead><tr class="text-gray-500 border-b"><th class="py-1 text-left">#</th><th class="py-1 text-right">Principal</th><th class="py-1 text-right">Interest</th><th class="py-1 text-right">Total</th></tr></thead>
                    <tbody>
                      @for (s of result()?.schedule_preview; track s.month) {
                        <tr class="border-b border-gray-50">
                          <td class="py-1.5">{{ s.month }}</td>
                          <td class="py-1.5 text-right">₦{{ s.principal | number:'1.0-0' }}</td>
                          <td class="py-1.5 text-right">₦{{ s.interest | number:'1.0-0' }}</td>
                          <td class="py-1.5 text-right font-medium">₦{{ s.total | number:'1.0-0' }}</td>
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
