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
  selector: 'app-penalty-rules', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Penalty Rules" subtitle="Configure late payment penalties">
        <button class="cx-btn cx-btn-primary" (click)="openForm()"><lucide-icon name="plus" [size]="16"></lucide-icon> Add Rule</button>
      </cx-page-header>
      <div class="cx-card !p-4">
        <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()" searchPlaceholder="Search penalty rules..." [hasActions]="true" (query)="onQuery($event)">
          <ng-template #rowActions let-row><button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)"><lucide-icon name="pencil" [size]="14"></lucide-icon></button></ng-template>
        </cx-data-table>
      </div>
    </div>
    <cx-form-dialog [open]="showForm()" [title]="editId ? 'Edit Rule' : 'Create Rule'" [saving]="saving()" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="space-y-4">
        <div><label class="cx-label">Product *</label><select class="cx-select" [(ngModel)]="form.product_id"><option value="">Select</option>@for(p of products();track p.id){<option [value]="p.id">{{p.name}}</option>}</select></div>
        <div><label class="cx-label">Rule Name *</label><input class="cx-input" [(ngModel)]="form.name" /></div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Type</label><select class="cx-select" [(ngModel)]="form.calculation_type"><option value="flat">Flat Amount</option><option value="percentage">Percentage</option></select></div>
          <div><label class="cx-label">Value *</label><input class="cx-input" type="number" [(ngModel)]="form.value" /></div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Grace Period (days)</label><input class="cx-input" type="number" [(ngModel)]="form.grace_period_days" /></div>
          <div><label class="cx-label">Max Amount Cap</label><input class="cx-input" type="number" [(ngModel)]="form.max_amount" /></div>
        </div>
      </div>
    </cx-form-dialog>
  `,
})
export class PenaltyRulesComponent implements OnInit {
  columns: TableColumn[] = [{key:'name',label:'Rule Name'},{key:'product_name',label:'Product'},{key:'calculation_type',label:'Type'},{key:'value',label:'Value'},{key:'grace_period_days',label:'Grace Days'},{key:'max_amount',label:'Max',type:'currency'},{key:'is_active',label:'Active'}];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {}; q: any = {};
  products = signal<any[]>([]);
  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit() { this.load(); this.api.get('/loan-products',{per_page:100}).subscribe({next:r=>this.products.set(r.data||[])}); }
  load(p?:any) { this.loading.set(true); this.api.get('/penalty-rules',{...this.q,...p}).subscribe({next:r=>{this.rows.set(r.data||[]);this.pagination.set(r.meta||null);this.loading.set(false);},error:()=>this.loading.set(false)}); }
  onQuery(e:TableQueryEvent) { this.q=e; this.load(e); }
  openForm(row?:any) { if(row){this.editId=row.id;this.form={product_id:row.product_id,name:row.name,calculation_type:row.calculation_type,value:row.value,grace_period_days:row.grace_period_days,max_amount:row.max_amount};}else{this.editId=null;this.form={product_id:'',name:'',calculation_type:'flat',value:'',grace_period_days:0,max_amount:''};} this.showForm.set(true); }
  saveForm() { this.saving.set(true); (this.editId?this.api.put('/penalty-rules/'+this.editId,this.form):this.api.post('/penalty-rules',this.form)).subscribe({next:r=>{this.saving.set(false);this.toast.success(r.message||'Saved');this.showForm.set(false);this.load(this.q);},error:e=>{this.saving.set(false);this.toast.error(e.error?.message||'Failed');}}); }
}
