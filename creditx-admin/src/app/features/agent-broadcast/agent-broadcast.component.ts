import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

/**
 * Agent Broadcast — admin sends a message to field agents over the selected
 * channels (Email, Push). It always appears in each agent's in-app
 * notification list. Gated by notifications.manage.
 */
@Component({
  selector: 'app-agent-broadcast',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, ConfirmDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Agent Broadcast"
        subtitle="Send a message to field agents (in-app + email / push)"
        eyebrow="Notifications"></cx-page-header>

      <div class="cx-bc-form">
        <label class="cx-label">Subject</label>
        <input class="cx-input" [(ngModel)]="form.subject" placeholder="e.g. New loan product available" maxlength="150" />

        <label class="cx-label">Message</label>
        <textarea class="cx-input" rows="5" [(ngModel)]="form.message" placeholder="Write your message to agents…"></textarea>

        <label class="cx-label">Channels</label>
        <div class="cx-bc-channels">
          <label class="cx-bc-chk"><input type="checkbox" disabled checked /> <span>In-app (always)</span></label>
          <label class="cx-bc-chk"><input type="checkbox" [(ngModel)]="form.email" /> <span>Email</span></label>
          <label class="cx-bc-chk"><input type="checkbox" [(ngModel)]="form.push" /> <span>Push</span></label>
        </div>

        <label class="cx-label">Recipients</label>
        <div class="cx-bc-recipients">
          <label class="cx-bc-chk"><input type="radio" name="rt" value="all" [(ngModel)]="form.recipient_type" /> <span>All field agents</span></label>
          <label class="cx-bc-chk"><input type="radio" name="rt" value="by_location" [(ngModel)]="form.recipient_type" /> <span>By branch</span></label>
        </div>
        @if (form.recipient_type === 'by_location') {
          <select class="cx-select" [(ngModel)]="form.location_id">
            <option [ngValue]="''" disabled>Select branch…</option>
            @for (l of locations(); track l.id) { <option [ngValue]="l.id">{{ l.name }} ({{ l.code }})</option> }
          </select>
        }

        <div class="cx-bc-actions">
          <button class="cx-btn cx-btn-primary" (click)="openConfirm()" [disabled]="busy() || !valid()">
            @if (busy()) { <span class="cx-bc-spinner"></span> }
            @else { <lucide-icon name="send" [size]="14"></lucide-icon> }
            <span>{{ busy() ? 'Sending…' : 'Send Broadcast' }}</span>
          </button>
        </div>

        @if (result(); as r) {
          <div class="cx-bc-result">
            <lucide-icon name="check-circle" [size]="16"></lucide-icon>
            @if (r.queued) {
              <span>In-app delivered to {{ r.agents }} agent(s). Email/push are being sent in the background.</span>
            } @else {
              <span>Delivered to {{ r.agents }} agent(s) — in-app {{ r.sent.in_app }}.</span>
            }
          </div>
        }
      </div>
    </div>

    <cx-confirm-dialog
      [open]="showConfirm()"
      title="Send broadcast"
      [message]="confirmMessage()"
      confirmLabel="Send"
      variant="warning"
      (confirmed)="doSend()"
      (cancelled)="showConfirm.set(false)">
    </cx-confirm-dialog>
  `,
  styles: [`
    .cx-bc-form { max-width: 620px; display: flex; flex-direction: column; gap: 8px;
      background: var(--cx-surface); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-xl, 12px); padding: 20px; }
    .cx-bc-form .cx-label { margin-top: 8px; }
    .cx-bc-channels, .cx-bc-recipients { display: flex; gap: 18px; flex-wrap: wrap; }
    .cx-bc-chk { display: flex; align-items: center; gap: 6px; font-size: 14px; color: var(--cx-text-secondary); cursor: pointer; }
    .cx-bc-actions { margin-top: 14px; }
    .cx-bc-result { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding: 10px 12px;
      border-radius: var(--cx-radius-md); background: #f0fdf4; color: #166534; border: 1px solid #dcfce7; font-size: 13px; }
    .cx-bc-spinner { width: 14px; height: 14px; border: 2px solid currentColor; border-right-color: transparent;
      border-radius: 50%; display: inline-block; animation: cx-bc-spin 0.6s linear infinite; }
    @keyframes cx-bc-spin { to { transform: rotate(360deg); } }
  `],
})
export class AgentBroadcastComponent {
  form: any = { subject: '', message: '', email: true, push: true, recipient_type: 'all', location_id: '' };
  locations = signal<any[]>([]);
  busy = signal(false);
  result = signal<any>(null);
  showConfirm = signal(false);

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {
    this.api.get('/locations', { per_page: 200 }).subscribe({ next: r => this.locations.set(r.data || []), error: () => {} });
  }

  valid(): boolean {
    if (!this.form.subject.trim() || !this.form.message.trim()) return false;
    if (this.form.recipient_type === 'by_location' && !this.form.location_id) return false;
    return true;
  }

  private channels(): string[] {
    const c: string[] = [];
    if (this.form.email) c.push('email');
    if (this.form.push) c.push('push');
    return c;
  }

  confirmMessage(): string {
    const who = this.form.recipient_type === 'by_location'
      ? 'agents in the selected branch'
      : 'all field agents';
    const ch = ['in-app', ...this.channels().map(c => c === 'email' ? 'email' : 'push')].join(', ');
    return `Send “${this.form.subject.trim()}” to ${who} via ${ch}?`;
  }

  openConfirm(): void {
    if (!this.valid()) return;
    this.showConfirm.set(true);
  }

  doSend(): void {
    this.showConfirm.set(false);
    this.busy.set(true);
    this.result.set(null);
    this.api.post('/notifications/broadcast', {
      subject: this.form.subject,
      message: this.form.message,
      channels: this.channels(),
      recipient_type: this.form.recipient_type,
      location_id: this.form.location_id || undefined,
    }).subscribe({
      next: r => { this.busy.set(false); this.result.set(r.data); this.toast.success(r.message || 'Broadcast sent'); },
      error: e => { this.busy.set(false); this.toast.error(e.error?.message || 'Broadcast failed'); },
    });
  }
}
