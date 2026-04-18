import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { SearchableSelectComponent, SelectOption } from '../../shared/components/searchable-select/searchable-select.component';

@Component({
  selector: 'app-users', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, FormDialogComponent, SearchableSelectComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="User Management" subtitle="{{ totalRecords | number }} users">
        <div class="flex items-center gap-2">
          <div class="relative">
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="exportOpen = !exportOpen">
              <lucide-icon name="download" [size]="14"></lucide-icon> Export
              <lucide-icon name="chevron-down" [size]="12"></lucide-icon>
            </button>
            @if (exportOpen) {
              <div class="absolute right-0 top-full mt-1 w-44 bg-[var(--cx-surface)] border border-[var(--cx-border)] rounded-xl shadow-xl z-50 overflow-hidden">
                <button class="w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-[var(--cx-surface-hover)] flex items-center gap-2" (click)="exportData('csv')">
                  <lucide-icon name="file-text" [size]="14"></lucide-icon> Export CSV
                </button>
                <button class="w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-[var(--cx-surface-hover)] flex items-center gap-2" (click)="exportData('excel')">
                  <lucide-icon name="file-text" [size]="14"></lucide-icon> Export Excel
                </button>
                <button class="w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-[var(--cx-surface-hover)] flex items-center gap-2" (click)="exportData('pdf')">
                  <lucide-icon name="file-text" [size]="14"></lucide-icon> Export PDF
                </button>
              </div>
            }
          </div>
          @if (auth.hasPermission('users.create')) {
            <button class="cx-btn cx-btn-primary" (click)="openForm()">
              <lucide-icon name="plus" [size]="16"></lucide-icon> Add User
            </button>
          }
        </div>
      </cx-page-header>

      <!-- Filters -->
      <div class="cx-card !p-4 mb-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div class="lg:col-span-2">
            <div class="relative">
              <lucide-icon name="search" class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" [size]="16"></lucide-icon>
              <input type="text" class="cx-input !pl-8 w-full" placeholder="Search by name, email, phone..." [(ngModel)]="filters.search" (input)="onFilterChange()" />
            </div>
          </div>
          <select class="cx-select" [(ngModel)]="filters.role" (change)="onFilterChange()">
            <option value="">All Roles</option>
            @for (r of roles(); track r.id) { <option [value]="r.slug">{{ r.name }}</option> }
          </select>
          <select class="cx-select" [(ngModel)]="filters.department_id" (change)="onFilterChange()">
            <option value="">All Departments</option>
            @for (d of departments(); track d.id) { <option [value]="d.id">{{ d.name }}</option> }
          </select>
          <select class="cx-select" [(ngModel)]="filters.status" (change)="onFilterChange()">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      <!-- Table -->
      <div class="cx-card !p-4 overflow-hidden">
        @if (loading()) {
          <div class="flex items-center justify-center py-16">
            <div class="flex flex-col items-center gap-3">
              <div class="w-8 h-8 border-3 border-[var(--cx-primary)] border-t-transparent rounded-full animate-spin"></div>
              <span class="text-sm text-[var(--cx-text-muted)]">Loading users...</span>
            </div>
          </div>
        } @else if (rows().length === 0) {
          <div class="flex flex-col items-center justify-center py-16">
            <lucide-icon name="users" [size]="48" class="text-[var(--cx-text-muted)] opacity-30 mb-3"></lucide-icon>
            <h3 class="text-base font-semibold text-[var(--cx-text)]">No users found</h3>
            <p class="text-sm text-[var(--cx-text-muted)] mt-1">Try adjusting your filters</p>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-[var(--cx-border)]">
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider cursor-pointer" (click)="sort('firstName')">
                    <div class="flex items-center gap-1">User @if (filters.sort_by==='firstName') { <lucide-icon [name]="filters.sort_dir==='ASC'?'arrow-up':'arrow-down'" [size]="12"></lucide-icon> }</div>
                  </th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Role</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Department</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Team</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Status</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider cursor-pointer" (click)="sort('createdAt')">
                    <div class="flex items-center gap-1">Joined @if (filters.sort_by==='createdAt') { <lucide-icon [name]="filters.sort_dir==='ASC'?'arrow-up':'arrow-down'" [size]="12"></lucide-icon> }</div>
                  </th>
                  <th class="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.id; let odd = $odd) {
                  <tr class="border-b border-[var(--cx-border)] transition-colors hover:bg-[var(--cx-surface-hover)]">
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-3">
                        @if (row.avatar_path) {
                          <img [src]="apiUrl + '/storage/' + row.avatar_path" class="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                        } @else {
                          <div class="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                               [style.background]="avatarColor(row.id)">
                            {{ row.first_name?.[0] }}{{ row.last_name?.[0] }}
                          </div>
                        }
                        <div>
                          <div class="text-sm font-medium text-[var(--cx-text)]">{{ row.full_name }}</div>
                          <div class="text-xs text-[var(--cx-text-muted)]">{{ row.email }}</div>
                        </div>
                      </div>
                    </td>
                    <td class="px-4 py-3">
                      @if (row.roles?.length) {
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--cx-primary-50)] text-[var(--cx-primary)]">
                          {{ row.roles[0].name }}
                        </span>
                      } @else { <span class="text-xs text-[var(--cx-text-muted)]">—</span> }
                    </td>
                    <td class="px-4 py-3 text-sm text-[var(--cx-text-secondary)]">{{ row.department_name || '—' }}</td>
                    <td class="px-4 py-3">
                      <div class="text-sm text-[var(--cx-text-secondary)]">{{ row.team_name || '—' }}</div>
                      @if (row.team_lead_name) { <div class="text-xs text-[var(--cx-text-muted)]">Lead: {{ row.team_lead_name }}</div> }
                    </td>
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                            [class]="statusClass(row.status)">
                        {{ row.status | titlecase }}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-xs text-[var(--cx-text-muted)]">{{ row.created_at | date:'mediumDate' }}</td>
                    <td class="px-4 py-3">
                      <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)">
                        <lucide-icon name="pencil" [size]="14"></lucide-icon>
                      </button>
                      <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="resetPassword(row)" title="Reset Password">
                        <lucide-icon name="refresh-cw" [size]="14"></lucide-icon>
                      </button>
                      <label class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon cursor-pointer" title="Upload Photo">
                        <lucide-icon name="upload" [size]="14"></lucide-icon>
                        <input type="file" accept="image/*" class="hidden" (change)="uploadAvatar(row, $event)" />
                      </label>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <!-- Pagination -->
          <div class="flex items-center justify-between px-4 py-3 border-t border-[var(--cx-border)]">
            <div class="text-xs text-[var(--cx-text-muted)]">
              Showing {{ (page - 1) * perPage + 1 }}–{{ min(page * perPage, totalRecords) }} of {{ totalRecords | number }}
            </div>
            <div class="flex items-center gap-1">
              <button class="cx-btn cx-btn-ghost cx-btn-sm" [disabled]="page <= 1" (click)="goPage(page - 1)"><lucide-icon name="chevron-left" [size]="14"></lucide-icon></button>
              @for (p of pageNumbers(); track p) {
                <button class="cx-btn cx-btn-sm min-w-[32px]" [class]="p === page ? 'cx-btn-primary' : 'cx-btn-ghost'" (click)="goPage(p)">{{ p }}</button>
              }
              <button class="cx-btn cx-btn-ghost cx-btn-sm" [disabled]="page >= totalPages" (click)="goPage(page + 1)"><lucide-icon name="chevron-right" [size]="14"></lucide-icon></button>
            </div>
          </div>
        }
      </div>
    </div>

    <!-- Create/Edit Dialog -->
    <cx-form-dialog [open]="showForm()" [title]="editId ? 'Edit User' : 'Create User'" [saving]="saving()" maxWidth="640px" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">First Name *</label><input class="cx-input" [(ngModel)]="form.first_name" /></div>
          <div><label class="cx-label">Last Name *</label><input class="cx-input" [(ngModel)]="form.last_name" /></div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Email *</label><input class="cx-input" type="email" [(ngModel)]="form.email" /></div>
          <div><label class="cx-label">Phone</label><input class="cx-input" [(ngModel)]="form.phone" /></div>
        </div>
        @if (!editId) { <div><label class="cx-label">Password *</label><input class="cx-input" type="password" [(ngModel)]="form.password" placeholder="Min 8 characters" /></div> }
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Department</label>
            <cx-searchable-select [options]="deptOptions()" placeholder="Select department..." [clearable]="true"
              [(ngModel)]="form.department_id" (ngModelChange)="onDeptChange()"></cx-searchable-select>
          </div>
          <div><label class="cx-label">Team</label>
            <cx-searchable-select [options]="teamOptions()" placeholder="Select team..." [clearable]="true"
              [(ngModel)]="form.team_id"></cx-searchable-select>
          </div>
        </div>
        <div><label class="cx-label">Roles</label>
          <div class="flex flex-wrap gap-2 mt-1">
            @for (r of roles(); track r.id) {
              <label class="text-xs cursor-pointer px-3 py-1.5 rounded-lg border transition-all"
                     [class]="selRoles.includes(r.id) ? 'bg-[var(--cx-primary-50)] border-[var(--cx-primary)] text-[var(--cx-primary)] font-medium' : 'border-[var(--cx-border)] text-[var(--cx-text-secondary)]'">
                <input type="checkbox" [checked]="selRoles.includes(r.id)" (change)="toggleArr('selRoles', r.id)" class="sr-only" /> {{ r.name }}
              </label>
            }
          </div>
        </div>
        <div><label class="cx-label">Locations</label>
          <div class="flex flex-wrap gap-2 mt-1">
            @for (l of locs(); track l.id) {
              <label class="text-xs cursor-pointer px-3 py-1.5 rounded-lg border transition-all"
                     [class]="selLocs.includes(l.id) ? 'bg-[var(--cx-accent-50)] border-[var(--cx-accent)] text-[var(--cx-accent-dark)] font-medium' : 'border-[var(--cx-border)] text-[var(--cx-text-secondary)]'">
                <input type="checkbox" [checked]="selLocs.includes(l.id)" (change)="toggleArr('selLocs', l.id)" class="sr-only" /> {{ l.name }}
              </label>
            }
          </div>
        </div>
        @if (editId) {
          <div><label class="cx-label">Status</label>
            <select class="cx-select" [(ngModel)]="form.status">
              <option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option>
            </select>
          </div>
        }
      </div>
    </cx-form-dialog>

    <!-- Password Reset Dialog -->
    @if (resetResult) {
      <div class="fixed inset-0 z-50 flex items-center justify-center" (click)="resetResult = null">
        <div class="fixed inset-0 bg-black/40"></div>
        <div class="relative bg-[var(--cx-surface)] rounded-2xl shadow-2xl max-w-sm w-full mx-4 cx-animate-in" (click)="$event.stopPropagation()">
          <div class="px-6 py-4 border-b border-[var(--cx-border)]">
            <h3 class="text-sm font-bold text-[var(--cx-text)]">Password Reset</h3>
          </div>
          <div class="px-6 py-5 space-y-4">
            <div class="flex items-center gap-3 p-3 rounded-xl bg-[var(--cx-success-light)]">
              <lucide-icon name="check-circle" [size]="20" class="text-[var(--cx-success)]"></lucide-icon>
              <span class="text-sm font-medium text-[var(--cx-success)]">Password reset for {{ resetResult.user_name }}</span>
            </div>
            <div>
              <label class="cx-label">New Password</label>
              <div class="flex items-center gap-2">
                <input type="text" class="cx-input font-mono text-base tracking-wider" [value]="resetResult.password" readonly #pwdInput />
                <button class="cx-btn cx-btn-outline cx-btn-sm flex-shrink-0" (click)="copyPassword(pwdInput)">
                  <lucide-icon name="copy" [size]="14"></lucide-icon> Copy
                </button>
              </div>
            </div>
            <p class="text-[10px] text-[var(--cx-text-muted)]">Share this password securely with the user. They should change it on first login.</p>
          </div>
          <div class="px-6 py-3 border-t border-[var(--cx-border)] flex justify-end">
            <button class="cx-btn cx-btn-primary cx-btn-sm" (click)="resetResult = null">Done</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class UsersComponent implements OnInit {
  rows = signal<any[]>([]); loading = signal(true);
  roles = signal<any[]>([]); locs = signal<any[]>([]); departments = signal<any[]>([]); teams = signal<any[]>([]);
  showForm = signal(false); saving = signal(false);
  editId: string | null = null; form: any = {};
  selRoles: string[] = []; selLocs: string[] = [];
  filters: any = { search: '', role: '', department_id: '', status: '', sort_by: 'createdAt', sort_dir: 'DESC' };
  page = 1; perPage = 25; totalRecords = 0; totalPages = 0;
  exportOpen = false;
  resetResult: any = null;
  private filterTimeout: any;

  apiUrl = environment.apiUrl.replace('/api', '');

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService, private http: HttpClient) {}

  ngOnInit(): void {
    this.load();
    this.api.get('/roles', { per_page: 100 }).subscribe({ next: r => this.roles.set(r.data || []) });
    this.api.get('/locations', { per_page: 100 }).subscribe({ next: r => this.locs.set(r.data || []) });
    this.api.get('/departments', { per_page: 100 }).subscribe({ next: r => this.departments.set(r.data || []) });
    this.api.get('/teams', { per_page: 100 }).subscribe({ next: r => this.teams.set(r.data || []) });
  }

  load(): void {
    this.loading.set(true);
    const params: any = { page: this.page, per_page: this.perPage, sort_by: this.filters.sort_by, sort_dir: this.filters.sort_dir };
    if (this.filters.search) params.search = this.filters.search;
    if (this.filters.role) params.role = this.filters.role;
    if (this.filters.department_id) params.department_id = this.filters.department_id;
    if (this.filters.status) params.status = this.filters.status;
    this.api.get('/users', params).subscribe({
      next: res => { this.rows.set(res.data || []); this.totalRecords = res.meta?.total || 0; this.totalPages = Math.ceil(this.totalRecords / this.perPage); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  onFilterChange(): void { clearTimeout(this.filterTimeout); this.filterTimeout = setTimeout(() => { this.page = 1; this.load(); }, 400); }
  sort(key: string): void { if (this.filters.sort_by === key) this.filters.sort_dir = this.filters.sort_dir === 'ASC' ? 'DESC' : 'ASC'; else { this.filters.sort_by = key; this.filters.sort_dir = 'ASC'; } this.load(); }
  goPage(p: number): void { if (p >= 1 && p <= this.totalPages) { this.page = p; this.load(); } }
  pageNumbers(): number[] { const p: number[] = []; const s = Math.max(1, this.page - 2); for (let i = s; i <= Math.min(this.totalPages, s + 4); i++) p.push(i); return p; }
  min(a: number, b: number): number { return Math.min(a, b); }

  statusClass(s: string): string {
    return { active: 'bg-[var(--cx-success-light)] text-[var(--cx-success)]', inactive: 'bg-gray-100 text-gray-500', suspended: 'bg-[var(--cx-danger-light)] text-[var(--cx-danger)]' }[s] || 'bg-gray-100 text-gray-500';
  }

  avatarColor(id: string): string {
    const colors = ['#0A4F2A','#C9A227','#2563eb','#7c3aed','#dc2626','#059669','#d97706','#0891b2'];
    let hash = 0; for (const c of id) hash = c.charCodeAt(0) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  deptOptions(): SelectOption[] { return this.departments().map((d: any) => ({ value: d.id, label: d.name, sublabel: d.code })); }
  teamOptions(): SelectOption[] { return this.filteredTeams().map((t: any) => ({ value: t.id, label: t.name, sublabel: t.department_name })); }

  filteredTeams(): any[] {
    if (!this.form.department_id) return this.teams();
    return this.teams().filter((t: any) => t.department_id === this.form.department_id);
  }

  onDeptChange(): void { this.form.team_id = ''; }

  openForm(row?: any): void {
    if (row) {
      this.editId = row.id;
      this.form = { first_name: row.first_name, last_name: row.last_name, email: row.email, phone: row.phone, status: row.status, department_id: row.department_id || '', team_id: row.team_id || '' };
      this.selRoles = (row.roles || []).map((r: any) => r.id);
      this.selLocs = (row.locations || []).map((l: any) => l.id);
    } else {
      this.editId = null;
      this.form = { first_name: '', last_name: '', email: '', phone: '', password: '', status: 'active', department_id: '', team_id: '' };
      this.selRoles = []; this.selLocs = [];
    }
    this.showForm.set(true);
  }

  saveForm(): void {
    this.saving.set(true);
    const payload = { ...this.form, role_ids: this.selRoles, location_ids: this.selLocs };
    (this.editId ? this.api.put('/users/' + this.editId, payload) : this.api.post('/users', payload)).subscribe({
      next: r => { this.saving.set(false); this.toast.success(r.message || 'Saved'); this.showForm.set(false); this.load(); },
      error: e => { this.saving.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }

  toggleArr(arr: 'selRoles' | 'selLocs', id: string): void { const a = this[arr]; this[arr] = a.includes(id) ? a.filter(x => x !== id) : [...a, id]; }

  exportData(format: string): void {
    this.exportOpen = false;
    const params: any = { per_page: 10000, sort_by: this.filters.sort_by, sort_dir: this.filters.sort_dir };
    if (this.filters.search) params.search = this.filters.search;
    if (this.filters.role) params.role = this.filters.role;
    if (this.filters.status) params.status = this.filters.status;

    this.api.get('/users', params).subscribe({
      next: res => {
        const data = res.data || [];
        if (data.length === 0) { this.toast.error('No data to export'); return; }
        const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        const filename = `CreditX_Users_${ts}`;

        if (format === 'csv') {
          const headers = ['Full Name', 'Email', 'Phone', 'Role', 'Department', 'Team', 'Status', 'Joined'];
          const csvRows = [headers.join(',')];
          for (const r of data) {
            csvRows.push([`"${r.full_name}"`, r.email, r.phone || '', r.roles?.[0]?.name || '', `"${r.department_name || ''}"`, `"${r.team_name || ''}"`, r.status, r.created_at].join(','));
          }
          this.downloadBlob(new Blob([csvRows.join('\n')], { type: 'text/csv' }), filename + '.csv');
        } else if (format === 'excel') {
          // Generate HTML table for Excel compatibility
          let html = '<html><head><meta charset="UTF-8"></head><body><table border="1"><tr><th>Full Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Department</th><th>Team</th><th>Status</th><th>Joined</th></tr>';
          for (const r of data) {
            html += `<tr><td>${r.full_name}</td><td>${r.email}</td><td>${r.phone || ''}</td><td>${r.roles?.[0]?.name || ''}</td><td>${r.department_name || ''}</td><td>${r.team_name || ''}</td><td>${r.status}</td><td>${r.created_at}</td></tr>`;
          }
          html += '</table></body></html>';
          this.downloadBlob(new Blob([html], { type: 'application/vnd.ms-excel' }), filename + '.xls');
        } else if (format === 'pdf') {
          // Generate printable HTML and trigger print
          const printWin = window.open('', '_blank');
          if (!printWin) return;
          let html = `<html><head><title>CreditX Users Report</title><style>body{font-family:Arial,sans-serif;margin:20px}h1{color:#0A4F2A;font-size:18px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ddd;padding:8px;font-size:11px;text-align:left}th{background:#0A4F2A;color:white}tr:nth-child(even){background:#f9f9f9}.meta{color:#666;font-size:11px;margin-top:4px}</style></head><body>`;
          html += `<h1>CreditX — User Report</h1><p class="meta">Generated: ${new Date().toLocaleString()} | Total: ${data.length} users</p>`;
          html += '<table><tr><th>Full Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Department</th><th>Team</th><th>Status</th><th>Joined</th></tr>';
          for (const r of data) {
            html += `<tr><td>${r.full_name}</td><td>${r.email}</td><td>${r.phone || ''}</td><td>${r.roles?.[0]?.name || ''}</td><td>${r.department_name || ''}</td><td>${r.team_name || ''}</td><td>${r.status}</td><td>${r.created_at}</td></tr>`;
          }
          html += '</table></body></html>';
          printWin.document.write(html);
          printWin.document.close();
          printWin.onload = () => { printWin.print(); };
        }
        this.toast.success(`Exported ${data.length} users (${format.toUpperCase()})`);
      },
    });
  }

  resetPassword(row: any): void {
    if (!confirm(`Reset password for ${row.full_name}?`)) return;
    this.api.post('/users/' + row.id + '/reset-password', {}).subscribe({
      next: r => { this.resetResult = r.data; },
      error: e => this.toast.error(e.error?.message || 'Failed'),
    });
  }

  copyPassword(input: HTMLInputElement): void {
    navigator.clipboard.writeText(input.value).then(() => this.toast.success('Password copied'));
  }

  uploadAvatar(row: any, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('avatar', file);
    this.http.post<any>(`${environment.apiUrl}/users/${row.id}/avatar`, formData).subscribe({
      next: () => { this.toast.success('Photo uploaded'); this.load(); },
      error: (e: any) => this.toast.error(e.error?.message || 'Upload failed'),
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
}
