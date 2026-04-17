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
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';

@Component({
  selector: 'app-customers', standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, StatusBadgeComponent, FormDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Customer Management" subtitle="{{ totalRecords | number }} customers">
        @if (auth.hasPermission('customers.create')) {
          <button class="cx-btn cx-btn-primary" (click)="openForm()"><lucide-icon name="plus" [size]="16"></lucide-icon> Add Customer</button>
        }
      </cx-page-header>
      <div class="cx-card !p-0 overflow-hidden">
        <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
          searchPlaceholder="Search customers by name, phone, BVN..." [hasActions]="true" (query)="onQuery($event)">
          <ng-template #rowActions let-row>
            <div class="flex items-center gap-1">
              <a [routerLink]="['/customers', row.id]" class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" title="View"><lucide-icon name="eye" [size]="14"></lucide-icon></a>
              <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)" title="Edit"><lucide-icon name="pencil" [size]="14"></lucide-icon></button>
            </div>
          </ng-template>
        </cx-data-table>
      </div>
    </div>
    <cx-form-dialog [open]="showForm()" [title]="editId ? 'Edit Customer' : 'Create Customer'" [saving]="saving()" maxWidth="640px" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">First Name *</label><input class="cx-input" [(ngModel)]="form.first_name" /></div>
          <div><label class="cx-label">Last Name *</label><input class="cx-input" [(ngModel)]="form.last_name" /></div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Phone *</label><input class="cx-input" [(ngModel)]="form.phone" /></div>
          <div><label class="cx-label">Email</label><input class="cx-input" type="email" [(ngModel)]="form.email" /></div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">BVN</label><input class="cx-input" [(ngModel)]="form.bvn" /></div>
          <div><label class="cx-label">Date of Birth</label><input class="cx-input" type="date" [(ngModel)]="form.date_of_birth" /></div>
        </div>
        <div><label class="cx-label">Address</label><textarea class="cx-input" rows="2" [(ngModel)]="form.address"></textarea></div>
      </div>
    </cx-form-dialog>
  `,
})
export class CustomersComponent implements OnInit {
  columns: TableColumn[] = [
    { key: 'full_name', label: 'Customer Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'bvn', label: 'BVN' },
    { key: 'active_loans_count', label: 'Loans', align: 'center' },
    { key: 'created_at', label: 'Registered', type: 'date' },
  ];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {};
  totalRecords = 0; q: any = {};

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit() { this.load(); }

  load(p?: any) {
    this.loading.set(true);
    this.api.get('/customers', { ...this.q, ...p }).subscribe({
      next: r => { this.rows.set(r.data || []); this.pagination.set(r.meta || null); this.totalRecords = r.meta?.total || 0; this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
  onQuery(e: TableQueryEvent) { this.q = e; this.load(e); }

  openForm(row?: any) {
    if (row) { this.editId = row.id; this.form = { first_name: row.first_name, last_name: row.last_name, phone: row.phone, email: row.email, bvn: row.bvn, date_of_birth: row.date_of_birth, address: row.address }; }
    else { this.editId = null; this.form = { first_name: '', last_name: '', phone: '', email: '', bvn: '', date_of_birth: '', address: '' }; }
    this.showForm.set(true);
  }

  saveForm() {
    this.saving.set(true);
    (this.editId ? this.api.put('/customers/' + this.editId, this.form) : this.api.post('/customers', this.form)).subscribe({
      next: r => { this.saving.set(false); this.toast.success(r.message || 'Saved'); this.showForm.set(false); this.load(this.q); },
      error: e => { this.saving.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }
}
