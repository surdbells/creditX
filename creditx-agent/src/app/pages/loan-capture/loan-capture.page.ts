import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonSpinner, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronForwardOutline, chevronBackOutline, checkmarkCircleOutline, searchOutline, calculatorOutline } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-loan-capture',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonSpinner, IonIcon],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/loans"></ion-back-button></ion-buttons>
        <ion-title>New Loan Application</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="p-4">
        <!-- Step Indicator -->
        <div class="flex items-center justify-between mb-6">
          @for (s of stepLabels; track s; let i = $index) {
            <div class="flex items-center gap-1" [class.flex-1]="i < stepLabels.length - 1">
              <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                   [class]="step() > i ? 'bg-[#0A4F2A] text-white' : step() === i ? 'bg-[#C9A227] text-white' : 'bg-gray-200 text-gray-500'">
                @if (step() > i) { <ion-icon name="checkmark-circle-outline" class="text-sm"></ion-icon> }
                @else { {{ i + 1 }} }
              </div>
              <span class="text-[10px] text-gray-500 hidden sm:inline">{{ s }}</span>
              @if (i < stepLabels.length - 1) { <div class="flex-1 h-0.5 mx-1" [class]="step() > i ? 'bg-[#0A4F2A]' : 'bg-gray-200'"></div> }
            </div>
          }
        </div>

        <!-- Step 1: Product Select -->
        @if (step() === 0) {
          <div class="space-y-3">
            <h3 class="text-base font-semibold text-gray-800">Select Loan Product</h3>
            @if (productsLoading()) {
              <div class="flex justify-center py-8"><ion-spinner name="crescent"></ion-spinner></div>
            } @else {
              @for (product of products(); track product.id) {
                <div class="p-4 rounded-xl border-2 cursor-pointer transition-colors"
                     [class]="form['product_id'] === product.id ? 'border-[#0A4F2A] bg-[#0A4F2A]/5' : 'border-gray-100 bg-white'"
                     (click)="selectProduct(product)">
                  <div class="font-semibold text-sm text-gray-800">{{ product.name }}</div>
                  <div class="text-xs text-gray-500 mt-1">{{ product.interest_calculation_method }} &bull; {{ product.interest_rate }}% &bull; {{ product.min_tenure }}-{{ product.max_tenure }} months</div>
                  <div class="text-xs text-gray-400 mt-0.5">₦{{ product.min_amount | number:'1.0-0' }} — ₦{{ product.max_amount | number:'1.0-0' }}</div>
                </div>
              }
            }
          </div>
        }

        <!-- Step 2: Staff ID Validation -->
        @if (step() === 1) {
          <div class="space-y-4">
            <h3 class="text-base font-semibold text-gray-800">Staff Record Lookup</h3>
            <div class="flex gap-2">
              <input type="text" class="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm" [(ngModel)]="form['staff_id']" placeholder="Enter Staff ID" />
              <button class="px-4 py-3 rounded-xl bg-[#0A4F2A] text-white disabled:opacity-50" [disabled]="staffLoading() || !form['staff_id']" (click)="lookupStaff()">
                @if (staffLoading()) { <ion-spinner name="crescent" class="w-4 h-4"></ion-spinner> }
                @else { <ion-icon name="search-outline"></ion-icon> }
              </button>
            </div>
            @if (staffRecord()) {
              <div class="p-4 rounded-xl bg-green-50 border border-green-100">
                <div class="font-semibold text-sm text-gray-800">{{ staffRecord()?.employee_name }}</div>
                <div class="text-xs text-gray-500 mt-1">{{ staffRecord()?.organization }} &bull; {{ staffRecord()?.job_title }}</div>
                <div class="text-xs text-gray-500">Gross: ₦{{ staffRecord()?.gross_pay | number:'1.0-0' }} &bull; Net: ₦{{ staffRecord()?.net_pay | number:'1.0-0' }}</div>
              </div>
            }
            @if (staffError()) {
              <div class="p-3 rounded-xl bg-red-50 text-red-600 text-sm">{{ staffError() }}</div>
            }
          </div>
        }

        <!-- Step 3: Loan Details -->
        @if (step() === 2) {
          <div class="space-y-4">
            <h3 class="text-base font-semibold text-gray-800">Loan Details</h3>
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Loan Amount (₦)</label>
              <input type="number" class="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm" [(ngModel)]="form['amount']" placeholder="Enter amount" />
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Tenure (months)</label>
              <input type="number" class="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm" [(ngModel)]="form['tenure']" placeholder="Enter tenure" />
            </div>
            <button class="w-full py-3 rounded-xl bg-[#C9A227]/10 text-[#C9A227] font-medium text-sm flex items-center justify-center gap-2 border border-[#C9A227]/20"
                    [disabled]="calcLoading()" (click)="calculate()">
              <ion-icon name="calculator-outline"></ion-icon> Calculate Breakdown
            </button>
            @if (calcResult()) {
              <div class="p-4 rounded-xl bg-[#0A4F2A]/5 border border-[#0A4F2A]/10 space-y-1 text-sm">
                <div class="flex justify-between"><span class="text-gray-500">Gross Loan</span><span class="font-semibold">₦{{ calcResult()?.gross_loan | number:'1.2-2' }}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">Total Fees</span><span class="font-semibold">₦{{ calcResult()?.total_fees | number:'1.2-2' }}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">Net Disbursed</span><span class="font-semibold text-[#0A4F2A]">₦{{ calcResult()?.net_disbursed | number:'1.2-2' }}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">Monthly Repayment</span><span class="font-semibold text-[#C9A227]">₦{{ calcResult()?.mr_principal_interest | number:'1.2-2' }}</span></div>
              </div>
            }
          </div>
        }

        <!-- Step 4: Personal & Banking -->
        @if (step() === 3) {
          <div class="space-y-4">
            <h3 class="text-base font-semibold text-gray-800">Personal & Banking</h3>
            @for (field of personalFields; track field.key) {
              <div>
                <label class="text-xs font-medium text-gray-500 mb-1 block">{{ field.label }}</label>
                <input [type]="field.type || 'text'" class="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm"
                       [(ngModel)]="form[field.key]" [placeholder]="field.placeholder || ''" />
              </div>
            }
          </div>
        }

        <!-- Step 5: Review & Submit -->
        @if (step() === 4) {
          <div class="space-y-4">
            <h3 class="text-base font-semibold text-gray-800">Review & Submit</h3>
            <div class="p-4 rounded-xl bg-white border border-gray-100 space-y-2 text-sm">
              <div class="flex justify-between"><span class="text-gray-500">Product</span><span class="font-medium">{{ selectedProductName() }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Staff ID</span><span class="font-medium">{{ form['staff_id'] }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Customer</span><span class="font-medium">{{ staffRecord()?.employee_name }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Amount</span><span class="font-semibold">₦{{ form['amount'] | number:'1.2-2' }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Tenure</span><span class="font-medium">{{ form['tenure'] }} months</span></div>
              @if (calcResult()) {
                <div class="flex justify-between border-t pt-2 mt-2"><span class="text-gray-500">Net Disbursed</span><span class="font-semibold text-[#0A4F2A]">₦{{ calcResult()?.net_disbursed | number:'1.2-2' }}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">Monthly Payment</span><span class="font-semibold text-[#C9A227]">₦{{ calcResult()?.mr_principal_interest | number:'1.2-2' }}</span></div>
              }
            </div>
          </div>
        }

        <!-- Navigation Buttons -->
        <div class="flex gap-3 mt-6">
          @if (step() > 0) {
            <button class="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm" (click)="step.set(step() - 1)">
              <ion-icon name="chevron-back-outline"></ion-icon> Back
            </button>
          }
          @if (step() < 4) {
            <button class="flex-1 py-3 rounded-xl bg-[#0A4F2A] text-white font-medium text-sm disabled:opacity-50"
                    [disabled]="!canProceed()" (click)="step.set(step() + 1)">
              Next <ion-icon name="chevron-forward-outline"></ion-icon>
            </button>
          } @else {
            <button class="flex-1 py-3 rounded-xl bg-[#0A4F2A] text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    [disabled]="submitting()" (click)="submit()">
              @if (submitting()) { <ion-spinner name="crescent" class="w-4 h-4"></ion-spinner> Submitting... }
              @else { <ion-icon name="checkmark-circle-outline"></ion-icon> Submit Application }
            </button>
          }
        </div>
      </div>
    </ion-content>
  `,
})
export class LoanCapturePage implements OnInit {
  step = signal(0);
  stepLabels = ['Product', 'Staff', 'Details', 'Info', 'Review'];

  products = signal<any[]>([]);
  productsLoading = signal(true);
  staffRecord = signal<any>(null);
  staffLoading = signal(false);
  staffError = signal<string | null>(null);
  calcResult = signal<any>(null);
  calcLoading = signal(false);
  submitting = signal(false);

  form: any = {
    product_id: '', staff_id: '', amount: '', tenure: '',
    phone: '', email: '', bank_name: '', account_number: '',
    home_address: '', bvn: '',
  };

  personalFields = [
    { key: 'phone', label: 'Phone Number', type: 'tel', placeholder: '08012345678' },
    { key: 'email', label: 'Email', type: 'email', placeholder: 'customer@email.com' },
    { key: 'bank_name', label: 'Bank Name', placeholder: 'e.g. Access Bank' },
    { key: 'account_number', label: 'Account Number', placeholder: '0123456789' },
    { key: 'bvn', label: 'BVN', placeholder: '22200000000' },
    { key: 'home_address', label: 'Home Address', placeholder: 'Residential address' },
  ];

  constructor(private api: ApiService, private router: Router) {
    addIcons({ chevronForwardOutline, chevronBackOutline, checkmarkCircleOutline, searchOutline, calculatorOutline });
  }

  ngOnInit(): void {
    this.api.get('/loan-products', { per_page: 50, is_active: true }).subscribe({
      next: res => { this.products.set(res.data || []); this.productsLoading.set(false); },
      error: () => this.productsLoading.set(false),
    });
  }

  selectProduct(product: any): void { this.form['product_id'] = product.id; }

  selectedProductName(): string {
    return this.products().find(p => p.id === this.form['product_id'])?.name || '—';
  }

  lookupStaff(): void {
    this.staffLoading.set(true); this.staffError.set(null); this.staffRecord.set(null);
    this.api.get('/government-records', { search: this.form['staff_id'], per_page: 1 }).subscribe({
      next: res => {
        const records = res.data || [];
        if (records.length > 0) this.staffRecord.set(records[0]);
        else this.staffError.set('No government record found for this Staff ID');
        this.staffLoading.set(false);
      },
      error: () => { this.staffError.set('Lookup failed'); this.staffLoading.set(false); },
    });
  }

  calculate(): void {
    this.calcLoading.set(true);
    this.api.post('/loan-products/calculate', {
      product_id: this.form['product_id'],
      amount: this.form['amount'],
      tenure: this.form['tenure'],
    }).subscribe({
      next: res => { this.calcResult.set(res.data); this.calcLoading.set(false); },
      error: () => this.calcLoading.set(false),
    });
  }

  canProceed(): boolean {
    switch (this.step()) {
      case 0: return !!this.form['product_id'];
      case 1: return !!this.staffRecord();
      case 2: return !!this.form['amount'] && !!this.form['tenure'];
      case 3: return !!this.form['phone'];
      default: return true;
    }
  }

  submit(): void {
    this.submitting.set(true);
    const payload = {
      product_id: this.form['product_id'],
      staff_id: this.form['staff_id'],
      amount_requested: this.form['amount'],
      tenure: this.form['tenure'],
      customer: {
        phone: this.form['phone'], email: this.form['email'],
        bank_name: this.form['bank_name'], account_number: this.form['account_number'],
        bvn: this.form['bvn'], home_address: this.form['home_address'],
      },
    };
    this.api.post('/loans', payload).subscribe({
      next: res => { this.submitting.set(false); this.router.navigate(['/loans', res.data?.id || '']); },
      error: () => this.submitting.set(false),
    });
  }
}
