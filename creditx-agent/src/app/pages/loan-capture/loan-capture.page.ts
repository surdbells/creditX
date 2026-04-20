import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonSpinner, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronForwardOutline, chevronBackOutline, checkmarkCircleOutline, searchOutline, calculatorOutline, cloudUploadOutline, closeCircleOutline } from 'ionicons/icons';
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
        @if (agentBlocked()) {
          <div class="flex flex-col items-center justify-center py-16">
            <div class="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
              <ion-icon name="close-circle-outline" class="text-3xl text-red-500"></ion-icon>
            </div>
            <h3 class="text-base font-bold text-gray-800 mb-1">Loan Applications Paused</h3>
            <p class="text-xs text-gray-500 text-center max-w-xs">The admin has temporarily stopped accepting new loan applications. Please check back later or contact your supervisor.</p>
            <button class="mt-4 px-4 py-2 rounded-xl bg-gray-100 text-sm font-medium text-gray-600" (click)="router.navigate(['/dashboard'])">Back to Dashboard</button>
          </div>
        } @else {
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
            @if (existingCustomer() && staffRecord()) {
              <div class="p-3 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/20 text-xs text-[#8a6f1a] flex items-start gap-2">
                <ion-icon name="information-circle-outline" class="text-base flex-shrink-0 mt-0.5"></ion-icon>
                <div>Existing customer found. Contact details have been pre-filled — you can edit them as needed.</div>
              </div>
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
                @if (field.key === 'bank_name') {
                  <input type="text" class="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm"
                         [(ngModel)]="form[field.key]" [placeholder]="field.placeholder || ''"
                         list="banks-list" autocomplete="off" />
                  <datalist id="banks-list">
                    @for (b of banks(); track b.code) { <option [value]="b.name"></option> }
                  </datalist>
                } @else {
                  <input [type]="field.type || 'text'" class="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm"
                         [(ngModel)]="form[field.key]" [placeholder]="field.placeholder || ''" />
                }
              </div>
            }
          </div>
        }

        <!-- Step 5: Review & Submit -->
        <!-- Step 5: Document Upload -->
        @if (step() === 4) {
          <div class="space-y-4">
            <h3 class="text-base font-semibold text-gray-800">Upload Documents</h3>
            <p class="text-xs text-gray-500">Upload required documents (passport, ID, payslip, bank statement)</p>

            @for (docType of docTypes; track docType.key) {
              <div class="p-4 rounded-xl border border-gray-100 bg-white">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm font-medium text-gray-800">{{ docType.label }}</span>
                  @if (getUploadedDoc(docType.key)) {
                    <span class="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-1">
                      <ion-icon name="checkmark-circle" class="text-xs"></ion-icon>
                      Ready
                    </span>
                  }
                </div>
                @if (getUploadedDoc(docType.key); as docFile) {
                  <div class="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div class="flex items-center gap-2 min-w-0 flex-1">
                      <ion-icon name="document-outline" class="text-base text-gray-400 flex-shrink-0"></ion-icon>
                      <div class="min-w-0">
                        <div class="text-xs text-gray-700 truncate">{{ docFile.name }}</div>
                        <div class="text-[10px] text-gray-400">{{ formatFileSize(docFile.file.size) }}</div>
                      </div>
                    </div>
                    <button type="button" class="text-red-500 p-1" (click)="removeUpload(docType.key)" aria-label="Remove">
                      <ion-icon name="close-circle" class="text-lg"></ion-icon>
                    </button>
                  </div>
                } @else {
                  <div class="flex gap-2">
                    <label class="flex-1 py-3 rounded-xl border-2 border-dashed border-gray-200 text-center cursor-pointer hover:border-[#0A4F2A]/30 transition-colors">
                      <input type="file" class="hidden" [accept]="docType.accept" (change)="onFileSelected($event, docType.key)" />
                      <ion-icon name="cloud-upload-outline" class="text-xl text-gray-400 block mx-auto"></ion-icon>
                      <span class="text-xs text-gray-500 mt-1 block">Tap to select file</span>
                      <span class="text-[10px] text-gray-400 block">Max 10MB</span>
                    </label>
                  </div>
                }
              </div>
            }

            @if (uploadError()) {
              <div class="p-3 rounded-xl bg-red-50 text-red-600 text-sm">{{ uploadError() }}</div>
            }
          </div>
        }

        <!-- Step 6: Review & Submit -->
        @if (step() === 5) {
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

            <!-- Upload Progress (visible after loan is submitted) -->
            @if (submittedLoanId() && uploadedDocs.size > 0) {
              <div class="p-4 rounded-xl bg-white border border-gray-100 space-y-3">
                <div class="flex items-center justify-between">
                  <h4 class="text-sm font-semibold text-gray-800">Uploading Documents</h4>
                  @if (uploadsComplete()) {
                    <ion-icon name="checkmark-circle" class="text-green-600 text-lg"></ion-icon>
                  } @else {
                    <ion-spinner name="crescent" class="w-4 h-4"></ion-spinner>
                  }
                </div>
                @for (docType of docTypes; track docType.key) {
                  @if (getUploadedDoc(docType.key); as doc) {
                    <div class="space-y-1">
                      <div class="flex justify-between items-center text-xs">
                        <span class="text-gray-700 truncate pr-2">{{ docType.label }}</span>
                        @if (getUploadState(docType.key); as state) {
                          @if (state.status === 'done') {
                            <span class="text-green-600 font-medium flex items-center gap-1 flex-shrink-0">
                              <ion-icon name="checkmark-circle"></ion-icon> Done
                            </span>
                          } @else if (state.status === 'error') {
                            <button class="text-red-600 font-medium flex items-center gap-1 flex-shrink-0" (click)="retryUpload(docType.key, submittedLoanId()!)">
                              <ion-icon name="refresh-outline"></ion-icon> Retry
                            </button>
                          } @else {
                            <span class="text-[#0A4F2A] font-medium flex-shrink-0">{{ state.progress }}%</span>
                          }
                        }
                      </div>
                      <div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        @if (getUploadState(docType.key); as state) {
                          <div class="h-full transition-all duration-300 rounded-full"
                               [class]="state.status === 'error' ? 'bg-red-500' : state.status === 'done' ? 'bg-green-500' : 'bg-[#0A4F2A]'"
                               [style.width.%]="state.progress"></div>
                        }
                      </div>
                      @if (getUploadState(docType.key)?.status === 'error') {
                        <div class="text-[10px] text-red-600">{{ getUploadState(docType.key)?.error }}</div>
                      }
                    </div>
                  }
                }
                @if (uploadsComplete()) {
                  <button class="w-full py-2 rounded-lg bg-[#0A4F2A] text-white text-sm font-medium mt-2" (click)="proceedAfterUploads()">
                    Continue to Loan
                  </button>
                }
              </div>
            }
          </div>
        }

        <!-- Navigation Buttons -->
        <div class="flex gap-3 mt-6">
          @if (step() > 0) {
            <button class="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm" (click)="step.set(step() - 1)">
              <ion-icon name="chevron-back-outline"></ion-icon> Back
            </button>
          }
          @if (step() < 5) {
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
        } <!-- end else agentBlocked -->
      </div>
    </ion-content>
  `,
})
export class LoanCapturePage implements OnInit {
  step = signal(0);
  stepLabels = ['Product', 'Staff', 'Details', 'Info', 'Docs', 'Review'];

  products = signal<any[]>([]);
  productsLoading = signal(true);
  staffRecord = signal<any>(null);
  staffLoading = signal(false);
  staffError = signal<string | null>(null);
  existingCustomer = signal<any>(null);
  calcResult = signal<any>(null);
  calcLoading = signal(false);
  submitting = signal(false);

  form: any = {
    product_id: '', staff_id: '', amount: '', tenure: '',
    phone: '', email: '', bank_name: '', account_number: '',
    home_address: '', bvn: '',
  };

  uploadedDocs: Map<string, {name: string; file: File}> = new Map();
  uploadError = signal<string|null>(null);
  docTypes = [
    { key: 'passport', label: 'Passport Photograph', accept: 'image/*' },
    { key: 'id_card', label: 'ID Card (NIN/Voter/Driver)', accept: 'image/*,.pdf' },
    { key: 'payslip', label: 'Recent Payslip', accept: 'image/*,.pdf' },
    { key: 'bank_statement', label: 'Bank Statement', accept: '.pdf,image/*' },
  ];

  personalFields = [
    { key: 'phone', label: 'Phone Number', type: 'tel', placeholder: '08012345678' },
    { key: 'email', label: 'Email', type: 'email', placeholder: 'customer@email.com' },
    { key: 'bank_name', label: 'Bank Name', placeholder: 'e.g. Access Bank' },
    { key: 'account_number', label: 'Account Number', placeholder: '0123456789' },
    { key: 'bvn', label: 'BVN', placeholder: '22200000000' },
    { key: 'home_address', label: 'Home Address', placeholder: 'Residential address' },
  ];

  agentBlocked = signal(false);
  banks = signal<{code: string; name: string}[]>([]);

  constructor(private api: ApiService, public router: Router) {
    addIcons({ chevronForwardOutline, chevronBackOutline, checkmarkCircleOutline, searchOutline, calculatorOutline, cloudUploadOutline, closeCircleOutline });
  }

  ngOnInit(): void {
    // Check if agents can accept loans
    this.api.get('/settings', { per_page: 200 }).subscribe({
      next: res => {
        const settings = res.data || [];
        const s = settings.find((x: any) => x.key === 'agent.accepting_loans');
        if (s && (s.value === 'false' || s.value === '0')) {
          this.agentBlocked.set(true);
        }
      },
    });

    this.api.get('/loan-products', { per_page: 50, is_active: true }).subscribe({
      next: res => { this.products.set(res.data || []); this.productsLoading.set(false); },
      error: () => this.productsLoading.set(false),
    });

    this.api.get('/banks').subscribe({
      next: res => this.banks.set(res.data || []),
      error: () => {},
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
        if (records.length > 0) {
          const rec = records[0];
          this.staffRecord.set(rec);
          // Auto-fill from government record (still editable)
          if (!this.form['phone'] && rec.telephone_number) this.form['phone'] = rec.telephone_number;
          if (!this.form['bank_name'] && rec.bank_name) this.form['bank_name'] = rec.bank_name;
          if (!this.form['account_number'] && rec.account_number) this.form['account_number'] = rec.account_number;
          // Check for existing customer (richer data: email, address, etc)
          this.api.get('/customers', { search: rec.staff_id, per_page: 1 }).subscribe({
            next: cres => {
              const customers = cres.data || [];
              if (customers.length > 0) {
                const c = customers[0];
                // Only overwrite if form field is empty — don't clobber agent edits
                if (!this.form['phone'] && c.phone) this.form['phone'] = c.phone;
                if (!this.form['email'] && c.email) this.form['email'] = c.email;
                if (!this.form['bank_name'] && c.bank_name) this.form['bank_name'] = c.bank_name;
                if (!this.form['account_number'] && c.account_number) this.form['account_number'] = c.account_number;
                this.existingCustomer.set(c);
              }
              this.staffLoading.set(false);
            },
            error: () => this.staffLoading.set(false),
          });
        } else {
          this.staffError.set('No government record found for this Staff ID');
          this.staffLoading.set(false);
        }
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
      case 4: return true; // docs are optional
      default: return true;
    }
  }

  getUploadedDoc(key: string): {name: string; file: File} | undefined {
    return this.uploadedDocs.get(key);
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  removeUpload(docKey: string): void {
    this.uploadedDocs.delete(docKey);
    const states = new Map(this.uploadStates());
    states.delete(docKey);
    this.uploadStates.set(states);
  }

  onFileSelected(event: Event, docKey: string): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (file.size > 10 * 1024 * 1024) {
        this.uploadError.set('File size must be under 10MB');
        return;
      }
      this.uploadedDocs.set(docKey, { name: file.name, file });
      this.uploadError.set(null);
    }
  }

  // Per-document upload state: docKey -> { progress: 0-100, status: 'pending'|'uploading'|'done'|'error', error?: string }
  uploadStates = signal<Map<string, { progress: number; status: 'pending' | 'uploading' | 'done' | 'error'; error?: string }>>(new Map());

  private uploadDocuments(loanId: string): void {
    const states = new Map(this.uploadStates());
    this.uploadedDocs.forEach((_, docType) => {
      states.set(docType, { progress: 0, status: 'pending' });
    });
    this.uploadStates.set(states);

    this.uploadedDocs.forEach((doc, docType) => {
      const formData = new FormData();
      formData.append('file', doc.file);
      formData.append('type', docType);
      formData.append('loan_id', loanId);

      this.setUploadState(docType, { progress: 0, status: 'uploading' });

      this.api.uploadWithProgress(`/documents`, formData).subscribe({
        next: (event: any) => {
          if (event.type === 1 /* HttpEventType.UploadProgress */ && event.total) {
            const pct = Math.round((event.loaded / event.total) * 100);
            this.setUploadState(docType, { progress: pct, status: 'uploading' });
          } else if (event.type === 4 /* HttpEventType.Response */) {
            this.setUploadState(docType, { progress: 100, status: 'done' });
          }
        },
        error: (err) => {
          const msg = err?.error?.message || err?.message || 'Upload failed';
          this.setUploadState(docType, { progress: 0, status: 'error', error: msg });
        },
      });
    });
  }

  private setUploadState(docKey: string, state: { progress: number; status: 'pending' | 'uploading' | 'done' | 'error'; error?: string }): void {
    const next = new Map(this.uploadStates());
    next.set(docKey, state);
    this.uploadStates.set(next);
  }

  getUploadState(docKey: string) {
    return this.uploadStates().get(docKey);
  }

  retryUpload(docKey: string, loanId: string): void {
    const doc = this.uploadedDocs.get(docKey);
    if (!doc || !loanId) return;
    const formData = new FormData();
    formData.append('file', doc.file);
    formData.append('type', docKey);
    formData.append('loan_id', loanId);
    this.setUploadState(docKey, { progress: 0, status: 'uploading' });
    this.api.uploadWithProgress(`/documents`, formData).subscribe({
      next: (event: any) => {
        if (event.type === 1 && event.total) {
          this.setUploadState(docKey, { progress: Math.round((event.loaded / event.total) * 100), status: 'uploading' });
        } else if (event.type === 4) {
          this.setUploadState(docKey, { progress: 100, status: 'done' });
        }
      },
      error: (err) => this.setUploadState(docKey, { progress: 0, status: 'error', error: err?.error?.message || 'Upload failed' }),
    });
  }

  submittedLoanId = signal<string | null>(null);
  uploadsComplete = signal(false);

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
      next: res => {
        this.submitting.set(false);
        const loanId = res.data?.id || '';
        this.submittedLoanId.set(loanId);
        if (loanId && this.uploadedDocs.size > 0) {
          this.uploadDocuments(loanId);
          this.pollUploadsComplete(loanId);
        } else {
          this.router.navigate(['/loans', loanId]);
        }
      },
      error: () => this.submitting.set(false),
    });
  }

  private pollUploadsComplete(loanId: string): void {
    const iv = setInterval(() => {
      const states = Array.from(this.uploadStates().values());
      if (states.length === 0) return;
      const allDone = states.every(s => s.status === 'done' || s.status === 'error');
      if (allDone) {
        clearInterval(iv);
        this.uploadsComplete.set(true);
        // If all succeeded, auto-navigate after a brief success pause
        const allSucceeded = states.every(s => s.status === 'done');
        if (allSucceeded) {
          setTimeout(() => this.router.navigate(['/loans', loanId]), 800);
        }
        // Otherwise stay on page so user can retry failed uploads
      }
    }, 400);
  }

  proceedAfterUploads(): void {
    const loanId = this.submittedLoanId();
    if (loanId) this.router.navigate(['/loans', loanId]);
  }
}
