import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../shared/components/data-table/data-table.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import { PageGuide } from '../../shared/guide/page-guide.model';

const DOCUMENT_TYPES_GUIDE: PageGuide = {
  id: 'document-types',
  titleKey: 'Document Types',
  purposeKey: 'Defines which documents agents upload against a loan, and which of them block submission.',
  descriptionKey:
    'Rather than hard-coding a fixed list, the documents a loan needs are configured here. The agent '
    + 'app builds its upload list from whatever is active, so adding a document or making one '
    + 'mandatory takes effect without shipping a new app version.',
  actionKeys: [
    'Add a new document type agents can upload',
    'Mark a document required, so no loan can be submitted without it',
    'Deactivate a document type to retire it without touching existing loans',
    'Set the accepted file types and the order documents appear in',
  ],
  sections: [
    {
      selector: 'cx-data-table',
      titleKey: 'The document list',
      bodyKey:
        'Requirement shows whether a document blocks submission. Status controls whether agents see '
        + 'it at all. Types marked "system" ship with the product — you can relabel or retire them, '
        + 'but their code is fixed because uploaded documents reference it.',
    },
  ],
  workflowKeys: ['Define types here', 'Agent captures loan', 'Uploads documents', 'Submit for approval'],
  usedByKeys: ['Agent app capture wizard', 'Loan submission checks', 'Approval review'],
  businessRuleKeys: [
    'Required is global — a required document is needed on every loan, regardless of product.',
    'Deactivating is the safe way to retire a type; it is hidden from capture and no longer enforced.',
    'A system type\'s code cannot be changed, because uploaded documents are stored against it.',
    'Making a type required affects loans not yet submitted, not those already in the workflow.',
  ],
  tipKeys: [
    'Deactivate rather than delete — deleting a type that existing loans reference loses the link.',
    'Agents need to reopen the app to pick up a newly added document type.',
    'Keep the required list short; every extra mandatory document is another reason a loan stalls.',
  ],
  permissionKeys: ['products.view', 'products.create', 'products.edit', 'products.delete'],
  faq: [
    {
      questionKey: 'I made a document required — what happens to loans already submitted?',
      answerKey: 'Nothing. The check runs at submission, so loans already through it are unaffected.',
    },
    {
      questionKey: 'Why can I not change this type\'s code?',
      answerKey: 'It is a system type. Uploaded documents are stored against that code, so changing it would orphan them.',
    },
  ],
};

/**
 * Document Types — the documents agents can upload against a loan, and which of
 * them block submit-for-approval.
 *
 * "Required" is GLOBAL: a required document must be present on every loan
 * before an agent can submit it. The agent app builds its upload list from the
 * active types here, so changes take effect without an app release.
 */
@Component({
  selector: 'app-document-types',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, DataTableComponent, FormDialogComponent, PageGuideComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Document Types"
        subtitle="Documents agents upload, and which are mandatory before a loan can be submitted"
        eyebrow="Configuration">
        @if (auth.hasPermission('products.create')) {
          <button class="cx-btn cx-btn-primary" (click)="openForm()">
            <lucide-icon name="plus" [size]="14"></lucide-icon>
            <span>Add Document Type</span>
          </button>
        }
      </cx-page-header>

      <cx-page-guide [guide]="guide"></cx-page-guide>

      <cx-data-table [allColumns]="columns" [rows]="rows()" [loading]="loading()"
                     [searchPlaceholder]="''" [hasActions]="true" trackBy="id">
        <ng-template #cellTemplate let-row let-col="column">
          @switch (col.key) {
            @case ('is_required') {
              <span class="cx-badge" [ngClass]="row.is_required ? 'cx-badge-warning' : 'cx-badge-neutral'">
                {{ row.is_required ? 'Required' : 'Optional' }}
              </span>
            }
            @case ('is_active') {
              <span class="cx-badge" [ngClass]="row.is_active ? 'cx-badge-success' : 'cx-badge-neutral'">
                {{ row.is_active ? 'Active' : 'Inactive' }}
              </span>
            }
            @case ('code') {
              <span class="cx-dt-code">{{ row.code }}</span>
              @if (row.is_system) { <span class="cx-dt-sys" title="Shipped with the product — cannot be deleted or re-coded">system</span> }
            }
          }
        </ng-template>
        <ng-template #rowActions let-row>
          <div class="flex items-center gap-1 justify-end">
            @if (auth.hasPermission('products.edit')) {
              <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(row)" title="Edit">
                <lucide-icon name="pencil" [size]="14"></lucide-icon>
              </button>
            }
            @if (!row.is_system && auth.hasPermission('products.delete')) {
              <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="remove(row)" title="Delete">
                <lucide-icon name="trash-2" [size]="14"></lucide-icon>
              </button>
            }
          </div>
        </ng-template>
      </cx-data-table>
    </div>

    <cx-form-dialog
      [open]="showForm()"
      [title]="editId ? 'Edit Document Type' : 'Add Document Type'"
      [subtitle]="editId ? 'Update this document definition' : 'Define a document agents can upload'"
      [saving]="saving()" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="cx-form-stack">
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Label *</label>
            <input class="cx-input" [(ngModel)]="form.label" placeholder="e.g. Passport Photograph" />
          </div>
          <div>
            <label class="cx-label">Code *</label>
            <input class="cx-input" [(ngModel)]="form.code" placeholder="e.g. utility_bill"
                   [disabled]="!!editId && form.is_system" />
            <p class="cx-dt-hint">
              @if (editId && form.is_system) {
                A system type's code is fixed — uploaded documents reference it.
              } @else {
                Lowercase letters, numbers and underscores. Stored on every uploaded document, so keep it stable.
              }
            </p>
          </div>
        </div>

        <div><label class="cx-label">Description</label><input class="cx-input" [(ngModel)]="form.description" placeholder="Short description" /></div>

        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Accepted files</label>
            <input class="cx-input" [(ngModel)]="form.accept" placeholder="e.g. image/*,.pdf" />
          </div>
          <div>
            <label class="cx-label">Sort order</label>
            <input class="cx-input" type="number" [(ngModel)]="form.sort_order" />
          </div>
        </div>

        <label class="cx-dt-check">
          <input type="checkbox" [(ngModel)]="form.is_required" />
          <span>
            <strong>Required before submission</strong>
            <em>Agents cannot submit a loan for approval until this document is uploaded. Applies to all loans.</em>
          </span>
        </label>

        <label class="cx-dt-check">
          <input type="checkbox" [(ngModel)]="form.is_active" />
          <span>
            <strong>Active</strong>
            <em>Inactive types are hidden from capture and never enforced — this is the safe way to retire one.</em>
          </span>
        </label>
      </div>
    </cx-form-dialog>
  `,
  styles: [`
    .cx-dt-code { font-family: var(--cx-font-mono, ui-monospace, monospace); font-size: 12px; }
    .cx-dt-sys {
      margin-left: 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em;
      color: var(--cx-text-muted); border: 1px solid var(--cx-border); border-radius: 999px; padding: 1px 6px;
    }
    .cx-dt-hint { font-size: 11px; color: var(--cx-text-muted); margin-top: 4px; line-height: 1.4; }
    .cx-dt-check { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; padding: 10px 12px;
      border: 1px solid var(--cx-border); border-radius: var(--cx-radius-md); background: var(--cx-surface-2, transparent); }
    .cx-dt-check input { margin-top: 3px; }
    .cx-dt-check strong { display: block; font-size: 13px; font-weight: 600; color: var(--cx-text); }
    .cx-dt-check em { display: block; font-style: normal; font-size: 11.5px; color: var(--cx-text-muted); margin-top: 2px; line-height: 1.4; }
  `],
})
export class DocumentTypesComponent implements OnInit {
  readonly guide = DOCUMENT_TYPES_GUIDE;

  columns: TableColumn[] = [
    { key: 'label', label: 'Document' },
    { key: 'code', label: 'Code', type: 'custom' },
    { key: 'is_required', label: 'Requirement', type: 'custom' },
    { key: 'is_active', label: 'Status', type: 'custom' },
    { key: 'sort_order', label: 'Order', align: 'right' },
  ];

  rows = signal<any[]>([]);
  loading = signal(true);
  showForm = signal(false);
  saving = signal(false);
  editId: string | null = null;
  form: any = {};

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.get('/document-types').subscribe({
      next: r => { this.rows.set(r.data || []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openForm(row?: any) {
    if (row) {
      this.editId = row.id;
      this.form = {
        label: row.label, code: row.code, description: row.description || '',
        accept: row.accept || '', sort_order: row.sort_order ?? 0,
        is_required: !!row.is_required, is_active: !!row.is_active, is_system: !!row.is_system,
      };
    } else {
      this.editId = null;
      this.form = { label: '', code: '', description: '', accept: '', sort_order: 0, is_required: false, is_active: true, is_system: false };
    }
    this.showForm.set(true);
  }

  saveForm() {
    if (!this.form.label || !this.form.code) { this.toast.error('Label and code are required.'); return; }
    this.saving.set(true);
    const req = this.editId
      ? this.api.put('/document-types/' + this.editId, this.form)
      : this.api.post('/document-types', this.form);
    req.subscribe({
      next: r => { this.saving.set(false); this.toast.success(r.message || 'Saved'); this.showForm.set(false); this.load(); },
      error: e => { this.saving.set(false); this.toast.error(e.error?.errors?.code || e.error?.message || 'Failed'); },
    });
  }

  remove(row: any) {
    if (!confirm(`Delete "${row.label}"? If any loan has this document uploaded, deactivate it instead.`)) return;
    this.api.delete('/document-types/' + row.id).subscribe({
      next: r => { this.toast.success(r.message || 'Deleted'); this.load(); },
      error: e => this.toast.error(e.error?.message || 'Failed to delete'),
    });
  }
}
