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
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import { PageGuide } from '../../shared/guide/page-guide.model';
const PENALTY_RULES_GUIDE: PageGuide = {
  id: 'penalty-rules',
  titleKey: 'Penalty Rules',
  purposeKey: 'What a customer is charged when a repayment is late, per product.',
  descriptionKey:
    'A penalty rule turns lateness into a charge automatically — after a grace period, at a set '
    + 'rate or flat amount. Because it applies without anyone deciding case by case, the rule must '
    + 'match what the customer agreed to; a penalty that cannot be justified from the loan agreement '
    + 'is a complaint, and potentially a regulatory one.',
  actionKeys: [
    'Define the penalty for a product',
    'Set the grace period before it applies',
    'Deactivate a rule that should no longer charge',
  ],
  dependsOnKeys: ['Loan Products', 'GL Mappings'],
  usedByKeys: ['Repayment schedules', 'Payments', 'Aged Receivables'],
  businessRuleKeys: [
    'Penalties apply automatically once the grace period passes — nobody triggers them per loan.',
    'A penalty is income to the institution and posts to the ledger like any other charge.',
    'Changing a rule affects future charges; penalties already charged stand until reversed deliberately.',
    'Grace periods are counted from the instalment due date.',
  ],
  tipKeys: [
    'Keep the rule identical to what the loan agreement says. That document is what a customer will quote back at you.',
    'A grace period of a day or two absorbs bank clearing delays and prevents a lot of unnecessary disputes.',
  ],
  permissionKeys: ['products.edit'],
};

@Component({
  selector: 'app-penalty-rules', standalone: true,
  imports: [SearchableSelectDirective, CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent, PageGuideComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Penalty Rules"
        subtitle="Configure penalty charges for late payments, per product"
        eyebrow="Configuration">
        <button class="cx-btn cx-btn-primary" (click)="openForm()">
          <lucide-icon name="plus" [size]="14"></lucide-icon>
          <span>Add Rule</span>
        </button>
      </cx-page-header>

      <cx-page-guide [guide]="guide"></cx-page-guide>
      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()" searchPlaceholder="Search penalty rules..." [hasActions]="true" (query)="onQuery($event)">
        <ng-template #rowActions let-row>
          <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)" title="Edit">
            <lucide-icon name="pencil" [size]="14"></lucide-icon>
          </button>
        </ng-template>
      </cx-data-table>
    </div>
    <cx-form-dialog
      [open]="showForm()"
      [title]="editId ? 'Edit Rule' : 'Create Rule'"
      [subtitle]="editId ? 'Update penalty calculation' : 'Define how late-payment penalties are computed'"
      [saving]="saving()" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="cx-form-stack">
        <div>
          <label class="cx-label">Product *</label>
          <select class="cx-select" [(ngModel)]="form.product_id">
            <option value="">Select product...</option>
            @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
          </select>
        </div>
        <div><label class="cx-label">Rule Name *</label><input class="cx-input" [(ngModel)]="form.name" placeholder="e.g. Late Payment Standard" /></div>
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Calculation</label>
            <select class="cx-select" [(ngModel)]="form.calculation_type">
              <option value="flat">Flat Amount</option>
              <option value="percentage">Percentage</option>
            </select>
          </div>
          <div>
            <label class="cx-label">
              {{ form.calculation_type === 'percentage' ? 'Fraction *' : 'Amount (' + settings.currencySymbol() + ') *' }}
            </label>
            <input class="cx-input" type="number"
                   [attr.step]="form.calculation_type === 'percentage' ? '0.0001' : '1'"
                   [attr.min]="0"
                   [attr.max]="form.calculation_type === 'percentage' ? 1 : null"
                   [(ngModel)]="form.value"
                   [placeholder]="form.calculation_type === 'percentage' ? 'e.g. 0.02' : 'e.g. 5000'" />
            @if (form.calculation_type === 'percentage') {
              <div class="cx-field-hint">0.02 = 2%</div>
            }
          </div>
        </div>
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Grace Period (days)</label><input class="cx-input" type="number" [(ngModel)]="form.grace_period_days" placeholder="0" /></div>
          <div><label class="cx-label">Max Amount Cap</label><input class="cx-input" type="number" [(ngModel)]="form.max_amount" placeholder="Optional" /></div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--cx-text-secondary);cursor:pointer;">
          <input type="checkbox" [(ngModel)]="form.apply_after_maturity_only" />
          <span>Only penalise after the loan's maturity date (last installment due date)</span>
        </label>
      </div>
    </cx-form-dialog>
  `,
})
export class PenaltyRulesComponent implements OnInit {
  readonly guide = PENALTY_RULES_GUIDE;

  columns: TableColumn[] = [{key:'name',label:'Rule Name'},{key:'product_name',label:'Product'},{key:'calculation_type',label:'Type'},{key:'value',label:'Value'},{key:'grace_period_days',label:'Grace Days'},{key:'max_amount',label:'Max',type:'currency'},{key:'is_active',label:'Active'}];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {}; q: any = {};
  products = signal<any[]>([]);
  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService, public settings: SettingsService) {}
  ngOnInit() { this.load(); this.api.get('/loan-products',{per_page:100}).subscribe({next:r=>this.products.set(r.data||[])}); }
  load(p?:any) { this.loading.set(true); this.api.get('/penalty-rules',{...this.q,...p}).subscribe({next:r=>{this.rows.set(r.data||[]);this.pagination.set(r.meta||null);this.loading.set(false);},error:()=>this.loading.set(false)}); }
  onQuery(e:TableQueryEvent) { this.q=e; this.load(e); }
  openForm(row?:any) { if(row){this.editId=row.id;this.form={product_id:row.product_id,name:row.name,calculation_type:row.calculation_type,value:row.value,grace_period_days:row.grace_period_days,max_amount:row.max_amount,apply_after_maturity_only:!!row.apply_after_maturity_only};}else{this.editId=null;this.form={product_id:'',name:'',calculation_type:'flat',value:'',grace_period_days:0,max_amount:'',apply_after_maturity_only:false};} this.showForm.set(true); }
  saveForm() { this.saving.set(true); (this.editId?this.api.put('/penalty-rules/'+this.editId,this.form):this.api.post('/penalty-rules',this.form)).subscribe({next:r=>{this.saving.set(false);this.toast.success(r.message||'Saved');this.showForm.set(false);this.load(this.q);},error:e=>{this.saving.set(false);this.toast.error(e.error?.message||'Failed');}}); }
}
