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
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-users', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, FormDialogComponent, SearchableSelectComponent, ConfirmDialogComponent, EmptyStateComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Users"
        [subtitle]="totalRecords() + ' active team members'"
        eyebrow="Access Management">
        <div class="flex items-center gap-2">
          <div class="relative">
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="exportOpen = !exportOpen">
              <lucide-icon name="download" [size]="14"></lucide-icon>
              <span>Export</span>
              <lucide-icon name="chevron-down" [size]="12"></lucide-icon>
            </button>
            @if (exportOpen) {
              <div class="cx-users-export-menu cx-animate-in">
                <button class="cx-users-export-option" (click)="exportData('csv')">
                  <lucide-icon name="file-spreadsheet" [size]="14"></lucide-icon>
                  <span>CSV</span>
                </button>
                <button class="cx-users-export-option" (click)="exportData('excel')">
                  <lucide-icon name="file-spreadsheet" [size]="14"></lucide-icon>
                  <span>Excel</span>
                </button>
                <button class="cx-users-export-option" (click)="exportData('pdf')">
                  <lucide-icon name="file-text" [size]="14"></lucide-icon>
                  <span>PDF</span>
                </button>
              </div>
            }
          </div>
          @if (auth.hasPermission('users.create')) {
            <button class="cx-btn cx-btn-primary" (click)="openForm()">
              <lucide-icon name="plus" [size]="14"></lucide-icon>
              <span>Add User</span>
            </button>
          }
        </div>
      </cx-page-header>

      <!-- Filters -->
      <div class="cx-users-filters">
        <div class="cx-users-filter-search">
          <lucide-icon name="search" [size]="14" class="cx-users-filter-search-icon"></lucide-icon>
          <input type="text" class="cx-users-filter-search-input"
            placeholder="Search by name, email, phone..."
            [(ngModel)]="filters.search" (input)="onFilterChange()" />
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

      <!-- Table -->
      <div class="cx-users-table-wrap">
        @if (loading()) {
          <div class="cx-users-state">
            <div class="cx-users-loading">
              <div class="cx-users-loading-dots"><span></span><span></span><span></span></div>
              <span>Loading users...</span>
            </div>
          </div>
        } @else if (rows().length === 0) {
          <div class="cx-users-state">
            <cx-empty-state title="No users found" description="Try adjusting your filters or add a new user." icon="users"></cx-empty-state>
          </div>
        } @else {
          <div class="cx-users-table-scroll">
            <table class="cx-users-table">
              <thead>
                <tr>
                  <th class="cx-users-th-user" (click)="sort('firstName')">
                    <div class="cx-users-th-inner">
                      <span>User</span>
                      @if (filters.sort_by === 'firstName') {
                        <lucide-icon [name]="filters.sort_dir === 'ASC' ? 'arrow-up' : 'arrow-down'" [size]="12" class="cx-users-sort-icon is-active"></lucide-icon>
                      } @else {
                        <lucide-icon name="chevrons-up-down" [size]="12" class="cx-users-sort-icon"></lucide-icon>
                      }
                    </div>
                  </th>
                  <th>Role</th>
                  <th>Dept / Team</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th class="cx-users-th-sortable" (click)="sort('createdAt')">
                    <div class="cx-users-th-inner">
                      <span>Joined</span>
                      @if (filters.sort_by === 'createdAt') {
                        <lucide-icon [name]="filters.sort_dir === 'ASC' ? 'arrow-up' : 'arrow-down'" [size]="12" class="cx-users-sort-icon is-active"></lucide-icon>
                      } @else {
                        <lucide-icon name="chevrons-up-down" [size]="12" class="cx-users-sort-icon"></lucide-icon>
                      }
                    </div>
                  </th>
                  <th class="cx-users-actions-col"></th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.id) {
                  <tr>
                    <td class="cx-users-user-cell">
                      <div class="cx-users-user">
                        @if (row.avatar_path) {
                          <img [src]="avatarUrl(row.avatar_path)" class="cx-users-avatar-img" alt="" (error)="onAvatarError($event, row)" />
                        } @else {
                          <div class="cx-users-avatar-initial" [style.background]="avatarColor(row.id)">
                            {{ row.first_name?.[0] }}{{ row.last_name?.[0] }}
                          </div>
                        }
                        <div class="cx-users-user-meta">
                          <div class="cx-users-user-name">{{ row.full_name }}</div>
                          <div class="cx-users-user-email">{{ row.email }}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      @if (row.roles?.length) {
                        <span class="cx-users-role-chip">{{ row.roles[0].name }}</span>
                      } @else {
                        <span class="cx-users-muted">—</span>
                      }
                    </td>
                    <td>
                      <div class="cx-users-dept">{{ row.department_name || '—' }}</div>
                      @if (row.team_name) { <div class="cx-users-team">{{ row.team_name }}</div> }
                    </td>
                    <td class="cx-users-loc">{{ row.location_name || '—' }}</td>
                    <td>
                      <span class="cx-status-badge" [attr.data-tone]="row.status === 'active' ? 'success' : row.status === 'suspended' ? 'danger' : 'neutral'">
                        <span class="cx-status-dot"></span>
                        <span>{{ row.status | titlecase }}</span>
                      </span>
                    </td>
                    <td class="cx-users-joined tabular-nums">{{ row.created_at | date:'mediumDate' }}</td>
                    <td class="cx-users-actions-col">
                      <div class="cx-users-row-actions">
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
          <div class="cx-users-pagination">
            <div class="cx-users-pagination-info">
              Showing <span class="tabular-nums">{{ (page - 1) * perPage + 1 }}</span>&ndash;<span class="tabular-nums">{{ min(page * perPage, totalRecords()) }}</span>
              of <span class="tabular-nums">{{ totalRecords() | number }}</span>
            </div>
            <div class="cx-users-pagination-controls">
              <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" [disabled]="page <= 1" (click)="goPage(page - 1)" aria-label="Previous page">
                <lucide-icon name="chevron-left" [size]="14"></lucide-icon>
              </button>
              @for (p of pageNumbers(); track p) {
                <button class="cx-btn cx-btn-sm cx-users-page-btn" [class]="p === page ? 'cx-btn-primary' : 'cx-btn-ghost'" (click)="goPage(p)">{{ p }}</button>
              }
              <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" [disabled]="page >= totalPages" (click)="goPage(page + 1)" aria-label="Next page">
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
      [title]="editId ? 'Edit User' : 'Create User'"
      [subtitle]="editId ? 'Update user details and access' : 'Add a new team member'"
      [saving]="saving()" maxWidth="680px" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="cx-form-stack">
        <!-- Identity -->
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">First Name *</label><input class="cx-input" [(ngModel)]="form.first_name" placeholder="First name" /></div>
          <div><label class="cx-label">Last Name *</label><input class="cx-input" [(ngModel)]="form.last_name" placeholder="Last name" /></div>
        </div>
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Email *</label><input class="cx-input" type="email" [(ngModel)]="form.email" placeholder="user@example.com" /></div>
          <div><label class="cx-label">Phone</label><input class="cx-input" [(ngModel)]="form.phone" placeholder="0801 234 5678" /></div>
        </div>
        @if (!editId) {
          <div>
            <label class="cx-label">Password *</label>
            <input class="cx-input" type="password" [(ngModel)]="form.password" placeholder="Minimum 8 characters" />
          </div>
        }

        <!-- Organization -->
        <h4 class="cx-form-section-title">Organization</h4>
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Department</label>
            <cx-searchable-select [options]="deptOptions()" placeholder="Select department..." [clearable]="true"
              [(ngModel)]="form.department_id" (ngModelChange)="onDeptChange()"></cx-searchable-select>
          </div>
          <div>
            <label class="cx-label">Team</label>
            <cx-searchable-select [options]="teamOptions()" placeholder="Select team..." [clearable]="true"
              [(ngModel)]="form.team_id"></cx-searchable-select>
          </div>
        </div>

        <!-- Access -->
        <h4 class="cx-form-section-title">Access</h4>
        <div>
          <label class="cx-label">Roles</label>
          <div class="cx-users-chips">
            @for (r of roles(); track r.id) {
              <button type="button" class="cx-users-chip"
                      [class.is-selected]="selRoles.includes(r.id)"
                      (click)="toggleArr('selRoles', r.id)">
                @if (selRoles.includes(r.id)) { <lucide-icon name="check" [size]="11"></lucide-icon> }
                {{ r.name }}
              </button>
            }
          </div>
        </div>
        <div>
          <label class="cx-label">Locations</label>
          <div class="cx-users-chips">
            @for (l of locs(); track l.id) {
              <button type="button" class="cx-users-chip cx-users-chip-gold"
                      [class.is-selected]="selLocs.includes(l.id)"
                      (click)="toggleArr('selLocs', l.id)">
                @if (selLocs.includes(l.id)) { <lucide-icon name="check" [size]="11"></lucide-icon> }
                {{ l.name }}
              </button>
            }
          </div>
        </div>
        @if (editId) {
          <div>
            <label class="cx-label">Account Status</label>
            <select class="cx-select" [(ngModel)]="form.status">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
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

            <!-- Email delivery status -->
            @if (resetResult.email_sent) {
              <div class="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-900/20">
                <lucide-icon name="check-circle" [size]="16" class="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5"></lucide-icon>
                <div class="flex-1">
                  <p class="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Emailed to user</p>
                  <p class="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">The new password was sent to {{ resetResult.email }}. You can also share it verbally if needed.</p>
                </div>
              </div>
            } @else {
              <div class="flex items-start gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/20">
                <lucide-icon name="alert-circle" [size]="16" class="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"></lucide-icon>
                <div class="flex-1">
                  <p class="text-xs font-semibold text-red-800 dark:text-red-300">Email delivery failed</p>
                  <p class="text-[11px] text-red-700 dark:text-red-400 mt-0.5">Could not send the password to {{ resetResult.email }}. Share it with the user through another secure channel.</p>
                </div>
              </div>
            }

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
  styles: [`
    /* ═══ Export dropdown ═══ */
    .cx-users-export-menu {
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
    .cx-users-export-option {
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
    .cx-users-export-option:hover { background: var(--cx-surface-hover); }
    .cx-users-export-option lucide-icon { color: var(--cx-text-muted); }

    /* ═══ Filters row ═══ */
    .cx-users-filters {
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
      .cx-users-filters { grid-template-columns: 2fr 1fr 1fr 1fr 1fr; }
    }
    .cx-users-filter-search { position: relative; }
    .cx-users-filter-search-icon {
      position: absolute; left: 0.75rem; top: 50%;
      transform: translateY(-50%);
      color: var(--cx-text-muted);
      pointer-events: none;
    }
    .cx-users-filter-search-input {
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
    .cx-users-filter-search-input:hover { border-color: var(--cx-border); }
    .cx-users-filter-search-input:focus {
      background: var(--cx-surface);
      border-color: var(--cx-primary-600);
      box-shadow: var(--cx-ring-focus);
    }

    /* ═══ Table wrap ═══ */
    .cx-users-table-wrap {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      overflow: hidden;
    }
    .cx-users-state { padding: 4rem 1rem; text-align: center; }
    .cx-users-loading {
      display: inline-flex; align-items: center; gap: 0.75rem;
      color: var(--cx-text-muted);
      font-size: var(--cx-text-sm);
    }
    .cx-users-loading-dots { display: inline-flex; gap: 4px; }
    .cx-users-loading-dots span {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--cx-primary-600);
      animation: cx-loading-pulse 1.2s infinite var(--cx-ease-premium);
    }
    .cx-users-loading-dots span:nth-child(2) { animation-delay: 0.2s; background: var(--cx-accent-500); }
    .cx-users-loading-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes cx-loading-pulse {
      0%, 100% { opacity: 0.3; transform: scale(0.8); }
      50% { opacity: 1; transform: scale(1.15); }
    }

    .cx-users-table-scroll { overflow-x: auto; }
    .cx-users-table {
      width: 100%; min-width: 800px;
      border-collapse: collapse;
    }
    .cx-users-table thead {
      background: var(--cx-surface-2);
    }
    .cx-users-table thead tr { border-bottom: 1px solid var(--cx-border); }
    .cx-users-table th {
      padding: 0.75rem 1rem;
      font-size: var(--cx-text-xs); font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.05em;
      color: var(--cx-text-muted);
      white-space: nowrap;
      text-align: left;
      user-select: none;
    }
    .cx-users-th-user, .cx-users-th-sortable { cursor: pointer; }
    .cx-users-th-user:hover, .cx-users-th-sortable:hover { color: var(--cx-text); }
    .cx-users-th-inner { display: flex; align-items: center; gap: 4px; }
    .cx-users-sort-icon {
      color: var(--cx-text-subtle);
      opacity: 0.6;
      transition: opacity var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-users-th-user:hover .cx-users-sort-icon,
    .cx-users-th-sortable:hover .cx-users-sort-icon { opacity: 1; }
    .cx-users-sort-icon.is-active { color: var(--cx-primary-600); opacity: 1; }

    .cx-users-table tbody td {
      padding: 0.75rem 1rem;
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      border-bottom: 1px solid var(--cx-border-subtle);
      vertical-align: middle;
    }
    .cx-users-table tbody tr { transition: background var(--cx-dur-fast) var(--cx-ease-premium); }
    .cx-users-table tbody tr:hover { background: var(--cx-surface-hover); }
    .cx-users-table tbody tr:last-child td { border-bottom: none; }

    /* ═══ User cell ═══ */
    .cx-users-user-cell { min-width: 240px; }
    .cx-users-user { display: flex; align-items: center; gap: 0.75rem; }
    .cx-users-avatar-img {
      width: 34px; height: 34px; flex-shrink: 0;
      border-radius: 50%;
      object-fit: cover;
      border: 1px solid var(--cx-border-subtle);
    }
    .cx-users-avatar-initial {
      width: 34px; height: 34px; flex-shrink: 0;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: #fff;
      font-size: var(--cx-text-xs); font-weight: 600;
      letter-spacing: 0.02em;
    }
    .cx-users-user-meta { min-width: 0; }
    .cx-users-user-name {
      font-size: var(--cx-text-sm); font-weight: 500;
      color: var(--cx-text);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      max-width: 220px;
    }
    .cx-users-user-email {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      max-width: 220px;
    }

    /* ═══ Cell content ═══ */
    .cx-users-role-chip {
      display: inline-flex; align-items: center;
      padding: 3px 10px;
      background: var(--cx-primary-50);
      color: var(--cx-primary-700);
      border-radius: var(--cx-radius-pill);
      font-size: var(--cx-text-xs); font-weight: 500;
      white-space: nowrap;
    }
    .cx-users-dept {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-secondary);
      overflow: hidden; text-overflow: ellipsis;
    }
    .cx-users-team {
      font-size: 11px;
      color: var(--cx-text-muted);
      margin-top: 2px;
    }
    .cx-users-loc {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-secondary);
    }
    .cx-users-muted {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
    }
    .cx-users-joined {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      white-space: nowrap;
    }
    .cx-users-actions-col { width: 160px; }
    .cx-users-row-actions {
      display: flex; align-items: center; gap: 0.1rem;
      justify-content: flex-end;
    }

    /* ═══ Pagination ═══ */
    .cx-users-pagination {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--cx-border);
      background: var(--cx-surface);
    }
    .cx-users-pagination-info {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
    }
    .cx-users-pagination-controls { display: flex; align-items: center; gap: 0.35rem; }
    .cx-users-page-btn {
      min-width: 32px;
      font-variant-numeric: tabular-nums;
    }

    /* ═══ Chips (form) ═══ */
    .cx-users-chips {
      display: flex; flex-wrap: wrap; gap: 6px;
      margin-top: 4px;
    }
    .cx-users-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 10px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-pill);
      font-size: var(--cx-text-xs);
      color: var(--cx-text-secondary);
      cursor: pointer;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-users-chip:hover {
      border-color: var(--cx-primary-200);
      color: var(--cx-text);
    }
    .cx-users-chip.is-selected {
      background: var(--cx-primary-50);
      border-color: var(--cx-primary-600);
      color: var(--cx-primary-700);
      font-weight: 500;
    }
    .cx-users-chip-gold.is-selected {
      background: var(--cx-accent-50);
      border-color: var(--cx-accent-500);
      color: var(--cx-accent-700);
    }
  `],
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

  /**
   * Builds the URL for a user avatar. Uses the /api/storage alias which
   * is routed to PHP unconditionally — unlike the legacy /storage path
   * which can be intercepted by nginx's static-file location handling
   * and return 404 before PHP ever sees the request.
   *
   * environment.apiUrl already includes '/api' so the resulting URL is
   * e.g. https://api.dostsuite.com/api/storage/avatars/uuid.jpg
   */
  avatarUrl(avatarPath: string): string {
    if (!avatarPath) return '';
    // Strip any accidental leading slash so we don't get //
    const clean = avatarPath.startsWith('/') ? avatarPath.slice(1) : avatarPath;
    return `${environment.apiUrl}/storage/${clean}`;
  }

  /**
   * If an avatar fails to load (file was deleted, storage offline, etc.)
   * we null the row's avatar_path client-side so Angular falls back to
   * the initials tile. Avoids a broken-image icon.
   */
  onAvatarError(ev: Event, row: any): void {
    row.avatar_path = null;
    // Hide the broken img element immediately
    const img = ev.target as HTMLImageElement;
    if (img) img.style.display = 'none';
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
