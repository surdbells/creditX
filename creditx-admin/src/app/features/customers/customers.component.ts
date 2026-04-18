import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn, TablePagination, TableQueryEvent } from '../../shared/components/data-table/data-table.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { NIGERIA_STATES } from '../../core/data/nigeria-states';

@Component({
  selector: 'app-customers', standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, StatusBadgeComponent, FormDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Customer Management" subtitle="{{ totalRecords | number }} customers">
        @if (auth.hasPermission('customers.create')) {
          <button class="cx-btn cx-btn-primary" (click)="openForm()"><lucide-icon name="plus" [size]="16"></lucide-icon> Add Customer</button>
        }
      </cx-page-header>
      <div class="cx-card !p-4 overflow-hidden">
        <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()" [pagination]="pagination()"
          searchPlaceholder="Search customers by name, phone, BVN..." [hasActions]="true" (query)="onQuery($event)">
          <ng-template #rowActions let-row>
            <div class="flex items-center gap-1">
              <a [routerLink]="['/customers', row.id]" class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" title="View"><lucide-icon name="eye" [size]="14"></lucide-icon></a>
              <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)" title="Edit"><lucide-icon name="pencil" [size]="14"></lucide-icon></button>
            </div>
          </ng-template>
        </cx-data-table>
      </div>
    </div>
    <cx-form-dialog [open]="showForm()" [title]="editId ? 'Edit Customer' : 'Create Customer'" [saving]="saving()" maxWidth="720px" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="space-y-4">
        <h4 class="text-xs font-bold text-[var(--cx-text-muted)] uppercase tracking-wider">Personal Information</h4>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Full Name *</label><input class="cx-input" [(ngModel)]="form.full_name" /></div>
          <div><label class="cx-label">Staff ID</label><input class="cx-input" [(ngModel)]="form.staff_id" /></div>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div><label class="cx-label">Phone *</label><input class="cx-input" [(ngModel)]="form.phone" /></div>
          <div><label class="cx-label">Alt Phone</label><input class="cx-input" [(ngModel)]="form.alt_phone" /></div>
          <div><label class="cx-label">Email</label><input class="cx-input" type="email" [(ngModel)]="form.email" /></div>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div><label class="cx-label">Date of Birth</label><input class="cx-input" type="date" [(ngModel)]="form.date_of_birth" /></div>
          <div><label class="cx-label">Gender</label>
            <select class="cx-select" [(ngModel)]="form.gender"><option value="">—</option><option>Male</option><option>Female</option></select>
          </div>
          <div><label class="cx-label">Marital Status</label>
            <select class="cx-select" [(ngModel)]="form.marital_status"><option value="">—</option><option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option></select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">BVN</label><input class="cx-input" [(ngModel)]="form.bvn" /></div>
          <div><label class="cx-label">Religion</label><input class="cx-input" [(ngModel)]="form.religion" /></div>
        </div>

        <h4 class="text-xs font-bold text-[var(--cx-text-muted)] uppercase tracking-wider pt-2">Address & Origin</h4>
        <div><label class="cx-label">Home Address</label><textarea class="cx-input" rows="2" [(ngModel)]="form.home_address"></textarea></div>
        <div><label class="cx-label">Permanent Address</label><textarea class="cx-input" rows="2" [(ngModel)]="form.permanent_address"></textarea></div>
        <div class="grid grid-cols-3 gap-4">
          <div><label class="cx-label">State of Origin</label>
            <select class="cx-select" [(ngModel)]="form.state_of_origin" (change)="onStateChange()">
              <option value="">Select State</option>
              @for (s of states; track s.name) { <option [value]="s.name">{{ s.name }}</option> }
            </select>
          </div>
          <div><label class="cx-label">LGA</label>
            <select class="cx-select" [(ngModel)]="form.lga">
              <option value="">Select LGA</option>
              @for (l of filteredLgas; track l) { <option [value]="l">{{ l }}</option> }
            </select>
          </div>
          <div><label class="cx-label">Hometown</label><input class="cx-input" [(ngModel)]="form.hometown" /></div>
        </div>

        <h4 class="text-xs font-bold text-[var(--cx-text-muted)] uppercase tracking-wider pt-2">Family</h4>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Mother's Maiden Name</label><input class="cx-input" [(ngModel)]="form.mothers_maiden_name" /></div>
          <div><label class="cx-label">Number of Children</label><input class="cx-input" type="number" [(ngModel)]="form.number_of_children" /></div>
        </div>

        <h4 class="text-xs font-bold text-[var(--cx-text-muted)] uppercase tracking-wider pt-2">Next of Kin</h4>
        @for (nok of form.next_of_kins; track $index; let i = $index) {
          <div class="p-3 rounded-xl border border-[var(--cx-border)] bg-[var(--cx-surface-hover)]/30 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-[var(--cx-text-muted)]">NOK {{ i + 1 }}</span>
              <button type="button" class="text-xs text-[var(--cx-danger)]" (click)="removeNok(i)">Remove</button>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="cx-label">Full Name *</label><input class="cx-input" [(ngModel)]="nok.full_name" /></div>
              <div><label class="cx-label">Phone *</label><input class="cx-input" [(ngModel)]="nok.phone" /></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="cx-label">Relationship</label>
                <select class="cx-select" [(ngModel)]="nok.relationship">
                  <option value="">—</option><option>Spouse</option><option>Parent</option><option>Sibling</option><option>Child</option><option>Friend</option><option>Colleague</option><option>Other</option>
                </select>
              </div>
              <div><label class="cx-label">Address</label><input class="cx-input" [(ngModel)]="nok.address" /></div>
            </div>
          </div>
        }
        <button type="button" class="cx-btn cx-btn-outline cx-btn-sm w-full" (click)="addNok()">
          <lucide-icon name="plus" [size]="14"></lucide-icon> Add Next of Kin
        </button>

        <h4 class="text-xs font-bold text-[var(--cx-text-muted)] uppercase tracking-wider pt-2">Banking</h4>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Bank Name</label><input class="cx-input" [(ngModel)]="form.bank_name" /></div>
          <div><label class="cx-label">Account Number</label><input class="cx-input" [(ngModel)]="form.account_number" /></div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Alt Bank Name</label><input class="cx-input" [(ngModel)]="form.alt_bank_name" /></div>
          <div><label class="cx-label">Alt Account Number</label><input class="cx-input" [(ngModel)]="form.alt_account_number" /></div>
        </div>
      </div>
    </cx-form-dialog>
  `,
})
export class CustomersComponent implements OnInit {
  columns: TableColumn[] = [
    { key: 'full_name', label: 'Customer Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'bvn', label: 'BVN' },
    { key: 'active_loans_count', label: 'Loans', align: 'center' },
    { key: 'created_at', label: 'Registered', type: 'date' },
  ];
  rows = signal<any[]>([]); loading = signal(true); pagination = signal<TablePagination|null>(null);
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {};
  totalRecords = 0; q: any = {};

  states = NIGERIA_STATES;
  filteredLgas: string[] = [];

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  onStateChange(): void {
    const state = this.states.find(s => s.name === this.form.state_of_origin);
    this.filteredLgas = state?.lgas || [];
    this.form.lga = '';
  }

  addNok(): void {
    if (!this.form.next_of_kins) this.form.next_of_kins = [];
    this.form.next_of_kins.push({ full_name: '', phone: '', relationship: '', address: '' });
  }

  removeNok(i: number): void { this.form.next_of_kins.splice(i, 1); }
  ngOnInit() { this.load(); }

  load(p?: any) {
    this.loading.set(true);
    this.api.get('/customers', { ...this.q, ...p }).subscribe({
      next: r => { this.rows.set(r.data || []); this.pagination.set(r.meta || null); this.totalRecords = r.meta?.total || 0; this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
  onQuery(e: TableQueryEvent) { this.q = e; this.load(e); }

  openForm(row?: any) {
    if (row) {
      this.editId = row.id;
      this.form = {
        full_name: row.full_name, staff_id: row.staff_id, phone: row.phone, alt_phone: row.alt_phone,
        email: row.email, date_of_birth: row.date_of_birth, gender: row.gender || '', marital_status: row.marital_status || '',
        bvn: row.bvn, religion: row.religion, home_address: row.home_address, permanent_address: row.permanent_address,
        state_of_origin: row.state_of_origin || '', lga: row.lga || '', hometown: row.hometown,
        mothers_maiden_name: row.mothers_maiden_name, number_of_children: row.number_of_children,
        bank_name: row.bank_name, account_number: row.account_number,
        alt_bank_name: row.alt_bank_name, alt_account_number: row.alt_account_number,
        next_of_kins: (row.next_of_kins || []).map((n: any) => ({ full_name: n.full_name, phone: n.phone, relationship: n.relationship, address: n.address })),
      };
      const state = this.states.find(s => s.name === row.state_of_origin);
      this.filteredLgas = state?.lgas || [];
    } else {
      this.editId = null;
      this.form = {
        full_name: '', staff_id: '', phone: '', alt_phone: '', email: '', date_of_birth: '',
        gender: '', marital_status: '', bvn: '', religion: '', home_address: '', permanent_address: '',
        state_of_origin: '', lga: '', hometown: '', mothers_maiden_name: '', number_of_children: null,
        bank_name: '', account_number: '', alt_bank_name: '', alt_account_number: '',
        next_of_kins: [],
      };
      this.filteredLgas = [];
    }
    this.showForm.set(true);
  }

  saveForm() {
    this.saving.set(true);
    (this.editId ? this.api.put('/customers/' + this.editId, this.form) : this.api.post('/customers', this.form)).subscribe({
      next: r => { this.saving.set(false); this.toast.success(r.message || 'Saved'); this.showForm.set(false); this.load(this.q); },
      error: e => { this.saving.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }
}
