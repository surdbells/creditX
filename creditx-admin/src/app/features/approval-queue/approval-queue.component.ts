import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-approval-queue', standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, StatusBadgeComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Approval Queue"
        subtitle="Loans awaiting your decision at this approval step"
        eyebrow="Workflow"></cx-page-header>
      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
        searchPlaceholder="Search pending approvals..." [hasActions]="true" (query)="onQuery($event)">
        <ng-template #rowActions let-row>
          <div class="flex items-center gap-1 justify-end">
            <a [routerLink]="['/loans', row.loan_id || row.id]" class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" title="Review">
              <lucide-icon name="eye" [size]="14"></lucide-icon>
            </a>
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon cx-aq-approve" (click)="decide(row, 'approve')" title="Approve">
              <lucide-icon name="check-circle" [size]="14"></lucide-icon>
            </button>
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon cx-aq-reject" (click)="decide(row, 'reject')" title="Reject">
              <lucide-icon name="x-circle" [size]="14"></lucide-icon>
            </button>
          </div>
        </ng-template>
      </cx-data-table>
    </div>
  `,
  styles: [`
    .cx-aq-approve { color: var(--cx-success); }
    .cx-aq-approve:hover { background: var(--cx-success-50); }
    .cx-aq-reject { color: var(--cx-danger); }
    .cx-aq-reject:hover { background: var(--cx-danger-50); }
  `],
})
export class ApprovalQueueComponent implements OnInit {
  columns: TableColumn[] = [
    { key: 'application_id', label: 'App ID' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'amount_requested', label: 'Amount', type: 'currency', align: 'right' },
    { key: 'product_name', label: 'Product' },
    { key: 'current_step', label: 'Step' },
    { key: 'status', label: 'Status' },
    { key: 'created_at', label: 'Submitted', type: 'date' },
  ];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null); q: any = {};

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit() { this.load(); }
  load(p?: any) { this.loading.set(true); this.api.get('/approval-queue', { ...this.q, ...p }).subscribe({ next: r => { this.rows.set(r.data || []); this.pagination.set(r.meta || null); this.loading.set(false); }, error: () => this.loading.set(false) }); }
  onQuery(e: TableQueryEvent) { this.q = e; this.load(e); }

  decide(row: any, decision: string) {
    const id = row.loan_id || row.id;
    this.api.post(`/approval-queue/loan/${id}/decide`, { decision, comment: '' }).subscribe({
      next: r => { this.toast.success(r.message || `Loan ${decision}d`); this.load(this.q); },
      error: e => this.toast.error(e.error?.message || 'Failed'),
    });
  }
}
