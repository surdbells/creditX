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
      <cx-page-header title="Role Management" subtitle="Configure roles and assign permissions">
        @if (auth.hasPermission('roles.create')) {
          <button class="cx-btn cx-btn-primary" (click)="openForm()"><lucide-icon name="plus" [size]="16"></lucide-icon> Add Role</button>
        }
      </cx-page-header>
      <div class="cx-card !p-4">
        <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
          searchPlaceholder="Search roles..." [hasActions]="true" (query)="onQuery($event)">
          <ng-template #rowActions let-row>
            <div class="flex items-center gap-1">
              <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)" title="Edit"><lucide-icon name="pencil" [size]="14"></lucide-icon></button>
              <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openPerms(row)" title="Permissions"><lucide-icon name="shield" [size]="14"></lucide-icon></button>
            </div>
          </ng-template>
        </cx-data-table>
      </div>
    </div>

    <!-- Create/Edit Dialog -->
    <cx-form-dialog [open]="showForm()" [title]="editId ? 'Edit Role' : 'Create Role'" [saving]="saving()" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="space-y-4">
        <div><label class="cx-label">Name *</label><input class="cx-input" [(ngModel)]="form.name" /></div>
        <div><label class="cx-label">Slug *</label><input class="cx-input" [(ngModel)]="form.slug" /></div>
        <div><label class="cx-label">Description</label><textarea class="cx-input" rows="2" [(ngModel)]="form.description"></textarea></div>
      </div>
    </cx-form-dialog>

    <!-- Permissions Dialog -->
    <cx-form-dialog [open]="showPerms()" [title]="'Permissions — ' + permRoleName" [saving]="savingPerms()" saveLabel="Save Permissions"
      maxWidth="700px" (close)="showPerms.set(false)" (save)="savePermissions()">
      <div class="space-y-4">
        @for (mod of permModules(); track mod) {
          <div class="border border-[var(--cx-border)] rounded-xl overflow-hidden">
            <div class="flex items-center justify-between px-4 py-2.5 bg-[var(--cx-surface-hover)]">
              <span class="text-xs font-semibold uppercase tracking-wider text-[var(--cx-text-muted)]">{{ mod }}</span>
              <button class="text-xs text-[var(--cx-primary)] font-medium" (click)="toggleModule(mod)">Toggle All</button>
            </div>
            <div class="px-4 py-3 flex flex-wrap gap-2">
              @for (p of permsByModule(mod); track p.id) {
                <label class="text-xs cursor-pointer px-3 py-1.5 rounded-lg border transition-all"
                       [class]="selPerms.includes(p.id) ? 'bg-[var(--cx-primary-50)] border-[var(--cx-primary)] text-[var(--cx-primary)] font-medium' : 'border-[var(--cx-border)] text-[var(--cx-text-secondary)]'">
                  <input type="checkbox" [checked]="selPerms.includes(p.id)" (change)="togglePerm(p.id)" class="sr-only" />
                  {{ p.name }}
                </label>
              }
            </div>
          </div>
        }
      </div>
    </cx-form-dialog>
  `,
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
