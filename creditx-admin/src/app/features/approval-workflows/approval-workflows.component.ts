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
      <cx-page-header
        title="Approval Workflows"
        subtitle="Define multi-step approval pipelines per loan product"
        eyebrow="Workflow">
        @if (auth.hasPermission('products.create')) {
          <button class="cx-btn cx-btn-primary" (click)="openForm()">
            <lucide-icon name="plus" [size]="14"></lucide-icon>
            <span>New Workflow</span>
          </button>
        }
      </cx-page-header>
      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
        searchPlaceholder="Search workflows..." [hasActions]="true" (query)="onQuery($event)">
        <ng-template #rowActions let-row>
          <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)" title="Edit">
            <lucide-icon name="pencil" [size]="14"></lucide-icon>
          </button>
        </ng-template>
      </cx-data-table>
    </div>

    <cx-form-dialog
      [open]="showForm()"
      [title]="editId ? 'Edit Workflow' : 'Create Workflow'"
      [subtitle]="editId ? 'Update approval pipeline' : 'Configure a new approval pipeline'"
      [saving]="saving()" maxWidth="720px" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="cx-form-stack">
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Workflow Name *</label><input class="cx-input" [(ngModel)]="form.name" placeholder="e.g. Payroll Loan Approval" /></div>
          <div>
            <label class="cx-label">Loan Product *</label>
            <cx-searchable-select [options]="productOptions()" placeholder="Select product..." [(ngModel)]="form.product_id"></cx-searchable-select>
          </div>
        </div>
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Mode</label>
            <select class="cx-select" [(ngModel)]="form.mode">
              <option value="sequential">Sequential</option>
              <option value="parallel">Parallel</option>
            </select>
          </div>
          <div>
            <label class="cx-label">Status</label>
            <select class="cx-select" [(ngModel)]="form.is_active">
              <option [ngValue]="true">Active</option>
              <option [ngValue]="false">Inactive</option>
            </select>
          </div>
        </div>

        <!-- Approval Steps -->
        <div class="cx-wf-steps-section">
          <div class="cx-wf-steps-header">
            <h4 class="cx-form-section-title" style="margin: 0; border: none; padding: 0;">Approval Steps</h4>
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="addStep()">
              <lucide-icon name="plus" [size]="12"></lucide-icon>
              <span>Add Step</span>
            </button>
          </div>
          @if (!form.steps?.length) {
            <div class="cx-wf-steps-empty">No approval steps defined. Add at least one step.</div>
          } @else {
            <div class="cx-wf-steps-list">
              @for (step of form.steps; track $index; let i = $index) {
                <div class="cx-wf-step">
                  <div class="cx-wf-step-number">{{ i + 1 }}</div>
                  <div class="cx-wf-step-fields">
                    <div>
                      <label class="cx-label">Step Name</label>
                      <input class="cx-input" placeholder="e.g. Credit Manager Review" [(ngModel)]="step.name" />
                    </div>
                    <div>
                      <label class="cx-label">Approver Role</label>
                      <cx-searchable-select [options]="roleOptions()" placeholder="Select role..." [(ngModel)]="step.role_id"></cx-searchable-select>
                    </div>
                  </div>
                  <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon cx-wf-step-remove" (click)="removeStep(i)" title="Remove">
                    <lucide-icon name="trash-2" [size]="14"></lucide-icon>
                  </button>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </cx-form-dialog>
  `,
  styles: [`
    .cx-wf-steps-section { margin-top: 0.5rem; padding-top: 1rem; border-top: 1px solid var(--cx-border-subtle); }
    .cx-wf-steps-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 0.75rem;
    }
    .cx-wf-steps-empty {
      padding: 1.25rem;
      background: var(--cx-stone-50);
      border: 1px dashed var(--cx-border);
      border-radius: var(--cx-radius-md);
      text-align: center;
      font-size: var(--cx-text-sm);
      color: var(--cx-text-muted);
    }
    .cx-wf-steps-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .cx-wf-step {
      display: flex; align-items: flex-start; gap: 0.75rem;
      padding: 0.85rem;
      background: var(--cx-stone-50);
      border: 1px solid var(--cx-border-subtle);
      border-radius: var(--cx-radius-md);
    }
    .cx-wf-step-number {
      width: 28px; height: 28px; flex-shrink: 0;
      border-radius: 50%;
      background: var(--cx-primary-600);
      color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: var(--cx-text-xs); font-weight: 600;
      margin-top: 18px;
    }
    .cx-wf-step-fields {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
      min-width: 0;
    }
    @media (max-width: 640px) { .cx-wf-step-fields { grid-template-columns: 1fr; } }
    .cx-wf-step-remove { color: var(--cx-danger); margin-top: 22px; }
    .cx-wf-step-remove:hover { background: var(--cx-danger-50); }
  `],
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
