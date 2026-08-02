import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { SearchableSelectDirective } from '../../shared/directives/searchable-select.directive';
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import { PageGuide } from '../../shared/guide/page-guide.model';

/**
 * Settlements queue — outbound bank transfers that pay disbursed loans to
 * customers via Paystack/Flutterwave. Lists every settlement with a status
 * filter and a retry action for failed/reversed ones. Gated by loans.disburse
 * (menu + backend RbacMiddleware).
 */
const SETTLEMENTS_GUIDE: PageGuide = {
  id: 'settlements',
  titleKey: 'Settlements',
  purposeKey: 'The actual outbound transfers paying disbursed loans out to customers.',
  descriptionKey:
    'Disbursement records that a loan has been released and posts the accounting; settlement is the '
    + 'money genuinely leaving the bank. Keeping them separate is what lets you see loans that are '
    + 'disbursed in the books but not yet paid — which is exactly the gap customers ring about.',
  actionKeys: [
    'See disbursed loans awaiting transfer',
    'Mark a transfer as sent, or record a failure',
    'Investigate a customer who says they have not been paid',
  ],
  workflowKeys: [
    'Loan disbursed and journals posted',
    'Appears here awaiting transfer',
    'Transfer sent to the customer\'s bank',
    'Marked settled, or retried on failure',
  ],
  dependsOnKeys: ['Disbursement Queue'],
  businessRuleKeys: [
    'Disbursed and settled are different states. A loan can be fully disbursed in the books while the transfer is still pending.',
    'A failed transfer does not undo the disbursement — the loan remains disbursed and the transfer is retried.',
    'Bank details come from the customer record; a wrong account number fails here, not at disbursement.',
  ],
  tipKeys: [
    'When a customer says they have not been paid, this page answers it — not the loan status.',
    'Chase failed transfers the same day. They are usually a wrong account number, and the customer is waiting.',
  ],
  permissionKeys: ['loans.disburse'],
};

@Component({
  selector: 'app-settlements',
  standalone: true,
  imports: [SearchableSelectDirective, CommonModule, FormsModule, RouterLink, LucideAngularModule, PageHeaderComponent, DataTableComponent, PageGuideComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Settlements" subtitle="Outbound transfers paying disbursed loans to customers" eyebrow="Finance"></cx-page-header>

      <cx-page-guide [guide]="guide"></cx-page-guide>

      <div class="cx-st-toolbar">
        <label class="cx-st-toolbar-label">Status</label>
        <select class="cx-select" [(ngModel)]="statusFilter" (change)="load()">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="reversed">Reversed</option>
        </select>
      </div>

      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
                     searchPlaceholder="Search by application ID, customer, or account..."
                     [hasActions]="true" trackBy="id" (query)="onQuery($event)">
        <ng-template #rowActions let-row>
          <div class="flex items-center gap-1 justify-end">
            <a class="cx-btn cx-btn-outline cx-btn-sm" [routerLink]="'/loans/' + row.loan_id" title="Open loan">
              <lucide-icon name="external-link" [size]="14"></lucide-icon>
            </a>
            @if ((row.status === 'failed' || row.status === 'reversed') && auth.hasPermission('loans.disburse')) {
              <button class="cx-btn cx-btn-primary cx-btn-sm" (click)="retry(row)" [disabled]="retrying() === row.id" title="Retry settlement">
                <lucide-icon name="refresh-cw" [size]="14"></lucide-icon>
                <span class="ml-1">Retry</span>
              </button>
            }
          </div>
        </ng-template>
      </cx-data-table>
    </div>
  `,
  styles: [`
    .cx-st-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .cx-st-toolbar-label { font-size: var(--cx-text-xs); font-weight: 600; color: var(--cx-text-secondary); }
    .cx-st-toolbar .cx-select { max-width: 220px; }
  `],
})
export class SettlementsComponent implements OnInit {
  readonly guide = SETTLEMENTS_GUIDE;

  private api = inject(ApiService);
  private toast = inject(ToastService);
  auth = inject(AuthService);

  columns: TableColumn[] = [
    { key: 'application_id', label: 'App ID' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'provider', label: 'Provider' },
    { key: 'amount', label: 'Amount', type: 'currency', align: 'right' },
    { key: 'account_number', label: 'Account' },
    { key: 'status', label: 'Status', type: 'badge', badgeMap: {
      pending:    { label: 'Pending',    class: 'cx-badge-warning' },
      processing: { label: 'Processing', class: 'cx-badge-warning' },
      success:    { label: 'Success',    class: 'cx-badge-success' },
      failed:     { label: 'Failed',     class: 'cx-badge-danger' },
      reversed:   { label: 'Reversed',   class: 'cx-badge-danger' },
    } },
    { key: 'failure_reason', label: 'Reason' },
    { key: 'created_at', label: 'Created', type: 'date' },
  ];

  rows = signal<any[]>([]);
  loading = signal(true);
  pagination = signal<TablePagination | null>(null);
  retrying = signal<string | null>(null);
  statusFilter = '';
  private q: any = {};

  ngOnInit(): void { this.load(); }

  onQuery(e: TableQueryEvent) { this.q = e; this.load(); }

  load(): void {
    this.loading.set(true);
    this.api.get('/settlements', { ...this.q, status: this.statusFilter || undefined }).subscribe({
      next: r => { this.rows.set(r.data || []); this.pagination.set(r.meta || null); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  retry(row: any): void {
    if (this.retrying()) return;
    this.retrying.set(row.id);
    this.api.post(`/loans/${row.loan_id}/settle`, {}).subscribe({
      next: r => { this.retrying.set(null); this.toast.success(r.message || 'Settlement initiated'); this.load(); },
      error: e => { this.retrying.set(null); this.toast.error(e.error?.message || 'Retry failed'); },
    });
  }
}
