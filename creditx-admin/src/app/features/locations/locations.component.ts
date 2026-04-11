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
  selector: 'app-locations', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Location Management" subtitle="Manage branches and offices">
        <button class="cx-btn cx-btn-primary" (click)="openForm()"><lucide-icon name="plus" [size]="16"></lucide-icon> Add Location</button>
      </cx-page-header>
      <div class="cx-card !p-4">
        <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()" searchPlaceholder="Search locations..." [hasActions]="true" (query)="onQuery($event)">
          <ng-template #rowActions let-row><button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)"><lucide-icon name="pencil" [size]="14"></lucide-icon></button></ng-template>
        </cx-data-table>
      </div>
    </div>
    <cx-form-dialog [open]="showForm()" [title]="editId ? 'Edit Location' : 'Create Location'" [saving]="saving()" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="space-y-4">
        <div><label class="cx-label">Name *</label><input class="cx-input" [(ngModel)]="form.name" /></div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Code *</label><input class="cx-input" [(ngModel)]="form.code" /></div>
          <div><label class="cx-label">Type</label><select class="cx-select" [(ngModel)]="form.type"><option value="head_office">Head Office</option><option value="branch">Branch</option><option value="satellite">Satellite</option></select></div>
        </div>
        <div><label class="cx-label">Address</label><input class="cx-input" [(ngModel)]="form.address" /></div>
        <div><label class="cx-label">State</label><input class="cx-input" [(ngModel)]="form.state" /></div>
        @if (editId) { <div><label class="cx-label">Active</label><select class="cx-select" [(ngModel)]="form.is_active"><option [ngValue]="true">Yes</option><option [ngValue]="false">No</option></select></div> }
      </div>
    </cx-form-dialog>
  `,
})
export class LocationsComponent implements OnInit {
  columns: TableColumn[] = [{key:'name',label:'Name'},{key:'code',label:'Code'},{key:'state',label:'State'},{key:'type',label:'Type'},{key:'is_active',label:'Active'},{key:'created_at',label:'Created',type:'date'}];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {}; q: any = {};
  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit() { this.load(); }
  load(p?:any) { this.loading.set(true); this.api.get('/locations',{...this.q,...p}).subscribe({next:r=>{this.rows.set(r.data||[]);this.pagination.set(r.meta||null);this.loading.set(false);},error:()=>this.loading.set(false)}); }
  onQuery(e:TableQueryEvent) { this.q=e; this.load(e); }
  openForm(row?:any) { if(row){this.editId=row.id;this.form={name:row.name,code:row.code,type:row.type,address:row.address,state:row.state,is_active:row.is_active};}else{this.editId=null;this.form={name:'',code:'',type:'branch',address:'',state:'',is_active:true};} this.showForm.set(true); }
  saveForm() { this.saving.set(true); (this.editId?this.api.put('/locations/'+this.editId,this.form):this.api.post('/locations',this.form)).subscribe({next:r=>{this.saving.set(false);this.toast.success(r.message||'Saved');this.showForm.set(false);this.load(this.q);},error:e=>{this.saving.set(false);this.toast.error(e.error?.message||'Failed');}}); }
}
