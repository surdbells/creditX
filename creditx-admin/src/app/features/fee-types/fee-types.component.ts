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
import { SearchableSelectDirective } from '../../shared/directives/searchable-select.directive';
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import { PageGuide } from '../../shared/guide/page-guide.model';
const FEE_TYPES_GUIDE: PageGuide = {
  id: 'fee-types',
  titleKey: 'Fee Types',
  purposeKey: 'The catalogue of charges that can be attached to loan products.',
  descriptionKey:
    'A fee type defines a charge once — processing, insurance, management — and products then '
    + 'attach it with their own amount and effect. Defining it centrally is what keeps the same fee '
    + 'named and posted consistently across every product that charges it.',
  actionKeys: [
    'Define a fee type',
    'Set how it is calculated — flat, or a percentage',
    'Retire a fee type no longer charged',
  ],
  usedByKeys: ['Loan Products', 'Loan calculator', 'Journal Entries'],
  businessRuleKeys: [
    'A fee type on its own charges nothing. It only takes effect once a product attaches it.',
    'Its effect on the loan is set where it is attached: deducted from the disbursement, or added to the amount owed. The two produce very different customer experiences.',
    'Fees are income and post to the ledger through GL mappings.',
    'A fee type in use by a product cannot simply be removed without changing that product.',
  ],
  tipKeys: [
    'Name fees the way you would explain them to a customer. These names surface on statements and in the calculator.',
  ],
  permissionKeys: ['products.view'],
};

@Component({
  selector: 'app-fee-types', standalone: true,
  imports: [SearchableSelectDirective, CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent, PageGuideComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Fee Types"
        subtitle="Define the types of fees that can be charged on loans"
        eyebrow="Configuration">
        <button class="cx-btn cx-btn-primary" (click)="openForm()">
          <lucide-icon name="plus" [size]="14"></lucide-icon>
          <span>Add Fee Type</span>
        </button>
      </cx-page-header>

      <cx-page-guide [guide]="guide"></cx-page-guide>
      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()" searchPlaceholder="Search fee types..." [hasActions]="true" (query)="onQuery($event)">
        <ng-template #rowActions let-row>
          <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)" title="Edit">
            <lucide-icon name="pencil" [size]="14"></lucide-icon>
          </button>
        </ng-template>
      </cx-data-table>
    </div>
    <cx-form-dialog
      [open]="showForm()"
      [title]="editId ? 'Edit Fee Type' : 'Create Fee Type'"
      [subtitle]="editId ? 'Update this fee definition' : 'Define a new chargeable fee'"
      [saving]="saving()" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="cx-form-stack">
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Name *</label><input class="cx-input" [(ngModel)]="form.name" placeholder="e.g. Processing Fee" /></div>
          <div><label class="cx-label">Code *</label><input class="cx-input" [(ngModel)]="form.code" placeholder="e.g. PROC_FEE" /></div>
        </div>
        <div><label class="cx-label">Description</label><input class="cx-input" [(ngModel)]="form.description" placeholder="Short description" /></div>
        <div>
          <label class="cx-label">GL Account</label>
          <select class="cx-select" [(ngModel)]="form.gl_account_id">
            <option [ngValue]="''">— Select GL —</option>
            @for (gl of glAccounts(); track gl.id) {
              <option [ngValue]="gl.id">{{ gl.account_code }} — {{ gl.account_name }}</option>
            }
          </select>
        </div>
      </div>
    </cx-form-dialog>
  `,
})
export class FeeTypesComponent implements OnInit {
  readonly guide = FEE_TYPES_GUIDE;

  columns: TableColumn[] = [{key:'name',label:'Fee Name'},{key:'code',label:'Code'},{key:'description',label:'Description'},{key:'is_active',label:'Active'},{key:'created_at',label:'Created',type:'date'}];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {}; q: any = {};
  glAccounts = signal<any[]>([]);
  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit() { this.load(); this.api.get('/gl-accounts',{per_page:100}).subscribe({next:r=>this.glAccounts.set(r.data||[])}); }
  load(p?:any) { this.loading.set(true); this.api.get('/fee-types',{...this.q,...p}).subscribe({next:r=>{this.rows.set(r.data||[]);this.pagination.set(r.meta||null);this.loading.set(false);},error:()=>this.loading.set(false)}); }
  onQuery(e:TableQueryEvent) { this.q=e; this.load(e); }
  openForm(row?:any) { if(row){this.editId=row.id;this.form={name:row.name,code:row.code,description:row.description,gl_account_id:row.gl_account_id||''};}else{this.editId=null;this.form={name:'',code:'',description:'',gl_account_id:''};} this.showForm.set(true); }
  saveForm() { this.saving.set(true); (this.editId?this.api.put('/fee-types/'+this.editId,this.form):this.api.post('/fee-types',this.form)).subscribe({next:r=>{this.saving.set(false);this.toast.success(r.message||'Saved');this.showForm.set(false);this.load(this.q);},error:e=>{this.saving.set(false);this.toast.error(e.error?.message||'Failed');}}); }
}
