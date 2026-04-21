import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonSpinner, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { searchOutline, checkmarkCircleOutline, closeCircleOutline, personOutline, briefcaseOutline, checkmarkCircle, closeCircle } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-lookup',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonSpinner, IonIcon],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/dashboard"></ion-back-button></ion-buttons>
        <ion-title>Staff Lookup</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="cxm-page-header cx-animate-in">
        <div class="cxm-eyebrow cxm-eyebrow-primary">Eligibility Check</div>
        <h1 class="cxm-title">Staff Lookup</h1>
        <p class="cxm-subtitle">Find a government employee record and check loan eligibility</p>
      </div>

      <div class="px-4 pb-6 flex flex-col gap-4">
        <!-- Search Card -->
        <div class="cxm-lookup-search">
          <label class="cxm-lookup-label">Staff ID / IPPIS Number</label>
          <div class="cxm-lookup-input-row">
            <input type="text" class="cxm-lookup-input"
                   [(ngModel)]="staffId" placeholder="Enter staff ID" (keyup.enter)="search()" />
            <button class="cxm-lookup-search-btn"
                    [disabled]="loading() || !staffId.trim()" (click)="search()">
              @if (loading()) {
                <ion-spinner name="crescent" style="width: 16px; height: 16px"></ion-spinner>
              } @else {
                <ion-icon name="search-outline" style="font-size: 18px"></ion-icon>
              }
            </button>
          </div>
        </div>

        <!-- Results -->
        @if (searched() && !loading()) {
          @if (record()) {
            <div class="cxm-lookup-result cx-animate-in">
              <!-- Header with avatar -->
              <div class="cxm-lookup-header">
                <div class="cxm-avatar cxm-avatar-lg">
                  {{ record()?.employee_name?.charAt(0) }}
                </div>
                <div class="cxm-lookup-header-meta">
                  <div class="cxm-lookup-name">{{ record()?.employee_name }}</div>
                  <div class="cxm-lookup-id">
                    <span class="cxm-lookup-staff-id">{{ record()?.staff_id }}</span>
                    <span class="cxm-lookup-dot">·</span>
                    <span>{{ record()?.record_type_name }}</span>
                  </div>
                </div>
              </div>

              <!-- Details grid -->
              <div class="cxm-lookup-details">
                @for (field of recordFields(); track field.label) {
                  <div class="cxm-lookup-field">
                    <span class="cxm-lookup-field-label">{{ field.label }}</span>
                    <span class="cxm-lookup-field-value">{{ field.value || '—' }}</span>
                  </div>
                }
              </div>

              <!-- Eligibility banner -->
              @if (eligibility()) {
                <div class="cxm-elig" [class.is-eligible]="eligibility()?.eligible">
                  <div class="cxm-elig-head">
                    <div class="cxm-elig-icon">
                      <ion-icon [name]="eligibility()?.eligible ? 'checkmark-circle' : 'close-circle'" style="font-size: 18px"></ion-icon>
                    </div>
                    <div>
                      <div class="cxm-elig-title">
                        {{ eligibility()?.eligible ? 'Eligible for Loan' : 'Not Eligible' }}
                      </div>
                      @if (!eligibility()?.eligible && eligibility()?.reasons?.length) {
                        <div class="cxm-elig-sub">{{ eligibility()?.reasons?.length }} reason{{ eligibility()?.reasons?.length === 1 ? '' : 's' }}</div>
                      }
                    </div>
                  </div>
                  @if (eligibility()?.reasons?.length) {
                    <div class="cxm-elig-reasons">
                      @for (reason of eligibility()?.reasons; track reason) {
                        <div class="cxm-elig-reason">
                          <span class="cxm-elig-bullet">•</span>
                          <span>{{ reason }}</span>
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          } @else {
            <div class="cxm-empty">
              <div class="cxm-empty-icon">
                <ion-icon name="close-circle-outline" style="font-size: 24px"></ion-icon>
              </div>
              <div class="cxm-empty-title">No record found</div>
              <div class="cxm-empty-desc">We couldn't find a record for "{{ staffId }}".</div>
            </div>
          }
        }
      </div>
    </ion-content>
  `,
  styles: [`
    .cxm-lookup-search {
      padding: 14px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
    }
    .cxm-lookup-label {
      display: block;
      font-size: var(--cx-text-xs);
      font-weight: 500;
      color: var(--cx-text-secondary);
      margin-bottom: 6px;
    }
    .cxm-lookup-input-row { display: flex; gap: 8px; }
    .cxm-lookup-input {
      flex: 1;
      padding: 10px 14px;
      background: var(--cx-surface-2);
      border: 1px solid transparent;
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      outline: none;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-lookup-input:focus {
      background: var(--cx-surface);
      border-color: var(--cx-primary-600);
    }
    .cxm-lookup-search-btn {
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
    .cxm-lookup-search-btn:disabled { opacity: 0.5; box-shadow: none; }
    .cxm-lookup-search-btn:not(:disabled):active {
      transform: scale(0.93);
      background: var(--cx-primary-700);
    }

    .cxm-lookup-result {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-2xl);
      overflow: hidden;
    }
    .cxm-lookup-header {
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: linear-gradient(135deg, var(--cx-primary-50) 0%, var(--cx-surface) 100%);
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cxm-lookup-header-meta { min-width: 0; flex: 1; }
    .cxm-lookup-name {
      font-size: var(--cx-text-md);
      font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
    }
    .cxm-lookup-id {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      margin-top: 2px;
    }
    .cxm-lookup-staff-id {
      font-family: var(--cx-font-mono, monospace);
      color: var(--cx-primary-700);
      font-weight: 500;
    }
    .cxm-lookup-dot { color: var(--cx-stone-400); }

    .cxm-lookup-details {
      padding: 6px 16px;
      display: flex;
      flex-direction: column;
    }
    .cxm-lookup-field {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cxm-lookup-field:last-child { border-bottom: none; }
    .cxm-lookup-field-label {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      flex-shrink: 0;
    }
    .cxm-lookup-field-value {
      font-size: var(--cx-text-sm);
      font-weight: 500;
      color: var(--cx-text);
      text-align: right;
    }

    .cxm-elig {
      margin: 0 16px 16px;
      padding: 14px;
      background: var(--cx-danger-50);
      border: 1px solid rgba(193, 48, 48, 0.15);
      border-radius: var(--cx-radius-lg);
    }
    .cxm-elig.is-eligible {
      background: var(--cx-success-50);
      border-color: rgba(26, 122, 69, 0.2);
    }
    .cxm-elig-head {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .cxm-elig-icon {
      width: 32px; height: 32px;
      border-radius: 50%;
      background: var(--cx-danger);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .cxm-elig.is-eligible .cxm-elig-icon { background: var(--cx-primary-600); }
    .cxm-elig-title {
      font-size: var(--cx-text-sm);
      font-weight: 600;
      color: var(--cx-danger);
      letter-spacing: -0.005em;
    }
    .cxm-elig.is-eligible .cxm-elig-title { color: var(--cx-primary-700); }
    .cxm-elig-sub {
      font-size: 10px;
      color: var(--cx-text-muted);
      margin-top: 1px;
    }
    .cxm-elig-reasons {
      margin-top: 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .cxm-elig-reason {
      display: flex;
      gap: 6px;
      font-size: var(--cx-text-xs);
      color: var(--cx-text-secondary);
      line-height: 1.5;
    }
    .cxm-elig-bullet {
      color: var(--cx-danger);
      font-weight: 600;
      flex-shrink: 0;
    }
  `],
})
export class LookupPage {
  staffId = '';
  loading = signal(false);
  searched = signal(false);
  record = signal<any>(null);
  eligibility = signal<any>(null);

  constructor(private api: ApiService) {
    addIcons({ searchOutline, checkmarkCircleOutline, closeCircleOutline, personOutline, briefcaseOutline });
  }

  search(): void {
    if (!this.staffId.trim()) return;
    this.loading.set(true); this.searched.set(true);
    this.record.set(null); this.eligibility.set(null);

    this.api.get('/government-records', { search: this.staffId.trim(), per_page: 1 }).subscribe({
      next: res => {
        const records = res.data || [];
        if (records.length > 0) {
          this.record.set(records[0]);
          // Check eligibility
          this.api.get(`/government-records/${records[0].id}/eligibility`).subscribe({
            next: eligRes => { this.eligibility.set(eligRes.data); this.loading.set(false); },
            error: () => this.loading.set(false),
          });
        } else {
          this.loading.set(false);
        }
      },
      error: () => this.loading.set(false),
    });
  }

  recordFields = () => {
    const r = this.record();
    if (!r) return [];
    return [
      { label: 'Job Title', value: r.job_title },
      { label: 'Organization', value: r.organization },
      { label: 'Department', value: r.department },
      { label: 'Grade Level', value: r.grade_level },
      { label: 'Step', value: r.step },
      { label: 'Gross Pay', value: r.gross_pay ? '₦' + Number(r.gross_pay).toLocaleString() : null },
      { label: 'Net Pay', value: r.net_pay ? '₦' + Number(r.net_pay).toLocaleString() : null },
      { label: 'Date of Birth', value: r.date_of_birth },
      { label: 'Date of Employment', value: r.date_of_employment },
      { label: 'Retirement Date', value: r.retirement_date },
    ];
  };
}
