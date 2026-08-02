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
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import { PageGuide } from '../../shared/guide/page-guide.model';
const RECORD_TYPES_GUIDE: PageGuide = {
  id: 'record-types',
  titleKey: 'Record Types',
  purposeKey: 'The categories of employee record the institutions list is organised into.',
  descriptionKey:
    'Different payroll sources — IPPIS, GIFMIS, a state scheme, a private employer — carry '
    + 'different fields and different levels of assurance. Defining them as types keeps each source '
    + 'identifiable, so a match can be understood in terms of where it came from.',
  actionKeys: ['Define a record type', 'Retire one no longer in use'],
  usedByKeys: ['Institutions', 'Agent onboarding'],
  businessRuleKeys: [
    'A type in use by loaded records should not be removed — the records would lose their provenance.',
    'The type does not change how matching works; it identifies the source of the data.',
  ],
  permissionKeys: ['government_records.view'],
};

@Component({
  selector: 'app-record-types', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent, PageGuideComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Record Types"
        subtitle="Define categories of government employee records (IPPIS, GIFMIS, etc.)"
        eyebrow="Configuration">
        <button class="cx-btn cx-btn-primary" (click)="openForm()">
          <lucide-icon name="plus" [size]="14"></lucide-icon>
          <span>Add Type</span>
        </button>
      </cx-page-header>

      <cx-page-guide [guide]="guide"></cx-page-guide>
      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()" searchPlaceholder="Search record types..." [hasActions]="true" (query)="onQuery($event)">
        <ng-template #rowActions let-row>
          <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)" title="Edit">
            <lucide-icon name="pencil" [size]="14"></lucide-icon>
          </button>
        </ng-template>
      </cx-data-table>
    </div>
    <cx-form-dialog
      [open]="showForm()"
      [title]="editId ? 'Edit Record Type' : 'Create Record Type'"
      [subtitle]="editId ? 'Update record type definition' : 'Add a new category of government record'"
      [saving]="saving()" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="cx-form-stack">
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Name *</label><input class="cx-input" [(ngModel)]="form.name" placeholder="e.g. IPPIS" /></div>
          <div><label class="cx-label">Code *</label><input class="cx-input" [(ngModel)]="form.code" placeholder="e.g. IPPIS" /></div>
        </div>
        <div><label class="cx-label">Description</label><textarea class="cx-input" rows="2" [(ngModel)]="form.description" placeholder="What this record type represents..."></textarea></div>
      </div>
    </cx-form-dialog>
  `,
})
export class RecordTypesComponent implements OnInit {
  readonly guide = RECORD_TYPES_GUIDE;

  columns: TableColumn[] = [{key:'name',label:'Name'},{key:'code',label:'Code'},{key:'description',label:'Description'},{key:'is_active',label:'Active'},{key:'created_at',label:'Created',type:'date'}];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {}; q: any = {};
  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit() { this.load(); }
  load(p?:any) { this.loading.set(true); this.api.get('/record-types',{...this.q,...p}).subscribe({next:r=>{this.rows.set(r.data||[]);this.pagination.set(r.meta||null);this.loading.set(false);},error:()=>this.loading.set(false)}); }
  onQuery(e:TableQueryEvent) { this.q=e; this.load(e); }
  openForm(row?:any) { if(row){this.editId=row.id;this.form={name:row.name,code:row.code,description:row.description};}else{this.editId=null;this.form={name:'',code:'',description:''};} this.showForm.set(true); }
  saveForm() { this.saving.set(true); (this.editId?this.api.put('/record-types/'+this.editId,this.form):this.api.post('/record-types',this.form)).subscribe({next:r=>{this.saving.set(false);this.toast.success(r.message||'Saved');this.showForm.set(false);this.load(this.q);},error:e=>{this.saving.set(false);this.toast.error(e.error?.message||'Failed');}}); }
}
