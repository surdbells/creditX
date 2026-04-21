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
@Component({
  selector: 'app-loan-products', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent],
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
          <div><label class="cx-label">Min Amount (₦)</label><input class="cx-input" type="number" [(ngModel)]="form.min_amount" /></div>
          <div><label class="cx-label">Max Amount (₦)</label><input class="cx-input" type="number" [(ngModel)]="form.max_amount" /></div>
        </div>
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Min Tenure (months)</label><input class="cx-input" type="number" [(ngModel)]="form.min_tenure" /></div>
          <div><label class="cx-label">Max Tenure (months)</label><input class="cx-input" type="number" [(ngModel)]="form.max_tenure" /></div>
        </div>
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Max Age (years)</label><input class="cx-input" type="number" [(ngModel)]="form.max_age" /></div>
          <div><label class="cx-label">Max Service Years</label><input class="cx-input" type="number" [(ngModel)]="form.max_years_of_service" /></div>
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
                      {{ fee.calculation_type === 'percentage' ? 'Fraction' : 'Amount (₦)' }}
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
    }
  `],
})
export class LoanProductsComponent implements OnInit {
  columns: TableColumn[] = [{key:'name',label:'Product Name'},{key:'code',label:'Code'},{key:'interest_calculation_method',label:'Method'},{key:'interest_rate',label:'Rate'},{key:'min_amount',label:'Min',type:'currency'},{key:'max_amount',label:'Max',type:'currency'},{key:'is_active',label:'Active'}];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {}; fees: any[] = []; q: any = {};
  feeTypes = signal<any[]>([]);
  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit() { this.load(); this.api.get('/fee-types',{per_page:100}).subscribe({next:r=>this.feeTypes.set(r.data||[])}); }
  load(p?:any) { this.loading.set(true); this.api.get('/loan-products',{...this.q,...p}).subscribe({next:r=>{this.rows.set(r.data||[]);this.pagination.set(r.meta||null);this.loading.set(false);},error:()=>this.loading.set(false)}); }
  onQuery(e:TableQueryEvent) { this.q=e; this.load(e); }
  openForm(row?:any) {
    if(row){this.editId=row.id;this.form={name:row.name,code:row.code,description:row.description,interest_calculation_method:row.interest_calculation_method,interest_rate:row.interest_rate,min_amount:row.min_amount,max_amount:row.max_amount,min_tenure:row.min_tenure,max_tenure:row.max_tenure,max_age:row.max_age,max_years_of_service:row.max_years_of_service,allows_top_up:row.allows_top_up};this.fees=(row.fees||[]).map((f:any)=>({fee_type_id:f.fee_type_id,calculation_type:f.calculation_type,value:f.value,effect:f.effect||'deducted_from_disbursement',applies_to:f.applies_to||'principal'}));}
    else{this.editId=null;this.form={name:'',code:'',description:'',interest_calculation_method:'flat_rate',interest_rate:'',min_amount:'',max_amount:'',min_tenure:1,max_tenure:24,max_age:60,max_years_of_service:35,allows_top_up:false};this.fees=[];}
    this.showForm.set(true);
  }
  addFee() { this.fees.push({fee_type_id:'',calculation_type:'flat',value:'',effect:'deducted_from_disbursement',applies_to:'principal'}); }
  saveForm() { this.saving.set(true); const p={...this.form,fees:this.fees.filter(f=>f.fee_type_id)}; (this.editId?this.api.put('/loan-products/'+this.editId,p):this.api.post('/loan-products',p)).subscribe({next:r=>{this.saving.set(false);this.toast.success(r.message||'Saved');this.showForm.set(false);this.load(this.q);},error:e=>{this.saving.set(false);this.toast.error(e.error?.message||'Failed');}}); }
}
