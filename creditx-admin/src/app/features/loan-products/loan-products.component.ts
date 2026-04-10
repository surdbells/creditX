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
  selector: 'app-loan-products',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, PageHeaderComponent, DataTableComponent, StatusBadgeComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Loan Products" subtitle="Configure loan products and fee structures">
        @if (auth.hasPermission('products.create')) {
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
          [searchPlaceholder]="'Search products...'"
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
export class LoanProductsComponent implements OnInit {
  columns: TableColumn[] = [{key:'name',label:'Product Name'},{key:'code',label:'Code'},{key:'interest_calculation_method',label:'Interest Method'},{key:'interest_rate',label:'Rate'},{key:'min_amount',label:'Min Amount',type:'currency'},{key:'max_amount',label:'Max Amount',type:'currency'},{key:'min_tenure',label:'Min Tenure'},{key:'max_tenure',label:'Max Tenure'},{key:'is_active',label:'Active'}];
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
    this.api.get('/loan-products', query).subscribe({
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
