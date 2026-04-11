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
  selector: 'app-users', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="User Management" subtitle="Manage system users, roles, and access">
        @if (auth.hasPermission('users.create')) {
          <button class="cx-btn cx-btn-primary" (click)="openForm()"><lucide-icon name="plus" [size]="16"></lucide-icon> Add User</button>
        }
      </cx-page-header>
      <div class="cx-card !p-4">
        <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
          searchPlaceholder="Search by name, email..." [hasActions]="true" (query)="onQuery($event)">
          <ng-template #rowActions let-row>
            <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)"><lucide-icon name="pencil" [size]="14"></lucide-icon></button>
          </ng-template>
        </cx-data-table>
      </div>
    </div>
    <cx-form-dialog [open]="showForm()" [title]="editId ? 'Edit User' : 'Create User'" [saving]="saving()" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">First Name *</label><input class="cx-input" [(ngModel)]="form.first_name" /></div>
          <div><label class="cx-label">Last Name *</label><input class="cx-input" [(ngModel)]="form.last_name" /></div>
        </div>
        <div><label class="cx-label">Email *</label><input class="cx-input" type="email" [(ngModel)]="form.email" /></div>
        <div><label class="cx-label">Phone</label><input class="cx-input" [(ngModel)]="form.phone" /></div>
        @if (!editId) { <div><label class="cx-label">Password *</label><input class="cx-input" type="password" [(ngModel)]="form.password" /></div> }
        <div><label class="cx-label">Roles</label>
          <div class="flex flex-wrap gap-2 mt-1">
            @for (r of roles(); track r.id) {
              <label class="text-sm cursor-pointer px-3 py-1.5 rounded-lg border" [class]="selRoles.includes(r.id) ? 'bg-[var(--cx-primary-50)] border-[var(--cx-primary)] text-[var(--cx-primary)]' : 'border-[var(--cx-border)]'">
                <input type="checkbox" [checked]="selRoles.includes(r.id)" (change)="toggleArr('selRoles', r.id)" class="sr-only" /> {{ r.name }}
              </label>
            }
          </div>
        </div>
        <div><label class="cx-label">Locations</label>
          <div class="flex flex-wrap gap-2 mt-1">
            @for (l of locs(); track l.id) {
              <label class="text-sm cursor-pointer px-3 py-1.5 rounded-lg border" [class]="selLocs.includes(l.id) ? 'bg-[var(--cx-accent-50)] border-[var(--cx-accent)]' : 'border-[var(--cx-border)]'">
                <input type="checkbox" [checked]="selLocs.includes(l.id)" (change)="toggleArr('selLocs', l.id)" class="sr-only" /> {{ l.name }}
              </label>
            }
          </div>
        </div>
        @if (editId) { <div><label class="cx-label">Status</label><select class="cx-select" [(ngModel)]="form.status"><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select></div> }
      </div>
    </cx-form-dialog>
  `,
})
export class UsersComponent implements OnInit {
  columns: TableColumn[] = [{key:'full_name',label:'Name'},{key:'email',label:'Email'},{key:'phone',label:'Phone'},{key:'status',label:'Status',type:'badge',badgeMap:{active:{label:'Active',class:'bg-[var(--cx-success-light)] text-[var(--cx-success)]'},inactive:{label:'Inactive',class:'bg-gray-100 text-gray-600'},suspended:{label:'Suspended',class:'bg-[var(--cx-danger-light)] text-[var(--cx-danger)]'}}},{key:'created_at',label:'Created',type:'date'}];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  showForm = signal(false); saving = signal(false); editId: string|null = null;
  form: any = {}; selRoles: string[] = []; selLocs: string[] = [];
  roles = signal<any[]>([]); locs = signal<any[]>([]); q: any = {};
  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit() { this.load(); this.api.get('/roles',{per_page:100}).subscribe({next:r=>this.roles.set(r.data||[])}); this.api.get('/locations',{per_page:100}).subscribe({next:r=>this.locs.set(r.data||[])}); }
  load(p?: any) { this.loading.set(true); this.api.get('/users',{...this.q,...p}).subscribe({ next:r=>{this.rows.set(r.data||[]);this.pagination.set(r.meta||null);this.loading.set(false);}, error:()=>{this.loading.set(false);} }); }
  onQuery(e: TableQueryEvent) { this.q=e; this.load(e); }
  openForm(row?: any) { if(row){this.editId=row.id;this.form={first_name:row.first_name,last_name:row.last_name,email:row.email,phone:row.phone,status:row.status};this.selRoles=(row.roles||[]).map((r:any)=>r.id);this.selLocs=(row.locations||[]).map((l:any)=>l.id);}else{this.editId=null;this.form={first_name:'',last_name:'',email:'',phone:'',password:'',status:'active'};this.selRoles=[];this.selLocs=[];} this.showForm.set(true); }
  saveForm() { this.saving.set(true); const p={...this.form,role_ids:this.selRoles,location_ids:this.selLocs}; (this.editId?this.api.put('/users/'+this.editId,p):this.api.post('/users',p)).subscribe({ next:r=>{this.saving.set(false);this.toast.success(r.message||'Saved');this.showForm.set(false);this.load(this.q);}, error:e=>{this.saving.set(false);this.toast.error(e.error?.message||'Failed');} }); }
  toggleArr(arr: 'selRoles'|'selLocs', id: string) { const a=this[arr]; this[arr]=a.includes(id)?a.filter(x=>x!==id):[...a,id]; }
}
