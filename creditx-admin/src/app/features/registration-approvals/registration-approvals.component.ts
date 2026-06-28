import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

/**
 * Registration Approvals — 2-level approval queue for self-service portal
 * sign-ups. Each registration needs two distinct staff approvals before the
 * customer's account is activated. Gated by customers.edit (approve/reject).
 */
@Component({
  selector: 'app-registration-approvals',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, PageHeaderComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Registration Approvals"
        subtitle="Two-level approval of self-service portal sign-ups"
        eyebrow="Portal"></cx-page-header>

      <div class="cx-ra-table-wrap">
        <table class="cx-ra-table">
          <thead><tr>
            <th>Name</th><th>Email</th><th>Phone</th><th>Verified</th>
            <th class="c">Approvals</th><th></th>
          </tr></thead>
          <tbody>
            @if (loading()) {
              <tr><td colspan="6" class="cx-ra-state">Loading…</td></tr>
            } @else if (rows().length === 0) {
              <tr><td colspan="6" class="cx-ra-state">No registrations awaiting approval.</td></tr>
            } @else {
              @for (r of rows(); track r.id) {
                <tr>
                  <td>{{ r.full_name }}</td>
                  <td>{{ r.email }}</td>
                  <td class="tabular-nums">{{ r.phone || '—' }}</td>
                  <td class="tabular-nums">{{ r.email_verified_at || '—' }}</td>
                  <td class="c"><span class="cx-ra-badge">{{ r.approvals }}/2</span></td>
                  <td class="r">
                    @if (auth.hasPermission('customers.edit')) {
                      <button class="cx-btn cx-btn-primary cx-btn-sm" (click)="approve(r)" [disabled]="busyId() === r.id">
                        <lucide-icon name="check" [size]="13"></lucide-icon><span>Approve</span>
                      </button>
                      <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="reject(r)" [disabled]="busyId() === r.id">
                        <lucide-icon name="x" [size]="13"></lucide-icon><span>Reject</span>
                      </button>
                    }
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .cx-ra-table-wrap { background: var(--cx-surface); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-xl, 12px); overflow: hidden; }
    .cx-ra-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .cx-ra-table th { text-align: left; padding: 10px 14px; background: var(--cx-surface-2); font-size: 10px; font-weight: 600;
      letter-spacing: .06em; text-transform: uppercase; color: var(--cx-text-muted); border-bottom: 1px solid var(--cx-border); }
    .cx-ra-table th.c { text-align: center; }
    .cx-ra-table td { padding: 10px 14px; border-bottom: 1px solid var(--cx-border-subtle); }
    .cx-ra-table td.c { text-align: center; } .cx-ra-table td.r { text-align: right; }
    .cx-ra-table tbody tr:last-child td { border-bottom: none; }
    .cx-ra-state { padding: 32px; text-align: center; color: var(--cx-text-muted); }
    .cx-ra-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;
      background: var(--cx-surface-2); color: var(--cx-text-secondary); }
    .cx-ra-table .cx-btn { margin-left: 6px; }
  `],
})
export class RegistrationApprovalsComponent {
  rows = signal<any[]>([]);
  loading = signal(true);
  busyId = signal<string | null>(null);

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.get('/customers/registrations/pending', {}).subscribe({
      next: r => { this.rows.set(r.data?.registrations || []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  approve(r: any) {
    this.busyId.set(r.id);
    this.api.post(`/customers/${r.id}/registration/approve`, {}).subscribe({
      next: res => { this.busyId.set(null); this.toast.success(res.message || 'Approved'); this.load(); },
      error: e => { this.busyId.set(null); this.toast.error(e.error?.message || 'Approve failed'); },
    });
  }

  reject(r: any) {
    const reason = prompt(`Reject registration for ${r.full_name}? Optional reason:`);
    if (reason === null) return;
    this.busyId.set(r.id);
    this.api.post(`/customers/${r.id}/registration/reject`, { reason }).subscribe({
      next: res => { this.busyId.set(null); this.toast.success(res.message || 'Rejected'); this.load(); },
      error: e => { this.busyId.set(null); this.toast.error(e.error?.message || 'Reject failed'); },
    });
  }
}
