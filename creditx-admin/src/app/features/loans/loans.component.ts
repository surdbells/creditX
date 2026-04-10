import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, Plus, Eye, Pencil } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-loans',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, PageHeaderComponent, DataTableComponent, StatusBadgeComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Loan Management" subtitle="Manage loan applications and lifecycle">
        @if (auth.hasPermission('loans.create')) {
          <button class="cx-btn cx-btn-primary" (click)="showForm = !showForm">
            <lucide-icon name="plus" [size]="16"></lucide-icon> Add New
          </button>
        }
      </cx-page-header>

      <div class="cx-card !p-4">
        <cx-data-table
          [allColumns]="columns"
          [rows]="rows()"
          [loading]="loading()"
          [pagination]="pagination()"
          [searchPlaceholder]="'Search by App ID, customer...'"
          [hasActions]="true"
          (query)="onQuery($event)"
        >
          <ng-template #rowActions let-row>
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" title="View">
              <lucide-icon name="eye" [size]="14"></lucide-icon>
            </button>
          </ng-template>
        </cx-data-table>
      </div>
    </div>
  `,
})
export class LoansComponent implements OnInit {
  columns: TableColumn[] = [{key:'application_id',label:'App ID'},{key:'customer_name',label:'Customer'},{key:'product_name',label:'Product'},{key:'amount_requested',label:'Amount',type:'currency'},{key:'tenure',label:'Tenure'},{key:'status',label:'Status',type:'badge',badgeMap:{draft:{label:'Draft',class:'bg-gray-100 text-gray-600'},captured:{label:'Captured',class:'bg-[var(--cx-accent-50)] text-[var(--cx-accent)]'},submitted:{label:'Submitted',class:'bg-[var(--cx-warning-light)] text-[var(--cx-warning)]'},under_review:{label:'Under Review',class:'bg-[var(--cx-warning-light)] text-[var(--cx-warning)]'},approved:{label:'Approved',class:'bg-[var(--cx-success-light)] text-[var(--cx-success)]'},rejected:{label:'Rejected',class:'bg-[var(--cx-danger-light)] text-[var(--cx-danger)]'},disbursed:{label:'Disbursed',class:'bg-[var(--cx-info-light)] text-[var(--cx-info)]'},active:{label:'Active',class:'bg-[var(--cx-success-light)] text-[var(--cx-success)]'},overdue:{label:'Overdue',class:'bg-[var(--cx-danger-light)] text-[var(--cx-danger)]'},closed:{label:'Closed',class:'bg-[var(--cx-info-light)] text-[var(--cx-info)]'},written_off:{label:'Written Off',class:'bg-[var(--cx-danger-light)] text-[var(--cx-danger)]'},cancelled:{label:'Cancelled',class:'bg-gray-100 text-gray-500'}}},{key:'created_at',label:'Date',type:'date'}];
  rows = signal<any[]>([]);
  loading = signal(true);
  pagination = signal<TablePagination | null>(null);
  showForm = false;
  private currentQuery: any = {};

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit(): void { this.load(); }

  load(params?: any): void {
    this.loading.set(true);
    const query = { ...this.currentQuery, ...params };
    this.api.get('/loans', query).subscribe({
      next: res => {
        this.rows.set(res.data || []);
        this.pagination.set(res.meta || null);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.toast.error('Failed to load data'); },
    });
  }

  onQuery(event: TableQueryEvent): void {
    this.currentQuery = event;
    this.load(event);
  }
}
