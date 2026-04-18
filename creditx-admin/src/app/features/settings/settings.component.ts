import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';

@Component({
  selector: 'app-settings', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, FormDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="System Settings" subtitle="Configure application behavior">
        @if (auth.hasPermission('settings.create')) {
          <button class="cx-btn cx-btn-primary" (click)="openForm()"><lucide-icon name="plus" [size]="16"></lucide-icon> Add Setting</button>
        }
      </cx-page-header>

      <!-- Category Filter -->
      <div class="flex flex-wrap gap-2 mb-4">
        @for (cat of allCategories; track cat) {
          <button class="px-3 py-1.5 text-xs font-semibold rounded-full transition-all"
                  [class]="activeCategory === cat ? 'bg-[var(--cx-primary)] text-white' : 'bg-[var(--cx-surface)] text-[var(--cx-text-muted)] border border-[var(--cx-border)] hover:bg-[var(--cx-surface-hover)]'"
                  (click)="activeCategory = cat; load()">
            {{ cat === '' ? 'All' : (cat | titlecase) }}
          </button>
        }
      </div>

      @if (loading()) {
        <div class="cx-card flex items-center justify-center py-16">
          <div class="w-8 h-8 border-3 border-[var(--cx-primary)] border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else {
        <div class="space-y-3">
          @for (group of groupedSettings(); track group.category) {
            <div class="cx-card !p-0 overflow-hidden">
              <div class="px-5 py-3 bg-[var(--cx-surface-hover)] border-b border-[var(--cx-border)]">
                <h3 class="text-xs font-bold text-[var(--cx-text-muted)] uppercase tracking-wider">{{ group.category }}</h3>
              </div>
              <div class="divide-y divide-[var(--cx-border)]">
                @for (s of group.settings; track s.id) {
                  <div class="flex items-center justify-between px-5 py-4 hover:bg-[var(--cx-surface-hover)]/30 transition-colors">
                    <div class="flex-1 min-w-0 mr-4">
                      <div class="text-sm font-medium text-[var(--cx-text)]">{{ formatKey(s.key) }}</div>
                      <div class="text-[10px] text-[var(--cx-text-muted)] mt-0.5">{{ s.description || s.key }}</div>
                    </div>
                    <div class="flex items-center gap-3 flex-shrink-0">
                      @if (s.type === 'boolean') {
                        <button class="relative w-11 h-6 rounded-full transition-colors cursor-pointer"
                                [style.background]="s.value === 'true' || s.value === '1' ? 'var(--cx-primary)' : '#cbd5e1'"
                                (click)="toggleBool(s)">
                          <span class="absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-all duration-200"
                                [style.left]="s.value === 'true' || s.value === '1' ? '23px' : '3px'"></span>
                        </button>
                      } @else {
                        <span class="text-xs font-mono text-[var(--cx-text-secondary)] max-w-[200px] truncate">
                          {{ s.is_encrypted ? '••••••••' : (s.value || '—') }}
                        </span>
                      }
                      <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(s)"><lucide-icon name="pencil" [size]="14"></lucide-icon></button>
                    </div>
                  </div>
                }
              </div>
            </div>
          }
          @if (rows().length === 0) {
            <div class="cx-card text-center py-12">
              <lucide-icon name="settings" [size]="36" class="text-[var(--cx-text-muted)] opacity-30 mx-auto mb-2"></lucide-icon>
              <p class="text-sm text-[var(--cx-text-muted)]">No settings found</p>
            </div>
          }
        </div>
      }
    </div>

    <cx-form-dialog [open]="showForm()" [title]="editId ? 'Edit Setting' : 'Add Setting'" [saving]="saving()" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="space-y-4">
        <div><label class="cx-label">Key *</label><input class="cx-input" [(ngModel)]="form.key" [disabled]="!!editId" placeholder="e.g. 2fa.enabled" /></div>
        <div><label class="cx-label">Value *</label>
          @if (form.type === 'boolean') {
            <select class="cx-select" [(ngModel)]="form.value"><option value="true">Enabled (true)</option><option value="false">Disabled (false)</option></select>
          } @else if (form.type === 'json') {
            <textarea class="cx-input font-mono text-xs" rows="4" [(ngModel)]="form.value"></textarea>
          } @else {
            <input class="cx-input" [(ngModel)]="form.value" [type]="form.type === 'integer' || form.type === 'float' ? 'number' : 'text'" />
          }
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Type</label>
            <select class="cx-select" [(ngModel)]="form.type">
              <option value="string">String</option>
              <option value="integer">Integer</option>
              <option value="float">Float</option>
              <option value="boolean">Boolean</option>
              <option value="json">JSON</option>
            </select>
          </div>
          <div><label class="cx-label">Category</label>
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
        <div><label class="cx-label">Description</label><input class="cx-input" [(ngModel)]="form.description" placeholder="What this setting controls" /></div>
        <div class="flex items-center gap-2">
          <input type="checkbox" id="enc" [(ngModel)]="form.is_encrypted" class="rounded" />
          <label for="enc" class="text-xs text-[var(--cx-text-secondary)]">Encrypted (sensitive value)</label>
        </div>
      </div>
    </cx-form-dialog>
  `,
})
export class SettingsComponent implements OnInit {
  rows = signal<any[]>([]); loading = signal(true);
  activeCategory = '';
  allCategories = ['', 'general', 'security', 'notification', 'approval', 'penalty', 'payment', 'accounting'];
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {};

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
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
