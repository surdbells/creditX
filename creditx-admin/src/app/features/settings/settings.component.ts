import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { SettingsService } from '../../core/services/settings.service';
import { SearchableSelectDirective } from '../../shared/directives/searchable-select.directive';

@Component({
  selector: 'app-settings', standalone: true,
  imports: [SearchableSelectDirective, CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, FormDialogComponent, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="System Settings"
        [subtitle]="'Configure how ' + settings.companyName() + ' behaves across your organization'"
        eyebrow="Configuration">
        @if (auth.hasPermission('settings.create')) {
          <button class="cx-btn cx-btn-primary" (click)="openForm()">
            <lucide-icon name="plus" [size]="14"></lucide-icon>
            <span>Add Setting</span>
          </button>
        }
      </cx-page-header>

      <!-- Category Pills -->
      <div class="cx-settings-cats">
        @for (cat of allCategories; track cat) {
          <button class="cx-settings-cat"
                  [class.is-active]="activeCategory === cat"
                  (click)="activeCategory = cat; load()">
            {{ cat === '' ? 'All' : (cat | titlecase) }}
          </button>
        }
      </div>

      @if (loading()) {
        <cx-loading message="Loading settings..."></cx-loading>
      } @else if (rows().length === 0) {
        <cx-empty-state title="No settings found" description="No settings match this category yet." icon="settings"></cx-empty-state>
      } @else {
        <div class="cx-settings-groups">
          @for (group of groupedSettings(); track group.category) {
            <div class="cx-settings-group">
              <div class="cx-settings-group-header">
                <h3 class="cx-settings-group-title">{{ group.category }}</h3>
                <span class="cx-settings-group-count">{{ group.settings.length }}</span>
              </div>
              <div class="cx-settings-rows">
                @for (s of group.settings; track s.id) {
                  <div class="cx-settings-row">
                    <div class="cx-settings-row-main">
                      <div class="cx-settings-row-label">{{ formatKey(s.key) }}</div>
                      <div class="cx-settings-row-desc">{{ s.description || s.key }}</div>
                    </div>
                    <div class="cx-settings-row-control">
                      @if (s.type === 'boolean') {
                        <button class="cx-settings-switch"
                                [class.is-on]="s.value === 'true' || s.value === '1'"
                                (click)="toggleBool(s)"
                                [attr.aria-label]="formatKey(s.key)">
                          <span class="cx-settings-switch-thumb"></span>
                        </button>
                      } @else {
                        <span class="cx-settings-value">
                          {{ s.is_encrypted ? '••••••••' : (s.value || '—') }}
                        </span>
                      }
                      <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(s)" title="Edit">
                        <lucide-icon name="pencil" [size]="14"></lucide-icon>
                      </button>
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>

    <cx-form-dialog
      [open]="showForm()"
      [title]="editId ? 'Edit Setting' : 'Add Setting'"
      [subtitle]="editId ? 'Update this configuration value' : 'Add a new system setting'"
      [saving]="saving()" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="cx-form-stack">
        <div>
          <label class="cx-label">Key *</label>
          <input class="cx-input" [(ngModel)]="form.key" [disabled]="!!editId" placeholder="e.g. 2fa.enabled" />
        </div>
        <div>
          <label class="cx-label">Value *</label>
          @if (form.type === 'boolean') {
            <select class="cx-select" [(ngModel)]="form.value">
              <option value="true">Enabled (true)</option>
              <option value="false">Disabled (false)</option>
            </select>
          } @else if (form.type === 'json') {
            <textarea class="cx-input" style="font-family: var(--cx-font-mono); font-size: var(--cx-text-xs);" rows="4" [(ngModel)]="form.value"></textarea>
          } @else {
            <input class="cx-input" [(ngModel)]="form.value" [type]="form.type === 'integer' || form.type === 'float' ? 'number' : 'text'" />
          }
        </div>
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label">Type</label>
            <select class="cx-select" [(ngModel)]="form.type">
              <option value="string">String</option>
              <option value="integer">Integer</option>
              <option value="float">Float</option>
              <option value="boolean">Boolean</option>
              <option value="json">JSON</option>
            </select>
          </div>
          <div>
            <label class="cx-label">Category</label>
            <select class="cx-select" [(ngModel)]="form.category">
              <option value="general">General</option>
              <option value="security">Security</option>
              <option value="notification">Notification</option>
              <option value="approval">Approval</option>
              <option value="penalty">Penalty</option>
              <option value="payment">Payment</option>
              <option value="accounting">Accounting</option>
            </select>
          </div>
        </div>
        <div>
          <label class="cx-label">Description</label>
          <input class="cx-input" [(ngModel)]="form.description" placeholder="What this setting controls" />
        </div>
        <label class="cx-settings-encrypted">
          <input type="checkbox" [(ngModel)]="form.is_encrypted" />
          <div class="cx-settings-encrypted-meta">
            <span class="cx-settings-encrypted-label">Encrypted value</span>
            <span class="cx-settings-encrypted-hint">Check this for sensitive values like API keys or secrets</span>
          </div>
        </label>
      </div>
    </cx-form-dialog>
  `,
  styles: [`
    .cx-settings-cats {
      display: flex; flex-wrap: wrap; gap: 6px;
      margin-bottom: 1rem;
    }
    .cx-settings-cat {
      padding: 5px 12px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-pill);
      font-size: var(--cx-text-xs); font-weight: 500;
      color: var(--cx-text-secondary);
      cursor: pointer;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-settings-cat:hover:not(.is-active) {
      border-color: var(--cx-primary-200);
      color: var(--cx-text);
    }
    .cx-settings-cat.is-active {
      background: var(--cx-primary-600);
      color: #fff;
      border-color: var(--cx-primary-600);
      box-shadow: var(--cx-shadow-green);
    }

    .cx-settings-groups { display: flex; flex-direction: column; gap: 0.85rem; }
    .cx-settings-group {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      overflow: hidden;
    }
    .cx-settings-group-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.65rem 1rem;
      background: var(--cx-surface-2);
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cx-settings-group-title {
      margin: 0;
      font-size: var(--cx-text-xs); font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--cx-text-secondary);
    }
    .cx-settings-group-count {
      font-size: var(--cx-text-xs); font-weight: 500;
      color: var(--cx-text-muted);
      background: var(--cx-stone-100);
      padding: 2px 8px;
      border-radius: var(--cx-radius-pill);
      font-variant-numeric: tabular-nums;
    }

    .cx-settings-rows { display: flex; flex-direction: column; }
    .cx-settings-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 1rem;
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--cx-border-subtle);
      transition: background var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-settings-row:last-child { border-bottom: none; }
    .cx-settings-row:hover { background: var(--cx-surface-hover); }
    .cx-settings-row-main { flex: 1; min-width: 0; }
    .cx-settings-row-label {
      font-size: var(--cx-text-sm); font-weight: 500;
      color: var(--cx-text);
    }
    .cx-settings-row-desc {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      margin-top: 2px;
    }
    .cx-settings-row-control {
      display: flex; align-items: center; gap: 0.65rem;
      flex-shrink: 0;
    }
    .cx-settings-value {
      font-family: var(--cx-font-mono);
      font-size: var(--cx-text-xs);
      color: var(--cx-text-secondary);
      max-width: 220px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      background: var(--cx-stone-50);
      padding: 3px 9px;
      border-radius: var(--cx-radius-sm);
      border: 1px solid var(--cx-border-subtle);
    }

    /* Switch toggle */
    .cx-settings-switch {
      width: 40px; height: 22px;
      background: var(--cx-stone-300);
      border: none;
      border-radius: var(--cx-radius-pill);
      position: relative;
      cursor: pointer;
      transition: background var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cx-settings-switch.is-on { background: var(--cx-primary-600); }
    .cx-settings-switch-thumb {
      position: absolute;
      top: 3px; left: 3px;
      width: 16px; height: 16px;
      background: var(--cx-surface);
      border-radius: 50%;
      box-shadow: var(--cx-shadow-sm);
      transition: transform var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cx-settings-switch.is-on .cx-settings-switch-thumb { transform: translateX(18px); }

    /* Encrypted check-box */
    .cx-settings-encrypted {
      display: flex; align-items: flex-start; gap: 0.65rem;
      padding: 0.75rem;
      background: var(--cx-stone-50);
      border: 1px solid var(--cx-border-subtle);
      border-radius: var(--cx-radius-md);
      cursor: pointer;
    }
    .cx-settings-encrypted input[type="checkbox"] { margin-top: 2px; cursor: pointer; }
    .cx-settings-encrypted-meta { display: flex; flex-direction: column; }
    .cx-settings-encrypted-label {
      font-size: var(--cx-text-sm); font-weight: 500;
      color: var(--cx-text);
    }
    .cx-settings-encrypted-hint {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      margin-top: 2px;
    }
  `],
})
export class SettingsComponent implements OnInit {
  rows = signal<any[]>([]); loading = signal(true);
  activeCategory = '';
  allCategories = ['', 'general', 'security', 'notification', 'approval', 'penalty', 'payment', 'accounting'];
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {};

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService, public settings: SettingsService) {}
  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    const params: any = { per_page: 200 };
    if (this.activeCategory) params.category = this.activeCategory;
    this.api.get('/settings', params).subscribe({
      next: r => { this.rows.set(r.data || []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  groupedSettings(): { category: string; settings: any[] }[] {
    const map = new Map<string, any[]>();
    for (const s of this.rows()) {
      const cat = s.category || 'general';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    return Array.from(map.entries()).map(([category, settings]) => ({ category, settings }));
  }

  formatKey(key: string): string { return key.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

  toggleBool(s: any) {
    const newVal = (s.value === 'true' || s.value === '1') ? 'false' : 'true';
    this.api.put('/settings/' + s.id, { value: newVal }).subscribe({
      next: () => { s.value = newVal; this.toast.success(`${this.formatKey(s.key)}: ${newVal === 'true' ? 'Enabled' : 'Disabled'}`); },
      error: (e: any) => this.toast.error(e.error?.message || 'Failed'),
    });
  }

  openForm(row?: any) {
    if (row) {
      this.editId = row.id;
      this.form = { key: row.key, value: row.value, type: row.type, category: row.category, description: row.description, is_encrypted: row.is_encrypted };
    } else {
      this.editId = null;
      this.form = { key: '', value: '', type: 'string', category: 'general', description: '', is_encrypted: false };
    }
    this.showForm.set(true);
  }

  saveForm() {
    if (!this.form.key) { this.toast.error('Key is required'); return; }
    this.saving.set(true);
    // Ensure value is always string for the API
    const payload = { ...this.form, value: String(this.form.value) };
    (this.editId ? this.api.put('/settings/' + this.editId, payload) : this.api.post('/settings', payload)).subscribe({
      next: r => { this.saving.set(false); this.toast.success(r.message || 'Saved'); this.showForm.set(false); this.load(); },
      error: (e: any) => { this.saving.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }
}
