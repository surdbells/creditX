import { Component, OnInit, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonSpinner, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { timeOutline, checkmarkCircleOutline, closeCircleOutline, walletOutline } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-loan-detail',
  standalone: true,
  imports: [CommonModule, IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonSpinner, IonIcon],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/loans"></ion-back-button></ion-buttons>
        <ion-title>{{ loan()?.application_id || 'Loan Detail' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      @if (loading()) {
        <div class="flex justify-center py-16"><ion-spinner name="crescent"></ion-spinner></div>
      } @else if (loan()) {
        <div class="p-4 space-y-4">
          <!-- Status Banner -->
          <div class="p-4 rounded-2xl text-center" [class]="statusBannerClass(loan()?.status)">
            <span class="text-sm font-semibold capitalize">{{ loan()?.status?.replace('_',' ') }}</span>
          </div>

          <!-- Summary Cards -->
          <div class="grid grid-cols-2 gap-3">
            <div class="p-3 rounded-xl bg-white border border-gray-100 shadow-sm">
              <div class="text-xs text-gray-500">Amount</div>
              <div class="text-lg font-bold text-gray-800">₦{{ loan()?.amount_requested | number:'1.0-0' }}</div>
            </div>
            <div class="p-3 rounded-xl bg-white border border-gray-100 shadow-sm">
              <div class="text-xs text-gray-500">Net Disbursed</div>
              <div class="text-lg font-bold text-[#0A4F2A]">₦{{ loan()?.net_disbursed | number:'1.0-0' }}</div>
            </div>
            <div class="p-3 rounded-xl bg-white border border-gray-100 shadow-sm">
              <div class="text-xs text-gray-500">Tenure</div>
              <div class="text-lg font-bold text-gray-800">{{ loan()?.tenure }} mo</div>
            </div>
            <div class="p-3 rounded-xl bg-white border border-gray-100 shadow-sm">
              <div class="text-xs text-gray-500">Rate</div>
              <div class="text-lg font-bold text-[#C9A227]">{{ loan()?.interest_rate }}%</div>
            </div>
          </div>

          <!-- Loan Info -->
          <div class="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
            <h3 class="text-sm font-semibold text-gray-800 mb-3">Loan Information</h3>
            @for (field of infoFields(); track field.label) {
              <div class="flex justify-between py-1.5 border-b border-gray-50 last:border-0 text-sm">
                <span class="text-gray-500">{{ field.label }}</span>
                <span class="font-medium text-gray-800 text-right">{{ field.value || '—' }}</span>
              </div>
            }
          </div>

          <!-- Fee Breakdown -->
          @if (loan()?.fee_breakdowns?.length) {
            <div class="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
              <h3 class="text-sm font-semibold text-gray-800 mb-3">Fee Breakdown</h3>
              @for (fee of loan()?.fee_breakdowns; track fee.id) {
                <div class="flex justify-between py-1.5 border-b border-gray-50 last:border-0 text-sm">
                  <span class="text-gray-500">{{ fee.fee_type_name }}</span>
                  <span class="font-medium text-gray-800">₦{{ fee.amount | number:'1.2-2' }}</span>
                </div>
              }
            </div>
          }

          <!-- Approval Progress -->
          @if (approvals().length) {
            <div class="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
              <h3 class="text-sm font-semibold text-gray-800 mb-3">Approval Progress</h3>
              @for (a of approvals(); track a.id) {
                <div class="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <ion-icon
                    [name]="a.status === 'approved' || a.status === 'auto_approved' ? 'checkmark-circle-outline' : a.status === 'rejected' ? 'close-circle-outline' : 'time-outline'"
                    [class]="a.status === 'approved' || a.status === 'auto_approved' ? 'text-green-500 text-lg' : a.status === 'rejected' ? 'text-red-500 text-lg' : 'text-gray-400 text-lg'"
                  ></ion-icon>
                  <div class="flex-1">
                    <div class="text-sm font-medium text-gray-800">{{ a.step_name }}</div>
                    <div class="text-xs text-gray-500">{{ a.role_name }} &bull; {{ a.status }}</div>
                  </div>
                  @if (a.decided_at) { <div class="text-xs text-gray-400">{{ a.decided_at }}</div> }
                </div>
              }
            </div>
          }

          <!-- Activity Trail -->
          @if (loan()?.trails?.length) {
            <div class="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
              <h3 class="text-sm font-semibold text-gray-800 mb-3">Activity Trail</h3>
              @for (trail of loan()?.trails; track trail.id) {
                <div class="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div class="w-2 h-2 rounded-full bg-[#0A4F2A] mt-1.5 flex-shrink-0"></div>
                  <div>
                    <div class="text-sm text-gray-800">{{ trail.action }}</div>
                    <div class="text-xs text-gray-400">{{ trail.created_at }}</div>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }
    </ion-content>
  `,
})
export class LoanDetailPage implements OnInit {
  @Input() id = '';
  loan = signal<any>(null);
  approvals = signal<any[]>([]);
  loading = signal(true);

  constructor(private api: ApiService) {
    addIcons({ timeOutline, checkmarkCircleOutline, closeCircleOutline, walletOutline });
  }

  ngOnInit(): void {
    if (this.id) {
      this.api.get(`/loans/${this.id}`).subscribe({
        next: res => { this.loan.set(res.data); this.loading.set(false); },
        error: () => this.loading.set(false),
      });
      this.api.get(`/approvals/loan/${this.id}`).subscribe({
        next: res => this.approvals.set(res.data || []),
        error: () => {},
      });
    }
  }

  infoFields(): {label:string;value:string}[] {
    const l = this.loan();
    if (!l) return [];
    return [
      { label: 'Customer', value: l.customer_name }, { label: 'Staff ID', value: l.customer_staff_id },
      { label: 'Product', value: l.product_name }, { label: 'Branch', value: l.branch_name },
      { label: 'Loan Type', value: l.loan_type }, { label: 'Method', value: l.calculation_method },
      { label: 'Gross Loan', value: l.gross_loan ? '₦' + Number(l.gross_loan).toLocaleString() : '—' },
    ];
  }

  statusBannerClass(status: string): string {
    const map: Record<string,string> = {
      active:'bg-green-50 text-green-700', approved:'bg-green-50 text-green-700',
      submitted:'bg-yellow-50 text-yellow-700', under_review:'bg-yellow-50 text-yellow-700',
      overdue:'bg-red-50 text-red-700', rejected:'bg-red-50 text-red-700',
      disbursed:'bg-blue-50 text-blue-700', closed:'bg-blue-50 text-blue-700',
    };
    return map[status] || 'bg-gray-50 text-gray-700';
  }
}
