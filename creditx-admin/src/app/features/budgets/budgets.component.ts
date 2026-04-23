import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

/**
 * Budgets admin page.
 *
 * Shows a table of budgeted amounts per GL account for a selected
 * year + month. Inline-editable amount field per row. 'Add Budget'
 * row at the bottom for new entries — pick a GL account from the
 * dropdown and enter the amount.
 *
 * Gated by accounting.view (list); accounting.budget to
 * create/update/delete (the backend enforces this, so unauthorised
 * users see the table but action buttons fail with a 403).
 */
@Component({
  selector: 'app-budgets',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Budgets"
        subtitle="Monthly budget targets per GL account"
        eyebrow="Accounting">
        <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="load()" [disabled]="loading()">
          <lucide-icon name="refresh-cw" [size]="14"></lucide-icon>
          <span>{{ loading() ? 'Loading…' : 'Refresh' }}</span>
        </button>
      </cx-page-header>

      <div class="cx-bg-controls">
        <label>
          <span>Year</span>
          <input type="number" class="cx-input" min="2000" max="2099"
                 [(ngModel)]="year" (change)="load()" style="width:100px" />
        </label>
        <label>
          <span>Month</span>
          <select class="cx-input" [(ngModel)]="month" (change)="load()">
            <option value="">All months</option>
            @for (m of months; track m.value) {
              <option [value]="m.value">{{ m.label }}</option>
            }
          </select>
        </label>
        <div class="cx-bg-summary">
          Total budgeted: <strong class="tabular-nums">₦{{ totalBudget() | number:'1.2-2' }}</strong>
        </div>
      </div>

      @if (loading()) {
        <div class="cx-bg-loading">
          <lucide-icon name="loader-2" [size]="20" class="cx-bg-spin"></lucide-icon>
          <span>Loading budgets…</span>
        </div>
      } @else {
        <div class="cx-bg-table-wrap">
          <table class="cx-bg-table">
            <thead>
              <tr>
                <th>GL Code</th>
                <th>Account</th>
                <th>Type</th>
                @if (!month) { <th>Month</th> }
                <th class="cx-bg-right">Budget Amount</th>
                <th>Notes</th>
                <th class="cx-bg-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (b of budgets(); track b.id) {
                <tr>
                  <td class="cx-bg-mono">{{ b.gl_code }}</td>
                  <td>{{ b.gl_name }}</td>
                  <td><span class="cx-bg-type" [attr.data-type]="b.gl_type">{{ b.gl_type }}</span></td>
                  @if (!month) { <td>{{ b.month }}/{{ b.year }}</td> }
                  <td class="cx-bg-right">
                    @if (editingId() === b.id) {
                      <input type="number" class="cx-input cx-bg-edit-input"
                             [(ngModel)]="editAmount" step="0.01" min="0" />
                    } @else {
                      <span class="tabular-nums">₦{{ b.amount | number:'1.2-2' }}</span>
                    }
                  </td>
                  <td>
                    @if (editingId() === b.id) {
                      <input type="text" class="cx-input" [(ngModel)]="editNotes" />
                    } @else {
                      <span class="cx-bg-notes">{{ b.notes || '—' }}</span>
                    }
                  </td>
                  <td class="cx-bg-right">
                    @if (editingId() === b.id) {
                      <button class="cx-btn cx-btn-primary cx-btn-sm" (click)="saveEdit(b)" [disabled]="busy()">
                        <lucide-icon name="check" [size]="12"></lucide-icon>
                        <span>Save</span>
                      </button>
                      <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="cancelEdit()">Cancel</button>
                    } @else {
                      <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="startEdit(b)">
                        <lucide-icon name="pencil" [size]="12"></lucide-icon>
                        <span>Edit</span>
                      </button>
                      <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="removeBudget(b)" [disabled]="busy()">
                        <lucide-icon name="trash-2" [size]="12"></lucide-icon>
                      </button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td [attr.colspan]="month ? 6 : 7" class="cx-bg-empty">
                    No budgets set for this period yet. Add one below.
                  </td>
                </tr>
              }
              <!-- Add-budget row -->
              <tr class="cx-bg-add-row">
                <td colspan="2">
                  <select class="cx-input" [(ngModel)]="newGlId">
                    <option value="">— Select GL account —</option>
                    @for (gl of incomeExpenseAccounts(); track gl.id) {
                      <option [value]="gl.id">{{ gl.code }} — {{ gl.name }} ({{ gl.type }})</option>
                    }
                  </select>
                </td>
                <td>
                  <select class="cx-input" [(ngModel)]="newMonth">
                    @for (m of months; track m.value) {
                      <option [value]="m.value">{{ m.label }}</option>
                    }
                  </select>
                </td>
                @if (!month) {
                  <td><!-- month col empty in add row when 'All months' -->
                    {{ newMonth }}/{{ year }}
                  </td>
                }
                <td>
                  <input type="number" class="cx-input cx-bg-edit-input"
                         [(ngModel)]="newAmount" step="0.01" min="0" placeholder="0.00" />
                </td>
                <td>
                  <input type="text" class="cx-input" [(ngModel)]="newNotes" placeholder="Notes (optional)" />
                </td>
                <td class="cx-bg-right">
                  <button class="cx-btn cx-btn-primary cx-btn-sm" (click)="addBudget()"
                          [disabled]="busy() || !newGlId || !newAmount">
                    <lucide-icon name="plus" [size]="12"></lucide-icon>
                    <span>Add</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .cx-bg-controls {
      display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap;
      padding: 14px 16px;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
    }
    .cx-bg-controls label {
      display: flex; flex-direction: column; gap: 4px;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-bg-controls input, .cx-bg-controls select {
      font-size: 13px; padding: 6px 10px;
    }
    .cx-bg-summary {
      margin-left: auto;
      font-size: 13px;
      color: var(--cx-text-secondary);
    }
    .cx-bg-summary strong { color: var(--cx-text); font-weight: 600; }

    .cx-bg-table-wrap {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      overflow-x: auto;
    }
    .cx-bg-table { width: 100%; border-collapse: collapse; }
    .cx-bg-table th {
      background: var(--cx-surface-2);
      padding: 10px 12px;
      text-align: left;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--cx-text-muted);
      border-bottom: 1px solid var(--cx-border);
      white-space: nowrap;
    }
    .cx-bg-table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--cx-border);
      font-size: 13px;
      color: var(--cx-text);
      vertical-align: middle;
    }
    .cx-bg-right { text-align: right; }
    .cx-bg-mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
    }
    .cx-bg-notes { color: var(--cx-text-secondary); font-size: 12px; }
    .cx-bg-empty {
      text-align: center; padding: 24px;
      color: var(--cx-text-muted); font-style: italic;
    }
    .cx-bg-add-row td {
      background: var(--cx-surface-2);
      border-top: 2px solid var(--cx-border);
    }
    .cx-bg-add-row input, .cx-bg-add-row select {
      font-size: 13px; padding: 6px 10px; width: 100%;
    }
    .cx-bg-edit-input { text-align: right; width: 120px; }

    .cx-bg-type {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 999px;
      font-size: 10px; font-weight: 600;
      text-transform: capitalize;
    }
    .cx-bg-type[data-type="income"] {
      background: rgba(22, 163, 74, 0.12);
      color: #15803d;
    }
    .cx-bg-type[data-type="expense"] {
      background: rgba(234, 88, 12, 0.12);
      color: #c2410c;
    }
    .cx-bg-type[data-type="asset"] {
      background: rgba(59, 130, 246, 0.12);
      color: #1d4ed8;
    }
    .cx-bg-type[data-type="liability"] {
      background: rgba(168, 85, 247, 0.12);
      color: #7e22ce;
    }
    .cx-bg-type[data-type="equity"] {
      background: rgba(234, 179, 8, 0.15);
      color: #a16207;
    }

    .cx-bg-loading {
      display: flex; align-items: center; justify-content: center;
      gap: 10px;
      padding: 48px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      color: var(--cx-text-secondary);
      font-size: 13px;
    }
    .cx-bg-spin { animation: cx-bg-spin 1s linear infinite; }
    @keyframes cx-bg-spin { to { transform: rotate(360deg); } }
  `],
})
export class BudgetsComponent implements OnInit {
  budgets = signal<any[]>([]);
  glAccounts = signal<any[]>([]);
  loading = signal(true);
  busy = signal(false);

  year: number = new Date().getFullYear();
  month: string = String(new Date().getMonth() + 1).padStart(2, '0');

  editingId = signal<string | null>(null);
  editAmount = 0;
  editNotes = '';

  // 'Add budget' form fields
  newGlId = '';
  newMonth = '';
  newAmount: number | null = null;
  newNotes = '';

  months = [
    { value: '01', label: 'January' },   { value: '02', label: 'February' },
    { value: '03', label: 'March' },     { value: '04', label: 'April' },
    { value: '05', label: 'May' },       { value: '06', label: 'June' },
    { value: '07', label: 'July' },      { value: '08', label: 'August' },
    { value: '09', label: 'September' }, { value: '10', label: 'October' },
    { value: '11', label: 'November' },  { value: '12', label: 'December' },
  ];

  totalBudget = computed(() =>
    this.budgets().reduce((sum, b) => sum + parseFloat(b.amount || '0'), 0)
  );

  /**
   * GL accounts filtered to income + expense. Budgeting balance
   * sheet accounts is less common — income/expense are the primary
   * budget targets.
   */
  incomeExpenseAccounts = computed(() =>
    this.glAccounts().filter(gl => gl.type === 'income' || gl.type === 'expense')
  );

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() {
    this.newMonth = this.month;
    this.loadGlAccounts();
    this.load();
  }

  load() {
    this.loading.set(true);
    const params: any = { year: String(this.year) };
    if (this.month) params.month = this.month;
    this.api.get('/accounting/budgets', params).subscribe({
      next: r => {
        this.budgets.set(r.data?.budgets || []);
        this.loading.set(false);
      },
      error: e => {
        this.loading.set(false);
        this.toast.error(e.error?.message || 'Failed to load budgets');
      },
    });
  }

  /**
   * Fetch GL accounts for the 'Add budget' dropdown. Uses the
   * existing /accounting endpoint — picks off the tree-flat list.
   */
  loadGlAccounts() {
    this.api.get('/accounting', { ledger_type: 'general' }).subscribe({
      next: r => {
        const raw = r.data?.accounts || r.data?.items || r.data || [];
        this.glAccounts.set(raw.map((gl: any) => ({
          id: gl.id,
          code: gl.account_code || gl.code,
          name: gl.account_name || gl.name,
          type: gl.account_type || gl.type,
        })));
      },
      error: () => {
        // Soft-fail — the dropdown will be empty but existing budgets
        // still render. User can retry via Refresh.
      },
    });
  }

  startEdit(b: any) {
    this.editingId.set(b.id);
    this.editAmount = parseFloat(b.amount || '0');
    this.editNotes = b.notes || '';
  }

  cancelEdit() {
    this.editingId.set(null);
  }

  saveEdit(b: any) {
    this.busy.set(true);
    this.api.post('/accounting/budgets', {
      gl_id: b.gl_id,
      year: b.year,
      month: b.month,
      amount: String(this.editAmount),
      notes: this.editNotes,
    }).subscribe({
      next: () => {
        this.busy.set(false);
        this.editingId.set(null);
        this.toast.success('Budget updated');
        this.load();
      },
      error: e => {
        this.busy.set(false);
        this.toast.error(e.error?.message || 'Update failed');
      },
    });
  }

  removeBudget(b: any) {
    if (!confirm(`Delete the ${b.month}/${b.year} budget for ${b.gl_code}?`)) return;
    this.busy.set(true);
    this.api.delete(`/accounting/budgets/${b.id}`).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success('Budget deleted');
        this.load();
      },
      error: e => {
        this.busy.set(false);
        this.toast.error(e.error?.message || 'Delete failed');
      },
    });
  }

  addBudget() {
    if (!this.newGlId || this.newAmount == null) return;
    this.busy.set(true);
    this.api.post('/accounting/budgets', {
      gl_id: this.newGlId,
      year: String(this.year),
      month: this.newMonth || this.month || String(new Date().getMonth() + 1).padStart(2, '0'),
      amount: String(this.newAmount),
      notes: this.newNotes,
    }).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success('Budget added');
        this.newGlId = '';
        this.newAmount = null;
        this.newNotes = '';
        this.load();
      },
      error: e => {
        this.busy.set(false);
        this.toast.error(e.error?.message || 'Add failed');
      },
    });
  }
}
