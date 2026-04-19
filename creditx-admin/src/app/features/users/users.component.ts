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
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-users', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, FormDialogComponent, SearchableSelectComponent, ConfirmDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="User Management" [subtitle]="totalRecords() + ' users'">
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
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div class="lg:col-span-2">
            <div class="relative">
              <lucide-icon name="search" class="absolute left-1 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" [size]="16"></lucide-icon>
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
          <select class="cx-select" [(ngModel)]="filters.location_id" (change)="onFilterChange()">
            <option value="">All Locations</option>
            @for (l of locs(); track l.id) { <option [value]="l.id">{{ l.name }}</option> }
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
            <table class="w-full min-w-[800px]">
              <thead>
                <tr class="border-b border-[var(--cx-border)]">
                  <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider cursor-pointer min-w-[220px]" (click)="sort('firstName')">
                    <div class="flex items-center gap-1">User @if (filters.sort_by==='firstName') { <lucide-icon [name]="filters.sort_dir==='ASC'?'arrow-up':'arrow-down'" [size]="12"></lucide-icon> }</div>
                  </th>
                  <th class="px-3 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider w-[120px]">Role</th>
                  <th class="px-3 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider w-[130px]">Dept / Team</th>
                  <th class="px-3 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider w-[120px]">Location</th>
                  <th class="px-3 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider w-[90px]">Status</th>
                  <th class="px-3 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider cursor-pointer w-[110px]" (click)="sort('createdAt')">
                    <div class="flex items-center gap-1">Joined @if (filters.sort_by==='createdAt') { <lucide-icon [name]="filters.sort_dir==='ASC'?'arrow-up':'arrow-down'" [size]="12"></lucide-icon> }</div>
                  </th>
                  <th class="px-3 py-3 w-[140px]"></th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.id) {
                  <tr class="border-b border-[var(--cx-border)] transition-colors hover:bg-[var(--cx-surface-hover)]">
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-3">
                        @if (row.avatar_path) {
                          <img [src]="apiUrl + '/storage/' + row.avatar_path" class="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        } @else {
                          <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                               [style.background]="avatarColor(row.id)">
                            {{ row.first_name?.[0] }}{{ row.last_name?.[0] }}
                          </div>
                        }
                        <div class="min-w-0">
                          <div class="text-sm font-medium text-[var(--cx-text)] truncate">{{ row.full_name }}</div>
                          <div class="text-xs text-[var(--cx-text-muted)] truncate">{{ row.email }}</div>
                        </div>
                      </div>
                    </td>
                    <td class="px-3 py-3">
                      @if (row.roles?.length) {
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--cx-primary-50)] text-[var(--cx-primary)] whitespace-nowrap">
                          {{ row.roles[0].name }}
                        </span>
                      } @else { <span class="text-xs text-[var(--cx-text-muted)]">—</span> }
                    </td>
                    <td class="px-3 py-3">
                      <div class="text-xs text-[var(--cx-text-secondary)] truncate">{{ row.department_name || '—' }}</div>
                      @if (row.team_name) { <div class="text-[10px] text-[var(--cx-text-muted)] truncate">{{ row.team_name }}</div> }
                    </td>
                    <td class="px-3 py-3 text-xs text-[var(--cx-text-secondary)] truncate">{{ row.location_name || '—' }}</td>
                    <td class="px-3 py-3">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                            [class]="statusClass(row.status)">
                        {{ row.status | titlecase }}
                      </span>
                    </td>
                    <td class="px-3 py-3 text-xs text-[var(--cx-text-muted)] whitespace-nowrap">{{ row.created_at | date:'mediumDate' }}</td>
                    <td class="px-3 py-3">
                      <div class="flex items-center gap-0.5 justify-end">
                        <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)" title="Edit">
                          <lucide-icon name="pencil" [size]="13"></lucide-icon>
                        </button>
                        <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="resetPassword(row)" title="Reset Password">
                          <lucide-icon name="refresh-cw" [size]="13"></lucide-icon>
                        </button>
                        <label class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon cursor-pointer" title="Upload Photo">
                          <lucide-icon name="upload" [size]="13"></lucide-icon>
                          <input type="file" accept="image/*" class="hidden" (change)="uploadAvatar(row, $event)" />
                        </label>
                        <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="toggleStatus(row)"
                                [title]="row.status === 'active' ? 'Deactivate' : 'Activate'">
                          <lucide-icon [name]="row.status === 'active' ? 'user-x' : 'user-check'" [size]="13"
                                       [class]="row.status === 'active' ? 'text-[var(--cx-danger)]' : 'text-[var(--cx-success)]'"></lucide-icon>
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <!-- Pagination -->
          <div class="flex items-center justify-between px-4 py-3 border-t border-[var(--cx-border)]">
            <div class="text-xs text-[var(--cx-text-muted)]">
              Showing {{ (page - 1) * perPage + 1 }}–{{ min(page * perPage, totalRecords()) }} of {{ totalRecords() | number }}
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

    <!-- Unified Confirm Dialog (toggle status + reset password) -->
    <cx-confirm-dialog [open]="showConfirm()" 
                       [title]="confirmData.title || 'Confirm'"
                       [message]="confirmData.message || ''"
                       [confirmLabel]="confirmData.confirmLabel || 'Confirm'"
                       [variant]="confirmData.variant || 'warning'"
                       (confirmed)="handleConfirm()" (cancelled)="showConfirm.set(false)">
    </cx-confirm-dialog>

    <!-- Password Reset Result Dialog - Enhanced -->
    @if (resetResult) {
      <div class="fixed inset-0 z-50 flex items-center justify-center cx-animate-in" (click)="resetResult = null">
        <div class="fixed inset-0 bg-black/50 backdrop-blur-sm"></div>
        <div class="relative bg-[var(--cx-surface)] rounded-2xl shadow-2xl max-w-md w-full mx-4" (click)="$event.stopPropagation()">
          <!-- Header with gradient -->
          <div class="px-6 py-5 rounded-t-2xl bg-gradient-to-br from-[var(--cx-primary)] to-[var(--cx-primary-hover)] text-white">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <lucide-icon name="shield" [size]="20"></lucide-icon>
              </div>
              <div>
                <h3 class="text-base font-bold">Password Reset Successful</h3>
                <p class="text-xs text-white/80 mt-0.5">{{ resetResult.user_name }} &bull; {{ resetResult.user_email }}</p>
              </div>
            </div>
          </div>

          <div class="px-6 py-5 space-y-4">
            <!-- Password Display -->
            <div>
              <label class="cx-label flex items-center gap-1.5">
                <lucide-icon name="lock" [size]="12"></lucide-icon> Temporary Password
              </label>
              <div class="relative">
                <input [type]="showPwd() ? 'text' : 'password'" class="cx-input font-mono text-base tracking-wider pr-24"
                       [value]="resetResult.password" readonly #pwdInput />
                <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="showPwd.set(!showPwd())" [title]="showPwd() ? 'Hide' : 'Show'">
                    <lucide-icon [name]="showPwd() ? 'eye-off' : 'eye'" [size]="14"></lucide-icon>
                  </button>
                  <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="copyPassword(pwdInput)" title="Copy to clipboard">
                    <lucide-icon name="copy" [size]="14"></lucide-icon>
                  </button>
                </div>
              </div>
            </div>

            <!-- Security Warning -->
            <div class="flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/20">
              <lucide-icon name="alert-triangle" [size]="16" class="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"></lucide-icon>
              <div class="flex-1">
                <p class="text-xs font-semibold text-amber-800 dark:text-amber-300">Security Notice</p>
                <ul class="text-[11px] text-amber-700 dark:text-amber-400 mt-1 space-y-0.5 list-disc list-inside">
                  <li>Share this password through a secure channel only</li>
                  <li>The user must change it on first login</li>
                  <li>This is the only time the password will be shown</li>
                </ul>
              </div>
            </div>
          </div>

          <div class="px-6 py-3 border-t border-[var(--cx-border)] flex justify-end gap-2">
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="copyPassword(pwdInput)">
              <lucide-icon name="copy" [size]="14"></lucide-icon> Copy Password
            </button>
            <button class="cx-btn cx-btn-primary cx-btn-sm" (click)="resetResult = null; showPwd.set(false)">
              <lucide-icon name="check" [size]="14"></lucide-icon> Done
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Avatar Upload Preview Dialog -->
    @if (showAvatarPreview()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center cx-animate-in" (click)="showAvatarPreview.set(false)">
        <div class="fixed inset-0 bg-black/50 backdrop-blur-sm"></div>
        <div class="relative bg-[var(--cx-surface)] rounded-2xl shadow-2xl max-w-md w-full mx-4" (click)="$event.stopPropagation()">
          <div class="px-6 py-4 border-b border-[var(--cx-border)] flex items-center justify-between">
            <h3 class="text-sm font-bold text-[var(--cx-text)] flex items-center gap-2">
              <lucide-icon name="upload" [size]="16"></lucide-icon>
              Upload Profile Photo
            </h3>
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="showAvatarPreview.set(false)">
              <lucide-icon name="x" [size]="16"></lucide-icon>
            </button>
          </div>

          <div class="px-6 py-6">
            <!-- User context -->
            <p class="text-xs text-[var(--cx-text-muted)] mb-4 text-center">Update photo for <strong class="text-[var(--cx-text)]">{{ avatarPreview.row?.full_name }}</strong></p>

            <!-- Preview -->
            <div class="flex flex-col items-center gap-4">
              <div class="relative">
                <div class="w-32 h-32 rounded-full overflow-hidden ring-4 ring-[var(--cx-primary)]/10 shadow-xl">
                  <img [src]="avatarPreview.previewUrl" class="w-full h-full object-cover" alt="Preview" />
                </div>
                <div class="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[var(--cx-primary)] text-white text-[10px] font-semibold shadow-lg whitespace-nowrap">
                  Preview
                </div>
              </div>

              <!-- File Info -->
              <div class="w-full p-3 rounded-xl bg-[var(--cx-surface-hover)] text-center">
                <div class="text-xs font-medium text-[var(--cx-text)] truncate">{{ avatarPreview.fileName }}</div>
                <div class="text-[10px] text-[var(--cx-text-muted)] mt-0.5">{{ avatarPreview.fileSize }}</div>
              </div>

              <!-- Tip -->
              <div class="w-full flex items-start gap-2 p-2.5 rounded-lg bg-[var(--cx-primary)]/5 border border-[var(--cx-primary)]/10">
                <lucide-icon name="info" [size]="14" class="text-[var(--cx-primary)] flex-shrink-0 mt-0.5"></lucide-icon>
                <p class="text-[11px] text-[var(--cx-text-secondary)]">For best results, use a square image at least 200×200 pixels. Maximum file size: 2MB.</p>
              </div>
            </div>
          </div>

          <div class="px-6 py-3 border-t border-[var(--cx-border)] flex justify-end gap-2">
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="showAvatarPreview.set(false)" [disabled]="avatarUploading()">Cancel</button>
            <button class="cx-btn cx-btn-primary cx-btn-sm" (click)="confirmAvatarUpload()" [disabled]="avatarUploading()">
              @if (avatarUploading()) {
                <div class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Uploading...
              } @else {
                <lucide-icon name="upload" [size]="14"></lucide-icon> Upload Photo
              }
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class UsersComponent implements OnInit {
  rows = signal<any[]>([]); loading = signal(true);
  totalRecords = signal(0);
  roles = signal<any[]>([]); locs = signal<any[]>([]); departments = signal<any[]>([]); teams = signal<any[]>([]);
  showForm = signal(false); saving = signal(false);
  editId: string | null = null; form: any = {};
  showConfirm = signal(false);
  confirmData: any = {};
  showAvatarPreview = signal(false);
  avatarPreview: any = {};
  avatarUploading = signal(false);
  showPwd = signal(false);
  selRoles: string[] = []; selLocs: string[] = [];
  filters: any = { search: '', role: '', department_id: '', location_id: '', status: '', sort_by: 'createdAt', sort_dir: 'DESC' };
  page = 1; perPage = 25; totalPages = 0;
  exportOpen = false;
  resetResult: any = null;
  private filterTimeout: any;

  // Confirm dialog state
  confirmOpen = signal(false);
  confirmConfig: any = { title: '', message: '', type: 'warning', action: () => {} };

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
      next: res => {
        this.rows.set(res.data || []);
        const total = Number(res.meta?.total ?? 0);
        this.totalRecords.set(total);
        this.totalPages = Math.ceil(total / this.perPage);
        this.loading.set(false);
      },
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
    this.confirmData = {
      mode: 'reset_password',
      row,
      title: 'Reset Password',
      message: `Generate a new temporary password for ${row.full_name}? The user will be required to change it on next login.`,
      confirmLabel: 'Reset Password',
      variant: 'warning',
    };
    this.showConfirm.set(true);
  }

  uploadAvatar(row: any, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Validate
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      this.toast.error('Please select a JPEG, PNG, WebP, or GIF image');
      input.value = '';
      return;
    }
    if (file.size > maxSize) {
      this.toast.error('Image must be smaller than 2MB');
      input.value = '';
      return;
    }

    // Preview then confirm
    const reader = new FileReader();
    reader.onload = (e) => {
      this.avatarPreview = {
        row,
        file,
        previewUrl: e.target?.result as string,
        fileName: file.name,
        fileSize: this.formatFileSize(file.size),
      };
      this.showAvatarPreview.set(true);
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  confirmAvatarUpload(): void {
    const { row, file } = this.avatarPreview;
    this.avatarUploading.set(true);
    const formData = new FormData();
    formData.append('avatar', file);
    this.http.post<any>(`${environment.apiUrl}/users/${row.id}/avatar`, formData).subscribe({
      next: () => {
        this.avatarUploading.set(false);
        this.showAvatarPreview.set(false);
        this.toast.success('Profile photo updated');
        this.load();
      },
      error: (e: any) => {
        this.avatarUploading.set(false);
        this.toast.error(e.error?.message || 'Upload failed');
      },
    });
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  }

  copyPassword(input: HTMLInputElement): void {
    navigator.clipboard.writeText(input.value).then(() => this.toast.success('Password copied'));
  }

  toggleStatus(row: any): void {
    const newStatus = row.status === 'active' ? 'inactive' : 'active';
    this.confirmData = {
      mode: 'toggle_status',
      row,
      newStatus,
      title: newStatus === 'inactive' ? 'Deactivate User' : 'Activate User',
      message: (newStatus === 'inactive' ? 'Deactivate ' : 'Activate ') + row.full_name + '?',
      confirmLabel: newStatus === 'inactive' ? 'Deactivate' : 'Activate',
      variant: newStatus === 'inactive' ? 'danger' : 'warning',
    };
    this.showConfirm.set(true);
  }

  handleConfirm(): void {
    const { mode, row, newStatus } = this.confirmData;
    if (mode === 'toggle_status') {
      this.api.put('/users/' + row.id, { status: newStatus }).subscribe({
        next: () => { this.showConfirm.set(false); this.toast.success(`User ${newStatus === 'active' ? 'activated' : 'deactivated'}`); this.load(); },
        error: (e: any) => { this.showConfirm.set(false); this.toast.error(e.error?.message || 'Failed'); },
      });
    } else if (mode === 'reset_password') {
      this.api.post('/users/' + row.id + '/reset-password', {}).subscribe({
        next: (r: any) => {
          this.showConfirm.set(false);
          this.resetResult = { ...r.data, user_name: row.full_name, user_email: row.email };
        },
        error: (e: any) => { this.showConfirm.set(false); this.toast.error(e.error?.message || 'Failed'); },
      });
    }
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
}
