import { Component, OnInit, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, ArrowLeft, User, Phone, Mail, MapPin, CreditCard, FileText } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-customer-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, PageHeaderComponent, StatusBadgeComponent, LoadingSpinnerComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header [title]="customer()?.full_name || 'Customer Detail'" [subtitle]="'Staff ID: ' + (customer()?.staff_id || '—')">
        <a routerLink="/customers" class="cx-btn cx-btn-outline cx-btn-sm">
          <lucide-icon name="arrow-left" [size]="14"></lucide-icon> Back
        </a>
      </cx-page-header>

      @if (loading()) {
        <cx-loading message="Loading customer details..."></cx-loading>
      } @else if (customer()) {
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <!-- Personal Info -->
          <div class="cx-card">
            <h3 class="text-sm font-semibold text-[var(--cx-text)] mb-3">Personal Information</h3>
            <div class="space-y-2 text-sm">
              @for (field of personalFields; track field.label) {
                <div class="flex justify-between py-1 border-b border-[var(--cx-border)] last:border-0">
                  <span class="text-[var(--cx-text-muted)]">{{ field.label }}</span>
                  <span class="text-[var(--cx-text)] font-medium">{{ field.value || '—' }}</span>
                </div>
              }
            </div>
          </div>

          <!-- Banking Info -->
          <div class="cx-card">
            <h3 class="text-sm font-semibold text-[var(--cx-text)] mb-3">Banking Information</h3>
            <div class="space-y-2 text-sm">
              @for (field of bankingFields; track field.label) {
                <div class="flex justify-between py-1 border-b border-[var(--cx-border)] last:border-0">
                  <span class="text-[var(--cx-text-muted)]">{{ field.label }}</span>
                  <span class="text-[var(--cx-text)] font-medium">{{ field.value || '—' }}</span>
                </div>
              }
            </div>
          </div>

          <!-- Next of Kin -->
          <div class="cx-card">
            <h3 class="text-sm font-semibold text-[var(--cx-text)] mb-3">Next of Kin</h3>
            @if (customer()?.next_of_kins?.length) {
              @for (nok of customer()?.next_of_kins; track nok.id) {
                <div class="space-y-1 text-sm mb-3 pb-3 border-b border-[var(--cx-border)] last:border-0">
                  <div class="font-medium text-[var(--cx-text)]">{{ nok.full_name }}</div>
                  <div class="text-[var(--cx-text-muted)]">{{ nok.relationship }} &bull; {{ nok.phone }}</div>
                </div>
              }
            } @else {
              <p class="text-sm text-[var(--cx-text-muted)]">No next of kin records</p>
            }
          </div>
        </div>

        <!-- Documents -->
        @if (customer()?.documents?.length) {
          <div class="cx-card mt-4">
            <h3 class="text-sm font-semibold text-[var(--cx-text)] mb-3">Documents</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              @for (doc of customer()?.documents; track doc.id) {
                <div class="flex items-center gap-3 p-3 rounded-lg border border-[var(--cx-border)]">
                  <lucide-icon name="file-text" [size]="20" class="text-[var(--cx-primary)] flex-shrink-0"></lucide-icon>
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium truncate text-[var(--cx-text)]">{{ doc.file_name }}</div>
                    <div class="text-xs text-[var(--cx-text-muted)]">{{ doc.type }}</div>
                  </div>
                  <cx-status-badge [status]="doc.status"></cx-status-badge>
                </div>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class CustomerDetailComponent implements OnInit {
  @Input() id = '';
  customer = signal<any>(null);
  loading = signal(true);

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    if (this.id) {
      this.api.get(`/customers/${this.id}`).subscribe({
        next: res => { this.customer.set(res.data); this.loading.set(false); },
        error: () => this.loading.set(false),
      });
    }
  }

  get personalFields(): { label: string; value: string }[] {
    const c = this.customer();
    if (!c) return [];
    return [
      { label: 'Full Name', value: c.full_name },
      { label: 'Staff ID', value: c.staff_id },
      { label: 'Phone', value: c.phone },
      { label: 'Email', value: c.email },
      { label: 'Gender', value: c.gender },
      { label: 'Date of Birth', value: c.date_of_birth },
      { label: 'State of Origin', value: c.state_of_origin },
      { label: 'LGA', value: c.lga },
      { label: 'Home Address', value: c.home_address },
      { label: 'BVN', value: c.bvn },
    ];
  }

  get bankingFields(): { label: string; value: string }[] {
    const c = this.customer();
    if (!c) return [];
    return [
      { label: 'Bank Name', value: c.bank_name },
      { label: 'Account Number', value: c.account_number },
      { label: 'Alt. Bank', value: c.alt_bank_name },
      { label: 'Alt. Account', value: c.alt_account_number },
    ];
  }
}
