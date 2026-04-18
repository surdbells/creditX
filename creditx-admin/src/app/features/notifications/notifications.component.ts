import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { SearchableSelectComponent, SelectOption } from '../../shared/components/searchable-select/searchable-select.component';

@Component({
  selector: 'app-notifications', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent, SearchableSelectComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Notifications" subtitle="Manage templates and send push notifications">
        <div class="flex items-center gap-2">
          @if (auth.hasPermission('notifications.manage')) {
            <button class="cx-btn cx-btn-outline" (click)="openPushDialog()">
              <lucide-icon name="bell" [size]="16"></lucide-icon> Send Push
            </button>
            <button class="cx-btn cx-btn-primary" (click)="openTemplateForm()">
              <lucide-icon name="plus" [size]="16"></lucide-icon> Template
            </button>
          }
        </div>
      </cx-page-header>

      <div class="cx-card !p-4 overflow-hidden">
        <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
          searchPlaceholder="Search notifications..." [hasActions]="true" (query)="onQuery($event)">
          <ng-template #rowActions let-row>
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openTemplateForm(row)"><lucide-icon name="pencil" [size]="14"></lucide-icon></button>
          </ng-template>
        </cx-data-table>
      </div>
    </div>

    <!-- Template Form -->
    <cx-form-dialog [open]="showForm()" [title]="editId ? 'Edit Template' : 'Create Template'" [saving]="saving()" (close)="showForm.set(false)" (save)="saveTemplate()">
      <div class="space-y-4">
        <div><label class="cx-label">Name *</label><input class="cx-input" [(ngModel)]="form.name" /></div>
        <div><label class="cx-label">Subject *</label><input class="cx-input" [(ngModel)]="form.subject" /></div>
        <div><label class="cx-label">Body *</label><textarea class="cx-input" rows="4" [(ngModel)]="form.body"></textarea></div>
        <div><label class="cx-label">Channel</label>
          <select class="cx-select" [(ngModel)]="form.channel"><option>email</option><option>sms</option><option>push</option><option>in_app</option></select>
        </div>
      </div>
    </cx-form-dialog>

    <!-- Send Push Dialog -->
    <cx-form-dialog [open]="showPush()" title="Send Push Notification" [saving]="pushSending()" saveLabel="Send" (close)="showPush.set(false)" (save)="sendPush()">
      <div class="space-y-4">
        <div><label class="cx-label">Title *</label><input class="cx-input" [(ngModel)]="pushForm.title" placeholder="Notification title" /></div>
        <div><label class="cx-label">Message *</label><textarea class="cx-input" rows="3" [(ngModel)]="pushForm.body" placeholder="Notification message"></textarea></div>
        <div><label class="cx-label">Send To</label>
          <select class="cx-select" [(ngModel)]="pushForm.target" (change)="onPushTargetChange()">
            <option value="user">Specific User</option>
            <option value="role">All Users with Role</option>
          </select>
        </div>
        @if (pushForm.target === 'user') {
          <div><label class="cx-label">Select User</label>
            <cx-searchable-select [options]="userOptions()" placeholder="Search user..." [(ngModel)]="pushForm.user_id"></cx-searchable-select>
          </div>
        }
        @if (pushForm.target === 'role') {
          <div><label class="cx-label">Select Role</label>
            <select class="cx-select" [(ngModel)]="pushForm.role">
              <option value="">Choose...</option>
              <option value="agent">Agent</option>
              <option value="loan_officer">Loan Officer</option>
              <option value="all">All Users</option>
            </select>
          </div>
        }
        <div><label class="cx-label">Route (optional)</label>
          <input class="cx-input" [(ngModel)]="pushForm.route" placeholder="/loan-detail/abc123" />
          <p class="text-[10px] text-[var(--cx-text-muted)] mt-1">Deep link path to open when user taps the notification</p>
        </div>
      </div>
    </cx-form-dialog>
  `,
})
export class NotificationsComponent implements OnInit {
  columns: TableColumn[] = [
    { key: 'name', label: 'Template Name' },
    { key: 'subject', label: 'Subject' },
    { key: 'channel', label: 'Channel' },
    { key: 'is_active', label: 'Active' },
    { key: 'created_at', label: 'Created', type: 'date' },
  ];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null); q: any = {};

  // Template form
  showForm = signal(false); saving = signal(false); editId: string|null = null;
  form: any = { name: '', subject: '', body: '', channel: 'push' };

  // Push notification
  showPush = signal(false); pushSending = signal(false);
  pushForm: any = { title: '', body: '', target: 'user', user_id: '', role: '', route: '' };
  users = signal<any[]>([]);

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() { this.load(); }

  load(p?: any) {
    this.loading.set(true);
    this.api.get('/notification-templates', { ...this.q, ...p }).subscribe({
      next: r => { this.rows.set(r.data || []); this.pagination.set(r.meta || null); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
  onQuery(e: TableQueryEvent) { this.q = e; this.load(e); }

  openTemplateForm(row?: any) {
    if (row) { this.editId = row.id; this.form = { name: row.name, subject: row.subject, body: row.body, channel: row.channel }; }
    else { this.editId = null; this.form = { name: '', subject: '', body: '', channel: 'push' }; }
    this.showForm.set(true);
  }

  saveTemplate() {
    this.saving.set(true);
    (this.editId ? this.api.put('/notification-templates/' + this.editId, this.form) : this.api.post('/notification-templates', this.form)).subscribe({
      next: r => { this.saving.set(false); this.toast.success(r.message || 'Saved'); this.showForm.set(false); this.load(this.q); },
      error: e => { this.saving.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }

  userOptions(): SelectOption[] { return this.users().map((u: any) => ({ value: u.id, label: u.full_name, sublabel: u.email })); }

  openPushDialog() {
    this.pushForm = { title: '', body: '', target: 'user', user_id: '', role: '', route: '' };
    this.showPush.set(true);
    if (this.users().length === 0) {
      this.api.get('/users', { per_page: 500 }).subscribe({ next: r => this.users.set(r.data || []) });
    }
  }

  onPushTargetChange() { this.pushForm.user_id = ''; this.pushForm.role = ''; }

  sendPush() {
    if (!this.pushForm.title || !this.pushForm.body) { this.toast.error('Title and message are required'); return; }
    this.pushSending.set(true);

    const payload: any = {
      title: this.pushForm.title,
      body: this.pushForm.body,
      data: this.pushForm.route ? { route: this.pushForm.route } : {},
    };

    if (this.pushForm.target === 'user') {
      if (!this.pushForm.user_id) { this.pushSending.set(false); this.toast.error('Select a user'); return; }
      payload.user_id = this.pushForm.user_id;
    } else {
      // For role-based, we'd need to get user IDs by role — simplified for now
      payload.user_ids = this.users().filter((u: any) => {
        if (this.pushForm.role === 'all') return true;
        return (u.roles || []).some((r: any) => r.slug === this.pushForm.role);
      }).map((u: any) => u.id);
    }

    this.api.post('/notifications/push', payload).subscribe({
      next: r => { this.pushSending.set(false); this.toast.success(r.message || 'Notification sent'); this.showPush.set(false); },
      error: e => { this.pushSending.set(false); this.toast.error(e.error?.message || 'Failed to send'); },
    });
  }
}
