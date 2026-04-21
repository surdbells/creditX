import { Component, OnInit, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { timeOutline, checkmarkCircleOutline, closeCircleOutline, walletOutline, checkmark, close } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-loan-detail',
  standalone: true,
  imports: [CommonModule, IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonIcon],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/loans"></ion-back-button></ion-buttons>
        <ion-title>{{ loan()?.application_id || 'Loan Detail' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      @if (loading()) {
        <div class="cxm-loading">
          <div class="cxm-loading-dots"><span></span><span></span><span></span></div>
          <span class="cxm-loading-text">Loading loan details...</span>
        </div>
      } @else if (loan()) {
        <!-- Hero -->
        <div class="cxm-ld-hero cx-animate-in">
          <div class="cxm-eyebrow" style="color: rgba(255, 255, 255, 0.7)">{{ loan()?.product_name }}</div>
          <div class="cxm-ld-customer">{{ loan()?.customer_name }}</div>
          <div class="cxm-ld-app-id tabular-nums">{{ loan()?.application_id }}</div>
          <div class="cxm-ld-status-row">
            <span class="cxm-ld-status" [attr.data-tone]="statusTone(loan()?.status)">
              <span class="cxm-status-dot"></span>
              <span>{{ loan()?.status?.replace('_',' ') | titlecase }}</span>
            </span>
          </div>
        </div>

        <div class="px-4 pb-6 flex flex-col gap-3 -mt-4">
          <!-- Summary Cards -->
          <div class="grid grid-cols-2 gap-3">
            <div class="cxm-ld-stat">
              <div class="cxm-eyebrow">Amount</div>
              <div class="cxm-ld-stat-value tabular-nums">₦{{ loan()?.amount_requested | number:'1.0-0' }}</div>
            </div>
            <div class="cxm-ld-stat">
              <div class="cxm-eyebrow cxm-eyebrow-primary">Net Disbursed</div>
              <div class="cxm-ld-stat-value cxm-ld-stat-primary tabular-nums">₦{{ loan()?.net_disbursed | number:'1.0-0' }}</div>
            </div>
            <div class="cxm-ld-stat">
              <div class="cxm-eyebrow">Tenure</div>
              <div class="cxm-ld-stat-value tabular-nums">{{ loan()?.tenure }} <span class="cxm-ld-stat-unit">mo</span></div>
            </div>
            <div class="cxm-ld-stat">
              <div class="cxm-eyebrow cxm-eyebrow-gold">Rate</div>
              <div class="cxm-ld-stat-value cxm-ld-stat-gold tabular-nums">{{ loan()?.interest_rate }}<span class="cxm-ld-stat-unit">%</span></div>
            </div>
          </div>

          <!-- Loan Info -->
          <div class="cxm-card">
            <div class="cxm-section-header" style="margin-bottom: 10px">
              <h3 class="cxm-section-title">Loan Information</h3>
            </div>
            <div class="cxm-ld-fields">
              @for (field of infoFields(); track field.label) {
                <div class="cxm-ld-field">
                  <span class="cxm-ld-field-label">{{ field.label }}</span>
                  <span class="cxm-ld-field-value">{{ field.value || '—' }}</span>
                </div>
              }
            </div>
          </div>

          <!-- Fee Breakdown -->
          @if (loan()?.fee_breakdowns?.length) {
            <div class="cxm-card">
              <div class="cxm-section-header" style="margin-bottom: 10px">
                <h3 class="cxm-section-title">Fee Breakdown</h3>
              </div>
              <div class="cxm-ld-fields">
                @for (fee of loan()?.fee_breakdowns; track fee.id) {
                  <div class="cxm-ld-field">
                    <span class="cxm-ld-field-label">{{ fee.fee_type_name }}</span>
                    <span class="cxm-ld-field-value tabular-nums">₦{{ fee.amount | number:'1.2-2' }}</span>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Approval Progress -->
          @if (approvals().length) {
            <div class="cxm-card">
              <div class="cxm-section-header" style="margin-bottom: 12px">
                <h3 class="cxm-section-title">Approval Progress</h3>
              </div>
              <div class="cxm-ld-timeline">
                @for (a of approvals(); track a.id; let idx = $index; let last = $last) {
                  <div class="cxm-ld-step">
                    <div class="cxm-ld-step-rail">
                      <div class="cxm-ld-step-icon" [attr.data-state]="approvalState(a.status)">
                        <ion-icon [name]="approvalIcon(a.status)" style="font-size: 14px"></ion-icon>
                      </div>
                      @if (!last) { <div class="cxm-ld-step-line"></div> }
                    </div>
                    <div class="cxm-ld-step-body">
                      <div class="cxm-ld-step-name">{{ a.step_name }}</div>
                      <div class="cxm-ld-step-meta">
                        <span>{{ a.role_name }}</span>
                        <span class="cxm-ld-step-dot">·</span>
                        <span class="cxm-ld-step-status" [attr.data-state]="approvalState(a.status)">{{ a.status | titlecase }}</span>
                      </div>
                      @if (a.decided_at) {
                        <div class="cxm-ld-step-time tabular-nums">{{ a.decided_at }}</div>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Activity Trail -->
          @if (loan()?.trails?.length) {
            <div class="cxm-card">
              <div class="cxm-section-header" style="margin-bottom: 10px">
                <h3 class="cxm-section-title">Activity Trail</h3>
              </div>
              <div class="cxm-ld-trail">
                @for (trail of loan()?.trails; track trail.id) {
                  <div class="cxm-ld-trail-item">
                    <span class="cxm-ld-trail-dot"></span>
                    <div class="cxm-ld-trail-body">
                      <div class="cxm-ld-trail-action">{{ trail.action }}</div>
                      <div class="cxm-ld-trail-time tabular-nums">{{ trail.created_at }}</div>
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }
    </ion-content>
  `,
  styles: [`
    :host { display: block; }

    /* Hero banner */
    .cxm-ld-hero {
      padding: 20px 20px 40px;
      background: linear-gradient(135deg, var(--cx-primary-600) 0%, var(--cx-primary-500) 100%);
      color: #fff;
      position: relative;
    }
    .cxm-ld-hero::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0; right: 0;
      height: 20px;
      background: var(--cx-bg);
      border-top-left-radius: 20px;
      border-top-right-radius: 20px;
    }
    .cxm-ld-customer {
      font-size: var(--cx-text-xl);
      font-weight: 600;
      letter-spacing: -0.015em;
      margin-top: 4px;
      line-height: 1.2;
    }
    .cxm-ld-app-id {
      font-family: var(--cx-font-mono, monospace);
      font-size: var(--cx-text-xs);
      color: rgba(255, 255, 255, 0.75);
      margin-top: 3px;
    }
    .cxm-ld-status-row { margin-top: 10px; position: relative; z-index: 1; }
    .cxm-ld-status {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 12px;
      background: rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(6px);
      border-radius: var(--cx-radius-pill);
      font-size: var(--cx-text-xs);
      font-weight: 500;
      color: #fff;
    }
    .cxm-ld-status[data-tone="success"] { background: rgba(255, 255, 255, 0.95); color: var(--cx-primary-700); }
    .cxm-ld-status[data-tone="warning"] { background: rgba(201, 162, 39, 0.95); color: var(--cx-accent-900); }
    .cxm-ld-status[data-tone="danger"] { background: rgba(193, 48, 48, 0.95); color: #fff; }

    /* Stat cards */
    .cxm-ld-stat {
      padding: 12px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-lg);
      position: relative;
      z-index: 1;
    }
    .cxm-ld-stat-value {
      font-size: var(--cx-text-lg);
      font-weight: 700;
      color: var(--cx-text);
      letter-spacing: -0.015em;
      margin-top: 4px;
      line-height: 1.1;
    }
    .cxm-ld-stat-primary { color: var(--cx-primary-600); }
    .cxm-ld-stat-gold { color: var(--cx-accent-600); }
    .cxm-ld-stat-unit {
      font-size: var(--cx-text-sm);
      font-weight: 500;
      color: var(--cx-text-muted);
    }

    /* Field lists */
    .cxm-ld-fields { display: flex; flex-direction: column; }
    .cxm-ld-field {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 9px 0;
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cxm-ld-field:last-child { border-bottom: none; }
    .cxm-ld-field-label {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      flex-shrink: 0;
    }
    .cxm-ld-field-value {
      font-size: var(--cx-text-sm);
      font-weight: 500;
      color: var(--cx-text);
      text-align: right;
    }

    /* Timeline (approvals) */
    .cxm-ld-timeline { display: flex; flex-direction: column; gap: 4px; }
    .cxm-ld-step {
      display: flex;
      gap: 12px;
    }
    .cxm-ld-step-rail {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex-shrink: 0;
    }
    .cxm-ld-step-icon {
      width: 26px; height: 26px;
      border-radius: 50%;
      background: var(--cx-stone-100);
      color: var(--cx-text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .cxm-ld-step-icon[data-state="approved"] { background: var(--cx-primary-600); color: #fff; }
    .cxm-ld-step-icon[data-state="rejected"] { background: var(--cx-danger); color: #fff; }
    .cxm-ld-step-icon[data-state="pending"] { background: var(--cx-accent-500); color: #fff; }
    .cxm-ld-step-line {
      width: 2px;
      flex: 1;
      background: var(--cx-border-subtle);
      margin: 3px 0 0;
      min-height: 14px;
    }
    .cxm-ld-step-body {
      padding-bottom: 10px;
      flex: 1;
      min-width: 0;
    }
    .cxm-ld-step-name {
      font-size: var(--cx-text-sm);
      font-weight: 500;
      color: var(--cx-text);
    }
    .cxm-ld-step-meta {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      margin-top: 1px;
    }
    .cxm-ld-step-dot { color: var(--cx-stone-400); }
    .cxm-ld-step-status[data-state="approved"] { color: var(--cx-primary-700); font-weight: 500; }
    .cxm-ld-step-status[data-state="rejected"] { color: var(--cx-danger); font-weight: 500; }
    .cxm-ld-step-status[data-state="pending"] { color: var(--cx-accent-700); font-weight: 500; }
    .cxm-ld-step-time {
      font-size: 10px;
      color: var(--cx-text-muted);
      margin-top: 2px;
    }

    /* Activity trail */
    .cxm-ld-trail { display: flex; flex-direction: column; gap: 2px; }
    .cxm-ld-trail-item {
      display: flex;
      gap: 10px;
      padding: 6px 0;
    }
    .cxm-ld-trail-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: var(--cx-primary-600);
      margin-top: 6px;
      flex-shrink: 0;
      box-shadow: 0 0 0 2px rgba(10, 79, 42, 0.15);
    }
    .cxm-ld-trail-body { flex: 1; }
    .cxm-ld-trail-action {
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
    }
    .cxm-ld-trail-time {
      font-size: 10px;
      color: var(--cx-text-muted);
      margin-top: 1px;
    }
  `],
})
export class LoanDetailPage implements OnInit {
  @Input() id = '';
  loan = signal<any>(null);
  approvals = signal<any[]>([]);
  loading = signal(true);

  constructor(private api: ApiService) {
    addIcons({ timeOutline, checkmarkCircleOutline, closeCircleOutline, walletOutline, checkmark, close });
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

  statusTone(status: string): string {
    const s = (status || '').toLowerCase();
    if (['active', 'approved', 'disbursed', 'closed'].includes(s)) return 'success';
    if (['submitted', 'under_review', 'captured', 'draft'].includes(s)) return 'warning';
    if (['rejected', 'overdue'].includes(s)) return 'danger';
    return 'neutral';
  }

  approvalState(status: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'approved' || s === 'auto_approved') return 'approved';
    if (s === 'rejected') return 'rejected';
    return 'pending';
  }

  approvalIcon(status: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'approved' || s === 'auto_approved') return 'checkmark';
    if (s === 'rejected') return 'close';
    return 'time-outline';
  }
}
