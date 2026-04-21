import { Component, OnInit, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

/**
 * Agent Targets
 * ----------------------------------------------------------------------------
 * Bulk + per-user management of the two agent fields that ship in Commit 1:
 *   - is_agent (bool) — whether the user counts as a field agent at all
 *   - monthly_target (decimal, naira) — personal disbursement target
 *
 * Why this page exists: admins don't edit these through the standard Users
 * page (by policy). The standard user form stays focused on identity/RBAC;
 * target management is a finance-operations concern that deserves its own
 * surface with bulk tools.
 *
 * The page has three zones:
 *   1. Global fallback banner — shows the system-wide default, links to
 *      /settings for editing (it's still stored as agent.monthly_target
 *      in system_settings, just with naira semantics after Commit 1).
 *   2. Filter pills — "Agents only" (default) vs "All users" so admins
 *      can flag new users as agents.
 *   3. Interactive table with bulk-select checkboxes + sticky action bar
 *      that appears when 1+ rows are selected.
 *
 * Editing works differently on desktop vs mobile:
 *   - Desktop (≥768px): click the target cell to inline-edit (input +
 *     Save/Cancel). Keeps bulk workflows fast.
 *   - Mobile (<768px): row tap opens a form-dialog. Inline editing in
 *     a cramped mobile row is fiddly.
 *
 * Bulk operations use PATCH /users/bulk-agent-targets which is atomic
 * (all-or-nothing) — see BulkUpdateAgentTargetsAction for semantics.
 */
@Component({
  selector: 'app-agent-targets',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, LucideAngularModule,
    PageHeaderComponent, LoadingSpinnerComponent, EmptyStateComponent,
    FormDialogComponent, ConfirmDialogComponent,
  ],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Agent Targets"
        subtitle="Manage field agents and their monthly disbursement targets"
        eyebrow="Configuration">
      </cx-page-header>

      <!-- Global fallback banner -->
      <div class="cx-at-banner">
        <div class="cx-at-banner-icon">
          <lucide-icon name="target" [size]="18"></lucide-icon>
        </div>
        <div class="cx-at-banner-body">
          <div class="cx-at-banner-title">Global Default Target</div>
          <div class="cx-at-banner-desc">
            Agents without an individual target use this fallback.
            Current default: <strong class="cx-at-banner-amount tabular-nums">{{ formatNaira(globalDefault()) }}</strong>
          </div>
        </div>
        @if (canEdit) {
          <a routerLink="/settings" [queryParams]="{ key: 'agent.monthly_target' }" class="cx-at-banner-link">
            <span>Edit default</span>
            <lucide-icon name="chevron-right" [size]="14"></lucide-icon>
          </a>
        }
      </div>

      <!-- Filter + search -->
      <div class="cx-at-toolbar">
        <div class="cx-at-filter-pills">
          <button class="cx-at-pill"
                  [class.is-active]="filter === 'agents'"
                  (click)="setFilter('agents')">
            <lucide-icon name="user-check" [size]="14"></lucide-icon>
            <span>Agents only</span>
            <span class="cx-at-pill-count tabular-nums">{{ agentCount() }}</span>
          </button>
          <button class="cx-at-pill"
                  [class.is-active]="filter === 'all'"
                  (click)="setFilter('all')">
            <lucide-icon name="users" [size]="14"></lucide-icon>
            <span>All users</span>
          </button>
        </div>

        <div class="cx-at-search">
          <lucide-icon name="search" [size]="14" class="cx-at-search-icon"></lucide-icon>
          <input
            type="text"
            class="cx-at-search-input"
            placeholder="Search by name or email..."
            [(ngModel)]="searchQ"
            (input)="onSearch()" />
          @if (searchQ) {
            <button class="cx-at-search-clear" (click)="clearSearch()" aria-label="Clear search">
              <lucide-icon name="x" [size]="14"></lucide-icon>
            </button>
          }
        </div>
      </div>

      <!-- Sticky bulk action bar (visible when 1+ selected) -->
      @if (selectedIds().size > 0) {
        <div class="cx-at-bulkbar cx-animate-in">
          <div class="cx-at-bulkbar-count">
            <lucide-icon name="check-circle" [size]="16"></lucide-icon>
            <strong class="tabular-nums">{{ selectedIds().size }}</strong>
            <span>selected</span>
            <button class="cx-at-bulkbar-clear" (click)="clearSelection()">Clear</button>
          </div>
          @if (canEdit) {
            <div class="cx-at-bulkbar-actions">
              <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="openBulkSetTarget()">
                <lucide-icon name="edit-3" [size]="14"></lucide-icon>
                <span>Set target…</span>
              </button>
              <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="openBulkFlag(true)">
                <lucide-icon name="user-check" [size]="14"></lucide-icon>
                <span>Flag as agent</span>
              </button>
              <button class="cx-btn cx-btn-outline cx-btn-sm cx-at-bulkbar-danger" (click)="openBulkFlag(false)">
                <lucide-icon name="user-x" [size]="14"></lucide-icon>
                <span>Unflag</span>
              </button>
            </div>
          }
        </div>
      }

      <!-- Table / list -->
      @if (loading()) {
        <cx-loading message="Loading users..."></cx-loading>
      } @else if (rows().length === 0) {
        <cx-empty-state
          title="No users found"
          [description]="emptyDescription()"
          icon="users"></cx-empty-state>
      } @else {
        <div class="cx-at-table-wrap">
          <table class="cx-at-table">
            <thead>
              <tr>
                <th class="cx-at-col-check">
                  <input
                    type="checkbox"
                    class="cx-at-checkbox"
                    [checked]="allOnPageSelected()"
                    [indeterminate]="someOnPageSelected()"
                    (change)="toggleAllOnPage($event)"
                    aria-label="Select all on this page" />
                </th>
                <th class="cx-at-col-user">User</th>
                <th class="cx-at-col-flag">Agent</th>
                <th class="cx-at-col-target">Monthly Target</th>
                <th class="cx-at-col-actions"></th>
              </tr>
            </thead>
            <tbody>
              @for (user of rows(); track user.id) {
                <tr [class.is-selected]="selectedIds().has(user.id)"
                    [class.is-editing]="editingId() === user.id"
                    (click)="onRowClick(user, $event)">
                  <td class="cx-at-col-check">
                    <input
                      type="checkbox"
                      class="cx-at-checkbox"
                      [checked]="selectedIds().has(user.id)"
                      (change)="toggleOne(user.id)"
                      (click)="$event.stopPropagation()"
                      [attr.aria-label]="'Select ' + user.full_name" />
                  </td>
                  <td class="cx-at-col-user">
                    <div class="cx-at-user">
                      <div class="cx-at-avatar">
                        {{ initials(user) }}
                      </div>
                      <div class="cx-at-user-meta">
                        <div class="cx-at-user-name">{{ user.full_name || (user.first_name + ' ' + user.last_name) }}</div>
                        <div class="cx-at-user-email">{{ user.email }}</div>
                      </div>
                    </div>
                  </td>
                  <td class="cx-at-col-flag">
                    @if (user.is_agent) {
                      <span class="cx-status-badge" data-tone="success">
                        <span class="cx-status-dot"></span>
                        <span>Agent</span>
                      </span>
                    } @else {
                      <span class="cx-at-not-agent">—</span>
                    }
                  </td>
                  <td class="cx-at-col-target" (click)="$event.stopPropagation()">
                    @if (editingId() === user.id && !isMobile()) {
                      <!-- Desktop inline edit -->
                      <div class="cx-at-inline-edit">
                        <span class="cx-at-naira">₦</span>
                        <input
                          type="number"
                          class="cx-at-inline-input tabular-nums"
                          [(ngModel)]="editingValue"
                          (keydown.enter)="saveInline(user)"
                          (keydown.escape)="cancelInline()"
                          #inlineInput
                          min="0"
                          placeholder="0" />
                        <button
                          class="cx-at-inline-btn cx-at-inline-save"
                          [disabled]="savingId() === user.id"
                          (click)="saveInline(user)"
                          aria-label="Save">
                          <lucide-icon [name]="savingId() === user.id ? 'loader-2' : 'check'" [size]="14"
                                       [class.cx-at-spin]="savingId() === user.id"></lucide-icon>
                        </button>
                        <button
                          class="cx-at-inline-btn cx-at-inline-cancel"
                          [disabled]="savingId() === user.id"
                          (click)="cancelInline()"
                          aria-label="Cancel">
                          <lucide-icon name="x" [size]="14"></lucide-icon>
                        </button>
                      </div>
                    } @else {
                      <div class="cx-at-target-cell"
                           [class.is-editable]="canEdit && user.is_agent"
                           (click)="canEdit && user.is_agent && startInlineEdit(user)">
                        @if (user.monthly_target !== null && user.monthly_target !== undefined) {
                          <span class="cx-at-target-value tabular-nums">{{ formatNaira(user.monthly_target) }}</span>
                          <span class="cx-at-target-source">personal</span>
                        } @else if (user.is_agent) {
                          <span class="cx-at-target-fallback tabular-nums">{{ formatNaira(globalDefault()) }}</span>
                          <span class="cx-at-target-source">default</span>
                        } @else {
                          <span class="cx-at-target-none">—</span>
                        }
                        @if (canEdit && user.is_agent && !isMobile()) {
                          <lucide-icon name="pencil" [size]="12" class="cx-at-target-edit-hint"></lucide-icon>
                        }
                      </div>
                    }
                  </td>
                  <td class="cx-at-col-actions" (click)="$event.stopPropagation()">
                    @if (canEdit) {
                      <div class="cx-at-row-actions">
                        @if (user.is_agent) {
                          <button
                            class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon"
                            (click)="toggleFlag(user)"
                            [disabled]="savingId() === user.id"
                            title="Remove agent flag">
                            <lucide-icon name="user-x" [size]="14"></lucide-icon>
                          </button>
                        } @else {
                          <button
                            class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon"
                            (click)="toggleFlag(user)"
                            [disabled]="savingId() === user.id"
                            title="Flag as agent">
                            <lucide-icon name="user-check" [size]="14"></lucide-icon>
                          </button>
                        }
                      </div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        @if (totalPages() > 1) {
          <div class="cx-at-pagination">
            <div class="cx-at-pagination-info">
              Showing <span class="tabular-nums">{{ pageStart() }}</span>–<span class="tabular-nums">{{ pageEnd() }}</span>
              of <span class="tabular-nums">{{ total() }}</span>
            </div>
            <div class="cx-at-pagination-controls">
              <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon"
                      [disabled]="page() <= 1"
                      (click)="goPage(page() - 1)"
                      aria-label="Previous page">
                <lucide-icon name="chevron-left" [size]="14"></lucide-icon>
              </button>
              @for (p of pageNumbers(); track p) {
                <button class="cx-btn cx-btn-sm cx-at-page-btn"
                        [class]="p === page() ? 'cx-btn-primary' : 'cx-btn-ghost'"
                        (click)="goPage(p)">{{ p }}</button>
              }
              <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon"
                      [disabled]="page() >= totalPages()"
                      (click)="goPage(page() + 1)"
                      aria-label="Next page">
                <lucide-icon name="chevron-right" [size]="14"></lucide-icon>
              </button>
            </div>
          </div>
        }
      }
    </div>

    <!-- Mobile edit dialog (and also used for some desktop flows) -->
    <cx-form-dialog
      [open]="editDialogOpen()"
      [title]="'Edit Target'"
      [subtitle]="editDialogUser()?.full_name || ''"
      [saving]="savingId() === editDialogUser()?.id"
      [saveDisabled]="!isEditDialogValid()"
      (close)="closeEditDialog()"
      (save)="saveEditDialog()">
      @if (editDialogUser()) {
        <div class="cx-form-stack">
          <div class="cx-at-dlg-row">
            <label class="cx-label">Flagged as agent</label>
            <label class="cx-at-switch">
              <input type="checkbox" [(ngModel)]="editDialogIsAgent" />
              <span class="cx-at-switch-slider"></span>
            </label>
          </div>
          @if (editDialogIsAgent) {
            <div>
              <label class="cx-label">Monthly target (naira)</label>
              <div class="cx-at-dlg-target-input">
                <span class="cx-at-naira">₦</span>
                <input
                  type="number"
                  class="cx-input tabular-nums"
                  [(ngModel)]="editDialogTarget"
                  min="0"
                  placeholder="e.g. 5000000" />
              </div>
              <p class="cx-at-dlg-hint">
                Leave empty to fall back to the global default
                (<span class="tabular-nums">{{ formatNaira(globalDefault()) }}</span>).
              </p>
            </div>
          } @else {
            <p class="cx-at-dlg-hint">
              Non-agents don't have a target. Their monthly_target field
              will be cleared when you save.
            </p>
          }
        </div>
      }
    </cx-form-dialog>

    <!-- Bulk set-target dialog -->
    <cx-form-dialog
      [open]="bulkTargetDialogOpen()"
      title="Set target for selected agents"
      [subtitle]="bulkTargetSubtitle()"
      [saving]="bulkSaving()"
      [saveDisabled]="!isBulkTargetValid()"
      saveLabel="Apply to all"
      (close)="closeBulkTargetDialog()"
      (save)="saveBulkTarget()">
      <div class="cx-form-stack">
        <div>
          <label class="cx-label">Monthly target (naira)</label>
          <div class="cx-at-dlg-target-input">
            <span class="cx-at-naira">₦</span>
            <input
              type="number"
              class="cx-input tabular-nums"
              [(ngModel)]="bulkTargetValue"
              min="0"
              placeholder="e.g. 5000000" />
          </div>
          <p class="cx-at-dlg-hint">
            Sets the same target on all {{ selectedIds().size }} selected users.
            Leave empty to clear (they'll fall back to the global default).
          </p>
        </div>

        <!-- Warning if any selected users are not flagged as agents -->
        @if (selectedNonAgentCount() > 0) {
          <div class="cx-at-dlg-warning">
            <lucide-icon name="alert-circle" [size]="14"></lucide-icon>
            <div>
              <strong class="tabular-nums">{{ selectedNonAgentCount() }}</strong>
              of the selected users aren't flagged as agents.
              Their target will be saved but won't show anywhere until you flag them.
            </div>
          </div>
        }
      </div>
    </cx-form-dialog>

    <!-- Bulk flag confirm -->
    <cx-confirm-dialog
      [open]="bulkFlagDialogOpen()"
      [title]="bulkFlagPayload === true ? 'Flag as agents?' : 'Remove agent flag?'"
      [message]="bulkFlagMessage()"
      [confirmLabel]="bulkFlagPayload === true ? 'Flag as agents' : 'Unflag'"
      [variant]="bulkFlagPayload === true ? 'warning' : 'danger'"
      (confirmed)="confirmBulkFlag()"
      (cancelled)="bulkFlagDialogOpen.set(false)">
    </cx-confirm-dialog>
  `,
  styleUrls: ['./agent-targets.component.scss'],
})
export class AgentTargetsComponent implements OnInit {
  // ─── Data state ───────────────────────────────────────────────────────
  rows = signal<any[]>([]);
  total = signal(0);
  loading = signal(true);
  agentCount = signal(0);
  globalDefault = signal<string>('1000000');

  // ─── Filter / query ───────────────────────────────────────────────────
  filter: 'agents' | 'all' = 'agents';
  searchQ = '';
  page = signal(1);
  perPage = 20;
  private searchTimer: any = null;

  // ─── Selection ────────────────────────────────────────────────────────
  selectedIds = signal<Set<string>>(new Set());

  // ─── Inline edit ──────────────────────────────────────────────────────
  editingId = signal<string | null>(null);
  editingValue: string | number = '';
  savingId = signal<string | null>(null);

  // ─── Edit dialog (mobile) ─────────────────────────────────────────────
  editDialogOpen = signal(false);
  editDialogUser = signal<any>(null);
  editDialogIsAgent = false;
  editDialogTarget: string | number = '';

  // ─── Bulk target dialog ───────────────────────────────────────────────
  bulkTargetDialogOpen = signal(false);
  bulkTargetValue: string | number = '';
  bulkSaving = signal(false);

  // ─── Bulk flag confirm ────────────────────────────────────────────────
  bulkFlagDialogOpen = signal(false);
  bulkFlagPayload: boolean = false; // true = flag as agent; false = unflag

  // ─── Viewport / mobile detection ──────────────────────────────────────
  isMobile = signal(false);

  // ─── Derived ──────────────────────────────────────────────────────────
  totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.perPage)));
  pageStart = computed(() => (this.page() - 1) * this.perPage + 1);
  pageEnd = computed(() => Math.min(this.page() * this.perPage, this.total()));

  allOnPageSelected = computed(() => {
    const ids = new Set(this.rows().map(r => r.id));
    if (ids.size === 0) return false;
    const sel = this.selectedIds();
    for (const id of ids) if (!sel.has(id)) return false;
    return true;
  });

  someOnPageSelected = computed(() => {
    if (this.allOnPageSelected()) return false;
    const sel = this.selectedIds();
    return this.rows().some(r => sel.has(r.id));
  });

  selectedNonAgentCount = computed(() => {
    const sel = this.selectedIds();
    return this.rows().filter(r => sel.has(r.id) && !r.is_agent).length;
    // Note: only counts among loaded rows. When selection spans pages we
    // can't know; the dialog text just hints "some might not be agents".
  });

  get canEdit(): boolean { return this.auth.hasPermission('settings.edit'); }

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.updateMobile();
    this.loadGlobalDefault();
    this.load();
  }

  @HostListener('window:resize')
  onResize(): void { this.updateMobile(); }

  private updateMobile(): void {
    this.isMobile.set(typeof window !== 'undefined' && window.innerWidth < 768);
  }

  // ─── Data loading ─────────────────────────────────────────────────────

  /**
   * Fetches the current global default target from /settings. Runs once
   * on init — if the admin edits it mid-session we'll show a stale value
   * until refresh, but that's acceptable for this page.
   */
  private loadGlobalDefault(): void {
    this.api.get('/settings', { search: 'agent.monthly_target', per_page: 10 }).subscribe({
      next: (res: any) => {
        const rows = res?.data || [];
        const match = rows.find((r: any) => r.key === 'agent.monthly_target');
        if (match?.value) this.globalDefault.set(String(match.value));
      },
    });
  }

  load(): void {
    this.loading.set(true);
    const params: any = {
      page: this.page(),
      per_page: this.perPage,
      sort_by: 'firstName',
      sort_dir: 'ASC',
    };
    if (this.filter === 'agents') params.is_agent = 'true';
    if (this.searchQ.trim()) params.search = this.searchQ.trim();

    this.api.get('/users', params).subscribe({
      next: (res: any) => {
        this.rows.set(res?.data || []);
        this.total.set(res?.meta?.total || 0);
        // If we're showing agents only, the total IS the agent count.
        if (this.filter === 'agents' && !this.searchQ.trim()) {
          this.agentCount.set(res?.meta?.total || 0);
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Failed to load users');
      },
    });

    // Separate lightweight query to keep the 'Agents only' pill count
    // accurate when the active filter is 'all' or we have a search query.
    if (this.filter !== 'agents' || this.searchQ.trim()) {
      this.api.get('/users', { is_agent: 'true', per_page: 1 }).subscribe({
        next: (res: any) => this.agentCount.set(res?.meta?.total || 0),
      });
    }
  }

  // ─── Filter / search ──────────────────────────────────────────────────

  setFilter(f: 'agents' | 'all'): void {
    if (this.filter === f) return;
    this.filter = f;
    this.page.set(1);
    this.clearSelection();
    this.load();
  }

  onSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      this.load();
    }, 300);
  }

  clearSearch(): void {
    this.searchQ = '';
    this.page.set(1);
    this.load();
  }

  emptyDescription(): string {
    if (this.searchQ.trim()) return `No users match "${this.searchQ.trim()}".`;
    if (this.filter === 'agents') return 'No users are flagged as agents yet. Switch to "All users" and use the flag action on someone.';
    return 'No users in the system.';
  }

  // ─── Pagination ───────────────────────────────────────────────────────

  goPage(p: number): void {
    if (p < 1 || p > this.totalPages()) return;
    this.page.set(p);
    this.load();
  }

  pageNumbers(): number[] {
    const current = this.page();
    const last = this.totalPages();
    // Show up to 5 page numbers centered on current
    const start = Math.max(1, Math.min(current - 2, last - 4));
    const end = Math.min(last, start + 4);
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  // ─── Selection ────────────────────────────────────────────────────────

  toggleOne(id: string): void {
    const next = new Set(this.selectedIds());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.selectedIds.set(next);
  }

  toggleAllOnPage(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    const next = new Set(this.selectedIds());
    for (const row of this.rows()) {
      if (checked) next.add(row.id); else next.delete(row.id);
    }
    this.selectedIds.set(next);
  }

  clearSelection(): void { this.selectedIds.set(new Set()); }

  // ─── Row interaction ──────────────────────────────────────────────────

  onRowClick(user: any, ev: MouseEvent): void {
    // On mobile, tap anywhere on the row opens the edit dialog
    // (as long as the user has edit permission).
    if (!this.isMobile() || !this.canEdit) return;
    // Ignore clicks bubbling from buttons / checkboxes — those stop propagation
    this.openEditDialog(user);
  }

  // ─── Inline edit (desktop) ────────────────────────────────────────────

  startInlineEdit(user: any): void {
    if (!this.canEdit || !user.is_agent) return;
    this.editingId.set(user.id);
    this.editingValue = user.monthly_target ?? '';
    // Focus the input on next tick — Angular hasn't rendered it yet
    setTimeout(() => {
      const el = document.querySelector('.cx-at-inline-input') as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
  }

  cancelInline(): void {
    this.editingId.set(null);
    this.editingValue = '';
  }

  saveInline(user: any): void {
    const raw = this.editingValue;
    const payload: any = { monthly_target: raw === '' || raw === null ? null : Number(raw) };
    // Validate
    if (payload.monthly_target !== null && (isNaN(payload.monthly_target) || payload.monthly_target < 0)) {
      this.toast.error('Target must be a non-negative number');
      return;
    }

    this.savingId.set(user.id);
    this.api.patch(`/users/${user.id}/agent-target`, payload).subscribe({
      next: (res: any) => {
        // Reflect the response back onto the row so we show the new value
        const updatedVal = res?.data?.monthly_target ?? null;
        this.rows.update(rows =>
          rows.map(r => r.id === user.id ? { ...r, monthly_target: updatedVal } : r)
        );
        this.editingId.set(null);
        this.savingId.set(null);
        this.toast.success('Target updated');
      },
      error: (err: any) => {
        this.savingId.set(null);
        this.toast.error(err?.error?.message || 'Failed to save target');
      },
    });
  }

  // ─── Edit dialog (mobile) ─────────────────────────────────────────────

  openEditDialog(user: any): void {
    this.editDialogUser.set(user);
    this.editDialogIsAgent = !!user.is_agent;
    this.editDialogTarget = user.monthly_target ?? '';
    this.editDialogOpen.set(true);
  }

  closeEditDialog(): void {
    this.editDialogOpen.set(false);
    this.editDialogUser.set(null);
  }

  isEditDialogValid(): boolean {
    if (!this.editDialogIsAgent) return true;
    const v = this.editDialogTarget;
    if (v === '' || v === null || v === undefined) return true; // empty = clear target
    const n = Number(v);
    return !isNaN(n) && n >= 0;
  }

  saveEditDialog(): void {
    const user = this.editDialogUser();
    if (!user) return;
    const rawTarget = this.editDialogTarget;
    const payload: any = {
      is_agent: this.editDialogIsAgent,
      monthly_target: !this.editDialogIsAgent
        ? null // backend also force-clears, but be explicit
        : (rawTarget === '' || rawTarget === null ? null : Number(rawTarget)),
    };

    this.savingId.set(user.id);
    this.api.patch(`/users/${user.id}/agent-target`, payload).subscribe({
      next: (res: any) => {
        const d = res?.data || {};
        this.rows.update(rows =>
          rows.map(r => r.id === user.id
            ? { ...r, is_agent: d.is_agent ?? r.is_agent, monthly_target: d.monthly_target ?? null }
            : r)
        );
        this.savingId.set(null);
        this.closeEditDialog();
        this.toast.success('Saved');
      },
      error: (err: any) => {
        this.savingId.set(null);
        this.toast.error(err?.error?.message || 'Failed to save');
      },
    });
  }

  // ─── Single-row flag toggle (from row action button) ──────────────────

  toggleFlag(user: any): void {
    const next = !user.is_agent;
    this.savingId.set(user.id);
    const payload: any = { is_agent: next };
    // Backend force-clears target on unflag anyway, but we mirror it here
    // so the row updates instantly.
    this.api.patch(`/users/${user.id}/agent-target`, payload).subscribe({
      next: (res: any) => {
        const d = res?.data || {};
        this.rows.update(rows =>
          rows.map(r => r.id === user.id
            ? { ...r, is_agent: d.is_agent, monthly_target: d.monthly_target ?? null }
            : r)
        );
        this.savingId.set(null);
        this.toast.success(next ? 'Flagged as agent' : 'Agent flag removed');
        // If we're filtering to agents-only and we just unflagged, hide the row
        if (this.filter === 'agents' && !next) {
          this.rows.update(rows => rows.filter(r => r.id !== user.id));
          this.total.update(t => Math.max(0, t - 1));
          this.agentCount.update(c => Math.max(0, c - 1));
        } else if (next) {
          this.agentCount.update(c => c + 1);
        } else {
          this.agentCount.update(c => Math.max(0, c - 1));
        }
      },
      error: (err: any) => {
        this.savingId.set(null);
        this.toast.error(err?.error?.message || 'Failed');
      },
    });
  }

  // ─── Bulk actions ─────────────────────────────────────────────────────

  openBulkSetTarget(): void {
    this.bulkTargetValue = '';
    this.bulkTargetDialogOpen.set(true);
  }

  closeBulkTargetDialog(): void {
    this.bulkTargetDialogOpen.set(false);
  }

  bulkTargetSubtitle(): string {
    return `Applies to ${this.selectedIds().size} selected ${this.selectedIds().size === 1 ? 'user' : 'users'}`;
  }

  isBulkTargetValid(): boolean {
    const v = this.bulkTargetValue;
    if (v === '' || v === null || v === undefined) return true; // empty = clear
    const n = Number(v);
    return !isNaN(n) && n >= 0;
  }

  saveBulkTarget(): void {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;
    const raw = this.bulkTargetValue;
    const payload: any = {
      user_ids: ids,
      monthly_target: raw === '' || raw === null ? null : Number(raw),
    };

    this.bulkSaving.set(true);
    this.api.patch('/users/bulk-agent-targets', payload).subscribe({
      next: () => {
        this.bulkSaving.set(false);
        this.bulkTargetDialogOpen.set(false);
        this.clearSelection();
        this.toast.success(`Updated ${ids.length} user${ids.length === 1 ? '' : 's'}`);
        this.load();
      },
      error: (err: any) => {
        this.bulkSaving.set(false);
        this.toast.error(err?.error?.message || 'Bulk update failed');
      },
    });
  }

  openBulkFlag(flag: boolean): void {
    this.bulkFlagPayload = flag;
    this.bulkFlagDialogOpen.set(true);
  }

  bulkFlagMessage(): string {
    const count = this.selectedIds().size;
    const noun = count === 1 ? 'user' : 'users';
    if (this.bulkFlagPayload === true) {
      return `Flag ${count} ${noun} as field agents? They'll appear in the "Agents only" list and can sign into the mobile app.`;
    }
    return `Remove agent flag from ${count} ${noun}? Their personal monthly targets will also be cleared.`;
  }

  confirmBulkFlag(): void {
    const ids = Array.from(this.selectedIds());
    const payload: any = { user_ids: ids, is_agent: this.bulkFlagPayload };
    // On unflag we also explicitly clear target (backend does this too)
    if (this.bulkFlagPayload === false) payload.monthly_target = null;

    this.bulkSaving.set(true);
    this.api.patch('/users/bulk-agent-targets', payload).subscribe({
      next: () => {
        this.bulkSaving.set(false);
        this.bulkFlagDialogOpen.set(false);
        this.clearSelection();
        const verb = this.bulkFlagPayload ? 'flagged' : 'unflagged';
        this.toast.success(`${ids.length} user${ids.length === 1 ? '' : 's'} ${verb}`);
        this.load();
      },
      error: (err: any) => {
        this.bulkSaving.set(false);
        this.bulkFlagDialogOpen.set(false);
        this.toast.error(err?.error?.message || 'Bulk update failed');
      },
    });
  }

  // ─── Display helpers ──────────────────────────────────────────────────

  initials(user: any): string {
    const f = (user.first_name || '').charAt(0);
    const l = (user.last_name || '').charAt(0);
    return (f + l).toUpperCase() || '?';
  }

  /** Formats a decimal-string or number as ₦1,234,567 (no decimals). */
  formatNaira(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    const n = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(n)) return '—';
    return '₦' + Math.round(n).toLocaleString('en-NG');
  }
}
