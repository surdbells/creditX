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
      <cx-page-header title="System Settings" subtitle="Configure application behavior and preferences">
        @if (auth.hasPermission('settings.create')) {
          <button class="cx-btn cx-btn-primary" (click)="openForm()"><lucide-icon name="plus" [size]="16"></lucide-icon> Add Setting</button>
        }
      </cx-page-header>

      <!-- Category Tabs -->
      <div class="flex gap-1 mb-4 border-b border-[var(--cx-border)] pb-px overflow-x-auto">
        <button class="px-4 py-2.5 text-xs font-semibold whitespace-nowrap rounded-t-lg transition-all"
                [class]="activeCategory === '' ? 'text-[var(--cx-primary)] border-b-2 border-[var(--cx-primary)] bg-[var(--cx-surface)]' : 'text-[var(--cx-text-muted)] hover:text-[var(--cx-text)]'"
                (click)="activeCategory = ''; load()">All</button>
        @for (cat of categories(); track cat) {
          <button class="px-4 py-2.5 text-xs font-semibold whitespace-nowrap rounded-t-lg transition-all capitalize"
                  [class]="activeCategory === cat ? 'text-[var(--cx-primary)] border-b-2 border-[var(--cx-primary)] bg-[var(--cx-surface)]' : 'text-[var(--cx-text-muted)] hover:text-[var(--cx-text)]'"
                  (click)="activeCategory = cat; load()">{{ cat }}</button>
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
                @for (setting of group.settings; track setting.id) {
                  <div class="flex items-center justify-between px-5 py-4 hover:bg-[var(--cx-surface-hover)]/50 transition-colors">
                    <div class="flex-1 min-w-0 mr-4">
                      <div class="text-sm font-medium text-[var(--cx-text)]">{{ formatKey(setting.key) }}</div>
                      <div class="text-xs text-[var(--cx-text-muted)] mt-0.5">{{ setting.description || setting.key }}</div>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      @if (setting.type === 'boolean') {
                        <button class="w-11 h-6 rounded-full transition-colors relative"
                                [class]="setting.value === 'true' ? 'bg-[var(--cx-primary)]' : 'bg-gray-300'"
                                (click)="toggleBool(setting)">
                          <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                                [class]="setting.value === 'true' ? 'left-[22px]' : 'left-0.5'"></span>
                        </button>
                      } @else {
                        <span class="text-sm font-mono text-[var(--cx-text-secondary)] max-w-[200px] truncate">{{ setting.is_encrypted ? '••••••' : setting.value }}</span>
                      }
                      <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="openForm(setting)"><lucide-icon name="pencil" [size]="14"></lucide-icon></button>
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>

    <cx-form-dialog [open]="showForm()" [title]="editId ? 'Edit Setting' : 'Add Setting'" [saving]="saving()" (close)="showForm.set(false)" (save)="saveForm()">
      <div class="space-y-4">
        <div><label class="cx-label">Key *</label><input class="cx-input" [(ngModel)]="form.key" [disabled]="!!editId" /></div>
        <div><label class="cx-label">Value *</label>
          @if (form.type === 'text' || form.type === 'string') {
            <textarea class="cx-input" rows="3" [(ngModel)]="form.value"></textarea>
          } @else {
            <input class="cx-input" [(ngModel)]="form.value" />
          }
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="cx-label">Type</label>
            <select class="cx-select" [(ngModel)]="form.type">
              <option value="string">String</option><option value="number">Number</option>
              <option value="boolean">Boolean</option><option value="json">JSON</option>
              <option value="text">Text</option>
            </select>
          </div>
          <div><label class="cx-label">Category</label><input class="cx-input" [(ngModel)]="form.category" placeholder="general" /></div>
        </div>
        <div><label class="cx-label">Description</label><input class="cx-input" [(ngModel)]="form.description" /></div>
        <div class="flex items-center gap-2">
          <input type="checkbox" id="encrypted" [(ngModel)]="form.is_encrypted" class="rounded" />
          <label for="encrypted" class="text-xs text-[var(--cx-text-secondary)]">Encrypted (sensitive value)</label>
        </div>
      </div>
    </cx-form-dialog>
  `,
})
export class SettingsComponent implements OnInit {
  rows = signal<any[]>([]); loading = signal(true);
  categories = signal<string[]>([]);
  activeCategory = '';
  showForm = signal(false); saving = signal(false); editId: string|null = null; form: any = {};

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    const params: any = { per_page: 200 };
    if (this.activeCategory) params.category = this.activeCategory;
    this.api.get('/settings', params).subscribe({
      next: r => {
        this.rows.set(r.data || []);
        if (!this.activeCategory) {
          const cats = [...new Set((r.data || []).map((s: any) => s.category))].filter(Boolean) as string[];
          this.categories.set(cats);
        }
        this.loading.set(false);
      },
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

  toggleBool(setting: any) {
    const newVal = setting.value === 'true' ? 'false' : 'true';
    this.api.put('/settings/' + setting.id, { value: newVal }).subscribe({
      next: () => { setting.value = newVal; this.toast.success('Updated'); },
      error: e => this.toast.error(e.error?.message || 'Failed'),
    });
  }

  openForm(row?: any) {
    if (row) { this.editId = row.id; this.form = { key: row.key, value: row.value, type: row.type, category: row.category, description: row.description, is_encrypted: row.is_encrypted }; }
    else { this.editId = null; this.form = { key: '', value: '', type: 'string', category: 'general', description: '', is_encrypted: false }; }
    this.showForm.set(true);
  }

  saveForm() {
    this.saving.set(true);
    (this.editId ? this.api.put('/settings/' + this.editId, this.form) : this.api.post('/settings', this.form)).subscribe({
      next: r => { this.saving.set(false); this.toast.success(r.message || 'Saved'); this.showForm.set(false); this.load(); },
      error: e => { this.saving.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }
}
