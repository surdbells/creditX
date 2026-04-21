import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonSpinner, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronForwardOutline, chevronBackOutline, checkmarkCircleOutline, searchOutline, calculatorOutline, cloudUploadOutline, closeCircleOutline, checkmarkCircle, documentOutline, refreshOutline, informationCircleOutline, alertCircleOutline, closeCircle, checkmark, close } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-loan-capture',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonSpinner, IonIcon],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/loans"></ion-back-button></ion-buttons>
        <ion-title>New Application</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      @if (agentBlocked()) {
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
          <div class="cxm-eyebrow cxm-eyebrow-primary">Step {{ step() + 1 }} of {{ stepLabels.length }}</div>
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

        <div class="px-4 pb-6">
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
                    <input type="number" class="cxm-lc-input tabular-nums" [(ngModel)]="form['amount']" placeholder="500,000" />
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
            <div class="cxm-lc-card">
              <div class="flex flex-col gap-3">
                @for (field of personalFields; track field.key) {
                  <div>
                    <label class="cxm-lc-label">{{ field.label }}</label>
                    @if (field.key === 'bank_name') {
                      <input type="text" class="cxm-lc-input"
                             [(ngModel)]="form[field.key]" [placeholder]="field.placeholder || ''"
                             list="banks-list" autocomplete="off" />
                      <datalist id="banks-list">
                        @for (b of banks(); track b.code) { <option [value]="b.name"></option> }
                      </datalist>
                    } @else {
                      <input [type]="field.type || 'text'" class="cxm-lc-input"
                             [(ngModel)]="form[field.key]" [placeholder]="field.placeholder || ''" />
                    }
                  </div>
                }
              </div>
            </div>
          }

          <!-- Step 5: Document Upload -->
          @if (step() === 4) {
            <div class="flex flex-col gap-3">
              <p class="cxm-lc-doc-hint">Upload required documents (passport, ID, payslip, bank statement). Max 10MB each.</p>

              @for (docType of docTypes; track docType.key) {
                <div class="cxm-lc-doc">
                  <div class="cxm-lc-doc-head">
                    <span class="cxm-lc-doc-name">{{ docType.label }}</span>
                    @if (getUploadedDoc(docType.key)) {
                      <span class="cxm-status" data-tone="success">
                        <span class="cxm-status-dot"></span>
                        <span>Ready</span>
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
                        <div class="cxm-lc-doc-selected-size tabular-nums">{{ formatFileSize(docFile.file.size) }}</div>
                      </div>
                      <button type="button" class="cxm-lc-doc-remove" (click)="removeUpload(docType.key)" aria-label="Remove">
                        <ion-icon name="close" style="font-size: 16px"></ion-icon>
                      </button>
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
              <div class="cxm-lc-card">
                <h3 class="cxm-lc-review-title">Application Summary</h3>
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
                    <span class="cxm-lc-field-label">Customer</span>
                    <span class="cxm-lc-field-value">{{ staffRecord()?.employee_name }}</span>
                  </div>
                  <div class="cxm-lc-field">
                    <span class="cxm-lc-field-label">Amount</span>
                    <span class="cxm-lc-field-value tabular-nums">₦{{ form['amount'] | number:'1.2-2' }}</span>
                  </div>
                  <div class="cxm-lc-field">
                    <span class="cxm-lc-field-label">Tenure</span>
                    <span class="cxm-lc-field-value tabular-nums">{{ form['tenure'] }} months</span>
                  </div>
                  @if (calcResult()) {
                    <div class="cxm-lc-review-divider"></div>
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Net Disbursed</span>
                      <span class="cxm-lc-field-value cxm-lc-field-primary tabular-nums">₦{{ calcResult()?.net_disbursed | number:'1.2-2' }}</span>
                    </div>
                    <div class="cxm-lc-field">
                      <span class="cxm-lc-field-label">Monthly Payment</span>
                      <span class="cxm-lc-field-value cxm-lc-field-gold tabular-nums">₦{{ calcResult()?.mr_principal_interest | number:'1.2-2' }}</span>
                    </div>
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
                      [disabled]="submitting()" (click)="submit()">
                @if (submitting()) {
                  <ion-spinner name="crescent" style="width: 16px; height: 16px"></ion-spinner>
                  <span>Submitting...</span>
                } @else {
                  <ion-icon name="checkmark-circle-outline" style="font-size: 16px"></ion-icon>
                  <span>Submit Application</span>
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
    .cxm-lc-doc-hint {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      margin: 0;
      line-height: 1.5;
      padding: 0 2px;
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
    .cxm-lc-review-title {
      margin: 0 0 10px;
      font-size: var(--cx-text-sm);
      font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
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
export class LoanCapturePage implements OnInit {
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
    addIcons({ chevronForwardOutline, chevronBackOutline, checkmarkCircleOutline, searchOutline, calculatorOutline, cloudUploadOutline, closeCircleOutline, checkmarkCircle, documentOutline, refreshOutline, informationCircleOutline, alertCircleOutline, closeCircle, checkmark, close });
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
