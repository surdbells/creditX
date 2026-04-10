import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonSpinner, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { searchOutline, checkmarkCircleOutline, closeCircleOutline, personOutline, briefcaseOutline } from 'ionicons/icons';
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
    <ion-content [fullscreen]="true" class="ion-padding">
      <div class="space-y-4">
        <!-- Search -->
        <div>
          <label class="text-xs font-medium text-gray-500 mb-1 block">Staff ID / IPPIS Number</label>
          <div class="flex gap-2">
            <input type="text" class="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-[#0A4F2A] focus:outline-none"
                   [(ngModel)]="staffId" placeholder="Enter Staff ID" (keyup.enter)="search()" />
            <button class="px-4 py-3 rounded-xl bg-[#0A4F2A] text-white flex items-center gap-2 disabled:opacity-50"
                    [disabled]="loading() || !staffId.trim()" (click)="search()">
              @if (loading()) { <ion-spinner name="crescent" class="w-4 h-4"></ion-spinner> }
              @else { <ion-icon name="search-outline"></ion-icon> }
            </button>
          </div>
        </div>

        <!-- Results -->
        @if (searched() && !loading()) {
          @if (record()) {
            <div class="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
              <div class="p-4 bg-[#0A4F2A]/5 flex items-center gap-3">
                <div class="w-12 h-12 rounded-full bg-[#0A4F2A] flex items-center justify-center text-white text-lg font-bold">
                  {{ record()?.employee_name?.charAt(0) }}
                </div>
                <div>
                  <div class="text-base font-semibold text-gray-800">{{ record()?.employee_name }}</div>
                  <div class="text-xs text-gray-500">{{ record()?.staff_id }} &bull; {{ record()?.record_type_name }}</div>
                </div>
              </div>
              <div class="p-4 space-y-2">
                @for (field of recordFields(); track field.label) {
                  <div class="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span class="text-xs text-gray-500">{{ field.label }}</span>
                    <span class="text-sm font-medium text-gray-800 text-right">{{ field.value || '—' }}</span>
                  </div>
                }
              </div>

              <!-- Eligibility -->
              @if (eligibility()) {
                <div class="p-4 border-t border-gray-100">
                  <div class="flex items-center gap-2 mb-2">
                    <ion-icon [name]="eligibility()?.eligible ? 'checkmark-circle-outline' : 'close-circle-outline'"
                              [class]="eligibility()?.eligible ? 'text-green-500 text-xl' : 'text-red-500 text-xl'"></ion-icon>
                    <span class="text-sm font-semibold" [class]="eligibility()?.eligible ? 'text-green-700' : 'text-red-700'">
                      {{ eligibility()?.eligible ? 'Eligible for Loan' : 'Not Eligible' }}
                    </span>
                  </div>
                  @if (eligibility()?.reasons?.length) {
                    <div class="space-y-1">
                      @for (reason of eligibility()?.reasons; track reason) {
                        <div class="text-xs text-gray-500 flex items-start gap-1">
                          <span class="text-red-400 mt-0.5">•</span> {{ reason }}
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          } @else {
            <div class="p-8 rounded-2xl bg-gray-50 text-center">
              <ion-icon name="close-circle-outline" class="text-4xl text-gray-300"></ion-icon>
              <p class="text-sm text-gray-500 mt-2">No record found for "{{ staffId }}"</p>
            </div>
          }
        }
      </div>
    </ion-content>
  `,
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
