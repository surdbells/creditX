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
import { SearchableSelectComponent, SelectOption } from '../../shared/components/searchable-select/searchable-select.component';

@Component({
  selector: 'app-approval-workflows', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent, SearchableSelectComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Approval Workflows" subtitle="Configure loan approval pipelines">
        @if (auth.hasPermission('products.create')) {
          <button class="cx-btn cx-btn-primary" (click)="openForm()"><lucide-icon name="plus" [size]="16"></lucide-icon> New Workflow</button>
        }
      </cx-page-header>
      <div class="cx-card !p-0 overflow-hidden">
        <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
          searchPlaceholder="Search workflows..." [hasActions]="true" (query)="onQuery($event)">
          <ng-template #rowActions let-row>
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)" title="Edit"><lucide-icon name="pencil" [size]="14"></lucide-icon></button>
          </ng-template>
        </cx-data-table>
      </div>
    </div>

    <cx-form-dialog [open]="showForm()" [title]="editId ? 'Edit Workflow' : 'Create Workflow'" [saving]="saving()" maxWidth="700px" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Workflow Name *</label><input class="cx-input" [(ngModel)]="form.name" /></div>
          <div><label class="cx-label">Loan Product *</label>
            <cx-searchable-select [options]="productOptions()" placeholder="Select product..." [(ngModel)]="form.product_id"></cx-searchable-select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Mode</label>
            <select class="cx-select" [(ngModel)]="form.mode">
              <option value="sequential">Sequential</option>
              <option value="parallel">Parallel</option>
            </select>
          </div>
          <div><label class="cx-label">Active</label>
            <select class="cx-select" [(ngModel)]="form.is_active">
              <option [ngValue]="true">Yes</option>
              <option [ngValue]="false">No</option>
            </select>
          </div>
        </div>

        <!-- Approval Steps -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="cx-label !mb-0">Approval Steps</label>
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="addStep()">
              <lucide-icon name="plus" [size]="12"></lucide-icon> Add Step
            </button>
          </div>
          @for (step of form.steps; track $index; let i = $index) {
            <div class="flex items-center gap-3 mb-2 p-3 rounded-xl border border-[var(--cx-border)] bg-[var(--cx-surface-hover)]/50">
              <span class="text-xs font-bold text-[var(--cx-text-muted)] w-6">{{ i + 1 }}</span>
              <div class="flex-1 grid grid-cols-2 gap-2">
                <input class="cx-input !py-1.5 !text-xs" placeholder="Step name" [(ngModel)]="step.name" />
                <cx-searchable-select [options]="roleOptions()" placeholder="Approver role..." [(ngModel)]="step.role_id"></cx-searchable-select>
              </div>
              <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon text-[var(--cx-danger)]" (click)="removeStep(i)">
                <lucide-icon name="trash-2" [size]="14"></lucide-icon>
              </button>
            </div>
          }
          @if (!form.steps?.length) {
            <p class="text-xs text-[var(--cx-text-muted)] text-center py-3">No approval steps defined. Add at least one step.</p>
          }
        </div>
      </div>
    </cx-form-dialog>
  `,
})
export class ApprovalWorkflowsComponent implements OnInit {
  columns: TableColumn[] = [
    { key: 'name', label: 'Workflow Name' },
    { key: 'product_name', label: 'Product' },
    { key: 'mode', label: 'Mode' },
    { key: 'steps_count', label: 'Steps', align: 'center' },
    { key: 'is_active', label: 'Active' },
    { key: 'created_at', label: 'Created', type: 'date' },
  ];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {}; q: any = {};
  products = signal<any[]>([]); roles = signal<any[]>([]);

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() {
    this.load();
    this.api.get('/loan-products', { per_page: 100 }).subscribe({ next: r => this.products.set(r.data || []) });
    this.api.get('/roles', { per_page: 50 }).subscribe({ next: r => this.roles.set(r.data || []) });
  }

  load(p?: any) { this.loading.set(true); this.api.get('/approval-workflows', { ...this.q, ...p }).subscribe({ next: r => { this.rows.set(r.data || []); this.pagination.set(r.meta || null); this.loading.set(false); }, error: () => this.loading.set(false) }); }
  onQuery(e: TableQueryEvent) { this.q = e; this.load(e); }

  productOptions(): SelectOption[] { return this.products().map((p: any) => ({ value: p.id, label: p.name })); }
  roleOptions(): SelectOption[] { return this.roles().map((r: any) => ({ value: r.id, label: r.name })); }

  openForm(row?: any) {
    if (row) {
      this.editId = row.id;
      this.form = { name: row.name, product_id: row.product_id, mode: row.mode, is_active: row.is_active, steps: (row.steps || []).map((s: any) => ({ name: s.name, role_id: s.role_id || s.approver_role_id })) };
    } else {
      this.editId = null;
      this.form = { name: '', product_id: '', mode: 'sequential', is_active: true, steps: [] };
    }
    this.showForm.set(true);
  }

  addStep() { this.form.steps = [...(this.form.steps || []), { name: '', role_id: '' }]; }
  removeStep(i: number) { this.form.steps.splice(i, 1); this.form.steps = [...this.form.steps]; }

  saveForm() {
    if (!this.form.name || !this.form.product_id) { this.toast.error('Name and product are required'); return; }
    this.saving.set(true);
    const payload = { ...this.form, steps: (this.form.steps || []).map((s: any, i: number) => ({ ...s, step_order: i + 1 })) };
    (this.editId ? this.api.put('/approval-workflows/' + this.editId, payload) : this.api.post('/approval-workflows', payload)).subscribe({
      next: r => { this.saving.set(false); this.toast.success(r.message || 'Saved'); this.showForm.set(false); this.load(this.q); },
      error: e => { this.saving.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }
}
