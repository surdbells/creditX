import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';

@Component({
  selector: 'app-roles', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Roles & Permissions"
        subtitle="Define user roles and control what each can access"
        eyebrow="Access Control">
        @if (auth.hasPermission('roles.create')) {
          <button class="cx-btn cx-btn-primary" (click)="openForm()">
            <lucide-icon name="plus" [size]="14"></lucide-icon>
            <span>Add Role</span>
          </button>
        }
      </cx-page-header>
      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
        searchPlaceholder="Search roles..." [hasActions]="true" (query)="onQuery($event)">
        <ng-template #rowActions let-row>
          <div class="flex items-center gap-1 justify-end">
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)" title="Edit">
              <lucide-icon name="pencil" [size]="14"></lucide-icon>
            </button>
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openPerms(row)" title="Permissions">
              <lucide-icon name="shield" [size]="14"></lucide-icon>
            </button>
          </div>
        </ng-template>
      </cx-data-table>
    </div>

    <!-- Create/Edit Dialog -->
    <cx-form-dialog
      [open]="showForm()"
      [title]="editId ? 'Edit Role' : 'Create Role'"
      [subtitle]="editId ? 'Update role details' : 'Define a new user role'"
      [saving]="saving()" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="cx-form-stack">
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Name *</label><input class="cx-input" [(ngModel)]="form.name" placeholder="e.g. Credit Officer" /></div>
          <div><label class="cx-label">Slug *</label><input class="cx-input" [(ngModel)]="form.slug" placeholder="e.g. credit_officer" /></div>
        </div>
        <div><label class="cx-label">Description</label><textarea class="cx-input" rows="2" [(ngModel)]="form.description" placeholder="What this role is for..."></textarea></div>
      </div>
    </cx-form-dialog>

    <!-- Permissions Dialog -->
    <cx-form-dialog
      [open]="showPerms()"
      [title]="'Permissions — ' + permRoleName"
      [subtitle]="selPerms.length + ' permission(s) selected'"
      [saving]="savingPerms()" saveLabel="Save Permissions"
      maxWidth="760px" (close)="showPerms.set(false)" (save)="savePermissions()">
      <div class="cx-roles-perms">
        @for (mod of permModules(); track mod) {
          <div class="cx-roles-module">
            <div class="cx-roles-module-header">
              <div class="cx-roles-module-title">
                <lucide-icon name="folder-kanban" [size]="14"></lucide-icon>
                <span>{{ mod }}</span>
                <span class="cx-roles-module-count">{{ selectedInModule(mod) }}/{{ permsByModule(mod).length }}</span>
              </div>
              <button class="cx-roles-toggle-link" (click)="toggleModule(mod)">
                {{ isModuleFull(mod) ? 'Clear all' : 'Select all' }}
              </button>
            </div>
            <div class="cx-roles-chips">
              @for (p of permsByModule(mod); track p.id) {
                <button class="cx-roles-chip"
                        [class.is-selected]="selPerms.includes(p.id)"
                        (click)="togglePerm(p.id)"
                        type="button">
                  @if (selPerms.includes(p.id)) {
                    <lucide-icon name="check" [size]="11" class="cx-roles-chip-check"></lucide-icon>
                  }
                  {{ p.name }}
                </button>
              }
            </div>
          </div>
        }
      </div>
    </cx-form-dialog>
  `,
  styles: [`
    .cx-roles-perms { display: flex; flex-direction: column; gap: 0.85rem; }
    .cx-roles-module {
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-lg);
      overflow: hidden;
    }
    .cx-roles-module-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.65rem 0.9rem;
      background: var(--cx-surface-2);
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cx-roles-module-title {
      display: flex; align-items: center; gap: 0.5rem;
      font-size: var(--cx-text-xs); font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--cx-text-secondary);
    }
    .cx-roles-module-title lucide-icon { color: var(--cx-primary-600); }
    .cx-roles-module-count {
      background: var(--cx-primary-50);
      color: var(--cx-primary-700);
      padding: 2px 8px;
      border-radius: var(--cx-radius-pill);
      font-variant-numeric: tabular-nums;
      letter-spacing: 0;
    }
    .cx-roles-toggle-link {
      background: transparent; border: none;
      font-size: var(--cx-text-xs); font-weight: 500;
      color: var(--cx-primary-600);
      cursor: pointer;
      padding: 2px 6px;
      border-radius: var(--cx-radius-xs);
      transition: background var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-roles-toggle-link:hover { background: var(--cx-primary-50); }

    .cx-roles-chips {
      display: flex; flex-wrap: wrap; gap: 6px;
      padding: 0.85rem 0.9rem;
    }
    .cx-roles-chip {
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
    .cx-roles-chip:hover {
      border-color: var(--cx-primary-300, var(--cx-primary-200));
      color: var(--cx-text);
    }
    .cx-roles-chip.is-selected {
      background: var(--cx-primary-50);
      border-color: var(--cx-primary-600);
      color: var(--cx-primary-700);
      font-weight: 500;
    }
    .cx-roles-chip-check { color: var(--cx-primary-600); }
  `],
})
export class RolesComponent implements OnInit {
  columns: TableColumn[] = [{key:'name',label:'Role Name'},{key:'slug',label:'Slug'},{key:'description',label:'Description'},{key:'is_system',label:'System'},{key:'is_active',label:'Active'},{key:'created_at',label:'Created',type:'date'}];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {}; q: any = {};
  showPerms = signal(false); savingPerms = signal(false); permRoleName = ''; permRoleId = '';
  allPerms = signal<any[]>([]); selPerms: string[] = [];

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() {
    this.load();
    this.api.get('/permissions', { per_page: 200 }).subscribe({
      next: r => {
        const data = r.data || [];
        // API returns grouped: [{module, permissions: [...]}] — flatten to flat array
        if (data.length && data[0].permissions) {
          const flat: any[] = [];
          for (const group of data) {
            for (const p of group.permissions) flat.push(p);
          }
          this.allPerms.set(flat);
        } else {
          this.allPerms.set(data);
        }
      }
    });
  }

  load(p?: any) { this.loading.set(true); this.api.get('/roles', { ...this.q, ...p }).subscribe({ next: r => { this.rows.set(r.data || []); this.pagination.set(r.meta || null); this.loading.set(false); }, error: () => this.loading.set(false) }); }
  onQuery(e: TableQueryEvent) { this.q = e; this.load(e); }

  openForm(row?: any) {
    if (row) { this.editId = row.id; this.form = { name: row.name, slug: row.slug, description: row.description }; }
    else { this.editId = null; this.form = { name: '', slug: '', description: '' }; }
    this.showForm.set(true);
  }

  saveForm() {
    this.saving.set(true);
    (this.editId ? this.api.put('/roles/' + this.editId, this.form) : this.api.post('/roles', this.form)).subscribe({
      next: r => { this.saving.set(false); this.toast.success(r.message || 'Saved'); this.showForm.set(false); this.load(this.q); },
      error: e => { this.saving.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }

  openPerms(row: any) {
    this.permRoleName = row.name; this.permRoleId = row.id;
    this.selPerms = (row.permissions || []).map((p: any) => p.id);
    this.showPerms.set(true);
  }

  permModules(): string[] { return [...new Set(this.allPerms().map((p: any) => p.module))]; }
  permsByModule(mod: string): any[] { return this.allPerms().filter((p: any) => p.module === mod); }
  selectedInModule(mod: string): number {
    const ids = this.permsByModule(mod).map((p: any) => p.id);
    return ids.filter(id => this.selPerms.includes(id)).length;
  }
  isModuleFull(mod: string): boolean {
    const ids = this.permsByModule(mod).map((p: any) => p.id);
    return ids.length > 0 && ids.every(id => this.selPerms.includes(id));
  }
  togglePerm(id: string) { this.selPerms = this.selPerms.includes(id) ? this.selPerms.filter(x => x !== id) : [...this.selPerms, id]; }
  toggleModule(mod: string) {
    const ids = this.permsByModule(mod).map((p: any) => p.id);
    const allSelected = ids.every(id => this.selPerms.includes(id));
    if (allSelected) this.selPerms = this.selPerms.filter(id => !ids.includes(id));
    else this.selPerms = [...new Set([...this.selPerms, ...ids])];
  }

  savePermissions() {
    this.savingPerms.set(true);
    this.api.put('/roles/' + this.permRoleId + '/permissions', { permission_ids: this.selPerms }).subscribe({
      next: r => { this.savingPerms.set(false); this.toast.success('Permissions updated'); this.showPerms.set(false); this.load(this.q); },
      error: e => { this.savingPerms.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }
}
