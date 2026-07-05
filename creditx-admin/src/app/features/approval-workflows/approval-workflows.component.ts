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
                    <label class="cx-wf-step-cond">
                      <input type="checkbox" [(ngModel)]="step.is_conditional" />
                      <span>Conditional step — skipped unless a routing condition below targets it</span>
                    </label>
                  </div>
                  <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon cx-wf-step-remove" (click)="removeStep(i)" title="Remove">
                    <lucide-icon name="trash-2" [size]="14"></lucide-icon>
                  </button>
                </div>
              }
            </div>
          }
        </div>

        <!-- Routing Conditions -->
        <div class="cx-wf-steps-section">
          <div class="cx-wf-steps-header">
            <h4 class="cx-form-section-title" style="margin: 0; border: none; padding: 0;">Routing Conditions</h4>
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="addCondition()" [disabled]="conditionalStepOptions().length === 0">
              <lucide-icon name="plus" [size]="12"></lucide-icon>
              <span>Add Condition</span>
            </button>
          </div>
          @if (conditionalStepOptions().length === 0) {
            <div class="cx-wf-cond-hint">
              <lucide-icon name="info" [size]="14"></lucide-icon>
              <span>Mark at least one step above as <strong>Conditional</strong> to use it as a routing target, then add a condition that injects it.</span>
            </div>
          }
          @if (form.conditions?.length) {
            <div class="cx-wf-steps-list">
              @for (cond of form.conditions; track $index; let ci = $index) {
                <div class="cx-wf-step">
                  <div class="cx-wf-cond-fields">
                    <div>
                      <label class="cx-label">When loan</label>
                      <select class="cx-select" [(ngModel)]="cond.field">
                        @for (f of fieldOptions; track f.value) {
                          <option [value]="f.value">{{ f.label }}</option>
                        }
                      </select>
                    </div>
                    <div>
                      <label class="cx-label">Operator</label>
                      <select class="cx-select" [(ngModel)]="cond.operator">
                        @for (o of operatorOptions; track o.value) {
                          <option [value]="o.value">{{ o.label }}</option>
                        }
                      </select>
                    </div>
                    <div>
                      <label class="cx-label">Value</label>
                      <input class="cx-input" [placeholder]="valuePlaceholder(cond.field)" [(ngModel)]="cond.value" />
                    </div>
                    <div>
                      <label class="cx-label">Then add step</label>
                      <select class="cx-select" [(ngModel)]="cond.additional_step_index">
                        <option [ngValue]="null" disabled>Select step...</option>
                        @for (s of conditionalStepOptions(); track s.value) {
                          <option [ngValue]="s.value">{{ s.label }}</option>
                        }
                      </select>
                    </div>
                  </div>
                  <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon cx-wf-step-remove" (click)="removeCondition(ci)" title="Remove">
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

    /* Conditional-step toggle inside a step card */
    .cx-wf-step-cond {
      grid-column: 1 / -1;
      display: flex; align-items: center; gap: 0.5rem;
      font-size: var(--cx-text-xs); color: var(--cx-text-muted);
      cursor: pointer;
    }
    .cx-wf-step-cond input { width: 14px; height: 14px; flex-shrink: 0; }

    /* Routing condition row: field / operator / value / target step */
    .cx-wf-cond-fields {
      flex: 1;
      display: grid;
      grid-template-columns: 1.3fr 1.1fr 0.9fr 1.4fr;
      gap: 0.75rem;
      min-width: 0;
    }
    @media (max-width: 720px) { .cx-wf-cond-fields { grid-template-columns: 1fr 1fr; } }
    .cx-wf-cond-hint {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.75rem 0.9rem;
      background: var(--cx-stone-50);
      border: 1px dashed var(--cx-border);
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm); color: var(--cx-text-muted);
    }
    .cx-wf-cond-hint lucide-icon { flex-shrink: 0; color: var(--cx-primary-600); }
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

  // Mirror of backend ApprovalCondition::fieldOptions() — keep in sync.
  fieldOptions = [
    { value: 'amount', label: 'Loan Amount' },
    { value: 'tenure', label: 'Tenure (months)' },
    { value: 'product_code', label: 'Product Code' },
    { value: 'branch_id', label: 'Branch' },
    { value: 'loan_type', label: 'Loan Type' },
    { value: 'dsr', label: 'Debt-Service Ratio (DSR)' },
  ];
  // Mirror of backend ConditionOperator enum.
  operatorOptions = [
    { value: 'gt', label: 'is greater than' },
    { value: 'gte', label: 'is at least' },
    { value: 'lt', label: 'is less than' },
    { value: 'lte', label: 'is at most' },
    { value: 'eq', label: 'equals' },
    { value: 'in', label: 'is one of' },
  ];

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() {
    this.load();
    // Products + roles for the builder come from the workflow meta endpoint
    // (gated by the workflow permission), so managing workflows doesn't also
    // require roles.view — which was leaving the step role dropdown empty.
    this.api.get('/approval-workflows/meta').subscribe({
      next: r => { this.products.set(r.data?.products || []); this.roles.set(r.data?.roles || []); },
      error: () => { this.products.set([]); this.roles.set([]); },
    });
  }

  load(p?: any) { this.loading.set(true); this.api.get('/approval-workflows', { ...this.q, ...p }).subscribe({ next: r => { this.rows.set(r.data || []); this.pagination.set(r.meta || null); this.loading.set(false); }, error: () => this.loading.set(false) }); }
  onQuery(e: TableQueryEvent) { this.q = e; this.load(e); }

  productOptions(): SelectOption[] { return this.products().map((p: any) => ({ value: p.id, label: p.name })); }
  roleOptions(): SelectOption[] { return this.roles().map((r: any) => ({ value: r.id, label: r.name })); }

  openForm(row?: any) {
    if (row) {
      this.editId = row.id;
      const steps = (row.steps || []).map((s: any) => ({ name: s.name, role_id: s.role_id || s.approver_role_id, is_conditional: !!s.is_conditional }));
      // Conditions reference their target step by ID on the backend; map it
      // back to a position index so the form's step dropdown stays valid even
      // after steps are reordered/rebuilt.
      const stepIdIndex = new Map<string, number>((row.steps || []).map((s: any, i: number) => [s.id, i]));
      const conditions = (row.conditions || []).map((c: any) => ({
        field: c.field,
        operator: c.operator,
        value: c.value,
        additional_step_index: stepIdIndex.has(c.additional_step_id) ? stepIdIndex.get(c.additional_step_id) : null,
        is_active: c.is_active !== false,
      }));
      this.form = { name: row.name, product_id: row.product_id, mode: row.mode, is_active: row.is_active, steps, conditions };
    } else {
      this.editId = null;
      this.form = { name: '', product_id: '', mode: 'sequential', is_active: true, steps: [], conditions: [] };
    }
    this.showForm.set(true);
  }

  addStep() { this.form.steps = [...(this.form.steps || []), { name: '', role_id: '', is_conditional: false }]; }
  removeStep(i: number) {
    this.form.steps.splice(i, 1);
    this.form.steps = [...this.form.steps];
    // Drop conditions whose target step no longer exists, and re-anchor
    // indexes that shifted because a step above them was removed.
    this.form.conditions = (this.form.conditions || [])
      .map((c: any) => {
        if (c.additional_step_index == null) return c;
        if (c.additional_step_index === i) return { ...c, additional_step_index: null };
        return c.additional_step_index > i ? { ...c, additional_step_index: c.additional_step_index - 1 } : c;
      });
  }

  addCondition() {
    const first = this.conditionalStepOptions()[0];
    this.form.conditions = [...(this.form.conditions || []), { field: 'dsr', operator: 'gt', value: '', additional_step_index: first ? first.value : null, is_active: true }];
  }
  removeCondition(i: number) { this.form.conditions.splice(i, 1); this.form.conditions = [...this.form.conditions]; }

  /** Steps marked conditional, as {value: index, label} options for the target dropdown. */
  conditionalStepOptions(): { value: number; label: string }[] {
    return (this.form.steps || [])
      .map((s: any, i: number) => ({ s, i }))
      .filter((x: any) => x.s.is_conditional)
      .map((x: any) => ({ value: x.i, label: `Step ${x.i + 1}: ${x.s.name || '(unnamed)'}` }));
  }

  valuePlaceholder(field: string): string {
    switch (field) {
      case 'dsr': return 'e.g. 0.4 (40% ratio)';
      case 'amount': return 'e.g. 5000000';
      case 'tenure': return 'e.g. 12';
      case 'loan_type': return 'e.g. top_up';
      case 'product_code': return 'e.g. PAYDAY';
      case 'branch_id': return 'branch UUID';
      default: return 'threshold value';
    }
  }

  saveForm() {
    if (!this.form.name || !this.form.product_id) { this.toast.error('Name and product are required'); return; }
    // Only submit conditions that target a valid step; a null target would
    // be silently dropped by the backend and confuse the admin.
    const conditions = (this.form.conditions || []).filter((c: any) => c.additional_step_index != null && c.value !== '' && c.value != null);
    if ((this.form.conditions || []).length > 0 && conditions.length !== this.form.conditions.length) {
      this.toast.error('Every routing condition needs a value and a target step'); return;
    }
    this.saving.set(true);
    const payload = {
      ...this.form,
      steps: (this.form.steps || []).map((s: any, i: number) => ({ ...s, step_order: i + 1 })),
      conditions: conditions.map((c: any) => ({
        field: c.field,
        operator: c.operator,
        value: String(c.value),
        additional_step_index: c.additional_step_index,
        is_active: c.is_active !== false,
      })),
    };
    (this.editId ? this.api.put('/approval-workflows/' + this.editId, payload) : this.api.post('/approval-workflows', payload)).subscribe({
      next: r => { this.saving.set(false); this.toast.success(r.message || 'Saved'); this.showForm.set(false); this.load(this.q); },
      error: e => { this.saving.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }
}
