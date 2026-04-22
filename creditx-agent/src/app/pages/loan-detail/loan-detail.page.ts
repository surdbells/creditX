import { Component, OnInit, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonIcon, IonSpinner, IonFooter } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  timeOutline, checkmarkCircleOutline, closeCircleOutline, walletOutline, checkmark, close,
  chatbubbleEllipsesOutline, paperPlaneOutline, createOutline,
} from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-loan-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonIcon, IonSpinner, IonFooter],
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

        <div class="cxm-ld-body">
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

    <!--
      Action bar — rendered as an Ionic footer so Ionic's layout
      manager positions it correctly above the bottom tab bar (which
      is owned by the parent tabs.page.ts). ion-footer also knows
      about safe-area insets natively, so notched devices and desktop
      browsers both land in the right place without manual env() math.

      Only rendered once the loan has loaded so we don't flash an empty
      bar during the initial fetch.

      Button visibility is status-driven:
        - Message      — always visible when loan is loaded; every loan
                         needs to be able to start a scoped thread
        - Submit       — only when status === 'captured' or 'draft'.
                         'submitted' and everything downstream have
                         already entered the approval flow.
    -->
    @if (loan(); as l) {
      <ion-footer class="ion-no-border">
        <div class="cxm-ld-action-bar">
          <button class="cxm-ld-action-btn cxm-ld-action-secondary" (click)="openMessageSheet()">
            <ion-icon name="chatbubble-ellipses-outline" style="font-size: 18px"></ion-icon>
            <span>Message</span>
          </button>
          @if (canSubmit(l.status)) {
            <button class="cxm-ld-action-btn cxm-ld-action-primary"
                    [disabled]="submitting()"
                    (click)="submitLoan()">
              @if (submitting()) {
                <ion-spinner name="crescent" style="width: 16px; height: 16px"></ion-spinner>
                <span>Submitting...</span>
              } @else {
                <ion-icon name="paper-plane-outline" style="font-size: 18px"></ion-icon>
                <span>Submit for Approval</span>
              }
            </button>
          }
        </div>
      </ion-footer>
    }

    <!--
      Loan-scoped message sheet. Creating a conversation requires a
      subject + body; we auto-prefill subject with 'Re: {app_id}' so
      backoffice can triage by loan at a glance, and pass loan_id so
      the conversation is filterable by loan downstream.
    -->
    @if (messageSheetOpen()) {
      <div class="cxm-ld-sheet-backdrop" (click)="closeMessageSheet()"></div>
      <div class="cxm-ld-sheet cx-animate-in">
        <div class="cxm-ld-sheet-handle"></div>
        <div class="cxm-ld-sheet-head">
          <div>
            <h3 class="cxm-ld-sheet-title">Start a conversation</h3>
            <p class="cxm-ld-sheet-sub">About loan {{ loan()?.application_id }}</p>
          </div>
          <button class="cxm-ld-sheet-close" (click)="closeMessageSheet()" aria-label="Close">
            <ion-icon name="close" style="font-size: 18px"></ion-icon>
          </button>
        </div>
        <div class="cxm-ld-sheet-body">
          <label class="cxm-ld-field-label" style="display: block; margin-bottom: 4px">Subject</label>
          <input type="text" class="cxm-ld-sheet-input"
                 [(ngModel)]="messageSubject" maxlength="200"
                 placeholder="What is this about?" />
          <label class="cxm-ld-field-label" style="display: block; margin: 12px 0 4px">Message</label>
          <textarea class="cxm-ld-sheet-textarea" rows="4"
                    [(ngModel)]="messageBody"
                    placeholder="Type your message..."></textarea>
        </div>
        <div class="cxm-ld-sheet-actions">
          <button class="cxm-ld-action-btn cxm-ld-action-secondary" (click)="closeMessageSheet()">
            Cancel
          </button>
          <button class="cxm-ld-action-btn cxm-ld-action-primary"
                  [disabled]="sendingMessage() || !messageSubject.trim() || !messageBody.trim()"
                  (click)="sendMessage()">
            @if (sendingMessage()) {
              <ion-spinner name="crescent" style="width: 16px; height: 16px"></ion-spinner>
              <span>Sending...</span>
            } @else {
              <ion-icon name="paper-plane-outline" style="font-size: 16px"></ion-icon>
              <span>Send</span>
            }
          </button>
        </div>
      </div>
    }
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

    /*
     * Body wrapper — replaces the old 'px-4 pb-6 flex flex-col gap-3
     * -mt-4' class.
     *
     * Unlike commits pre-G where the action bar was fixed-positioned
     * (requiring 150px bottom padding to clear it + the tab bar), the
     * action bar is now inside <ion-footer> which Ionic automatically
     * accounts for when sizing ion-content. Bottom-padding here only
     * needs to provide visual breathing room under the last content
     * card — 24px is plenty.
     */
    .cxm-ld-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 0 16px 24px;
      margin-top: -16px;
    }

    /*
     * Action bar layout — placement and positioning are now handled by
     * the parent <ion-footer> which sits above the ion-content and
     * above the app's bottom tab bar automatically. We only style the
     * bar's INTERNAL layout here (flex row of buttons + spacing).
     *
     * ion-footer has its own background + safe-area handling, so we
     * inherit both by leaving .cxm-ld-action-bar transparent and
     * letting the parent do the work.
     */
    .cxm-ld-action-bar {
      display: flex;
      gap: 8px;
      padding: 10px 12px 12px;
      background: var(--cx-surface);
      border-top: 1px solid var(--cx-border);
    }

    .cxm-ld-action-btn {
      flex: 1 1 0;
      min-width: 0; /* allow flex to shrink below content width */
      padding: 11px 12px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid transparent;
      transition: transform 100ms cubic-bezier(0.4, 0, 0.2, 1),
                  background 100ms cubic-bezier(0.4, 0, 0.2, 1);
      min-height: 44px; /* 44px min-tap-target on mobile */
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
    }

    .cxm-ld-action-secondary {
      background: var(--cx-surface-2, #f5f5f4);
      color: var(--cx-text-secondary);
      border-color: var(--cx-border);
      /* Secondary stays compact — only as wide as needed for 'Message' */
      flex: 0 0 auto;
      min-width: 110px;
    }
    .cxm-ld-action-secondary:active {
      background: var(--cx-surface-hover, var(--cx-stone-100, #e7e5e4));
      transform: scale(0.98);
    }

    .cxm-ld-action-primary {
      /* Primary takes all remaining width — THE action */
      flex: 1 1 auto;
      background: linear-gradient(135deg, var(--cx-primary-700), var(--cx-primary-600));
      color: #fff;
      box-shadow: 0 2px 8px rgba(10, 79, 42, 0.22);
    }
    .cxm-ld-action-primary:disabled {
      opacity: 0.55;
      box-shadow: none;
    }
    .cxm-ld-action-primary:not(:disabled):active {
      transform: scale(0.985);
    }

    /* ═══ Message sheet (loan-scoped conversation starter) ═══ */
    .cxm-ld-sheet-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      z-index: 100;
    }
    .cxm-ld-sheet {
      position: fixed;
      left: 0; right: 0; bottom: 0;
      background: var(--cx-surface);
      border-top-left-radius: 20px;
      border-top-right-radius: 20px;
      z-index: 101;
      padding-bottom: env(safe-area-inset-bottom);
      max-height: 85vh;
      display: flex;
      flex-direction: column;
    }
    .cxm-ld-sheet-handle {
      width: 36px; height: 4px;
      background: var(--cx-border);
      border-radius: 2px;
      margin: 8px auto 4px;
      flex-shrink: 0;
    }
    .cxm-ld-sheet-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 20px 14px;
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cxm-ld-sheet-title {
      margin: 0;
      font-size: var(--cx-text-md);
      font-weight: 600;
      color: var(--cx-text);
    }
    .cxm-ld-sheet-sub {
      margin: 2px 0 0;
      font-size: 11px;
      color: var(--cx-text-muted);
    }
    .cxm-ld-sheet-close {
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      background: var(--cx-surface-muted, rgba(0,0,0,0.04));
      border: none;
      border-radius: 50%;
      color: var(--cx-text-secondary);
      cursor: pointer;
      flex-shrink: 0;
    }
    .cxm-ld-sheet-body {
      flex: 1;
      overflow-y: auto;
      padding: 14px 20px;
    }
    .cxm-ld-sheet-input,
    .cxm-ld-sheet-textarea {
      width: 100%;
      padding: 10px 12px;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      outline: none;
      transition: border-color var(--cx-dur-fast) var(--cx-ease-premium);
      font-family: inherit;
      resize: none;
    }
    .cxm-ld-sheet-input:focus,
    .cxm-ld-sheet-textarea:focus {
      border-color: var(--cx-primary-600);
      background: var(--cx-surface);
    }
    .cxm-ld-sheet-actions {
      display: flex;
      gap: 10px;
      padding: 12px 20px 16px;
      border-top: 1px solid var(--cx-border-subtle);
    }
  `],
})
export class LoanDetailPage implements OnInit {
  @Input() id = '';
  loan = signal<any>(null);
  approvals = signal<any[]>([]);
  loading = signal(true);

  // Action bar state
  submitting = signal(false);

  // Message sheet state
  messageSheetOpen = signal(false);
  sendingMessage = signal(false);
  messageSubject = '';
  messageBody = '';

  constructor(
    private api: ApiService,
    private router: Router,
    private toast: ToastService,
  ) {
    addIcons({
      timeOutline, checkmarkCircleOutline, closeCircleOutline, walletOutline, checkmark, close,
      chatbubbleEllipsesOutline, paperPlaneOutline, createOutline,
    });
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

  /**
   * True when the loan is in a state that can be submitted for
   * approval. Matches the backend's LoanStatus transition map
   * (DRAFT or CAPTURED → SUBMITTED). Any other status already
   * passed the gate; showing the button would lead to a 400.
   */
  canSubmit(status: string | null | undefined): boolean {
    if (!status) return false;
    const s = status.toLowerCase();
    return s === 'captured' || s === 'draft';
  }

  /**
   * Submit the loan for approval. POST /loans/:id/submit transitions
   * the status CAPTURED → SUBMITTED and kicks off the approval engine.
   *
   * On success: refresh the loan payload (status + trails + approvals
   * will all be new) and toast the user. On error: the error
   * interceptor already toasts the server message; we just flip
   * submitting back to false so the button re-enables.
   */
  submitLoan(): void {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.api.post(`/loans/${this.id}/submit`, {}).subscribe({
      next: res => {
        this.submitting.set(false);
        this.loan.set(res.data);
        // Re-fetch approvals since initiate() may have created new rows
        this.api.get(`/approvals/loan/${this.id}`).subscribe({
          next: r => this.approvals.set(r.data || []),
          error: () => {},
        });
        this.toast.success('Loan submitted for approval');
      },
      error: () => this.submitting.set(false),
    });
  }

  /**
   * Open the compose sheet for a loan-scoped conversation. Pre-fills
   * a sensible default subject; agent can edit before sending.
   */
  openMessageSheet(): void {
    const appId = this.loan()?.application_id || 'loan';
    this.messageSubject = `Re: ${appId}`;
    this.messageBody = '';
    this.messageSheetOpen.set(true);
  }

  closeMessageSheet(): void {
    if (this.sendingMessage()) return; // don't allow close mid-send
    this.messageSheetOpen.set(false);
  }

  /**
   * POST /conversations with subject/body/loan_id. Backend attaches
   * the calling agent and creates the initial message in one shot.
   * On success: close sheet, toast, and navigate to the new thread
   * so the agent can continue the exchange immediately.
   */
  sendMessage(): void {
    const subject = this.messageSubject.trim();
    const body = this.messageBody.trim();
    if (!subject || !body || this.sendingMessage()) return;
    this.sendingMessage.set(true);
    this.api.post('/conversations', {
      subject,
      message: body,
      loan_id: this.id,
    }).subscribe({
      next: res => {
        this.sendingMessage.set(false);
        this.messageSheetOpen.set(false);
        this.toast.success('Conversation started');
        const conversationId = res.data?.id;
        if (conversationId) {
          this.router.navigate(['/messages', conversationId]);
        }
      },
      error: () => this.sendingMessage.set(false),
    });
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
