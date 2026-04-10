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
  selector: 'app-audit-logs',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, PageHeaderComponent, DataTableComponent, StatusBadgeComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Audit Logs" subtitle="System activity trail">
        
      </cx-page-header>

      <div class="cx-card !p-4">
        <cx-data-table
          [allColumns]="columns"
          [rows]="rows()"
          [loading]="loading()"
          [pagination]="pagination()"
          [searchPlaceholder]="'Search audit logs...'"
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
export class AuditLogsComponent implements OnInit {
  columns: TableColumn[] = [{key:'entity_type',label:'Entity'},{key:'entity_id',label:'Entity ID'},{key:'action',label:'Action'},{key:'user_id',label:'User ID'},{key:'ip_address',label:'IP'},{key:'created_at',label:'Timestamp',type:'date'}];
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
    this.api.get('/audit-logs', query).subscribe({
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
