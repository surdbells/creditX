import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Pencil } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { SettingsService } from '../../core/services/settings.service';
import { SearchableSelectDirective } from '../../shared/directives/searchable-select.directive';
@Component({
  selector: 'app-loan-products', standalone: true,
  imports: [SearchableSelectDirective, CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Loan Products"
        subtitle="Configure loan types, interest methods, and attached fees"
        eyebrow="Configuration">
        <button class="cx-btn cx-btn-primary" (click)="openForm()">
          <lucide-icon name="plus" [size]="14"></lucide-icon>
          <span>Add Product</span>
        </button>
      </cx-page-header>
      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()" searchPlaceholder="Search products..." [hasActions]="true" (query)="onQuery($event)">
        <ng-template #rowActions let-row>
          <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)" title="Edit">
            <lucide-icon name="pencil" [size]="14"></lucide-icon>
          </button>
        </ng-template>
      </cx-data-table>
    </div>
    <cx-form-dialog
      [open]="showForm()"
      [title]="editId ? 'Edit Product' : 'Create Product'"
      [subtitle]="editId ? 'Update loan product configuration' : 'Define a new loan product'"
      [saving]="saving()" maxWidth="720px" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="cx-form-stack">
        <!-- Identity -->
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Name *</label><input class="cx-input" [(ngModel)]="form.name" placeholder="e.g. Payroll Loan" /></div>
          <div><label class="cx-label">Code *</label><input class="cx-input" [(ngModel)]="form.code" placeholder="e.g. PAYROLL" /></div>
        </div>
        <div><label class="cx-label">Description</label><input class="cx-input" [(ngModel)]="form.description" placeholder="Short product description" /></div>

        <!-- Interest -->
        <h4 class="cx-form-section-title">Interest</h4>
        <div class="cx-form-row cx-form-row-3">
          <div>
            <label class="cx-label">Method *</label>
            <select class="cx-select" [(ngModel)]="form.interest_calculation_method">
              <option value="flat_rate">Flat Rate</option>
              <option value="reducing_balance">Reducing Balance</option>
              <option value="amortized">Amortized (EMI)</option>
            </select>
          </div>
          <div>
            <label class="cx-label">Interest Rate (fraction)</label>
            <input class="cx-input" type="number" step="0.0001" min="0" max="1"
                   [(ngModel)]="form.interest_rate" placeholder="e.g. 0.05" />
            <div class="cx-field-hint">Enter as a fraction: 0.05 = 5%, 0.035 = 3.5%</div>
          </div>
          <div>
            <label class="cx-label">Allows Top-up</label>
            <select class="cx-select" [(ngModel)]="form.allows_top_up">
              <option [ngValue]="true">Yes</option>
              <option [ngValue]="false">No</option>
            </select>
          </div>
        </div>

        <!-- Limits -->
        <h4 class="cx-form-section-title">Limits</h4>
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Min Amount ({{ settings.currencySymbol() }})</label><input class="cx-input" type="number" [(ngModel)]="form.min_amount" /></div>
          <div><label class="cx-label">Max Amount ({{ settings.currencySymbol() }})</label><input class="cx-input" type="number" [(ngModel)]="form.max_amount" /></div>
        </div>
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Min Tenure (months)</label><input class="cx-input" type="number" [(ngModel)]="form.min_tenure" /></div>
          <div><label class="cx-label">Max Tenure (months)</label><input class="cx-input" type="number" [(ngModel)]="form.max_tenure" /></div>
        </div>
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Max Age (years)</label><input class="cx-input" type="number" [(ngModel)]="form.max_age" /></div>
          <div><label class="cx-label">Max Service Years</label><input class="cx-input" type="number" [(ngModel)]="form.max_years_of_service" /></div>
        </div>

        <!-- Status -->
        <h4 class="cx-form-section-title">Status</h4>
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Product Status</label>
            <select class="cx-select" [(ngModel)]="form.is_active">
              <option [ngValue]="true">Active</option>
              <option [ngValue]="false">Inactive</option>
            </select>
            <div class="cx-field-hint">Inactive products are hidden from new loan capture.</div>
          </div>
        </div>

        <!-- Where this product is offered -->
        <h4 class="cx-form-section-title">Availability</h4>
        <p class="cx-field-hint" style="margin-top:-6px">
          Which channels may originate a loan against this product. Turning one off hides
          the product there; it stays visible here so you can always switch it back on.
        </p>
        <div class="cx-lp-channels">
          <label class="cx-lp-check">
            <input type="checkbox" [(ngModel)]="form.available_agent_app" />
            <span><strong>Agent app</strong><em>Field agents can capture against it</em></span>
          </label>
          <label class="cx-lp-check">
            <input type="checkbox" [(ngModel)]="form.available_portal" />
            <span><strong>Customer portal</strong><em>Customers can apply themselves online</em></span>
          </label>
          <label class="cx-lp-check">
            <input type="checkbox" [(ngModel)]="form.available_back_office" />
            <span><strong>Back office</strong><em>Staff can originate from the admin app</em></span>
          </label>
        </div>
        @if (!form.available_agent_app && !form.available_portal && !form.available_back_office) {
          <p class="cx-lp-warn">
            <lucide-icon name="alert-triangle" [size]="13"></lucide-icon>
            <span>No channel selected — no new loans can be originated against this product anywhere.</span>
          </p>
        }

        <!-- Documents required for this product -->
        <div class="cx-lp-docs-section">
          <div class="cx-lp-fees-header">
            <h4 class="cx-form-section-title" style="margin:0; border:none; padding:0;">Required Documents</h4>
            @if (!docsConfigured) {
              <span class="cx-lp-inherit">Using global defaults</span>
            } @else {
              <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="resetDocuments()">Reset to defaults</button>
            }
          </div>
          <p class="cx-field-hint">
            Tick the documents this product asks for, and mark which block submission.
            Leave every box unticked to fall back to the global document defaults.
          </p>
          @if (docs.length === 0) {
            <div class="cx-lp-fees-empty">No document types defined yet — add them under Document Types.</div>
          } @else {
            <div class="cx-lp-docs">
              @for (d of docs; track d.document_type_id) {
                <div class="cx-lp-doc-row" [class.is-on]="d.included">
                  <label class="cx-lp-doc-name">
                    <input type="checkbox" [(ngModel)]="d.included" />
                    <span>{{ d.label }}</span>
                  </label>
                  <label class="cx-lp-doc-req" [class.is-off]="!d.included">
                    <input type="checkbox" [(ngModel)]="d.is_required" [disabled]="!d.included" />
                    <span>Required</span>
                  </label>
                  @if (d.included && d.global_required && !d.is_required) {
                    <span class="cx-lp-doc-note" title="This document is required by default; this product makes it optional.">
                      relaxed
                    </span>
                  }
                </div>
              }
            </div>
          }
        </div>

        <!-- Attached Fees -->
        <div class="cx-lp-fees-section">
          <div class="cx-lp-fees-header">
            <h4 class="cx-form-section-title" style="margin: 0; border: none; padding: 0;">Attached Fees</h4>
            <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="addFee()">
              <lucide-icon name="plus" [size]="12"></lucide-icon>
              <span>Add Fee</span>
            </button>
          </div>
          @if (fees.length === 0) {
            <div class="cx-lp-fees-empty">No fees attached. Click "Add Fee" to configure charges.</div>
          } @else {
            <div class="cx-lp-fees-list">
              @for (fee of fees; track $index; let i = $index) {
                <div class="cx-lp-fee-row">
                  <div class="cx-lp-fee-field">
                    <label class="cx-label">Fee Type</label>
                    <select class="cx-select" [(ngModel)]="fee.fee_type_id">
                      <option value="">Select…</option>
                      @for (ft of feeTypes(); track ft.id) { <option [value]="ft.id">{{ ft.name }}</option> }
                    </select>
                  </div>
                  <div class="cx-lp-fee-field">
                    <label class="cx-label">Type</label>
                    <select class="cx-select" [(ngModel)]="fee.calculation_type">
                      <option value="flat">Flat</option>
                      <option value="percentage">%</option>
                    </select>
                  </div>
                  <div class="cx-lp-fee-field">
                    <label class="cx-label">
                      {{ fee.calculation_type === 'percentage' ? 'Fraction' : 'Amount (' + settings.currencySymbol() + ')' }}
                    </label>
                    <input class="cx-input" type="number"
                           [attr.step]="fee.calculation_type === 'percentage' ? '0.0001' : '1'"
                           [attr.min]="0"
                           [attr.max]="fee.calculation_type === 'percentage' ? 1 : null"
                           [(ngModel)]="fee.value"
                           [placeholder]="fee.calculation_type === 'percentage' ? 'e.g. 0.02' : 'e.g. 2000'" />
                    @if (fee.calculation_type === 'percentage') {
                      <div class="cx-field-hint">0.02 = 2%</div>
                    }
                  </div>
                  <div class="cx-lp-fee-field">
                    <label class="cx-label">Effect</label>
                    <select class="cx-select" [(ngModel)]="fee.effect">
                      <option value="adds_to_gross">Adds to Gross Loan</option>
                      <option value="deducted_from_disbursement">Deducted from Disbursement</option>
                    </select>
                    <div class="cx-field-hint">
                      @if (fee.effect === 'adds_to_gross') {
                        Increases gross; customer repays over term
                      } @else {
                        Reduces what customer receives; not repaid
                      }
                    </div>
                  </div>
                  @if (fee.calculation_type === 'percentage') {
                    <div class="cx-lp-fee-field">
                      <label class="cx-label">Base</label>
                      <select class="cx-select" [(ngModel)]="fee.applies_to">
                        <option value="principal">Principal</option>
                        <option value="gross_loan">Gross Loan</option>
                      </select>
                    </div>
                  } @else {
                    <!-- Placeholder cell for flat fees so the delete button
                         stays in the correct grid column (right edge). -->
                    <div aria-hidden="true"></div>
                  }
                  <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon cx-lp-fee-remove" (click)="fees.splice(i,1)" title="Remove">
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
    .cx-lp-fees-section { margin-top: 0.5rem; padding-top: 1rem; border-top: 1px solid var(--cx-border-subtle); }
    .cx-lp-fees-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 0.75rem;
    }
    .cx-lp-fees-empty {
      padding: 1.25rem;
      background: var(--cx-stone-50);
      border: 1px dashed var(--cx-border);
      border-radius: var(--cx-radius-md);
      text-align: center;
      font-size: var(--cx-text-sm);
      color: var(--cx-text-muted);
    }
    .cx-lp-fees-list { display: flex; flex-direction: column; gap: 0.5rem; }

    /* Grid-based fee row. One row per fee. Columns are sized so the
       longest dropdown labels ("Deducted from Disbursement",
       "Adds to Gross Loan") fit without truncation. Hints appear in a
       second grid row that's only populated where relevant, so they
       never shift input alignment. */
    .cx-lp-fee-row {
      display: grid;
      grid-template-columns:
        minmax(140px, 1.4fr)     /* Fee Type           */
        84px                      /* Type (flat/%)       */
        minmax(96px, 120px)       /* Amount / Fraction   */
        minmax(200px, 1.6fr)      /* Effect              */
        minmax(96px, 120px)       /* Base (if %)         */
        32px;                     /* Delete button       */
      grid-auto-rows: min-content;
      column-gap: 0.5rem;
      row-gap: 0.25rem;
      align-items: start;
      padding: 0.75rem;
      background: var(--cx-stone-50);
      border: 1px solid var(--cx-border-subtle);
      border-radius: var(--cx-radius-md);
    }

    .cx-lp-fee-field { display: flex; flex-direction: column; min-width: 0; }

    /* The delete button sits at the end of the grid. Vertically aligned
       with the input (labels are above inputs, button has no label). */
    .cx-lp-fee-remove {
      align-self: end;
      color: var(--cx-danger);
      margin-bottom: 2px;
    }
    .cx-lp-fee-remove:hover { background: var(--cx-danger-50); }

    /* Hints: small muted helper text below the inputs. Don't affect
       alignment of sibling fields because each hint is scoped to its
       own field's flex column. */
    .cx-lp-fee-field .cx-field-hint {
      margin-top: 0.2rem;
      line-height: 1.35;
    }

    /* When the "Base" column isn't rendered (flat fees), leave the
       cell empty so the grid column structure stays stable. This
       prevents the delete button from jumping left. */

    /* Tablet — tighter columns, slightly smaller Effect minmax */
    @media (max-width: 960px) {
      .cx-lp-fee-row {
        grid-template-columns:
          minmax(120px, 1.2fr)
          72px
          minmax(88px, 110px)
          minmax(170px, 1.4fr)
          minmax(88px, 110px)
          32px;
      }
    }

    /* ── Availability channels ───────────────────────────────────────────
       These and the document rules below MUST stay outside the mobile media
       query. They were nested inside it, so on any viewport wider than 640px
       the checkboxes and their labels rendered completely unstyled — running
       inline as raw text with no cards, spacing or hierarchy. */
    .cx-lp-channels { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:8px; margin-top:10px; }
    .cx-lp-check { display:flex; gap:9px; align-items:flex-start; padding:10px 12px; cursor:pointer;
      border:1px solid var(--cx-border); border-radius:var(--cx-radius-md); }
    .cx-lp-check input { margin-top:3px; }
    .cx-lp-check strong { display:block; font-size:13px; font-weight:600; color:var(--cx-text); }
    .cx-lp-check em { display:block; font-style:normal; font-size:11.5px; color:var(--cx-text-muted); margin-top:2px; }
    .cx-lp-warn { display:flex; gap:7px; align-items:center; font-size:12px; margin:8px 0 0; padding:8px 11px;
      border-radius:var(--cx-radius-md); background:color-mix(in srgb, var(--cx-warning) 12%, transparent); color:var(--cx-warning); }

    .cx-lp-docs-section { border-top:1px solid var(--cx-border); padding-top:14px; margin-top:14px; }
    .cx-lp-inherit { font-size:11px; padding:2px 9px; border-radius:999px;
      background:var(--cx-surface-2, var(--cx-stone-100)); color:var(--cx-text-muted); }
    .cx-lp-docs { display:flex; flex-direction:column; gap:4px; margin-top:8px; }
    .cx-lp-doc-row { display:flex; align-items:center; gap:12px; padding:7px 10px; border-radius:8px;
      border:1px solid transparent; }
    .cx-lp-doc-row.is-on { border-color:var(--cx-border); background:var(--cx-surface-2, transparent); }
    .cx-lp-doc-name { display:flex; align-items:center; gap:8px; flex:1; cursor:pointer; font-size:13px; color:var(--cx-text); }
    .cx-lp-doc-req { display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12px; color:var(--cx-text-secondary); }
    .cx-lp-doc-req.is-off { opacity:.4; cursor:not-allowed; }
    .cx-lp-doc-note { font-size:10px; text-transform:uppercase; letter-spacing:.04em; padding:2px 7px;
      border-radius:999px; background:color-mix(in srgb, var(--cx-warning) 14%, transparent); color:var(--cx-warning); }

    /* Mobile — stack everything into two columns. Fee Type spans full
       width; the others flow two-per-row. Delete button sits in the
       top-right corner. */
    @media (max-width: 640px) {
      .cx-lp-fee-row {
        grid-template-columns: 1fr 1fr 32px;
      }
      /* Fee Type spans all three columns on its own row */
      .cx-lp-fee-row > .cx-lp-fee-field:first-child { grid-column: 1 / 4; }

      /* Delete sits floated in the corner */
      .cx-lp-fee-row > .cx-lp-fee-remove {
        grid-column: 3 / 4;
        grid-row: 1 / 2;
        align-self: center;
      }

      /* The "Required" toggle wraps under the document name on narrow screens. */
      .cx-lp-doc-row { flex-wrap: wrap; gap: 6px 10px; }
    }
  `],
})
export class LoanProductsComponent implements OnInit {
  columns: TableColumn[] = [{key:'name',label:'Product Name'},{key:'code',label:'Code'},{key:'interest_calculation_method',label:'Method'},{key:'interest_rate',label:'Rate'},{key:'min_amount',label:'Min',type:'currency'},{key:'max_amount',label:'Max',type:'currency'},{key:'is_active',label:'Active'}];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {}; fees: any[] = []; q: any = {};
  feeTypes = signal<any[]>([]);

  /**
   * Document rows for the form: every ACTIVE catalogue type, each with
   * `included` (does this product ask for it) and `is_required` (does it block
   * submission here). Showing the whole catalogue rather than only the
   * product's rows is what makes adding a document a tick rather than a search.
   */
  docs: any[] = [];
  /** True when the product has its own list rather than inheriting defaults. */
  docsConfigured = false;
  private docTypes: any[] = [];

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService, public settings: SettingsService) {}

  ngOnInit() {
    this.load();
    this.api.get('/fee-types',{per_page:100}).subscribe({next:r=>this.feeTypes.set(r.data||[])});
    this.api.get('/document-types',{active:true}).subscribe({next:r=>this.docTypes=r.data||[]});
  }

  /** Blank document rows — every catalogue type, nothing ticked. */
  private blankDocs(): any[] {
    return this.docTypes.map(dt => ({
      document_type_id: dt.id, label: dt.label, code: dt.code,
      global_required: !!dt.is_required, included: false, is_required: false,
    }));
  }

  /**
   * Load a product's configured documents. A product that has never been
   * configured returns `configured: false`, and we show its inherited defaults
   * ticked — so opening the form and saving preserves current behaviour rather
   * than silently clearing every requirement.
   */
  private loadDocs(productId: string): void {
    this.docs = this.blankDocs();
    this.docsConfigured = false;
    this.api.get(`/loan-products/${productId}/documents`).subscribe({
      next: r => {
        this.docsConfigured = !!r.data?.configured;
        const byId = new Map((r.data?.documents || []).map((d: any) => [d.document_type_id, d]));
        this.docs = this.blankDocs().map(row => {
          const hit: any = byId.get(row.document_type_id);
          return hit ? { ...row, included: true, is_required: !!hit.is_required } : row;
        });
      },
      error: () => { /* non-fatal — the form falls back to an unticked list */ },
    });
  }

  /** Clear the override so the product goes back to the global catalogue. */
  resetDocuments(): void {
    this.docs = this.blankDocs();
    this.docsConfigured = false;
  }
  load(p?:any) { this.loading.set(true); this.api.get('/loan-products',{...this.q,...p}).subscribe({next:r=>{this.rows.set(r.data||[]);this.pagination.set(r.meta||null);this.loading.set(false);},error:()=>this.loading.set(false)}); }
  onQuery(e:TableQueryEvent) { this.q=e; this.load(e); }
  openForm(row?:any) {
    if(row){this.editId=row.id;this.form={name:row.name,code:row.code,description:row.description,interest_calculation_method:row.interest_calculation_method,interest_rate:row.interest_rate,min_amount:row.min_amount,max_amount:row.max_amount,min_tenure:row.min_tenure,max_tenure:row.max_tenure,max_age:row.max_age,max_years_of_service:row.max_years_of_service,allows_top_up:row.allows_top_up,is_active:row.is_active,
      // Channels default to true for products created before this feature,
      // where the API may not carry the flags yet.
      available_agent_app:row.available_agent_app!==false,available_portal:row.available_portal!==false,available_back_office:row.available_back_office!==false};
      this.fees=(row.fees||[]).map((f:any)=>({fee_type_id:f.fee_type_id,calculation_type:f.calculation_type,value:f.value,effect:f.effect||'deducted_from_disbursement',applies_to:f.applies_to||'principal'}));
      this.loadDocs(row.id);}
    else{this.editId=null;this.form={name:'',code:'',description:'',interest_calculation_method:'flat_rate',interest_rate:'',min_amount:'',max_amount:'',min_tenure:1,max_tenure:24,max_age:60,max_years_of_service:35,allows_top_up:false,is_active:true,
      available_agent_app:true,available_portal:true,available_back_office:true};
      this.fees=[];this.docs=this.blankDocs();this.docsConfigured=false;}
    this.showForm.set(true);
  }
  addFee() { this.fees.push({fee_type_id:'',calculation_type:'flat',value:'',effect:'deducted_from_disbursement',applies_to:'principal'}); }
  saveForm() {
    this.saving.set(true);
    const p = { ...this.form, fees: this.fees.filter(f => f.fee_type_id) };
    (this.editId ? this.api.put('/loan-products/' + this.editId, p) : this.api.post('/loan-products', p)).subscribe({
      next: r => {
        // Documents live on their own endpoint, so save them against the id the
        // product now has — which for a create is only known from the response.
        const id = this.editId || r.data?.id;
        if (!id) { this.finishSave(r.message); return; }
        this.saveDocuments(id, r.message);
      },
      error: e => { this.saving.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }

  /**
   * Persist the document selection. An empty list is sent deliberately — that
   * is what clears an override and returns the product to the global defaults.
   */
  private saveDocuments(productId: string, message?: string): void {
    const documents = this.docs
      .filter(d => d.included)
      .map((d, i) => ({ document_type_id: d.document_type_id, is_required: !!d.is_required, sort_order: i }));

    this.api.put(`/loan-products/${productId}/documents`, { documents }).subscribe({
      next: () => this.finishSave(message),
      error: e => {
        // The product itself saved; only the document list failed. Say so
        // rather than implying the whole save was lost.
        this.saving.set(false);
        this.toast.error('Product saved, but its documents could not be updated: '
          + (e.error?.message || 'request failed'));
        this.showForm.set(false);
        this.load(this.q);
      },
    });
  }

  private finishSave(message?: string): void {
    this.saving.set(false);
    this.toast.success(message || 'Saved');
    this.showForm.set(false);
    this.load(this.q);
  }
}
