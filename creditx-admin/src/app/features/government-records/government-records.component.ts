import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { SettingsService } from '../../core/services/settings.service';

@Component({
  selector: 'app-government-records', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, FormDialogComponent, EmptyStateComponent, MoneyPipe],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Government Records"
        [subtitle]="'Unified employee records database · ' + (totalRecords | number) + ' total'"
        eyebrow="Master Data">
        <div class="flex items-center gap-2">
          <div class="relative">
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="exportOpen = !exportOpen">
              <lucide-icon name="download" [size]="14"></lucide-icon>
              <span>Export</span>
              <lucide-icon name="chevron-down" [size]="12"></lucide-icon>
            </button>
            @if (exportOpen) {
              <div class="cx-gr-export-menu cx-animate-in">
                <button class="cx-gr-export-option" (click)="exportData('csv')">
                  <lucide-icon name="file-spreadsheet" [size]="14"></lucide-icon>
                  <span>CSV</span>
                </button>
                <button class="cx-gr-export-option" (click)="exportData('excel')">
                  <lucide-icon name="file-spreadsheet" [size]="14"></lucide-icon>
                  <span>Excel</span>
                </button>
                <button class="cx-gr-export-option" (click)="exportData('pdf')">
                  <lucide-icon name="file-text" [size]="14"></lucide-icon>
                  <span>PDF</span>
                </button>
              </div>
            }
          </div>
          @if (auth.hasPermission('records.create')) {
            <button class="cx-btn cx-btn-primary" (click)="openForm()">
              <lucide-icon name="plus" [size]="14"></lucide-icon>
              <span>Add Record</span>
            </button>
          }
        </div>
      </cx-page-header>

      <!-- Filters Bar -->
      <div class="cx-gr-filters">
        <div class="cx-gr-filter-search">
          <lucide-icon name="search" [size]="14" class="cx-gr-filter-search-icon"></lucide-icon>
          <input type="text" class="cx-gr-filter-search-input"
                 placeholder="Search by Staff ID, Name, Organization..."
                 [(ngModel)]="filters.search" (input)="onFilterChange()" />
        </div>
        <select class="cx-select" [(ngModel)]="filters.record_type_id" (change)="onFilterChange()">
          <option value="">All Record Types</option>
          @for (rt of recordTypes(); track rt.id) {
            <option [value]="rt.id">{{ rt.name }}</option>
          }
        </select>
        <select class="cx-select" [(ngModel)]="filters.is_active" (change)="onFilterChange()">
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <select class="cx-select" [(ngModel)]="filters.gender" (change)="onFilterChange()">
          <option value="">All Genders</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
      </div>

      <!-- Records Table -->
      <div class="cx-gr-table-wrap">
        @if (loading()) {
          <div class="cx-gr-state">
            <div class="cx-gr-loading">
              <div class="cx-gr-loading-dots"><span></span><span></span><span></span></div>
              <span>Loading records...</span>
            </div>
          </div>
        } @else if (rows().length === 0) {
          <div class="cx-gr-state">
            <cx-empty-state title="No records found" description="Try adjusting your filters or add a new record." icon="database"></cx-empty-state>
          </div>
        } @else {
          <div class="cx-gr-scroll">
            <table class="cx-gr-table">
              <thead>
                <tr>
                  @for (col of visibleColumns; track col.key) {
                    <th class="cx-gr-th-sortable" (click)="sort(col.key)">
                      <div class="cx-gr-th-inner">
                        <span>{{ col.label }}</span>
                        @if (filters.sort_by === col.key) {
                          <lucide-icon [name]="filters.sort_dir === 'ASC' ? 'arrow-up' : 'arrow-down'" [size]="12" class="cx-gr-sort-icon is-active"></lucide-icon>
                        } @else {
                          <lucide-icon name="chevrons-up-down" [size]="12" class="cx-gr-sort-icon"></lucide-icon>
                        }
                      </div>
                    </th>
                  }
                  <th class="cx-gr-actions-col"></th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.id) {
                  <tr>
                    <td><span class="cx-gr-staff-id">{{ row.staff_id }}</span></td>
                    <td>
                      <div class="cx-gr-employee-name">{{ row.employee_name }}</div>
                      <div class="cx-gr-employee-title">{{ row.job_title || '—' }}</div>
                    </td>
                    <td>
                      <span class="cx-gr-type-chip" [attr.data-type]="(row.record_type_name || '').toLowerCase()">
                        {{ row.record_type_name }}
                      </span>
                    </td>
                    <td class="cx-gr-org">{{ row.organization || '—' }}</td>
                    <td class="cx-gr-grade">{{ row.grade_level || '—' }}</td>
                    <td class="cx-gr-pay tabular-nums">
                      @if (row.gross_pay) { {{ row.gross_pay | money }} } @else { — }
                    </td>
                    <td>
                      <span class="cx-status-badge" [attr.data-tone]="row.is_active ? 'success' : 'neutral'">
                        <span class="cx-status-dot"></span>
                        <span>{{ row.is_active ? 'Active' : 'Inactive' }}</span>
                      </span>
                    </td>
                    <td class="cx-gr-actions-col">
                      <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)" title="Edit">
                        <lucide-icon name="pencil" [size]="14"></lucide-icon>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div class="cx-gr-pagination">
            <div class="cx-gr-pagination-info">
              Showing <span class="tabular-nums">{{ (page - 1) * perPage + 1 }}</span>&ndash;<span class="tabular-nums">{{ min(page * perPage, totalRecords) }}</span>
              of <span class="tabular-nums">{{ totalRecords | number }}</span> records
            </div>
            <div class="cx-gr-pagination-controls">
              <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" [disabled]="page <= 1" (click)="goPage(page - 1)" aria-label="Previous">
                <lucide-icon name="chevron-left" [size]="14"></lucide-icon>
              </button>
              @for (p of pageNumbers(); track p) {
                <button class="cx-btn cx-btn-sm cx-gr-page-btn" [class]="p === page ? 'cx-btn-primary' : 'cx-btn-ghost'" (click)="goPage(p)">{{ p }}</button>
              }
              <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" [disabled]="page >= totalPages" (click)="goPage(page + 1)" aria-label="Next">
                <lucide-icon name="chevron-right" [size]="14"></lucide-icon>
              </button>
            </div>
          </div>
        }
      </div>
    </div>

    <!-- Create/Edit Dialog -->
    <cx-form-dialog
      [open]="showForm()"
      [title]="editId ? 'Edit Record' : 'Add Government Record'"
      [subtitle]="editId ? 'Update this employee record' : 'Register a new employee record'"
      [saving]="saving()"
      maxWidth="680px" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="cx-form-stack">
        <!-- Identity -->
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Record Type *</label>
            <select class="cx-select" [(ngModel)]="form.record_type_id">
              <option value="">Select Type</option>
              @for (rt of recordTypes(); track rt.id) { <option [value]="rt.id">{{ rt.name }}</option> }
            </select>
          </div>
          <div><label class="cx-label">Staff ID *</label><input class="cx-input" [(ngModel)]="form.staff_id" placeholder="e.g. IPPIS/2024/0001" /></div>
        </div>
        <div><label class="cx-label">Employee Name *</label><input class="cx-input" [(ngModel)]="form.employee_name" placeholder="Full name" /></div>
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Job Title</label><input class="cx-input" [(ngModel)]="form.job_title" placeholder="e.g. Senior Officer" /></div>
          <div><label class="cx-label">Organization</label><input class="cx-input" [(ngModel)]="form.organization" placeholder="e.g. Federal Ministry of Education" /></div>
        </div>

        <!-- Employment -->
        <h4 class="cx-form-section-title">Employment Details</h4>
        <div class="cx-form-row cx-form-row-3">
          <div><label class="cx-label">Grade Level</label><input class="cx-input" [(ngModel)]="form.grade_level" placeholder="e.g. GL08" /></div>
          <div><label class="cx-label">Step</label><input class="cx-input" [(ngModel)]="form.step" placeholder="e.g. 5" /></div>
          <div>
            <label class="cx-label">Gender</label>
            <select class="cx-select" [(ngModel)]="form.gender">
              <option value="">—</option>
              <option>Male</option>
              <option>Female</option>
            </select>
          </div>
        </div>
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Hire Date</label><input class="cx-input" type="date" [(ngModel)]="form.hire_date" /></div>
          <div><label class="cx-label">Date of Birth</label><input class="cx-input" type="date" [(ngModel)]="form.date_of_birth" /></div>
        </div>

        <!-- Compensation -->
        <h4 class="cx-form-section-title">Compensation</h4>
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Gross Pay ({{ settings.currencySymbol() }})</label><input class="cx-input" type="number" [(ngModel)]="form.gross_pay" placeholder="0.00" /></div>
          <div><label class="cx-label">Net Pay ({{ settings.currencySymbol() }})</label><input class="cx-input" type="number" [(ngModel)]="form.net_pay" placeholder="0.00" /></div>
        </div>

        <!-- Banking -->
        <h4 class="cx-form-section-title">Banking & Contact</h4>
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Bank Name</label><input class="cx-input" [(ngModel)]="form.bank_name" placeholder="e.g. First Bank" /></div>
          <div><label class="cx-label">Account Number</label><input class="cx-input" [(ngModel)]="form.account_number" placeholder="10-digit NUBAN" /></div>
        </div>
        <div><label class="cx-label">Phone</label><input class="cx-input" [(ngModel)]="form.telephone_number" placeholder="0801 234 5678" /></div>
      </div>
    </cx-form-dialog>
  `,
  styles: [`
    /* Export menu */
    .cx-gr-export-menu {
      position: absolute; right: 0; top: calc(100% + 4px);
      z-index: var(--cx-z-dropdown);
      min-width: 180px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-lg);
      box-shadow: var(--cx-shadow-lg);
      padding: 0.35rem;
      display: flex; flex-direction: column;
    }
    .cx-gr-export-option {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.5rem 0.65rem;
      background: transparent; border: none;
      border-radius: var(--cx-radius-sm);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      cursor: pointer;
      text-align: left;
      transition: background var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-gr-export-option:hover { background: var(--cx-surface-hover); }
    .cx-gr-export-option lucide-icon { color: var(--cx-text-muted); }

    /* Filters */
    .cx-gr-filters {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.65rem;
      padding: 0.85rem;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      margin-bottom: 1rem;
    }
    @media (min-width: 768px) {
      .cx-gr-filters { grid-template-columns: 2fr 1fr 1fr 1fr; }
    }
    .cx-gr-filter-search { position: relative; }
    .cx-gr-filter-search-icon {
      position: absolute; left: 0.75rem; top: 50%;
      transform: translateY(-50%);
      color: var(--cx-text-muted);
      pointer-events: none;
    }
    .cx-gr-filter-search-input {
      width: 100%;
      padding: 0.55rem 0.85rem 0.55rem 2.15rem;
      background: var(--cx-surface-2);
      border: 1px solid transparent;
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      outline: none;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-gr-filter-search-input:hover { border-color: var(--cx-border); }
    .cx-gr-filter-search-input:focus {
      background: var(--cx-surface);
      border-color: var(--cx-primary-600);
      box-shadow: var(--cx-ring-focus);
    }

    /* Table */
    .cx-gr-table-wrap {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      overflow: hidden;
    }
    .cx-gr-state { padding: 4rem 1rem; text-align: center; }
    .cx-gr-loading {
      display: inline-flex; align-items: center; gap: 0.75rem;
      color: var(--cx-text-muted);
      font-size: var(--cx-text-sm);
    }
    .cx-gr-loading-dots { display: inline-flex; gap: 4px; }
    .cx-gr-loading-dots span {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--cx-primary-600);
      animation: cx-loading-pulse 1.2s infinite var(--cx-ease-premium);
    }
    .cx-gr-loading-dots span:nth-child(2) { animation-delay: 0.2s; background: var(--cx-accent-500); }
    .cx-gr-loading-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes cx-loading-pulse {
      0%, 100% { opacity: 0.3; transform: scale(0.8); }
      50% { opacity: 1; transform: scale(1.15); }
    }

    .cx-gr-scroll { overflow-x: auto; }
    .cx-gr-table { width: 100%; border-collapse: collapse; }
    .cx-gr-table thead { background: var(--cx-surface-2); }
    .cx-gr-table thead tr { border-bottom: 1px solid var(--cx-border); }
    .cx-gr-table th {
      padding: 0.75rem 1rem;
      font-size: var(--cx-text-xs); font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.05em;
      color: var(--cx-text-muted);
      text-align: left;
      white-space: nowrap;
    }
    .cx-gr-th-sortable { cursor: pointer; user-select: none; }
    .cx-gr-th-sortable:hover { color: var(--cx-text); }
    .cx-gr-th-inner { display: flex; align-items: center; gap: 4px; }
    .cx-gr-sort-icon {
      color: var(--cx-text-subtle); opacity: 0.6;
      transition: opacity var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-gr-th-sortable:hover .cx-gr-sort-icon { opacity: 1; }
    .cx-gr-sort-icon.is-active { color: var(--cx-primary-600); opacity: 1; }

    .cx-gr-actions-col { width: 60px; text-align: right; }
    .cx-gr-table tbody td {
      padding: 0.75rem 1rem;
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      border-bottom: 1px solid var(--cx-border-subtle);
      vertical-align: middle;
    }
    .cx-gr-table tbody tr { transition: background var(--cx-dur-fast) var(--cx-ease-premium); }
    .cx-gr-table tbody tr:hover { background: var(--cx-surface-hover); }
    .cx-gr-table tbody tr:last-child td { border-bottom: none; }

    .cx-gr-staff-id {
      display: inline-flex; align-items: center;
      padding: 2px 8px;
      font-family: var(--cx-font-mono);
      font-size: var(--cx-text-xs);
      font-weight: 500;
      color: var(--cx-primary-700);
      background: var(--cx-primary-50);
      border-radius: var(--cx-radius-sm);
      letter-spacing: 0.02em;
    }
    .cx-gr-employee-name {
      font-size: var(--cx-text-sm); font-weight: 500;
      color: var(--cx-text);
    }
    .cx-gr-employee-title {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      margin-top: 2px;
    }
    .cx-gr-org, .cx-gr-grade {
      font-size: var(--cx-text-sm);
      color: var(--cx-text-secondary);
    }
    .cx-gr-pay { font-weight: 500; }

    /* Type chips with auto-coloring */
    .cx-gr-type-chip {
      display: inline-flex; align-items: center;
      padding: 2px 10px;
      border-radius: var(--cx-radius-pill);
      font-size: var(--cx-text-xs);
      font-weight: 500;
      background: var(--cx-stone-100);
      color: var(--cx-text-secondary);
      white-space: nowrap;
    }
    .cx-gr-type-chip[data-type*="ippis"] { background: rgba(30, 92, 168, 0.1); color: var(--cx-info); }
    .cx-gr-type-chip[data-type*="gifmis"] { background: var(--cx-success-50); color: var(--cx-primary-700); }
    .cx-gr-type-chip[data-type*="military"] { background: var(--cx-danger-50); color: var(--cx-danger); }
    .cx-gr-type-chip[data-type*="pension"] { background: var(--cx-accent-50); color: var(--cx-accent-700); }

    /* Pagination */
    .cx-gr-pagination {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--cx-border);
      background: var(--cx-surface);
    }
    .cx-gr-pagination-info {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
    }
    .cx-gr-pagination-controls { display: flex; align-items: center; gap: 0.35rem; }
    .cx-gr-page-btn { min-width: 32px; font-variant-numeric: tabular-nums; }
  `],
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

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService, public settings: SettingsService) {}

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
