import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';

@Component({
  selector: 'app-government-records', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, FormDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Government Records" subtitle="Unified employee records database — {{ totalRecords | number }} total">
        <div class="flex items-center gap-2">
          <div class="relative">
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="exportOpen = !exportOpen">
              <lucide-icon name="download" [size]="14"></lucide-icon> Export
              <lucide-icon name="chevron-down" [size]="12"></lucide-icon>
            </button>
            @if (exportOpen) {
              <div class="absolute right-0 top-full mt-1 w-44 bg-[var(--cx-surface)] border border-[var(--cx-border)] rounded-xl shadow-xl z-50 overflow-hidden">
                <button class="w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-[var(--cx-surface-hover)] flex items-center gap-2" (click)="exportData('csv')"><lucide-icon name="file-text" [size]="14"></lucide-icon> Export CSV</button>
                <button class="w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-[var(--cx-surface-hover)] flex items-center gap-2" (click)="exportData('excel')"><lucide-icon name="file-text" [size]="14"></lucide-icon> Export Excel</button>
                <button class="w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-[var(--cx-surface-hover)] flex items-center gap-2" (click)="exportData('pdf')"><lucide-icon name="file-text" [size]="14"></lucide-icon> Export PDF</button>
              </div>
            }
          </div>
          @if (auth.hasPermission('records.create')) {
            <button class="cx-btn cx-btn-primary" (click)="openForm()">
              <lucide-icon name="plus" [size]="16"></lucide-icon> Add Record
            </button>
          }
        </div>
      </cx-page-header>

      <!-- Filters Bar -->
      <div class="cx-card !p-4 mb-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div class="lg:col-span-2">
            <div class="relative">
              <lucide-icon name="search" class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" [size]="16"></lucide-icon>
              <input type="text" class="cx-input !pl-8 w-full" placeholder="Search by Staff ID, Name, Organization..."
                     [(ngModel)]="filters.search" (input)="onFilterChange()" />
            </div>
          </div>
          <div>
            <select class="cx-select w-full" [(ngModel)]="filters.record_type_id" (change)="onFilterChange()">
              <option value="">All Record Types</option>
              @for (rt of recordTypes(); track rt.id) {
                <option [value]="rt.id">{{ rt.name }}</option>
              }
            </select>
          </div>
          <div>
            <select class="cx-select w-full" [(ngModel)]="filters.is_active" (change)="onFilterChange()">
              <option value="">All Status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
          <div>
            <select class="cx-select w-full" [(ngModel)]="filters.gender" (change)="onFilterChange()">
              <option value="">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Records Table -->
      <div class="cx-card !p-4 overflow-hidden">
        @if (loading()) {
          <div class="flex items-center justify-center py-16">
            <div class="flex flex-col items-center gap-3">
              <div class="w-8 h-8 border-3 border-[var(--cx-primary)] border-t-transparent rounded-full animate-spin"></div>
              <span class="text-sm text-[var(--cx-text-muted)]">Loading records...</span>
            </div>
          </div>
        } @else if (rows().length === 0) {
          <div class="flex flex-col items-center justify-center py-16">
            <lucide-icon name="database" [size]="48" class="text-[var(--cx-text-muted)] opacity-30 mb-3"></lucide-icon>
            <h3 class="text-base font-semibold text-[var(--cx-text)]">No records found</h3>
            <p class="text-sm text-[var(--cx-text-muted)] mt-1">Try adjusting your filters or search terms</p>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-[var(--cx-border)]">
                  @for (col of visibleColumns; track col.key) {
                    <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider cursor-pointer select-none hover:text-[var(--cx-text)]"
                        (click)="sort(col.key)">
                      <div class="flex items-center gap-1">
                        {{ col.label }}
                        @if (filters.sort_by === col.key) {
                          <lucide-icon [name]="filters.sort_dir === 'ASC' ? 'arrow-up' : 'arrow-down'" [size]="12"></lucide-icon>
                        }
                      </div>
                    </th>
                  }
                  <th class="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.id; let odd = $odd) {
                  <tr class="border-b border-[var(--cx-border)] transition-colors hover:bg-[var(--cx-surface-hover)]"
                      [class.bg-[var(--cx-surface-hover)/30]]="odd">
                    <td class="px-4 py-3">
                      <span class="font-mono text-sm font-medium text-[var(--cx-primary)]">{{ row.staff_id }}</span>
                    </td>
                    <td class="px-4 py-3">
                      <div class="text-sm font-medium text-[var(--cx-text)]">{{ row.employee_name }}</div>
                      <div class="text-xs text-[var(--cx-text-muted)]">{{ row.job_title || '—' }}</div>
                    </td>
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                            [class]="rtBadgeClass(row.record_type_name)">
                        {{ row.record_type_name }}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-sm text-[var(--cx-text-secondary)]">{{ row.organization || '—' }}</td>
                    <td class="px-4 py-3 text-sm text-[var(--cx-text-secondary)]">{{ row.grade_level || '—' }}</td>
                    <td class="px-4 py-3 text-sm font-medium text-[var(--cx-text)]">
                      @if (row.gross_pay) { ₦{{ row.gross_pay | number:'1.0-0' }} } @else { — }
                    </td>
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                            [class]="row.is_active ? 'bg-[var(--cx-success-light)] text-[var(--cx-success)]' : 'bg-gray-100 text-gray-500'">
                        {{ row.is_active ? 'Active' : 'Inactive' }}
                      </span>
                    </td>
                    <td class="px-4 py-3">
                      <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)">
                        <lucide-icon name="pencil" [size]="14"></lucide-icon>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div class="flex items-center justify-between px-4 py-3 border-t border-[var(--cx-border)]">
            <div class="text-xs text-[var(--cx-text-muted)]">
              Showing {{ (page - 1) * perPage + 1 }}–{{ min(page * perPage, totalRecords) }} of {{ totalRecords | number }} records
            </div>
            <div class="flex items-center gap-1">
              <button class="cx-btn cx-btn-ghost cx-btn-sm" [disabled]="page <= 1" (click)="goPage(page - 1)">
                <lucide-icon name="chevron-left" [size]="14"></lucide-icon>
              </button>
              @for (p of pageNumbers(); track p) {
                <button class="cx-btn cx-btn-sm min-w-[32px]" [class]="p === page ? 'cx-btn-primary' : 'cx-btn-ghost'" (click)="goPage(p)">
                  {{ p }}
                </button>
              }
              <button class="cx-btn cx-btn-ghost cx-btn-sm" [disabled]="page >= totalPages" (click)="goPage(page + 1)">
                <lucide-icon name="chevron-right" [size]="14"></lucide-icon>
              </button>
            </div>
          </div>
        }
      </div>
    </div>

    <!-- Create/Edit Dialog -->
    <cx-form-dialog [open]="showForm()" [title]="editId ? 'Edit Record' : 'Add Government Record'" [saving]="saving()"
      maxWidth="640px" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Record Type *</label>
            <select class="cx-select" [(ngModel)]="form.record_type_id">
              <option value="">Select Type</option>
              @for (rt of recordTypes(); track rt.id) { <option [value]="rt.id">{{ rt.name }}</option> }
            </select>
          </div>
          <div><label class="cx-label">Staff ID *</label><input class="cx-input" [(ngModel)]="form.staff_id" /></div>
        </div>
        <div><label class="cx-label">Employee Name *</label><input class="cx-input" [(ngModel)]="form.employee_name" /></div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Job Title</label><input class="cx-input" [(ngModel)]="form.job_title" /></div>
          <div><label class="cx-label">Organization</label><input class="cx-input" [(ngModel)]="form.organization" /></div>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div><label class="cx-label">Grade Level</label><input class="cx-input" [(ngModel)]="form.grade_level" /></div>
          <div><label class="cx-label">Step</label><input class="cx-input" [(ngModel)]="form.step" /></div>
          <div><label class="cx-label">Gender</label>
            <select class="cx-select" [(ngModel)]="form.gender"><option value="">—</option><option>Male</option><option>Female</option></select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Gross Pay (₦)</label><input class="cx-input" type="number" [(ngModel)]="form.gross_pay" /></div>
          <div><label class="cx-label">Net Pay (₦)</label><input class="cx-input" type="number" [(ngModel)]="form.net_pay" /></div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Hire Date</label><input class="cx-input" type="date" [(ngModel)]="form.hire_date" /></div>
          <div><label class="cx-label">Date of Birth</label><input class="cx-input" type="date" [(ngModel)]="form.date_of_birth" /></div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Bank Name</label><input class="cx-input" [(ngModel)]="form.bank_name" /></div>
          <div><label class="cx-label">Account Number</label><input class="cx-input" [(ngModel)]="form.account_number" /></div>
        </div>
        <div><label class="cx-label">Phone</label><input class="cx-input" [(ngModel)]="form.telephone_number" /></div>
      </div>
    </cx-form-dialog>
  `,
})
export class GovernmentRecordsComponent implements OnInit {
  visibleColumns = [
    { key: 'staff_id', label: 'Staff ID' },
    { key: 'employee_name', label: 'Employee' },
    { key: 'record_type_name', label: 'Type' },
    { key: 'organization', label: 'Organization' },
    { key: 'grade_level', label: 'Grade' },
    { key: 'gross_pay', label: 'Gross Pay' },
    { key: 'is_active', label: 'Status' },
  ];

  rows = signal<any[]>([]);
  loading = signal(true);
  recordTypes = signal<any[]>([]);
  showForm = signal(false);
  saving = signal(false);
  editId: string | null = null;
  form: any = {};

  filters: any = { search: '', record_type_id: '', is_active: '', gender: '', sort_by: 'createdAt', sort_dir: 'DESC' };
  page = 1; perPage = 25; totalRecords = 0; totalPages = 0;
  exportOpen = false;
  private filterTimeout: any;

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit(): void {
    this.load();
    this.api.get('/record-types', { per_page: 50 }).subscribe({ next: r => this.recordTypes.set(r.data || []) });
  }

  load(): void {
    this.loading.set(true);
    const params: any = { page: this.page, per_page: this.perPage, sort_by: this.filters.sort_by, sort_dir: this.filters.sort_dir };
    if (this.filters.search) params.search = this.filters.search;
    if (this.filters.record_type_id) params.record_type_id = this.filters.record_type_id;
    if (this.filters.is_active) params.is_active = this.filters.is_active;
    if (this.filters.gender) params.gender = this.filters.gender;

    this.api.get('/government-records', params).subscribe({
      next: res => {
        this.rows.set(res.data || []);
        this.totalRecords = res.meta?.total || 0;
        this.totalPages = Math.ceil(this.totalRecords / this.perPage);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.toast.error('Failed to load records'); },
    });
  }

  onFilterChange(): void {
    clearTimeout(this.filterTimeout);
    this.filterTimeout = setTimeout(() => { this.page = 1; this.load(); }, 400);
  }

  sort(key: string): void {
    if (this.filters.sort_by === key) this.filters.sort_dir = this.filters.sort_dir === 'ASC' ? 'DESC' : 'ASC';
    else { this.filters.sort_by = key; this.filters.sort_dir = 'ASC'; }
    this.load();
  }

  goPage(p: number): void { if (p >= 1 && p <= this.totalPages) { this.page = p; this.load(); } }

  pageNumbers(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.page - 2);
    const end = Math.min(this.totalPages, start + 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  min(a: number, b: number): number { return Math.min(a, b); }

  rtBadgeClass(type: string): string {
    const map: Record<string, string> = {
      'IPPIS': 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      'TESCOM': 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
      'LASG': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      'SUBEB': 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    };
    return map[type] || 'bg-gray-100 text-gray-600';
  }

  openForm(row?: any): void {
    if (row) {
      this.editId = row.id;
      this.form = {
        record_type_id: row.record_type_id, staff_id: row.staff_id, employee_name: row.employee_name,
        job_title: row.job_title, organization: row.organization, grade_level: row.grade_level,
        step: row.step, gender: row.gender, gross_pay: row.gross_pay, net_pay: row.net_pay,
        hire_date: row.hire_date, date_of_birth: row.date_of_birth, bank_name: row.bank_name,
        account_number: row.account_number, telephone_number: row.telephone_number,
      };
    } else {
      this.editId = null;
      this.form = {
        record_type_id: '', staff_id: '', employee_name: '', job_title: '', organization: '',
        grade_level: '', step: '', gender: '', gross_pay: '', net_pay: '', hire_date: '',
        date_of_birth: '', bank_name: '', account_number: '', telephone_number: '',
      };
    }
    this.showForm.set(true);
  }

  saveForm(): void {
    if (!this.form.record_type_id || !this.form.staff_id || !this.form.employee_name) {
      this.toast.error('Record type, Staff ID, and Employee Name are required'); return;
    }
    this.saving.set(true);
    const req = this.editId
      ? this.api.put(`/government-records/${this.editId}`, this.form)
      : this.api.post('/government-records', this.form);
    req.subscribe({
      next: r => { this.saving.set(false); this.toast.success(r.message || 'Saved'); this.showForm.set(false); this.load(); },
      error: e => { this.saving.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }

  exportData(format: string): void {
    this.exportOpen = false;
    const params: any = { per_page: 10000, sort_by: this.filters.sort_by, sort_dir: this.filters.sort_dir };
    if (this.filters.search) params.search = this.filters.search;
    if (this.filters.record_type_id) params.record_type_id = this.filters.record_type_id;
    this.api.get('/government-records', params).subscribe({
      next: res => {
        const data = res.data || [];
        if (data.length === 0) { this.toast.error('No records to export'); return; }
        const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        const filename = `CreditX_GovRecords_${ts}`;
        const headers = ['Staff ID','Employee Name','Record Type','Job Title','Organization','Grade','Step','Gross Pay','Net Pay','Gender','Status'];

        if (format === 'csv') {
          const csvRows = [headers.join(',')];
          for (const r of data) {
            csvRows.push([r.staff_id, `"${r.employee_name||''}"`, r.record_type_name, `"${r.job_title||''}"`,
              `"${r.organization||''}"`, r.grade_level, r.step, r.gross_pay, r.net_pay, r.gender, r.is_active ? 'Active' : 'Inactive'
            ].join(','));
          }
          this.downloadBlob(new Blob([csvRows.join('\n')], { type: 'text/csv' }), filename + '.csv');
        } else if (format === 'excel') {
          let html = '<html><head><meta charset="UTF-8"></head><body><table border="1"><tr>';
          for (const h of headers) html += `<th>${h}</th>`;
          html += '</tr>';
          for (const r of data) {
            html += `<tr><td>${r.staff_id}</td><td>${r.employee_name||''}</td><td>${r.record_type_name}</td><td>${r.job_title||''}</td><td>${r.organization||''}</td><td>${r.grade_level||''}</td><td>${r.step||''}</td><td>${r.gross_pay||''}</td><td>${r.net_pay||''}</td><td>${r.gender||''}</td><td>${r.is_active?'Active':'Inactive'}</td></tr>`;
          }
          this.downloadBlob(new Blob([html + '</table></body></html>'], { type: 'application/vnd.ms-excel' }), filename + '.xls');
        } else if (format === 'pdf') {
          const w = window.open('', '_blank'); if (!w) return;
          let html = `<html><head><title>Government Records</title><style>body{font-family:Arial;margin:20px}h1{color:#0A4F2A;font-size:16px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ddd;padding:5px;font-size:9px}th{background:#0A4F2A;color:white}.meta{color:#666;font-size:10px}</style></head><body>`;
          html += `<h1>CreditX — Government Records Report</h1><p class="meta">Generated: ${new Date().toLocaleString()} | Records: ${data.length}</p><table><tr>`;
          for (const h of headers) html += `<th>${h}</th>`;
          html += '</tr>';
          for (const r of data) {
            html += `<tr><td>${r.staff_id}</td><td>${r.employee_name||''}</td><td>${r.record_type_name}</td><td>${r.job_title||''}</td><td>${r.organization||''}</td><td>${r.grade_level||''}</td><td>${r.step||''}</td><td>${r.gross_pay||''}</td><td>${r.net_pay||''}</td><td>${r.gender||''}</td><td>${r.is_active?'Active':'Inactive'}</td></tr>`;
          }
          w.document.write(html + '</table></body></html>'); w.document.close(); w.onload = () => w.print();
        }
        this.toast.success(`Exported ${data.length} records (${format.toUpperCase()})`);
      },
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }
}
