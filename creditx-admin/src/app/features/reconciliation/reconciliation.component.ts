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
  selector: 'app-reconciliation',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, PageHeaderComponent, DataTableComponent, StatusBadgeComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Reconciliation" subtitle="Bank vs system statement matching">
        
      </cx-page-header>

      <div class="cx-card !p-4">
        <cx-data-table
          [allColumns]="columns"
          [rows]="rows()"
          [loading]="loading()"
          [pagination]="pagination()"
          [searchPlaceholder]="'Search reconciliations...'"
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
export class ReconciliationComponent implements OnInit {
  columns: TableColumn[] = [{key:'period',label:'Period'},{key:'bank_total',label:'Bank Total',type:'currency'},{key:'system_total',label:'System Total',type:'currency'},{key:'difference',label:'Difference',type:'currency'},{key:'status',label:'Status',type:'badge',badgeMap:{pending:{label:'Pending',class:'bg-[var(--cx-warning-light)] text-[var(--cx-warning)]'},matched:{label:'Matched',class:'bg-[var(--cx-success-light)] text-[var(--cx-success)]'},exception:{label:'Exception',class:'bg-[var(--cx-danger-light)] text-[var(--cx-danger)]'},resolved:{label:'Resolved',class:'bg-[var(--cx-info-light)] text-[var(--cx-info)]'}}},{key:'created_at',label:'Created',type:'date'}];
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
    this.api.get('/reconciliations', query).subscribe({
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
