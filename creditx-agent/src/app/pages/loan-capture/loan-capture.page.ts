import { Component, OnInit, OnDestroy, signal, computed, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonSpinner, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronForwardOutline, chevronBackOutline, checkmarkCircleOutline, searchOutline, calculatorOutline, cloudUploadOutline, closeCircleOutline, checkmarkCircle, documentOutline, refreshOutline, informationCircleOutline, alertCircleOutline, closeCircle, checkmark, close } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { NIGERIAN_STATES, getLgasForState } from '../../core/data/nigerian-states';
import { BankSelectComponent } from '../../shared/bank-select.component';

@Component({
  selector: 'app-loan-capture',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonSpinner, IonIcon, BankSelectComponent],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button [defaultHref]="isEditMode() ? ('/loans/' + id) : '/loans'"></ion-back-button></ion-buttons>
        <ion-title>{{ isEditMode() ? 'Edit Loan' : 'New Application' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      @if (editLoading()) {
        <!--
          Edit-mode hydration is in flight. Block the form so the agent
          doesn't type into fields that are about to be overwritten.
        -->
        <div class="cxm-empty cxm-lc-blocked">
          <ion-spinner name="crescent" style="width: 32px; height: 32px"></ion-spinner>
          <div class="cxm-empty-title" style="margin-top: 16px">Loading loan...</div>
        </div>
      } @else if (agentBlocked()) {
        <div class="cxm-empty cxm-lc-blocked">
          <div class="cxm-empty-icon" style="background: var(--cx-danger-50); color: var(--cx-danger)">
            <ion-icon name="close-circle-outline" style="font-size: 28px"></ion-icon>
          </div>
          <div class="cxm-empty-title">Applications Paused</div>
          <div class="cxm-empty-desc">The admin has temporarily stopped accepting new loan applications. Please check back later or contact your supervisor.</div>
          <button class="cxm-lc-back-btn" (click)="router.navigate(['/dashboard'])">Back to Dashboard</button>
        </div>
      } @else {
        <!-- Page header -->
        <div class="cxm-page-header cx-animate-in" style="padding-bottom: 12px">
          <div class="cxm-eyebrow cxm-eyebrow-primary">
            @if (isEditMode()) {
              Editing {{ editLoan()?.application_id || 'loan' }}
            } @else {
              Step {{ step() + 1 }} of {{ stepLabels.length }}
            }
          </div>
          <h1 class="cxm-title">{{ stepLabels[step()] }}</h1>
          <p class="cxm-subtitle">{{ stepHints[step()] }}</p>
        </div>

        <!-- Step indicator pill rail -->
        <div class="cxm-lc-rail-wrap">
          <div class="cxm-lc-rail">
            @for (s of stepLabels; track s; let i = $index; let last = $last) {
              <div class="cxm-lc-step-wrap" [class.is-last]="last">
                <div class="cxm-lc-step"
                     [class.is-active]="step() === i"
                     [class.is-done]="step() > i">
                  @if (step() > i) {
                    <ion-icon name="checkmark" style="font-size: 12px"></ion-icon>
                  } @else {
                    <span class="tabular-nums">{{ i + 1 }}</span>
                  }
                </div>
                @if (!last) {
                  <div class="cxm-lc-rail-line" [class.is-done]="step() > i"></div>
                }
              </div>
            }
          </div>
        </div>

        <div class="cxm-lc-body">
          <!-- Step 1: Product Select -->
          @if (step() === 0) {
            <div class="flex flex-col gap-2">
              @if (productsLoading()) {
                <div class="cxm-loading">
                  <div class="cxm-loading-dots"><span></span><span></span><span></span></div>
                  <span class="cxm-loading-text">Loading products...</span>
                </div>
              } @else {
                @for (product of products(); track product.id) {
                  <button type="button" class="cxm-lc-product"
                          [class.is-selected]="form['product_id'] === product.id"
                          (click)="selectProduct(product)">
                    <div class="cxm-lc-product-main">
                      <div class="cxm-lc-product-name">{{ product.name }}</div>
                      <div class="cxm-lc-product-meta">
                        <span>{{ product.interest_calculation_method }}</span>
                        <span class="cxm-lc-dot">·</span>
                        <span class="cxm-lc-product-rate">{{ product.interest_rate }}%</span>
                        <span class="cxm-lc-dot">·</span>
                        <span>{{ product.min_tenure }}–{{ product.max_tenure }} mo</span>
                      </div>
                      <div class="cxm-lc-product-range tabular-nums">
                        ₦{{ product.min_amount | number:'1.0-0' }} – ₦{{ product.max_amount | number:'1.0-0' }}
                      </div>
                    </div>
                    <div class="cxm-lc-product-check">
                      @if (form['product_id'] === product.id) {
                        <ion-icon name="checkmark" style="font-size: 14px"></ion-icon>
                      }
                    </div>
                  </button>
                }
              }
            </div>
          }

          <!-- Step 2: Staff Lookup -->
          @if (step() === 1) {
            <div class="flex flex-col gap-3">
              <div class="cxm-lc-card">
                <label class="cxm-lc-label">Staff ID / IPPIS Number</label>
                <div class="cxm-lc-search-row">
                  <input type="text" class="cxm-lc-input"
                         [(ngModel)]="form['staff_id']"
                         (ngModelChange)="onStaffIdChange()"
                         placeholder="Enter staff ID"
                         (keyup.enter)="lookupStaff()" />
                  <button class="cxm-lc-search-btn"
                          [disabled]="staffLoading() || !form['staff_id']"
                          (click)="lookupStaff()">
                    @if (staffLoading()) {
                      <ion-spinner name="crescent" style="width: 16px; height: 16px"></ion-spinner>
                    } @else {
                      <ion-icon name="search-outline" style="font-size: 18px"></ion-icon>
                    }
                  </button>
                </div>
              </div>

              @if (staffRecord()) {
                <div class="cxm-lc-result cx-animate-in">
                  <div class="cxm-lc-result-head">
                    <div class="cxm-avatar cxm-avatar-lg">
                      {{ staffRecord()?.employee_name?.charAt(0) }}
                    </div>
                    <div class="cxm-lc-result-meta">
                      <div class="cxm-lc-result-name">{{ staffRecord()?.employee_name }}</div>
                      <div class="cxm-lc-result-job">{{ staffRecord()?.job_title || '—' }} · {{ staffRecord()?.organization || '—' }}</div>
                    </div>
                    <div class="cxm-lc-result-check">
                      <ion-icon name="checkmark-circle" style="font-size: 20px"></ion-icon>
                    </div>
                  </div>
                  <div class="cxm-lc-result-stats">
                    <div class="cxm-lc-result-stat">
                      <div class="cxm-eyebrow">Gross Pay</div>
                      <div class="cxm-lc-result-stat-value tabular-nums">₦{{ staffRecord()?.gross_pay | number:'1.0-0' }}</div>
                    </div>
                    <div class="cxm-lc-result-stat">
                      <div class="cxm-eyebrow">Net Pay</div>
                      <div class="cxm-lc-result-stat-value tabular-nums">₦{{ staffRecord()?.net_pay | number:'1.0-0' }}</div>
                    </div>
                  </div>
                </div>
              }

              @if (staffError()) {
                <div class="cxm-lc-error">
                  <ion-icon name="alert-circle-outline" style="font-size: 16px"></ion-icon>
                  <span>{{ staffError() }}</span>
                </div>
              }

              @if (existingCustomer() && staffRecord()) {
                <div class="cxm-lc-info">
                  <ion-icon name="information-circle-outline" style="font-size: 16px"></ion-icon>
                  <div>Existing customer found. Contact details have been pre-filled — you can still edit them.</div>
                </div>
              }
            </div>
          }

          <!-- Step 3: Loan Details -->
          @if (step() === 2) {
            <div class="flex flex-col gap-3">
              <div class="cxm-lc-card">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="cxm-lc-label">Amount (₦)</label>
                    <input type="number" class="cxm-lc-input tabular-nums" [(ngModel)]="form['amount']"
                           (ngModelChange)="onAmountChange()" placeholder="500,000" />
                  </div>
                  <div>
                    <label class="cxm-lc-label">Tenure (months)</label>
                    <input type="number" class="cxm-lc-input tabular-nums" [(ngModel)]="form['tenure']" placeholder="12" />
                  </div>
                </div>
                <button class="cxm-lc-calc-btn" [disabled]="calcLoading() || !form['amount'] || !form['tenure']" (click)="calculate()">
                  @if (calcLoading()) {
                    <ion-spinner name="crescent" style="width: 14px; height: 14px"></ion-spinner>
                    <span>Calculating...</span>
                  } @else {
                    <ion-icon name="calculator-outline" style="font-size: 14px"></ion-icon>
                    <span>Calculate Breakdown</span>
                  }
                </button>
              </div>

              @if (calcResult()) {
                <div class="grid grid-cols-2 gap-3 cx-animate-in">
                  <div class="cxm-lc-calc-hero cxm-lc-calc-hero-primary">
                    <div class="cxm-eyebrow">Net Disbursed</div>
                    <div class="cxm-lc-calc-value tabular-nums">₦{{ calcResult()?.net_disbursed | number:'1.0-0' }}</div>
                  </div>
                  <div class="cxm-lc-calc-hero cxm-lc-calc-hero-gold">
                    <div class="cxm-eyebrow cxm-eyebrow-gold">Monthly</div>
                    <div class="cxm-lc-calc-value cxm-lc-calc-value-gold tabular-nums">₦{{ calcResult()?.mr_principal_interest | number:'1.0-0' }}</div>
                  </div>
                </div>
                <div class="cxm-lc-card">
                  <div class="cxm-lc-calc-field">
                    <span class="cxm-lc-calc-field-label">Gross Loan</span>
                    <span class="cxm-lc-calc-field-value tabular-nums">₦{{ calcResult()?.gross_loan | number:'1.2-2' }}</span>
                  </div>
                  <div class="cxm-lc-calc-field">
                    <span class="cxm-lc-calc-field-label">Total Fees</span>
                    <span class="cxm-lc-calc-field-value tabular-nums">₦{{ calcResult()?.total_fees | number:'1.2-2' }}</span>
                  </div>
                </div>
              }
            </div>
          }

          <!-- Step 4: Personal & Banking -->
          @if (step() === 3) {
            <div class="flex flex-col gap-3">

              <!-- Personal section -->
              <div class="cxm-lc-card" id="section-personal">
                <div class="cxm-lc-section-title">Personal Information</div>
                <div class="flex flex-col gap-3">
                  <div>
                    <label class="cxm-lc-label">Full Name <span class="cxm-lc-req">*</span></label>
                    <input class="cxm-lc-input" [(ngModel)]="form['full_name']" placeholder="As shown on ID" />
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="cxm-lc-label">Date of Birth</label>
                      <input type="date" class="cxm-lc-input" [(ngModel)]="form['date_of_birth']" />
                    </div>
                    <div>
                      <label class="cxm-lc-label">Gender</label>
                      <select class="cxm-lc-select" [(ngModel)]="form['gender']">
                        <option value="">Select...</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="cxm-lc-label">Marital Status</label>
                      <select class="cxm-lc-select" [(ngModel)]="form['marital_status']">
                        <option value="">Select...</option>
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Divorced">Divorced</option>
                        <option value="Widowed">Widowed</option>
                      </select>
                    </div>
                    <div>
                      <label class="cxm-lc-label">Children</label>
                      <input type="number" min="0" max="20" class="cxm-lc-input" [(ngModel)]="form['number_of_children']" placeholder="0" />
                    </div>
                  </div>
                  <div>
                    <label class="cxm-lc-label">BVN <span class="cxm-lc-req">*</span></label>
                    <input type="text" inputmode="numeric" maxlength="11" pattern="\d*" class="cxm-lc-input"
                           [class.is-invalid]="bvnError()"
                           [(ngModel)]="form['bvn']"
                           (ngModelChange)="onBvnChange($event)"
                           placeholder="22200000000" />
                    @if (bvnError(); as err) {
                      <div class="cxm-lc-field-err">{{ err }}</div>
                    }
                  </div>
                  <div>
                    <label class="cxm-lc-label">Mother's Maiden Name</label>
                    <input class="cxm-lc-input" [(ngModel)]="form['mothers_maiden_name']" />
                  </div>
                  <div>
                    <label class="cxm-lc-label">Religion</label>
                    <select class="cxm-lc-select" [(ngModel)]="form['religion']">
                      <option value="">Select...</option>
                      <option value="Christian">Christian</option>
                      <option value="Muslim">Muslim</option>
                      <option value="Others">Others</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Contact section -->
              <div class="cxm-lc-card" id="section-contact">
                <div class="cxm-lc-section-title">Contact Information</div>
                <div class="flex flex-col gap-3">
                  <div>
                    <label class="cxm-lc-label">Phone <span class="cxm-lc-req">*</span></label>
                    <input type="tel" maxlength="11" class="cxm-lc-input"
                           [(ngModel)]="form['phone']" placeholder="08012345678" />
                  </div>
                  <div>
                    <label class="cxm-lc-label">Alternative Phone</label>
                    <input type="tel" maxlength="11" class="cxm-lc-input" [(ngModel)]="form['alt_phone']" />
                  </div>
                  <div>
                    <label class="cxm-lc-label">Email</label>
                    <input type="email" class="cxm-lc-input" [(ngModel)]="form['email']" placeholder="customer@email.com" />
                  </div>
                  <div>
                    <label class="cxm-lc-label">Home Address (nearest bus stop)</label>
                    <input class="cxm-lc-input" [(ngModel)]="form['home_address']" />
                  </div>
                  <div>
                    <label class="cxm-lc-label">Permanent Home Address</label>
                    <input class="cxm-lc-input" [(ngModel)]="form['permanent_address']" />
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="cxm-lc-label">State of Origin</label>
                      <select class="cxm-lc-select"
                              [(ngModel)]="form['state_of_origin']"
                              (ngModelChange)="onStateChange($event)">
                        <option value="">Select state...</option>
                        @for (s of states; track s.name) {
                          <option [value]="s.name">{{ s.name }}</option>
                        }
                      </select>
                    </div>
                    <div>
                      <label class="cxm-lc-label">LGA</label>
                      <select class="cxm-lc-select"
                              [(ngModel)]="form['lga']"
                              [disabled]="availableLgas().length === 0">
                        <option value="">
                          {{ availableLgas().length === 0 ? 'Select state first' : 'Select LGA...' }}
                        </option>
                        @for (lga of availableLgas(); track lga) {
                          <option [value]="lga">{{ lga }}</option>
                        }
                      </select>
                    </div>
                  </div>
                  <div>
                    <label class="cxm-lc-label">Home Town</label>
                    <input class="cxm-lc-input" [(ngModel)]="form['hometown']" />
                  </div>
                </div>
              </div>

              <!-- Employment section -->
              <div class="cxm-lc-card" id="section-employment">
                <div class="cxm-lc-section-title">Employment Information</div>
                <div class="flex flex-col gap-3">
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="cxm-lc-label">Employee ID</label>
                      <input class="cxm-lc-input" [(ngModel)]="form['employee_id']" />
                    </div>
                    <div>
                      <label class="cxm-lc-label">Net Pay (₦)</label>
                      <input type="number" class="cxm-lc-input tabular-nums" [(ngModel)]="form['gross_pay']" />
                    </div>
                  </div>
                  <div>
                    <label class="cxm-lc-label">Job Title</label>
                    <input class="cxm-lc-input" [(ngModel)]="form['job_title']" />
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="cxm-lc-label">Employer</label>
                      <input class="cxm-lc-input" [(ngModel)]="form['employer']" />
                    </div>
                    <div>
                      <label class="cxm-lc-label">Sub-Organization</label>
                      <input class="cxm-lc-input" [(ngModel)]="form['organization']" />
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="cxm-lc-label">Command</label>
                      <input class="cxm-lc-input" [(ngModel)]="form['command']" />
                    </div>
                    <div>
                      <label class="cxm-lc-label">Employment Date</label>
                      <input type="date" class="cxm-lc-input" [(ngModel)]="form['employment_date']" />
                    </div>
                  </div>
                  <div>
                    <label class="cxm-lc-label">ID Type</label>
                    <select class="cxm-lc-select" [(ngModel)]="form['id_type']">
                      <option value="">Select...</option>
                      <option value="WorkID">Work ID</option>
                      <option value="OldNationalID">National ID</option>
                      <option value="DriversLicense">Driver's License</option>
                      <option value="VotersCard">Voter's Card</option>
                      <option value="NigerianIntPassport">Int'l Passport</option>
                      <option value="NHISCard">NHIS Card</option>
                      <option value="GovStaffID">Gov Staff ID</option>
                      <option value="BirthCertificate">Birth Certificate</option>
                    </select>
                  </div>
                  <div>
                    <label class="cxm-lc-label">Work ID Number</label>
                    <input class="cxm-lc-input" [(ngModel)]="form['work_id_number']" />
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="cxm-lc-label">ID Issued</label>
                      <input type="date" class="cxm-lc-input" [(ngModel)]="form['work_id_issued_date']" />
                    </div>
                    <div>
                      <label class="cxm-lc-label">ID Expires</label>
                      <input type="date" class="cxm-lc-input" [(ngModel)]="form['work_id_expiry_date']" />
                    </div>
                  </div>
                </div>
              </div>

              <!-- Loan extras section -->
              <div class="cxm-lc-card" id="section-loan">
                <div class="cxm-lc-section-title">Loan Details</div>
                <div class="flex flex-col gap-3">
                  <div>
                    <label class="cxm-lc-label">Amount in Words</label>
                    <input class="cxm-lc-input cxm-lc-readonly" [(ngModel)]="form['loan_amount_words']" readonly
                           placeholder="Computed from the amount above" />
                  </div>
                  <div>
                    <label class="cxm-lc-label">Loan Purpose</label>
                    <input class="cxm-lc-input" [(ngModel)]="form['loan_purpose']" placeholder="Public Sector" />
                  </div>
                  <div>
                    <label class="cxm-lc-label">Repayment Method</label>
                    <select class="cxm-lc-select" [(ngModel)]="form['repayment_method']">
                      <option value="">Select...</option>
                      <option value="Direct Debit">Direct Debit</option>
                      <option value="Cheques">Cheques</option>
                      <option value="Payroll Deduction">Payroll Deduction</option>
                    </select>
                  </div>
                  <div>
                    <label class="cxm-lc-label">Bank Statement Mode</label>
                    <select class="cxm-lc-select" [(ngModel)]="form['bank_statement_mode']">
                      <option value="">No statement fee</option>
                      <option value="generated_by_company">Generated by company (₦500 fee)</option>
                      <option value="not_generated_by_company">Not generated by company</option>
                    </select>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="cxm-lc-label">Statement ID</label>
                      <input class="cxm-lc-input" [(ngModel)]="form['account_statement_id']" />
                    </div>
                    <div>
                      <label class="cxm-lc-label">Statement Password</label>
                      <input type="text" class="cxm-lc-input" [(ngModel)]="form['account_statement_password']" />
                    </div>
                  </div>
                </div>
              </div>

              <!-- Bank section -->
              <div class="cxm-lc-card" id="section-bank">
                <div class="cxm-lc-section-title">Disbursement Bank</div>
                <div class="flex flex-col gap-3">
                  <div>
                    <label class="cxm-lc-label">Bank Name <span class="cxm-lc-req">*</span></label>
                    <cxm-bank-select [banks]="banks()" [value]="form['bank_name']" placeholder="Search bank…"
                                     (valueChange)="form['bank_name'] = $event; onAccountInput('main')"></cxm-bank-select>
                  </div>
                  <div>
                    <label class="cxm-lc-label">Account Number <span class="cxm-lc-req">*</span></label>
                    <input type="text" maxlength="10" inputmode="numeric" class="cxm-lc-input"
                           [(ngModel)]="form['account_number']" (ngModelChange)="onAccountInput('main')"
                           placeholder="0123456789" />
                  </div>
                  <div>
                    <label class="cxm-lc-label">Account Name</label>
                    <input class="cxm-lc-input" [class.cxm-lc-readonly]="!manualMain()" [readonly]="!manualMain()"
                           [(ngModel)]="form['account_name']"
                           [placeholder]="manualMain() ? 'Type the account name' : 'Auto-filled from account number'" />
                    <div class="cxm-lc-acct-row">
                      @if (!manualMain()) {
                        @if (resolvingMain()) {
                          <span class="cxm-lc-acct-hint">Verifying account…</span>
                        } @else if (acctErrMain()) {
                          <span class="cxm-lc-acct-hint cxm-lc-acct-err">{{ acctErrMain() }}</span>
                        } @else if (form['account_name']) {
                          <span class="cxm-lc-acct-hint cxm-lc-acct-ok">✓ Verified</span>
                        }
                      }
                      <button type="button" class="cxm-lc-acct-toggle" (click)="toggleManual('main')">
                        {{ manualMain() ? 'Use auto-resolve' : 'Enter manually' }}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label class="cxm-lc-label">Alternate Bank</label>
                    <cxm-bank-select [banks]="banks()" [value]="form['alt_bank_name']" placeholder="Search bank…"
                                     (valueChange)="form['alt_bank_name'] = $event; onAccountInput('alt')"></cxm-bank-select>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="cxm-lc-label">Alt Account #</label>
                      <input type="text" maxlength="10" inputmode="numeric" class="cxm-lc-input"
                             [(ngModel)]="form['alt_account_number']" (ngModelChange)="onAccountInput('alt')" />
                    </div>
                    <div>
                      <label class="cxm-lc-label">Alt Account Name</label>
                      <input class="cxm-lc-input" [class.cxm-lc-readonly]="!manualAlt()" [readonly]="!manualAlt()"
                             [(ngModel)]="form['alt_account_name']"
                             [placeholder]="manualAlt() ? 'Type the name' : 'Auto-filled'" />
                    </div>
                  </div>
                  <div class="cxm-lc-acct-row">
                    @if (!manualAlt()) {
                      @if (resolvingAlt()) {
                        <span class="cxm-lc-acct-hint">Verifying alternate account…</span>
                      } @else if (acctErrAlt()) {
                        <span class="cxm-lc-acct-hint cxm-lc-acct-err">{{ acctErrAlt() }}</span>
                      } @else if (form['alt_account_name']) {
                        <span class="cxm-lc-acct-hint cxm-lc-acct-ok">✓ Verified</span>
                      }
                    }
                    <button type="button" class="cxm-lc-acct-toggle" (click)="toggleManual('alt')">
                      {{ manualAlt() ? 'Use auto-resolve' : 'Enter manually' }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Next of Kin section -->
              <div class="cxm-lc-card" id="section-nok">
                <div class="cxm-lc-section-title">Next of Kin</div>
                <div class="flex flex-col gap-3">
                  <div>
                    <label class="cxm-lc-label">Full Name</label>
                    <input class="cxm-lc-input" [(ngModel)]="form['nok_full_name']" />
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="cxm-lc-label">Phone</label>
                      <input type="tel" maxlength="11" class="cxm-lc-input" [(ngModel)]="form['nok_phone']" />
                    </div>
                    <div>
                      <label class="cxm-lc-label">Relationship</label>
                      <select class="cxm-lc-select" [(ngModel)]="form['nok_relationship']">
                        <option value="">Select...</option>
                        <option value="Father">Father</option>
                        <option value="Mother">Mother</option>
                        <option value="Brother">Brother</option>
                        <option value="Sister">Sister</option>
                        <option value="Wife">Wife</option>
                        <option value="Husband">Husband</option>
                        <option value="Son">Son</option>
                        <option value="Daughter">Daughter</option>
                        <option value="Friend">Friend</option>
                        <option value="Others">Others</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label class="cxm-lc-label">Address</label>
                    <input class="cxm-lc-input" [(ngModel)]="form['nok_address']" />
                  </div>
                </div>
              </div>

            </div>
          }

          <!-- Step 5: Document Upload -->
          @if (step() === 4) {
            <div class="flex flex-col gap-3">
              <div class="cxm-lc-doc-head-row">
                <p class="cxm-lc-doc-hint">All documents are required. Max 10MB each.</p>
                <span class="cxm-lc-doc-counter tabular-nums"
                      [class.is-complete]="allDocsStaged()">
                  {{ stagedDocCount() }} of {{ docTypes.length }}
                </span>
              </div>

              @for (docType of docTypes; track docType.key) {
                <div class="cxm-lc-doc">
                  <div class="cxm-lc-doc-head">
                    <span class="cxm-lc-doc-name">{{ docType.label }}</span>
                    @if (getUploadedDoc(docType.key); as dd) {
                      <span class="cxm-status" [attr.data-tone]="isExistingDoc(dd) ? 'info' : 'success'">
                        <span class="cxm-status-dot"></span>
                        <span>{{ isExistingDoc(dd) ? 'Already uploaded' : 'Ready' }}</span>
                      </span>
                    }
                  </div>
                  @if (getUploadedDoc(docType.key); as docFile) {
                    <div class="cxm-lc-doc-selected">
                      <div class="cxm-lc-doc-selected-icon">
                        <ion-icon name="document-outline" style="font-size: 16px"></ion-icon>
                      </div>
                      <div class="cxm-lc-doc-selected-meta">
                        <div class="cxm-lc-doc-selected-name">{{ docFile.name }}</div>
                        @if (isExistingDoc(docFile)) {
                          <div class="cxm-lc-doc-selected-size" style="color: var(--cx-text-muted); font-size: 11px">
                            Saved on server · Tap Replace to upload a new file
                          </div>
                        } @else {
                          <div class="cxm-lc-doc-selected-size tabular-nums">{{ formatFileSize(docFile.file?.size || 0) }}</div>
                        }
                      </div>
                      @if (isExistingDoc(docFile)) {
                        <!--
                          Existing docs get a Replace button (relabels the
                          file input) instead of a Remove button. Removing
                          an existing doc via the wizard would put the loan
                          in a bad state (3 of 4 required docs) without a
                          clear recovery path — we don't expose that.
                          Replace lets the agent swap the file; the old
                          server-side record stays attached until Save.
                        -->
                        <label class="cxm-lc-doc-remove" aria-label="Replace" style="cursor: pointer">
                          <input type="file" class="hidden" [accept]="docType.accept" (change)="onFileSelected($event, docType.key)" />
                          <ion-icon name="refresh-outline" style="font-size: 16px"></ion-icon>
                        </label>
                      } @else {
                        <button type="button" class="cxm-lc-doc-remove" (click)="removeUpload(docType.key)" aria-label="Remove">
                          <ion-icon name="close" style="font-size: 16px"></ion-icon>
                        </button>
                      }
                    </div>
                  } @else {
                    <label class="cxm-lc-doc-drop">
                      <input type="file" class="hidden" [accept]="docType.accept" (change)="onFileSelected($event, docType.key)" />
                      <ion-icon name="cloud-upload-outline" style="font-size: 22px; color: var(--cx-text-muted)"></ion-icon>
                      <span class="cxm-lc-doc-drop-label">Tap to select file</span>
                    </label>
                  }
                </div>
              }

              @if (uploadError()) {
                <div class="cxm-lc-error">
                  <ion-icon name="alert-circle-outline" style="font-size: 16px"></ion-icon>
                  <span>{{ uploadError() }}</span>
                </div>
              }
            </div>
          }

          <!-- Step 6: Review & Submit -->
          @if (step() === 5) {
            <div class="flex flex-col gap-3">

              <!-- Loan summary (product, staff, amounts) -->
              <div class="cxm-lc-card">
                <div class="cxm-lc-review-head">
                  <h3 class="cxm-lc-review-title">Loan Summary</h3>
                  <button class="cxm-lc-edit-btn" (click)="step.set(2)" type="button">
                    <span>Edit</span>
                  </button>
                </div>
                <div class="cxm-lc-review-fields">
                  <div class="cxm-lc-field">
                    <span class="cxm-lc-field-label">Product</span>
                    <span class="cxm-lc-field-value">{{ selectedProductName() }}</span>
                  </div>
                  <div class="cxm-lc-field">
                    <span class="cxm-lc-field-label">Staff ID</span>
                    <span class="cxm-lc-field-value cxm-lc-field-mono">{{ form['staff_id'] }}</span>
                  </div>
                  <div class="cxm-lc-field">
                    <span class="cxm-lc-field-label">Amount</span>
                    <span class="cxm-lc-field-value tabular-nums">₦{{ form['amount'] | number:'1.0-0' }}</span>
                  </div>
                  <div class="cxm-lc-field">
                    <span class="cxm-lc-field-label">Tenure</span>
                    <span class="cxm-lc-field-value tabular-nums">{{ form['tenure'] }} months</span>
                  </div>
                  @if (calcResult(); as calc) {
                    <div class="cxm-lc-review-divider"></div>
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Net Disbursed</span>
                      <span class="cxm-lc-field-value cxm-lc-field-primary tabular-nums">₦{{ calc.net_disbursed | number:'1.0-0' }}</span>
                    </div>
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Monthly Payment</span>
                      <span class="cxm-lc-field-value cxm-lc-field-gold tabular-nums">₦{{ calc.mr_principal_interest | number:'1.0-0' }}</span>
                    </div>
                  }
                </div>
              </div>

              <!-- Personal -->
              <div class="cxm-lc-card">
                <div class="cxm-lc-review-head">
                  <h3 class="cxm-lc-review-title">Personal Information</h3>
                  <button class="cxm-lc-edit-btn" (click)="goToEdit('section-personal')" type="button">
                    <span>Edit</span>
                  </button>
                </div>
                <div class="cxm-lc-review-fields">
                  @if (form['full_name']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Full Name</span>
                      <span class="cxm-lc-field-value">{{ form['full_name'] }}</span>
                    </div>
                  }
                  @if (form['date_of_birth']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Date of Birth</span>
                      <span class="cxm-lc-field-value">{{ form['date_of_birth'] }}</span>
                    </div>
                  }
                  @if (form['gender']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Gender</span>
                      <span class="cxm-lc-field-value">{{ form['gender'] }}</span>
                    </div>
                  }
                  @if (form['marital_status']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Marital Status</span>
                      <span class="cxm-lc-field-value">{{ form['marital_status'] }}</span>
                    </div>
                  }
                  @if (form['number_of_children']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Children</span>
                      <span class="cxm-lc-field-value tabular-nums">{{ form['number_of_children'] }}</span>
                    </div>
                  }
                  @if (form['bvn']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">BVN</span>
                      <span class="cxm-lc-field-value cxm-lc-field-mono tabular-nums">{{ form['bvn'] }}</span>
                    </div>
                  }
                  @if (form['mothers_maiden_name']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Mother's Maiden</span>
                      <span class="cxm-lc-field-value">{{ form['mothers_maiden_name'] }}</span>
                    </div>
                  }
                  @if (form['religion']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Religion</span>
                      <span class="cxm-lc-field-value">{{ form['religion'] }}</span>
                    </div>
                  }
                </div>
              </div>

              <!-- Contact -->
              <div class="cxm-lc-card">
                <div class="cxm-lc-review-head">
                  <h3 class="cxm-lc-review-title">Contact Information</h3>
                  <button class="cxm-lc-edit-btn" (click)="goToEdit('section-contact')" type="button">
                    <span>Edit</span>
                  </button>
                </div>
                <div class="cxm-lc-review-fields">
                  @if (form['phone']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Phone</span>
                      <span class="cxm-lc-field-value cxm-lc-field-mono">{{ form['phone'] }}</span>
                    </div>
                  }
                  @if (form['alt_phone']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Alt Phone</span>
                      <span class="cxm-lc-field-value cxm-lc-field-mono">{{ form['alt_phone'] }}</span>
                    </div>
                  }
                  @if (form['email']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Email</span>
                      <span class="cxm-lc-field-value">{{ form['email'] }}</span>
                    </div>
                  }
                  @if (form['home_address']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Home Address</span>
                      <span class="cxm-lc-field-value">{{ form['home_address'] }}</span>
                    </div>
                  }
                  @if (form['permanent_address']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Permanent</span>
                      <span class="cxm-lc-field-value">{{ form['permanent_address'] }}</span>
                    </div>
                  }
                  @if (form['state_of_origin']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">State</span>
                      <span class="cxm-lc-field-value">{{ form['state_of_origin'] }}</span>
                    </div>
                  }
                  @if (form['lga']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">LGA</span>
                      <span class="cxm-lc-field-value">{{ form['lga'] }}</span>
                    </div>
                  }
                  @if (form['hometown']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Home Town</span>
                      <span class="cxm-lc-field-value">{{ form['hometown'] }}</span>
                    </div>
                  }
                </div>
              </div>

              <!-- Employment -->
              <div class="cxm-lc-card">
                <div class="cxm-lc-review-head">
                  <h3 class="cxm-lc-review-title">Employment</h3>
                  <button class="cxm-lc-edit-btn" (click)="goToEdit('section-employment')" type="button">
                    <span>Edit</span>
                  </button>
                </div>
                <div class="cxm-lc-review-fields">
                  @if (form['employee_id']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Employee ID</span>
                      <span class="cxm-lc-field-value cxm-lc-field-mono">{{ form['employee_id'] }}</span>
                    </div>
                  }
                  @if (form['gross_pay']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Net Pay</span>
                      <span class="cxm-lc-field-value tabular-nums">₦{{ form['gross_pay'] | number:'1.0-0' }}</span>
                    </div>
                  }
                  @if (form['job_title']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Job Title</span>
                      <span class="cxm-lc-field-value">{{ form['job_title'] }}</span>
                    </div>
                  }
                  @if (form['employer']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Employer</span>
                      <span class="cxm-lc-field-value">{{ form['employer'] }}</span>
                    </div>
                  }
                  @if (form['organization']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Sub-Organization</span>
                      <span class="cxm-lc-field-value">{{ form['organization'] }}</span>
                    </div>
                  }
                  @if (form['command']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Command</span>
                      <span class="cxm-lc-field-value">{{ form['command'] }}</span>
                    </div>
                  }
                  @if (form['employment_date']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Employment Date</span>
                      <span class="cxm-lc-field-value">{{ form['employment_date'] }}</span>
                    </div>
                  }
                  @if (form['id_type']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">ID Type</span>
                      <span class="cxm-lc-field-value">{{ form['id_type'] }}</span>
                    </div>
                  }
                  @if (form['work_id_number']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Work ID #</span>
                      <span class="cxm-lc-field-value cxm-lc-field-mono">{{ form['work_id_number'] }}</span>
                    </div>
                  }
                </div>
              </div>

              <!-- Loan Details -->
              <div class="cxm-lc-card">
                <div class="cxm-lc-review-head">
                  <h3 class="cxm-lc-review-title">Loan Details</h3>
                  <button class="cxm-lc-edit-btn" (click)="goToEdit('section-loan')" type="button">
                    <span>Edit</span>
                  </button>
                </div>
                <div class="cxm-lc-review-fields">
                  @if (form['loan_amount_words']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Amount in Words</span>
                      <span class="cxm-lc-field-value">{{ form['loan_amount_words'] }}</span>
                    </div>
                  }
                  @if (form['loan_purpose']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Purpose</span>
                      <span class="cxm-lc-field-value">{{ form['loan_purpose'] }}</span>
                    </div>
                  }
                  @if (form['repayment_method']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Repayment</span>
                      <span class="cxm-lc-field-value">{{ form['repayment_method'] }}</span>
                    </div>
                  }
                  @if (form['bank_statement_mode']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">BS Mode</span>
                      <span class="cxm-lc-field-value">{{ form['bank_statement_mode'] }}</span>
                    </div>
                  }
                  @if (form['account_statement_id']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Statement ID</span>
                      <span class="cxm-lc-field-value cxm-lc-field-mono">{{ form['account_statement_id'] }}</span>
                    </div>
                  }
                </div>
              </div>

              <!-- Bank -->
              <div class="cxm-lc-card">
                <div class="cxm-lc-review-head">
                  <h3 class="cxm-lc-review-title">Disbursement Bank</h3>
                  <button class="cxm-lc-edit-btn" (click)="goToEdit('section-bank')" type="button">
                    <span>Edit</span>
                  </button>
                </div>
                <div class="cxm-lc-review-fields">
                  @if (form['bank_name']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Bank</span>
                      <span class="cxm-lc-field-value">{{ form['bank_name'] }}</span>
                    </div>
                  }
                  @if (form['account_number']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Account #</span>
                      <span class="cxm-lc-field-value cxm-lc-field-mono tabular-nums">{{ form['account_number'] }}</span>
                    </div>
                  }
                  @if (form['account_name']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Account Name</span>
                      <span class="cxm-lc-field-value">{{ form['account_name'] }}</span>
                    </div>
                  }
                  @if (form['alt_bank_name']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Alt Bank</span>
                      <span class="cxm-lc-field-value">{{ form['alt_bank_name'] }}</span>
                    </div>
                  }
                  @if (form['alt_account_number']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Alt Account #</span>
                      <span class="cxm-lc-field-value cxm-lc-field-mono tabular-nums">{{ form['alt_account_number'] }}</span>
                    </div>
                  }
                </div>
              </div>

              <!-- Next of Kin -->
              <div class="cxm-lc-card">
                <div class="cxm-lc-review-head">
                  <h3 class="cxm-lc-review-title">Next of Kin</h3>
                  <button class="cxm-lc-edit-btn" (click)="goToEdit('section-nok')" type="button">
                    <span>Edit</span>
                  </button>
                </div>
                <div class="cxm-lc-review-fields">
                  @if (form['nok_full_name']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Name</span>
                      <span class="cxm-lc-field-value">{{ form['nok_full_name'] }}</span>
                    </div>
                  }
                  @if (form['nok_relationship']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Relationship</span>
                      <span class="cxm-lc-field-value">{{ form['nok_relationship'] }}</span>
                    </div>
                  }
                  @if (form['nok_phone']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Phone</span>
                      <span class="cxm-lc-field-value cxm-lc-field-mono">{{ form['nok_phone'] }}</span>
                    </div>
                  }
                  @if (form['nok_address']) {
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Address</span>
                      <span class="cxm-lc-field-value">{{ form['nok_address'] }}</span>
                    </div>
                  }
                  @if (!form['nok_full_name']) {
                    <div class="cxm-lc-review-empty">No next of kin on file</div>
                  }
                </div>
              </div>

              <!-- Upload Progress -->
              @if (submittedLoanId() && uploadedDocs.size > 0) {
                <div class="cxm-lc-card">
                  <div class="cxm-lc-upload-head">
                    <h4 class="cxm-lc-review-title" style="margin: 0">Uploading Documents</h4>
                    @if (uploadsComplete()) {
                      <ion-icon name="checkmark-circle" style="font-size: 20px; color: var(--cx-primary-600)"></ion-icon>
                    } @else {
                      <ion-spinner name="crescent" style="width: 18px; height: 18px"></ion-spinner>
                    }
                  </div>
                  <div class="cxm-lc-upload-list">
                    @for (docType of docTypes; track docType.key) {
                      @if (getUploadedDoc(docType.key); as doc) {
                        <div class="cxm-lc-upload-item">
                          <div class="cxm-lc-upload-row">
                            <span class="cxm-lc-upload-name">{{ docType.label }}</span>
                            @if (getUploadState(docType.key); as state) {
                              @if (state.status === 'done') {
                                <span class="cxm-status" data-tone="success">
                                  <span class="cxm-status-dot"></span>
                                  <span>Done</span>
                                </span>
                              } @else if (state.status === 'error') {
                                <button class="cxm-lc-retry-btn" (click)="retryUpload(docType.key, submittedLoanId()!)">
                                  <ion-icon name="refresh-outline" style="font-size: 12px"></ion-icon>
                                  <span>Retry</span>
                                </button>
                              } @else {
                                <span class="cxm-lc-upload-pct tabular-nums">{{ state.progress }}%</span>
                              }
                            }
                          </div>
                          <div class="cxm-lc-progress-track">
                            @if (getUploadState(docType.key); as state) {
                              <div class="cxm-lc-progress-bar"
                                   [class.is-error]="state.status === 'error'"
                                   [class.is-done]="state.status === 'done'"
                                   [style.width.%]="state.progress"></div>
                            }
                          </div>
                          @if (getUploadState(docType.key)?.status === 'error') {
                            <div class="cxm-lc-upload-err">{{ getUploadState(docType.key)?.error }}</div>
                          }
                        </div>
                      }
                    }
                  </div>
                  @if (uploadsComplete()) {
                    <button class="cxm-lc-continue-btn" (click)="proceedAfterUploads()">Continue to Loan</button>
                  }
                </div>
              }
            </div>
          }

          <!-- Navigation Buttons -->
          <div class="cxm-lc-nav">
            @if (step() > 0) {
              <button class="cxm-lc-back" (click)="step.set(step() - 1)">
                <ion-icon name="chevron-back-outline" style="font-size: 14px"></ion-icon>
                <span>Back</span>
              </button>
            }
            @if (step() < 5) {
              <button class="cxm-lc-next"
                      [disabled]="!canProceed()" (click)="step.set(step() + 1)">
                <span>Next</span>
                <ion-icon name="chevron-forward-outline" style="font-size: 14px"></ion-icon>
              </button>
            } @else {
              <button class="cxm-lc-submit"
                      [disabled]="submitting() || !canSubmit()" (click)="submit()">
                @if (submitting()) {
                  <ion-spinner name="crescent" style="width: 16px; height: 16px"></ion-spinner>
                  <span>{{ isEditMode() ? 'Saving...' : 'Submitting...' }}</span>
                } @else {
                  <ion-icon name="checkmark-circle-outline" style="font-size: 16px"></ion-icon>
                  <span>{{ isEditMode() ? 'Save Changes' : 'Submit Application' }}</span>
                }
              </button>
            }
          </div>
        </div>
      }
    </ion-content>
  `,
  styles: [`
    :host { display: block; }

    /* ─── Agent blocked screen ─── */
    .cxm-lc-blocked { padding: 48px 24px; }
    .cxm-lc-back-btn {
      margin-top: 16px;
      padding: 10px 18px;
      background: var(--cx-stone-100);
      color: var(--cx-text-secondary);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm);
      font-weight: 500;
    }

    /* ─── Step rail ─── */
    .cxm-lc-rail-wrap {
      padding: 0 16px 16px;
    }
    .cxm-lc-rail {
      display: flex;
      align-items: center;
      padding: 12px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
    }
    .cxm-lc-step-wrap {
      display: flex;
      align-items: center;
      flex: 1;
    }
    .cxm-lc-step-wrap.is-last { flex: 0 0 auto; }
    .cxm-lc-step {
      width: 26px; height: 26px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--cx-text-xs);
      font-weight: 600;
      background: var(--cx-stone-100);
      color: var(--cx-text-muted);
      border: 2px solid transparent;
      flex-shrink: 0;
      transition: all var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cxm-lc-step.is-active {
      background: var(--cx-accent-500);
      color: #fff;
      box-shadow: 0 0 0 4px rgba(201, 162, 39, 0.15);
    }
    .cxm-lc-step.is-done {
      background: var(--cx-primary-600);
      color: #fff;
    }
    .cxm-lc-rail-line {
      flex: 1;
      height: 2px;
      background: var(--cx-stone-200);
      margin: 0 6px;
      transition: background var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cxm-lc-rail-line.is-done { background: var(--cx-primary-600); }

    /* ─── Shared card ─── */
    .cxm-lc-card {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .cxm-lc-label {
      display: block;
      font-size: var(--cx-text-xs);
      font-weight: 500;
      color: var(--cx-text-secondary);
      margin-bottom: 5px;
    }
    .cxm-lc-input {
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
    .cxm-lc-input:focus {
      background: var(--cx-surface);
      border-color: var(--cx-primary-600);
    }

    /* Invalid input state — red border + subtle background tint.
       Applied via [class.is-invalid] binding when field validation fails. */
    .cxm-lc-input.is-invalid,
    .cxm-lc-select.is-invalid {
      border-color: var(--cx-danger);
      background: rgba(220, 38, 38, 0.04);
    }
    .cxm-lc-input.is-invalid:focus,
    .cxm-lc-select.is-invalid:focus {
      background: var(--cx-surface);
      border-color: var(--cx-danger);
    }

    /* Inline error message under a field. Small, red, left-aligned with input. */
    .cxm-lc-field-err {
      margin-top: 4px;
      font-size: 11px;
      color: var(--cx-danger);
      line-height: 1.35;
    }

    /* Select boxes inherit input styling plus chevron glyph */
    .cxm-lc-select {
      width: 100%;
      padding: 10px 36px 10px 14px;
      background: var(--cx-surface-2);
      border: 1px solid transparent;
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      outline: none;
      appearance: none;
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b6965' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
      background-repeat: no-repeat;
      background-position: right 12px center;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-lc-select:focus {
      background-color: var(--cx-surface);
      border-color: var(--cx-primary-600);
    }

    /* Section headings within multi-section cards on step 3 */
    .cxm-lc-section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--cx-primary-700);
      padding-bottom: 8px;
      border-bottom: 1px solid var(--cx-border-subtle);
      margin-bottom: 4px;
    }

    /* Required-field marker — red asterisk in labels */
    .cxm-lc-req {
      color: var(--cx-danger);
      font-weight: 600;
      margin-left: 2px;
    }

    /* Read-only (auto-computed / auto-resolved) fields */
    .cxm-lc-readonly {
      background: var(--cx-surface-2, rgba(0,0,0,0.03));
      cursor: default;
    }
    .cxm-lc-acct-hint {
      font-size: 12px;
      margin-top: 4px;
      color: var(--cx-text-muted, #64748b);
    }
    .cxm-lc-acct-ok { color: var(--cx-success, #16a34a); }
    .cxm-lc-acct-err { color: var(--cx-danger, #dc2626); }
    .cxm-lc-acct-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 4px;
    }
    .cxm-lc-acct-row .cxm-lc-acct-hint { margin-top: 0; }
    .cxm-lc-acct-toggle {
      margin-left: auto;
      background: none;
      border: none;
      padding: 0;
      font-size: 12px;
      font-weight: 600;
      color: var(--cx-primary-600, #16a34a);
      cursor: pointer;
    }
    .cxm-lc-acct-toggle:active { opacity: 0.6; }

    /* ─── Product cards (step 1) ─── */
    .cxm-lc-product {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px;
      background: var(--cx-surface);
      border: 2px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      text-align: left;
      width: 100%;
      cursor: pointer;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-lc-product:active { transform: scale(0.99); }
    .cxm-lc-product.is-selected {
      border-color: var(--cx-primary-600);
      background: var(--cx-primary-50);
    }
    .cxm-lc-product-main { flex: 1; min-width: 0; }
    .cxm-lc-product-name {
      font-size: var(--cx-text-sm);
      font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
    }
    .cxm-lc-product-meta {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-wrap: wrap;
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      margin-top: 2px;
    }
    .cxm-lc-dot { color: var(--cx-stone-400); }
    .cxm-lc-product-rate {
      color: var(--cx-primary-700);
      font-weight: 500;
    }
    .cxm-lc-product-range {
      font-size: 11px;
      color: var(--cx-text-muted);
      margin-top: 2px;
    }
    .cxm-lc-product-check {
      width: 24px; height: 24px;
      border-radius: 50%;
      background: transparent;
      border: 2px solid var(--cx-stone-300);
      display: flex;
      align-items: center;
      justify-content: center;
      color: transparent;
      flex-shrink: 0;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-lc-product.is-selected .cxm-lc-product-check {
      background: var(--cx-primary-600);
      border-color: var(--cx-primary-600);
      color: #fff;
    }

    /* ─── Staff lookup (step 2) ─── */
    .cxm-lc-search-row { display: flex; gap: 8px; }
    .cxm-lc-search-btn {
      width: 44px;
      background: var(--cx-primary-600);
      color: #fff;
      border: none;
      border-radius: var(--cx-radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--cx-shadow-sm);
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-lc-search-btn:disabled { opacity: 0.5; box-shadow: none; }
    .cxm-lc-search-btn:not(:disabled):active { transform: scale(0.92); background: var(--cx-primary-700); }

    .cxm-lc-result {
      background: var(--cx-surface);
      border: 1px solid var(--cx-primary-200);
      border-radius: var(--cx-radius-xl);
      overflow: hidden;
    }
    .cxm-lc-result-head {
      padding: 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: linear-gradient(135deg, var(--cx-primary-50) 0%, var(--cx-surface) 100%);
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cxm-lc-result-meta { min-width: 0; flex: 1; }
    .cxm-lc-result-name {
      font-size: var(--cx-text-sm);
      font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
    }
    .cxm-lc-result-job {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      margin-top: 2px;
    }
    .cxm-lc-result-check {
      color: var(--cx-primary-600);
      flex-shrink: 0;
    }
    .cxm-lc-result-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: var(--cx-border-subtle);
    }
    .cxm-lc-result-stat {
      padding: 12px 14px;
      background: var(--cx-surface);
    }
    .cxm-lc-result-stat-value {
      font-size: var(--cx-text-md);
      font-weight: 600;
      color: var(--cx-text);
      margin-top: 3px;
    }

    .cxm-lc-error {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: var(--cx-danger-50);
      border: 1px solid rgba(193, 48, 48, 0.15);
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm);
      color: var(--cx-danger);
    }
    .cxm-lc-info {
      display: flex;
      gap: 8px;
      padding: 10px 12px;
      background: var(--cx-accent-50);
      border: 1px solid rgba(201, 162, 39, 0.2);
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-xs);
      color: var(--cx-accent-700);
      line-height: 1.5;
    }
    .cxm-lc-info ion-icon { flex-shrink: 0; margin-top: 2px; }

    /* ─── Loan details (step 3) ─── */
    .cxm-lc-calc-btn {
      margin-top: 4px;
      padding: 11px;
      background: var(--cx-accent-50);
      color: var(--cx-accent-700);
      border: 1px solid rgba(201, 162, 39, 0.25);
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm);
      font-weight: 600;
      letter-spacing: -0.005em;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-lc-calc-btn:disabled { opacity: 0.5; }
    .cxm-lc-calc-btn:not(:disabled):active {
      background: var(--cx-accent-100);
      transform: scale(0.99);
    }

    .cxm-lc-calc-hero {
      padding: 14px;
      border-radius: var(--cx-radius-xl);
      border: 1px solid transparent;
    }
    .cxm-lc-calc-hero-primary {
      background: linear-gradient(135deg, var(--cx-primary-600), var(--cx-primary-500));
      color: #fff;
      border-color: var(--cx-primary-600);
      box-shadow: var(--cx-shadow-md);
    }
    .cxm-lc-calc-hero-primary .cxm-eyebrow { color: rgba(255, 255, 255, 0.75); }
    .cxm-lc-calc-hero-gold {
      background: var(--cx-accent-50);
      border-color: rgba(201, 162, 39, 0.2);
    }
    .cxm-lc-calc-value {
      font-size: var(--cx-text-lg);
      font-weight: 700;
      letter-spacing: -0.015em;
      margin-top: 5px;
      line-height: 1.1;
    }
    .cxm-lc-calc-value-gold { color: var(--cx-accent-700); }

    .cxm-lc-calc-field {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cxm-lc-calc-field:last-child { border-bottom: none; }
    .cxm-lc-calc-field-label {
      font-size: var(--cx-text-sm);
      color: var(--cx-text-muted);
    }
    .cxm-lc-calc-field-value {
      font-size: var(--cx-text-sm);
      font-weight: 500;
      color: var(--cx-text);
    }

    /* ─── Documents (step 5) ─── */
    .cxm-lc-doc-head-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 2px;
    }
    .cxm-lc-doc-hint {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      margin: 0;
      line-height: 1.5;
      flex: 1;
      min-width: 0;
    }
    /*
     * Progress pill: 'N of 4' counter. Neutral when incomplete, flips
     * to primary-green when allDocsStaged() is true — a visual 'green
     * light' that mirrors the Next button becoming enabled. The pill
     * updates reactively via the signal-backed stagedDocCount() count.
     */
    .cxm-lc-doc-counter {
      flex-shrink: 0;
      padding: 3px 10px;
      font-size: 11px;
      font-weight: 600;
      color: var(--cx-text-muted);
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-pill);
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-lc-doc-counter.is-complete {
      color: #fff;
      background: var(--cx-primary-600);
      border-color: var(--cx-primary-600);
    }
    .cxm-lc-doc {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-lg);
      padding: 12px;
    }
    .cxm-lc-doc-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .cxm-lc-doc-name {
      font-size: var(--cx-text-sm);
      font-weight: 500;
      color: var(--cx-text);
    }
    .cxm-lc-doc-selected {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      background: var(--cx-surface-2);
      border-radius: var(--cx-radius-md);
    }
    .cxm-lc-doc-selected-icon {
      width: 28px; height: 28px;
      border-radius: var(--cx-radius-sm);
      background: var(--cx-primary-50);
      color: var(--cx-primary-600);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .cxm-lc-doc-selected-meta { flex: 1; min-width: 0; }
    .cxm-lc-doc-selected-name {
      font-size: var(--cx-text-xs);
      color: var(--cx-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cxm-lc-doc-selected-size {
      font-size: 10px;
      color: var(--cx-text-muted);
      margin-top: 1px;
    }
    .cxm-lc-doc-remove {
      width: 28px; height: 28px;
      border-radius: 50%;
      background: transparent;
      color: var(--cx-danger);
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-lc-doc-remove:active { background: var(--cx-danger-50); }
    .cxm-lc-doc-drop {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 18px 12px;
      background: var(--cx-surface-2);
      border: 2px dashed var(--cx-border-strong);
      border-radius: var(--cx-radius-md);
      cursor: pointer;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-lc-doc-drop:active {
      border-color: var(--cx-primary-600);
      background: var(--cx-primary-50);
    }
    .cxm-lc-doc-drop-label {
      font-size: var(--cx-text-xs);
      font-weight: 500;
      color: var(--cx-text-secondary);
    }

    /* ─── Review (step 6) ─── */
    .cxm-lc-review-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      gap: 8px;
    }
    .cxm-lc-review-title {
      margin: 0 0 10px;
      font-size: var(--cx-text-sm);
      font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
    }
    .cxm-lc-review-head .cxm-lc-review-title { margin: 0; }

    /* Per-section edit jump button — small pill, neutral styling */
    .cxm-lc-edit-btn {
      padding: 4px 12px;
      background: var(--cx-stone-100);
      color: var(--cx-text-secondary);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-pill);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-lc-edit-btn:active {
      transform: scale(0.96);
      background: var(--cx-stone-200);
    }

    /* Empty-section placeholder — e.g. NOK card when agent skipped NOK */
    .cxm-lc-review-empty {
      padding: 12px 0;
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      font-style: italic;
      text-align: center;
    }
    .cxm-lc-review-fields { display: flex; flex-direction: column; }
    .cxm-lc-field {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 9px 0;
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cxm-lc-field:last-child { border-bottom: none; }
    .cxm-lc-field-label {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
    }
    .cxm-lc-field-value {
      font-size: var(--cx-text-sm);
      font-weight: 500;
      color: var(--cx-text);
      text-align: right;
    }
    .cxm-lc-field-mono {
      font-family: var(--cx-font-mono, monospace);
      color: var(--cx-primary-700);
    }
    .cxm-lc-field-primary { color: var(--cx-primary-700); font-weight: 600; }
    .cxm-lc-field-gold { color: var(--cx-accent-700); font-weight: 600; }
    .cxm-lc-review-divider {
      height: 1px;
      background: var(--cx-border);
      margin: 6px -14px;
    }

    /* ─── Upload progress ─── */
    .cxm-lc-upload-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .cxm-lc-upload-list { display: flex; flex-direction: column; gap: 10px; }
    .cxm-lc-upload-item { display: flex; flex-direction: column; gap: 5px; }
    .cxm-lc-upload-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: var(--cx-text-xs);
    }
    .cxm-lc-upload-name { color: var(--cx-text); font-weight: 500; }
    .cxm-lc-upload-pct { color: var(--cx-primary-700); font-weight: 600; }
    .cxm-lc-retry-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      background: var(--cx-danger-50);
      color: var(--cx-danger);
      border: none;
      border-radius: var(--cx-radius-pill);
      font-size: 11px;
      font-weight: 500;
    }
    .cxm-lc-progress-track {
      width: 100%;
      height: 5px;
      background: var(--cx-stone-100);
      border-radius: var(--cx-radius-pill);
      overflow: hidden;
    }
    .cxm-lc-progress-bar {
      height: 100%;
      background: var(--cx-primary-600);
      border-radius: var(--cx-radius-pill);
      transition: width var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cxm-lc-progress-bar.is-done { background: var(--cx-primary-600); }
    .cxm-lc-progress-bar.is-error { background: var(--cx-danger); }
    .cxm-lc-upload-err {
      font-size: 10px;
      color: var(--cx-danger);
      line-height: 1.4;
    }
    .cxm-lc-continue-btn {
      margin-top: 4px;
      padding: 10px;
      background: var(--cx-primary-600);
      color: #fff;
      border: none;
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm);
      font-weight: 600;
      box-shadow: var(--cx-shadow-sm);
    }

    /* ─── Navigation ─── */
    /*
     * The Loan Capture page lives under the app's bottom tab bar (tabs.page.ts).
     * Tab bar is ~56px tall, plus the iOS home-indicator safe-area on notched
     * devices. Without generous bottom padding on the scrollable body, the
     * Next / Submit button at the end of each step gets hidden behind the
     * tab bar.
     *
     * The padding lives on the step body, not on .cxm-lc-nav directly, so
     * other trailing content (error messages, upload progress) also clears
     * the tab bar.
     *
     * 96px baseline = 56px tab bar + 24px visual breathing room + 16px slack.
     * env(safe-area-inset-bottom) adds the home-indicator height on top so
     * iPhone X and up don't clip.
     */
    .cxm-lc-body {
      padding: 0 16px;
      padding-bottom: calc(96px + env(safe-area-inset-bottom));
    }

    .cxm-lc-nav {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }
    .cxm-lc-back {
      flex: 1;
      padding: 12px;
      background: var(--cx-surface);
      color: var(--cx-text-secondary);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm);
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-lc-back:active { background: var(--cx-surface-hover); }
    .cxm-lc-next, .cxm-lc-submit {
      flex: 1;
      padding: 12px;
      background: linear-gradient(135deg, var(--cx-primary-600), var(--cx-primary-500));
      color: #fff;
      border: none;
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm);
      font-weight: 600;
      letter-spacing: -0.005em;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-shadow: 0 4px 12px rgba(10, 79, 42, 0.2);
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-lc-next:disabled, .cxm-lc-submit:disabled { opacity: 0.5; box-shadow: none; }
    .cxm-lc-next:not(:disabled):active, .cxm-lc-submit:not(:disabled):active {
      transform: scale(0.99);
      box-shadow: 0 1px 4px rgba(10, 79, 42, 0.2);
    }
    .cxm-lc-submit {
      background: linear-gradient(135deg, var(--cx-primary-700), var(--cx-primary-600));
    }
  `],
})
export class LoanCapturePage implements OnInit, OnDestroy {
  /**
   * Route parameter binding. When the route is /loans/:id/edit this
   * gets populated with the loan id; when /loans/new it stays empty.
   * withComponentInputBinding (enabled in app.config.ts, commit A) wires
   * URL params to @Input properties automatically — no ActivatedRoute
   * injection needed.
   *
   * Edit vs create mode is derived from whether id has a value.
   */
  @Input() id = '';

  /**
   * True when the page is hydrating an existing loan for editing.
   * Set once when the route param arrives; stays stable for the
   * lifetime of the component.
   */
  isEditMode = computed(() => !!this.id);

  /**
   * Loading flag for the initial hydration in edit mode. While this
   * is true, the wizard shows a spinner instead of the form so the
   * agent doesn't start typing into empty fields that are about to
   * be overwritten by the fetch result.
   */
  editLoading = signal(false);

  /**
   * The fetched loan payload. Held here for reference (e.g. the
   * page header shows the application_id when editing, and the
   * submit handler uses it to know the loan exists).
   */
  editLoan = signal<any>(null);

  step = signal(0);
  stepLabels = ['Product', 'Staff', 'Details', 'Info', 'Docs', 'Review'];
  stepHints = [
    'Choose the loan product that fits the customer',
    'Look up the staff record to verify eligibility',
    'Enter amount and tenure, then calculate',
    'Provide personal and banking details',
    'Upload required supporting documents',
    'Review everything and submit the application',
  ];

  products = signal<any[]>([]);
  productsLoading = signal(true);
  staffRecord = signal<any>(null);
  staffLoading = signal(false);
  staffError = signal<string | null>(null);
  // True when the looked-up staff is ineligible or already has a blocking loan
  // — prevents proceeding past the Staff ID step.
  staffBlocked = signal(false);
  existingCustomer = signal<any>(null);
  calcResult = signal<any>(null);
  calcLoading = signal(false);
  submitting = signal(false);

  form: any = {
    // Core loan
    product_id: '', staff_id: '', amount: '', tenure: '',
    // Personal
    full_name: '', date_of_birth: '', gender: '', marital_status: '',
    number_of_children: '', bvn: '', mothers_maiden_name: '', religion: '',
    // Contact
    phone: '', alt_phone: '', email: '',
    home_address: '', permanent_address: '',
    state_of_origin: '', lga: '', hometown: '',
    // Employment
    employee_id: '', gross_pay: '', job_title: '', employer: '',
    organization: '', command: '', employment_date: '',
    id_type: '', work_id_number: '',
    work_id_issued_date: '', work_id_expiry_date: '',
    // Loan extras
    loan_amount_words: '', loan_purpose: '', repayment_method: '',
    bank_statement_mode: '', account_statement_id: '', account_statement_password: '',
    // Bank
    bank_name: '', bank_code: '', account_number: '', account_name: '',
    alt_bank_name: '', alt_account_number: '', alt_account_name: '',
    // Next of Kin (single NOK captured here; server wraps it in an array)
    nok_full_name: '', nok_phone: '', nok_address: '', nok_relationship: '',
  };

  uploadedDocs: Map<string, {name: string; file?: File; existing?: boolean; documentId?: string}> = new Map();
  uploadError = signal<string|null>(null);
  /**
   * Document types offered at capture. Loaded from /document-types?active=true
   * so admins can add/retire documents and change which are required without an
   * app release. The list below is only a fallback for when that call fails
   * (e.g. offline) so the step still renders something usable.
   *
   * `required` mirrors the server's document_types.is_required — the server is
   * the authority (SubmitLoanAction re-checks it); this is display only.
   */
  docTypes: { key: string; label: string; accept: string; required?: boolean }[] = [
    { key: 'passport', label: 'Passport Photograph', accept: 'image/*' },
    { key: 'id_card', label: 'ID Card (NIN/Voter/Driver)', accept: 'image/*,.pdf' },
    { key: 'payslip', label: 'Recent Payslip', accept: 'image/*,.pdf' },
    { key: 'bank_statement', label: 'Bank Statement', accept: '.pdf,image/*' },
  ];

  /** Fetch the live document-type config; keep the fallback list on failure. */
  private loadDocTypes(): void {
    this.api.get('/document-types', { active: true }).subscribe({
      next: (r: any) => {
        const list = (r?.data || [])
          .map((d: any) => ({
            key: d.code,
            label: d.label,
            accept: d.accept || '*/*',
            required: !!d.is_required,
          }));
        if (list.length) this.docTypes = list;
      },
      error: () => { /* keep the fallback list */ },
    });
  }

  agentBlocked = signal(false);
  banks = signal<{code: string; name: string}[]>([]);

  /**
   * Nigerian states and cascading LGA list. Source is a static TS
   * file (core/data/nigerian-states.ts) — no network call. See the
   * file header for rationale.
   *
   * `states` is the full 37-state list (used in the State dropdown).
   * `availableLgas` is a signal that recomputes whenever the agent
   * picks a different state — it powers the LGA dropdown's options.
   */
  readonly states = NIGERIAN_STATES;
  availableLgas = signal<string[]>([]);

  /**
   * Fired when the State of Origin dropdown changes. Rebuilds the LGA
   * list and clears the previously-selected LGA if it isn't valid for
   * the new state (e.g. agent switched from Lagos with 'Ikeja' selected
   * to Rivers — 'Ikeja' isn't a Rivers LGA so we blank it).
   */
  onStateChange(newState: string): void {
    const lgas = getLgasForState(newState);
    this.availableLgas.set(lgas);
    const current = this.form['lga'];
    if (current && !lgas.includes(current)) {
      this.form['lga'] = '';
    }
  }

  /**
   * BVN validation — Nigerian BVN is exactly 11 digits, all numeric.
   * Signal tracks the current error message (or null if valid/empty).
   * Empty is treated as 'not-yet-filled' so the error only appears
   * after the agent has typed something.
   *
   * Per user decision: BVN blocks submit. submit() reads this signal
   * and refuses to POST if bvnError() is non-null OR if BVN is empty.
   */
  bvnError = signal<string | null>(null);

  onBvnChange(v: string): void {
    const trimmed = (v ?? '').trim();
    if (trimmed === '') {
      // Empty — no error shown, but submit will still block on emptiness.
      this.bvnError.set(null);
      return;
    }
    if (!/^\d+$/.test(trimmed)) {
      this.bvnError.set('BVN must contain only digits');
      return;
    }
    if (trimmed.length !== 11) {
      this.bvnError.set(`BVN must be exactly 11 digits (${trimmed.length} entered)`);
      return;
    }
    this.bvnError.set(null);
  }

  // ─── Amount in words (computed, read-only) ───
  private readonly W_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  private readonly W_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  private threeToWords(n: number): string {
    let s = '';
    if (n >= 100) { s += this.W_ONES[Math.floor(n / 100)] + ' Hundred'; n %= 100; if (n) s += ' and '; }
    if (n >= 20) { s += this.W_TENS[Math.floor(n / 10)]; n %= 10; if (n) s += '-' + this.W_ONES[n]; }
    else if (n > 0) { s += this.W_ONES[n]; }
    return s;
  }

  /** Convert a naira amount to words, e.g. 500000 → "Five Hundred Thousand Naira Only". */
  numberToWords(amount: any): string {
    const naira = Math.floor(Math.abs(Number(amount) || 0));
    if (naira === 0) return '';
    const scales = ['', ' Thousand', ' Million', ' Billion', ' Trillion'];
    const groups: number[] = [];
    let num = naira;
    while (num > 0) { groups.push(num % 1000); num = Math.floor(num / 1000); }
    const parts: string[] = [];
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i] === 0) continue;
      parts.push(this.threeToWords(groups[i]) + scales[i]);
    }
    return parts.join(' ').trim() + ' Naira Only';
  }

  onAmountChange(): void {
    this.form['loan_amount_words'] = this.numberToWords(this.form['amount']);
  }

  // ─── Bank account resolution (via backend → Paystack) ───
  resolvingMain = signal(false);
  resolvingAlt = signal(false);
  acctErrMain = signal<string | null>(null);
  acctErrAlt = signal<string | null>(null);
  manualMain = signal(false);
  manualAlt = signal(false);
  private acctDebounce: Record<string, any> = {};

  /**
   * Toggle a bank account name between auto-resolve and manual entry. Used as a
   * fallback when Paystack can't resolve a valid account. Switching back to
   * auto clears the typed name and re-attempts resolution from the current
   * number + bank.
   */
  toggleManual(which: 'main' | 'alt'): void {
    const manual = which === 'main' ? this.manualMain : this.manualAlt;
    const err = which === 'main' ? this.acctErrMain : this.acctErrAlt;
    const resolving = which === 'main' ? this.resolvingMain : this.resolvingAlt;
    const next = !manual();
    manual.set(next);
    err.set(null);
    resolving.set(false);
    if (which === 'main') this.form['account_name'] = ''; else this.form['alt_account_name'] = '';
    if (!next) this.onAccountInput(which); // back to auto — try resolving now
  }

  /** Exact (case-insensitive) bank-name → Paystack code lookup from the banks list. */
  private bankCodeFor(name: string): string | null {
    const n = (name ?? '').trim().toLowerCase();
    if (!n) return null;
    const b = this.banks().find(x => x.name.toLowerCase() === n);
    return b ? b.code : null;
  }

  /**
   * Fired when an account number or bank changes. Clears the resolved name,
   * and once we have a 10-digit number + a recognised bank, debounces a call
   * to the backend resolver which auto-fills the account name.
   */
  onAccountInput(which: 'main' | 'alt'): void {
    // Manual entry — leave the agent's typed name alone.
    if ((which === 'main' ? this.manualMain : this.manualAlt)()) return;

    const acct = which === 'main' ? this.form['account_number'] : this.form['alt_account_number'];
    const bank = which === 'main' ? this.form['bank_name'] : this.form['alt_bank_name'];
    const resolving = which === 'main' ? this.resolvingMain : this.resolvingAlt;
    const err = which === 'main' ? this.acctErrMain : this.acctErrAlt;

    // Any change invalidates a previously-resolved name.
    if (which === 'main') this.form['account_name'] = ''; else this.form['alt_account_name'] = '';
    err.set(null);
    resolving.set(false);

    const digits = String(acct ?? '').replace(/\D/g, '');
    const code = this.bankCodeFor(bank);
    // Capture the numeric bank code alongside the name — required for
    // settlement (outbound transfer) later. Main account only.
    if (which === 'main') this.form['bank_code'] = code || '';
    if (digits.length !== 10 || !code) return;

    clearTimeout(this.acctDebounce[which]);
    this.acctDebounce[which] = setTimeout(() => this.resolveAccount(which, digits, code), 400);
  }

  private resolveAccount(which: 'main' | 'alt', accountNumber: string, bankCode: string): void {
    const resolving = which === 'main' ? this.resolvingMain : this.resolvingAlt;
    const err = which === 'main' ? this.acctErrMain : this.acctErrAlt;
    resolving.set(true);
    err.set(null);
    this.api.get('/banks/resolve', { account_number: accountNumber, bank_code: bankCode }).subscribe({
      next: (r: any) => {
        resolving.set(false);
        const name = r?.data?.account_name || '';
        if (which === 'main') this.form['account_name'] = name; else this.form['alt_account_name'] = name;
      },
      error: (e: any) => {
        resolving.set(false);
        err.set(e?.error?.message || 'Could not verify this account.');
      },
    });
  }

  /**
   * Polling timer for the agent.accepting_loans setting. Checked every
   * 15s while this page is mounted so a pause toggled by admin takes
   * effect without the agent needing to reload. Cleared on destroy.
   */
  private pauseCheckTimer: any = null;
  private readonly PAUSE_CHECK_INTERVAL_MS = 15000;

  /**
   * Window focus handler reference — held so we can removeEventListener
   * in ngOnDestroy. Without the reference, the listener would leak
   * across navigations and accumulate.
   */
  private onFocusListener: (() => void) | null = null;

  constructor(private api: ApiService, public router: Router, private toast: ToastService) {
    addIcons({ chevronForwardOutline, chevronBackOutline, checkmarkCircleOutline, searchOutline, calculatorOutline, cloudUploadOutline, closeCircleOutline, checkmarkCircle, documentOutline, refreshOutline, informationCircleOutline, alertCircleOutline, closeCircle, checkmark, close });
  }

  ngOnInit(): void {
    // Edit mode: pause-guard is irrelevant (agent is editing an existing
    // loan, not intaking a new one). Skip the poll setup and the
    // synchronous first-check so editing works even when the admin has
    // paused intake. The pause guard exists to stop NEW applications;
    // updating an already-captured loan is a legitimate workflow even
    // during pauses.
    if (!this.isEditMode()) {
      // First check fires immediately so the 'Paused' state appears on
      // first render rather than after a 15s delay.
      this.refreshPauseState();

      // Poll every 15s so admin pauses propagate to agents who left the
      // app open on this page. 15s is a balance — faster wastes battery
      // and bandwidth, slower feels stale.
      this.pauseCheckTimer = setInterval(() => this.refreshPauseState(), this.PAUSE_CHECK_INTERVAL_MS);

      // Re-check whenever the tab regains focus / the app comes back to
      // foreground. Polling timers pause in backgrounded tabs/apps on
      // many platforms; this guarantees that switching back to a stale
      // tab triggers an immediate refresh before any interaction.
      this.onFocusListener = () => this.refreshPauseState();
      window.addEventListener('focus', this.onFocusListener);
      document.addEventListener('visibilitychange', this.onFocusListener);
    }

    this.api.get('/loan-products', { per_page: 50, is_active: true }).subscribe({
      next: res => { this.products.set(res.data || []); this.productsLoading.set(false); },
      error: () => this.productsLoading.set(false),
    });

    this.api.get('/banks').subscribe({
      next: res => this.banks.set(res.data || []),
      error: () => {},
    });

    this.loadDocTypes();

    // Edit-mode hydration. Fetch the loan and populate everything.
    if (this.isEditMode()) {
      this.hydrateForEdit();
    }
  }

  /**
   * Fetch the loan by id and populate form, signals, and existing-docs
   * state so the wizard is ready to be edited.
   *
   * Skips forward to Step 3 (Details) on success — product + staff
   * lookup steps are inapplicable in edit mode (product is immutable
   * via the agent wizard, customer can't be changed per session
   * decision).
   *
   * On error: toast fires via the API error interceptor. We navigate
   * back to the detail page so the agent isn't stuck on an empty
   * wizard.
   */
  private hydrateForEdit(): void {
    this.editLoading.set(true);
    this.api.get(`/loans/${this.id}`).subscribe({
      next: res => {
        const loan = res.data;
        if (!loan) {
          this.editLoading.set(false);
          this.router.navigate(['/loans']);
          return;
        }
        this.editLoan.set(loan);

        // ── Hydrate form from loan + customer ─────────────────────
        const c = loan.customer || {};
        const nokArr = Array.isArray(loan.next_of_kin) ? loan.next_of_kin : [];
        const nok = nokArr[0] || {};

        this.form['product_id'] = loan.product_id || '';
        this.form['amount'] = loan.amount_requested || '';
        this.form['tenure'] = String(loan.tenure || '');
        // Loan-level metadata
        this.form['bank_statement_mode'] = loan.bank_statement_mode || '';
        this.form['loan_amount_words'] = loan.loan_amount_words || '';
        this.form['loan_purpose'] = loan.loan_purpose || '';
        this.form['repayment_method'] = loan.repayment_method || '';
        this.form['account_statement_id'] = loan.account_statement_id || '';
        // account_statement_password is intentionally not returned by
        // the backend (Loan::toArray redacts it). Leave blank; the agent
        // re-enters if they want to change it, otherwise it stays as-is
        // on the server via the partial-update semantics.

        // Customer core
        this.form['staff_id'] = c.staff_id || '';
        this.form['full_name'] = c.full_name || '';
        this.form['date_of_birth'] = c.dob || '';
        this.form['gender'] = c.gender || '';
        this.form['marital_status'] = c.marital_status || '';
        this.form['number_of_children'] = c.number_of_children != null ? String(c.number_of_children) : '';
        this.form['bvn'] = c.bvn || '';
        this.form['mothers_maiden_name'] = c.mothers_maiden_name || '';
        this.form['religion'] = c.religion || '';
        // Customer contact
        this.form['phone'] = c.phone || '';
        this.form['alt_phone'] = c.alt_phone || '';
        this.form['email'] = c.email || '';
        this.form['home_address'] = c.home_address || '';
        this.form['permanent_address'] = c.permanent_address || '';
        this.form['state_of_origin'] = c.state_of_origin || '';
        this.form['lga'] = c.lga || '';
        this.form['hometown'] = c.hometown || '';
        // If state is populated, recompute the available LGAs so the
        // dropdown isn't empty when the agent looks at it.
        if (c.state_of_origin) {
          this.availableLgas.set(getLgasForState(c.state_of_origin));
        }
        // Customer employment
        this.form['employee_id'] = c.staff_id || '';
        this.form['gross_pay'] = c.gross_pay != null ? String(c.gross_pay) : '';
        this.form['job_title'] = c.job_title || '';
        this.form['employer'] = c.employer || '';
        this.form['organization'] = c.organization || '';
        this.form['command'] = c.command || '';
        this.form['employment_date'] = c.employment_date || '';
        this.form['id_type'] = c.id_type || '';
        this.form['work_id_number'] = c.work_id_number || '';
        this.form['work_id_issued_date'] = c.work_id_issued_date || '';
        this.form['work_id_expiry_date'] = c.work_id_expiry_date || '';
        // Customer bank
        this.form['bank_name'] = c.bank_name || '';
        this.form['bank_code'] = c.bank_code || this.bankCodeFor(c.bank_name || '') || '';
        this.form['account_number'] = c.account_number || '';
        this.form['alt_bank_name'] = c.alt_bank_name || '';
        this.form['alt_account_number'] = c.alt_account_number || '';
        this.form['alt_account_name'] = c.alt_account_name || '';
        // NOK (first one — the wizard only edits one)
        this.form['nok_full_name'] = nok.full_name || '';
        this.form['nok_phone'] = nok.phone || '';
        this.form['nok_address'] = nok.address || '';
        this.form['nok_relationship'] = nok.relationship || '';

        // ── Signals ────────────────────────────────────────────────
        this.existingCustomer.set(c);
        // Synthesize a staffRecord shape from customer data so any UI
        // that reads staffRecord() (Step 3 header, review sections)
        // gets the data it expects. The gross_pay / net_pay aren't
        // stored on Customer — show whatever's on the record + sensible
        // fallbacks so UI doesn't break with 'undefined'.
        this.staffRecord.set({
          employee_id: c.staff_id || '',
          employee_name: c.full_name || '',
          job_title: c.job_title || '',
          organization: c.organization || '',
          gross_pay: c.gross_pay != null ? Number(c.gross_pay) : 0,
          net_pay: 0, // not stored on Customer; UI tolerant
        });

        // Transaction → calcResult (so the numbers on Step 3 / Review
        // show without forcing a recalculate). If transaction is missing
        // (shouldn't be but defensive), leave calcResult null.
        if (loan.transaction) {
          this.calcResult.set({
            gross_loan: loan.gross_loan,
            net_disbursed: loan.net_disbursed,
            interest_rate: loan.interest_rate,
            fee_details: loan.fee_breakdowns || [],
            transaction: loan.transaction,
          });
        }

        // ── Existing documents: mark as staged so the Step 4 gate is
        // satisfied when the loan was captured with all 4 docs. The
        // map value is a lightweight placeholder because we can't
        // reconstruct the original File object — only its identity
        // and type. The submit flow detects this placeholder and
        // skips re-uploading.
        const docs = Array.isArray(loan.documents) ? loan.documents : [];
        for (const d of docs) {
          // Document.document_type from toArray maps to our docType.key
          const typeKey = d.document_type || d.type || null;
          if (!typeKey) continue;
          const known = this.docTypes.find(dt => dt.key === typeKey);
          if (!known) continue;
          // Seed uploadedDocs with a synthetic 'existing' marker. The
          // .file property is undefined; code that reads file.size /
          // file.type has been updated to tolerate this via the
          // isExistingDoc() helper.
          this.uploadedDocs.set(typeKey, {
            name: d.file_name || (known.label + ' (existing)'),
            file: undefined as any,
            existing: true,
            documentId: d.id,
          } as any);
        }

        // Jump past product + staff lookup. Step 2 (product) selection
        // is still meaningful if the agent wants to switch products,
        // but default landing spot is Step 3 (amount/tenure/details).
        // Per session decision, Step 2 (staff) is NOT entered in edit
        // mode — canProceed / navigation respect this.
        this.step.set(2);

        this.editLoading.set(false);
      },
      error: () => {
        this.editLoading.set(false);
        // Error interceptor toasts the reason. Bounce back to the list
        // so the user has somewhere to go.
        this.router.navigate(['/loans']);
      },
    });
  }

  ngOnDestroy(): void {
    if (this.pauseCheckTimer) {
      clearInterval(this.pauseCheckTimer);
      this.pauseCheckTimer = null;
    }
    if (this.onFocusListener) {
      window.removeEventListener('focus', this.onFocusListener);
      document.removeEventListener('visibilitychange', this.onFocusListener);
      this.onFocusListener = null;
    }
  }

  /**
   * Fetch the current agent.accepting_loans setting and flip the
   * agentBlocked signal if it changed. Runs on mount, on a 15s poll,
   * and whenever the tab regains focus.
   *
   * Errors are silent — a transient network failure shouldn't flip
   * the block on unnecessarily. The next tick tries again.
   *
   * NOTE: this requires the Agent role to have the 'settings.view'
   * permission. Migration bin/migrate-agent-settings-view.php grants
   * it on production; seed.php / seed-lite.php include it for fresh
   * environments.
   */
  private refreshPauseState(): void {
    // Silent: this polls every 15s; a transient network hiccup would
    // fire a confusing 'network error' toast. Real failures (e.g. user
    // interaction on this page) still surface via the page's own flow.
    this.api.get('/settings', { per_page: 200 }, { silent: true }).subscribe({
      next: res => {
        const settings = res.data || [];
        const s = settings.find((x: any) => x.key === 'agent.accepting_loans');
        // If the setting row doesn't exist, intake is OPEN (matches
        // backend default). If it exists and is 'false' / '0', block.
        const shouldBlock = !!s && (s.value === 'false' || s.value === '0');
        if (this.agentBlocked() !== shouldBlock) {
          this.agentBlocked.set(shouldBlock);
        }
      },
      error: () => { /* swallow — next tick retries */ },
    });
  }

  selectProduct(product: any): void { this.form['product_id'] = product.id; }

  selectedProductName(): string {
    return this.products().find(p => p.id === this.form['product_id'])?.name || '—';
  }

  /**
   * Clear the staff lookup state when the agent edits the IPPIS input.
   * Without this, an agent could search for staff A (match found, next
   * button enables), then change the ID to staff B and advance past
   * Step 2 with staffRecord still pointing at A. Clearing on change
   * forces a fresh lookup before the wizard will accept the new ID.
   */
  onStaffIdChange(): void {
    if (this.staffRecord() !== null) this.staffRecord.set(null);
    if (this.existingCustomer() !== null) this.existingCustomer.set(null);
    if (this.staffError() !== null) this.staffError.set(null);
    if (this.staffBlocked()) this.staffBlocked.set(false);
  }

  lookupStaff(): void {
    this.staffLoading.set(true); this.staffError.set(null); this.staffRecord.set(null); this.staffBlocked.set(false);
    // EXACT Staff ID match (not a fuzzy search) — the dedicated lookup endpoint
    // returns only records whose staff_id equals the value entered, each with
    // eligibility + the same duplicate-loan rules enforced at submit.
    this.api.get('/government-records/lookup/' + encodeURIComponent((this.form['staff_id'] || '').trim())).subscribe({
      next: res => {
        const records = res.data || [];
        if (records.length > 0) {
          const rec = records[0];
          this.staffRecord.set(rec);

          // Block BEFORE the agent fills the whole form: eligibility (age /
          // service / retirement) and duplicate-loan rules (in-progress /
          // pending decision). A running loan is not a block — it becomes a
          // top-up at submit — so it does not stop the agent here.
          const elig = rec.eligibility;
          const block = rec.loan_block;
          if (elig && elig.eligible === false) {
            this.staffError.set('Not eligible: ' + (elig.reasons || []).join(' '));
            this.staffBlocked.set(true);
            this.staffLoading.set(false);
            return;
          }
          if (block && block.blocked) {
            this.staffError.set(block.reason || 'This customer cannot take a new loan right now.');
            this.staffBlocked.set(true);
            this.staffLoading.set(false);
            return;
          }
          // Auto-fill from government record (still editable). Only populates
          // empty fields so repeated lookups don't clobber agent edits.
          this.applyPrefill({
            full_name: rec.employee_name,
            phone: rec.telephone_number,
            bank_name: rec.bank_name,
            account_number: rec.account_number,
            date_of_birth: rec.date_of_birth,
            gender: rec.gender,
            marital_status: rec.marital_status,
            state_of_origin: rec.state_of_origin,
            lga: rec.lga,
            employer: rec.employer,
            organization: rec.organization,
            gross_pay: rec.net_pay,
            employment_date: rec.employment_date,
          });

          // Now check for a richer existing Customer record by IPPIS.
          // This endpoint was added in Phase C.1 — returns 200 with
          // {found: bool, customer: object|null}. No 404 on miss.
          this.api.get(`/customers/by-ippis/${encodeURIComponent(rec.staff_id)}`).subscribe({
            next: cres => {
              const data = cres.data || {};
              if (data.found && data.customer) {
                const c = data.customer;
                this.existingCustomer.set(c);
                // Customer data is richer than government record — prefill
                // everything the customer has that the form needs. Still
                // only fills empty fields so agent edits win.
                this.applyPrefill({
                  full_name: c.full_name,
                  phone: c.phone,
                  alt_phone: c.alt_phone,
                  email: c.email,
                  date_of_birth: c.date_of_birth,
                  gender: c.gender,
                  marital_status: c.marital_status,
                  number_of_children: c.number_of_children,
                  bvn: c.bvn,
                  mothers_maiden_name: c.mothers_maiden_name,
                  religion: c.religion,
                  home_address: c.home_address,
                  permanent_address: c.permanent_address,
                  state_of_origin: c.state_of_origin,
                  lga: c.lga,
                  hometown: c.hometown,
                  // Employment
                  job_title: c.job_title,
                  employer: c.employer,
                  organization: c.organization,
                  command: c.command,
                  employment_date: c.employment_date,
                  id_type: c.id_type,
                  work_id_number: c.work_id_number,
                  work_id_issued_date: c.work_id_issued_date,
                  work_id_expiry_date: c.work_id_expiry_date,
                  gross_pay: c.gross_pay,
                  // Bank
                  bank_name: c.bank_name,
                  bank_code: c.bank_code,
                  account_number: c.account_number,
                  alt_bank_name: c.alt_bank_name,
                  alt_account_number: c.alt_account_number,
                  alt_account_name: c.alt_account_name,
                });
                // Prefill NOK if customer has one (use primary if multiple).
                const nok = (c.next_of_kins || []).find((n: any) => n.is_primary)
                          ?? (c.next_of_kins || [])[0];
                if (nok) {
                  this.applyPrefill({
                    nok_full_name: nok.full_name,
                    nok_phone: nok.phone,
                    nok_address: nok.address,
                    nok_relationship: nok.relationship,
                  });
                }
              }
              this.staffLoading.set(false);
            },
            error: () => this.staffLoading.set(false),
          });
        } else {
          this.staffError.set('No government record found for this exact Staff ID');
          this.staffLoading.set(false);
        }
      },
      error: (e: any) => {
        // 404 from the exact-lookup endpoint = no record with this Staff ID.
        this.staffError.set(e?.error?.message || 'No government record found for this exact Staff ID');
        this.staffLoading.set(false);
      },
    });
  }

  /**
   * Fill form fields from a source object, but only when the current
   * form value is empty/falsy. Lets the agent override prefill by
   * typing over it — repeated lookups won't clobber their edits.
   * Also stringifies non-string values (dates, numbers) since every
   * input binds to a string model.
   */
  private applyPrefill(src: Record<string, any>): void {
    for (const [key, rawVal] of Object.entries(src)) {
      if (rawVal === null || rawVal === undefined || rawVal === '') continue;
      if (this.form[key]) continue; // don't overwrite existing value
      this.form[key] = typeof rawVal === 'string' ? rawVal : String(rawVal);
    }
    // Re-validate BVN if it was prefilled. Existing customer records
    // may have been seeded with malformed BVNs from legacy data import;
    // trigger validation so the agent sees the error immediately rather
    // than on submit.
    if (src['bvn']) this.onBvnChange(this.form['bvn']);

    // Recompute the (read-only) amount-in-words from the prefilled amount.
    this.onAmountChange();

    // If state was prefilled, populate the LGA dropdown so the prefilled
    // LGA value (if any) has a matching option. Otherwise the dropdown
    // shows blank because its options list is empty until a state is
    // chosen via the UI.
    if (this.form['state_of_origin'] && this.availableLgas().length === 0) {
      this.availableLgas.set(getLgasForState(this.form['state_of_origin']));
    }
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
      case 1: return !!this.staffRecord() && !this.staffBlocked();
      case 2: return !!this.form['amount'] && !!this.form['tenure'];
      // Step 3: must have full_name, phone, and a VALID BVN. BVN is
      // required per user decision — wizard can't submit without it.
      case 3: return !!this.form['full_name']
                  && !!this.form['phone']
                  && !!this.form['bvn']
                  && this.bvnError() === null;
      // Step 4: documents are OPTIONAL at capture. Some documents aren't
      // available immediately, so agents may skip this step and capture the
      // loan now. The required documents are enforced later, at
      // submit-for-approval (backend SubmitLoanAction), so a loan cannot be
      // sent for approval without them.
      case 4: return true;
      default: return true;
    }
  }

  /**
   * Additional check for the final submit button. Requires:
   *   - Every form field that Steps 0-3 validated
   *   - A valid BVN (belt + suspenders vs Step 3's own check)
   *   - All required documents staged (matches Step 4's canProceed
   *     gate — if the user reached Step 5 without docs, we still
   *     refuse to submit)
   */
  canSubmit(): boolean {
    return !!this.form['product_id']
        && !!this.staffRecord()
        && !!this.form['amount']
        && !!this.form['tenure']
        && !!this.form['full_name']
        && !!this.form['phone']
        && !!this.form['bvn']
        && this.bvnError() === null
        && this.allDocsStaged();
  }

  /**
   * True when every docType in the required list has a file staged
   * in uploadedDocs. Used by both step-4's Next gate and the final
   * submit gate.
   */
  allDocsStaged(): boolean {
    return this.docTypes.every(dt => this.uploadedDocs.has(dt.key));
  }

  /**
   * Count of staged docs — for the 'N of M' progress indicator on
   * the docs step. Keeps the template simple and testable.
   */
  stagedDocCount(): number {
    return this.docTypes.filter(dt => this.uploadedDocs.has(dt.key)).length;
  }

  /**
   * Jump from the Review step (5) back to Step 3 with a specific
   * section scrolled into view. Used by the Edit links on each
   * section of the Review summary.
   *
   * Sequence:
   *   1. Set step to 3 — Angular re-renders Step 3's template (Step 5
   *      was rendered, so Step 3's DOM wasn't in the tree).
   *   2. Wait one tick (setTimeout 0) so the newly-rendered DOM is
   *      queryable by getElementById.
   *   3. scrollIntoView with block: 'start' and smooth behavior.
   *
   * If the anchor element isn't found (bad sectionId or DOM not ready),
   * scroll silently fails — agent still lands on Step 3 at its natural
   * scroll position, which is a sane fallback.
   */
  goToEdit(sectionId: string): void {
    this.step.set(3);
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  getUploadedDoc(key: string): {name: string; file?: File; existing?: boolean; documentId?: string} | undefined {
    return this.uploadedDocs.get(key) as any;
  }

  /**
   * True when an uploadedDocs entry came from the loan's existing
   * documents rather than a File picked this session. Drives the
   * Step 4 UI distinction — existing entries show 'Already uploaded'
   * and a Replace button; newly staged entries show the file size
   * and a Remove button.
   */
  isExistingDoc(doc: any): boolean {
    return !!(doc && doc.existing === true);
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

  /**
   * Upload all staged documents after a successful loan submit.
   *
   * The backend route is POST /api/documents/upload (NOT /documents —
   * that path is GET-only for listing). The action requires a
   * multipart payload with:
   *   - file         (the binary)
   *   - type         (DocumentType enum value — passport, id_card, etc.)
   *   - customer_id  (REQUIRED — the document attaches to the customer)
   *   - loan_id      (optional — links the doc to a specific loan)
   *
   * customer_id comes from the loan creation response; the agent
   * captures it in submit() and threads it through to this method.
   */
  private uploadDocuments(loanId: string, customerId: string, editMode: boolean = false): void {
    const states = new Map(this.uploadStates());
    this.uploadedDocs.forEach((doc, docType) => {
      // In edit mode, skip docs that are already uploaded on the
      // server (the 'existing' marker set by hydrateForEdit). Only
      // newly-selected File objects get a pending state.
      if (editMode && (doc as any).existing) {
        // Mark as 'done' so pollUploadsComplete doesn't wait forever.
        states.set(docType, { progress: 100, status: 'done' });
        return;
      }
      states.set(docType, { progress: 0, status: 'pending' });
    });
    this.uploadStates.set(states);

    this.uploadedDocs.forEach((doc, docType) => {
      // Skip existing docs — they're already on the server.
      if (editMode && (doc as any).existing) return;
      // Defensive: a doc without a File object shouldn't happen in
      // create mode, but guard anyway.
      if (!doc.file) return;

      const formData = new FormData();
      formData.append('file', doc.file);
      formData.append('type', docType);
      formData.append('customer_id', customerId);
      formData.append('loan_id', loanId);

      this.setUploadState(docType, { progress: 0, status: 'uploading' });

      this.api.uploadWithProgress(`/documents/upload`, formData).subscribe({
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
    const customerId = this.submittedCustomerId();
    // Retry only applies to newly-uploaded files that failed. Existing
    // docs don't need retrying — they're already on the server. Guard
    // on doc.file being present (narrows the ?File type for append).
    if (!doc || !doc.file || !loanId || !customerId) return;
    const formData = new FormData();
    formData.append('file', doc.file);
    formData.append('type', docKey);
    formData.append('customer_id', customerId);
    formData.append('loan_id', loanId);
    this.setUploadState(docKey, { progress: 0, status: 'uploading' });
    this.api.uploadWithProgress(`/documents/upload`, formData).subscribe({
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
  // Captured at loan-create time so the retry handler can re-upload
  // without losing which customer the documents attach to.
  submittedCustomerId = signal<string | null>(null);
  uploadsComplete = signal(false);

  /**
   * Build and submit the loan application payload. Shape matches
   * the refactored CreateLoanAction (Phase C.1):
   *
   *   - Always uses the 'customer' nested object (create-or-reuse path).
   *     If this agent has already looked up an existing customer by IPPIS,
   *     we send customer_id; the 'customer' block then acts as a PATCH.
   *     If IPPIS lookup returned no match, we omit customer_id and the
   *     backend creates a new Customer row from 'customer'.
   *   - Next-of-kin goes in a separate top-level 'next_of_kin' array so
   *     it persists as a NextOfKin row rather than Customer fields.
   *   - Loan-level metadata (loan_amount_words, loan_purpose,
   *     repayment_method, account_statement_id/password) goes at the top.
   */
  submit(): void {
    // Defensive — the submit button's [disabled] already gates on this,
    // but if an agent somehow invokes submit() via another path (stale
    // ref, keyboard enter on a hidden button) we still refuse.
    if (!this.canSubmit()) return;
    // Guarantee the read-only amount-in-words matches the final amount.
    this.onAmountChange();
    this.submitting.set(true);

    // Customer payload — every field we captured. Backend's fillFromArray
    // ignores keys with null/undefined values, and empty strings are fine
    // too (they just clear optional fields on existing records).
    const customerPayload: any = {
      staff_id: this.form['staff_id'],
      full_name: this.form['full_name'],
      phone: this.form['phone'],
      alt_phone: this.form['alt_phone'],
      email: this.form['email'],
      dob: this.form['date_of_birth'],
      gender: this.form['gender'],
      marital_status: this.form['marital_status'],
      number_of_children: this.form['number_of_children'] || null,
      bvn: this.form['bvn'],
      mothers_maiden_name: this.form['mothers_maiden_name'],
      religion: this.form['religion'],
      home_address: this.form['home_address'],
      permanent_address: this.form['permanent_address'],
      state_of_origin: this.form['state_of_origin'],
      lga: this.form['lga'],
      hometown: this.form['hometown'],
      // Employment
      employee_id: this.form['employee_id'],
      gross_pay: this.form['gross_pay'] || null,
      job_title: this.form['job_title'],
      employer: this.form['employer'],
      organization: this.form['organization'],
      command: this.form['command'],
      employment_date: this.form['employment_date'],
      id_type: this.form['id_type'],
      work_id_number: this.form['work_id_number'],
      work_id_issued_date: this.form['work_id_issued_date'],
      work_id_expiry_date: this.form['work_id_expiry_date'],
      // Bank
      bank_name: this.form['bank_name'],
      bank_code: this.form['bank_code'] || this.bankCodeFor(this.form['bank_name']) || '',
      account_number: this.form['account_number'],
      account_name: this.form['account_name'],
      alt_bank_name: this.form['alt_bank_name'],
      alt_account_number: this.form['alt_account_number'],
      alt_account_name: this.form['alt_account_name'],
    };

    // Next of kin — optional. Only send if at least a name is present.
    const nokList: any[] = [];
    if (this.form['nok_full_name']) {
      nokList.push({
        full_name: this.form['nok_full_name'],
        phone: this.form['nok_phone'],
        address: this.form['nok_address'],
        relationship: this.form['nok_relationship'],
        is_primary: true,
      });
    }

    const payload: any = {
      product_id: this.form['product_id'],
      amount: this.form['amount'],
      tenure: Number(this.form['tenure']),
      customer: customerPayload,
    };
    if (nokList.length > 0) payload.next_of_kin = nokList;

    // If we matched an existing customer on IPPIS lookup, include its id
    // so the backend treats the 'customer' block as a patch instead of
    // creating a duplicate row.
    const existing = this.existingCustomer();
    if (existing?.id) payload.customer_id = existing.id;

    // Loan-level metadata — only include keys that have a value so we
    // don't overwrite server-side defaults with empty strings.
    if (this.form['bank_statement_mode'])         payload.bank_statement_mode = this.form['bank_statement_mode'];
    if (this.form['loan_amount_words'])           payload.loan_amount_words = this.form['loan_amount_words'];
    if (this.form['loan_purpose'])                payload.loan_purpose = this.form['loan_purpose'];
    if (this.form['repayment_method'])            payload.repayment_method = this.form['repayment_method'];
    if (this.form['account_statement_id'])        payload.account_statement_id = this.form['account_statement_id'];
    if (this.form['account_statement_password']) payload.account_statement_password = this.form['account_statement_password'];

    // Edit mode: divert to PUT /loans/:id and skip the rest of the
    // POST flow. submitEdit handles its own toast + navigation.
    if (this.isEditMode()) {
      this.submitEdit(payload);
      return;
    }

    this.api.post('/loans', payload).subscribe({
      next: res => {
        this.submitting.set(false);
        const loanId = res.data?.id || '';
        const customerId = res.data?.customer_id || '';
        this.submittedLoanId.set(loanId);
        this.submittedCustomerId.set(customerId);
        // Success toast confirms to the agent that the server accepted
        // the application. The doc-upload phase then runs in the
        // background with its own per-doc progress indicators.
        this.toast.success('Loan application submitted successfully');
        if (loanId && customerId && this.uploadedDocs.size > 0) {
          this.uploadDocuments(loanId, customerId);
          this.pollUploadsComplete(loanId);
        } else {
          this.router.navigate(['/loans', loanId]);
        }
      },
      error: (err) => {
        this.submitting.set(false);
        // If the backend refused because intake is paused, flip the
        // block so the agent sees the 'Applications Paused' screen
        // immediately rather than being stuck on the submit step with
        // a generic error. The setting poll would catch up in ≤15s
        // but doing it inline from the 403 is instant.
        if (err?.status === 403) {
          this.agentBlocked.set(true);
        }
      },
    });
  }

  /**
   * Count of newly-uploaded (non-existing) documents staged in the
   * uploadedDocs Map. Used by edit-mode submit to decide whether to
   * run the upload phase — if the agent replaced or added no docs,
   * skip the upload flow entirely.
   */
  private newlyStagedDocCount(): number {
    let n = 0;
    this.uploadedDocs.forEach(v => {
      if (!(v as any).existing) n++;
    });
    return n;
  }

  /**
   * Edit-mode submit handler. PUT /loans/:id with the same payload
   * shape as create, then navigate back to the detail page. The
   * backend UpdateLoanAction (commit H1) accepts the nested customer
   * + next_of_kin blocks and recomputes loan math automatically.
   *
   * Uploads any NEWLY-STAGED documents after the PUT succeeds — same
   * flow as create, but only for docs that aren't marked as existing.
   */
  private submitEdit(payload: any): void {
    this.api.put(`/loans/${this.id}`, payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.toast.success('Loan updated successfully');

        // Upload only the newly-staged docs (ones without the 'existing'
        // marker). If they're all existing, there's nothing to do.
        if (this.newlyStagedDocCount() > 0) {
          // Resolve the customer id from the loaded loan as well as the
          // existingCustomer signal. Previously this read only the signal and,
          // when it was empty, silently fell through to the navigate below —
          // the agent saw "Loan updated successfully" while the document never
          // uploaded, so submit-for-approval kept reporting it missing.
          const customerId = (this.existingCustomer() as any)?.id
            || (this.editLoan() as any)?.customer_id
            || (this.editLoan() as any)?.customer?.id
            || '';

          if (customerId) {
            this.uploadDocuments(this.id, customerId, /* editMode */ true);
            this.pollUploadsComplete(this.id);
            return;
          }

          // Still no customer — fail loudly rather than pretending the
          // documents were saved.
          this.toast.error('Loan saved, but the documents could not be uploaded (customer not resolved). Please reopen the loan and try again.');
          return;
        }

        // No new docs to upload — navigate straight back to detail.
        // Use queryParams cache-bust so the loan-detail page re-fetches
        // instead of showing stale cached data.
        this.router.navigate(['/loans', this.id], {
          queryParams: { _: Date.now() },
        });
      },
      error: () => {
        this.submitting.set(false);
        // Error interceptor toasts the reason.
      },
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
