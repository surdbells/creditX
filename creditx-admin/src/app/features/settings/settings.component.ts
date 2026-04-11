import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Save, Pencil } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-settings', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="System Settings" subtitle="Configure system behavior"></cx-page-header>
      @if (loading()) {
        <div class="flex justify-center py-12"><div class="w-5 h-5 border-2 border-[var(--cx-primary)] border-t-transparent rounded-full animate-spin"></div></div>
      } @else {
        @for (cat of categories(); track cat) {
          <div class="cx-card mb-4">
            <h3 class="text-sm font-semibold text-[var(--cx-text)] mb-4 capitalize">{{ cat }}</h3>
            @for (setting of settingsByCategory(cat); track setting.id) {
              <div class="flex items-center justify-between py-3 border-b border-[var(--cx-border)] last:border-0">
                <div class="flex-1 min-w-0 mr-4">
                  <div class="text-sm font-medium text-[var(--cx-text)]">{{ setting.key }}</div>
                  <div class="text-xs text-[var(--cx-text-muted)]">{{ setting.description }}</div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  @if (editingKey === setting.key) {
                    <input class="cx-input !w-48" [(ngModel)]="editValue" />
                    <button class="cx-btn cx-btn-primary cx-btn-sm" (click)="saveSetting(setting)"><lucide-icon name="save" [size]="14"></lucide-icon></button>
                  } @else {
                    <span class="text-sm font-mono text-[var(--cx-text-secondary)] max-w-[200px] truncate">{{ setting.value }}</span>
                    <button class="cx-btn cx-btn-ghost cx-btn-sm cx-btn-icon" (click)="editingKey=setting.key;editValue=setting.value"><lucide-icon name="pencil" [size]="14"></lucide-icon></button>
                  }
                </div>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class SettingsComponent implements OnInit {
  settings = signal<any[]>([]); loading = signal(true);
  editingKey: string|null = null; editValue = '';
  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit() { this.load(); }
  load() { this.loading.set(true); this.api.get('/settings',{per_page:200}).subscribe({next:r=>{this.settings.set(r.data||[]);this.loading.set(false);},error:()=>this.loading.set(false)}); }
  categories(): string[] { return [...new Set((this.settings()||[]).map((s:any)=>s.category||'general'))]; }
  settingsByCategory(cat: string): any[] { return (this.settings()||[]).filter((s:any)=>(s.category||'general')===cat); }
  saveSetting(setting: any) {
    this.api.put('/settings/'+setting.id,{value:this.editValue}).subscribe({
      next:r=>{this.toast.success('Setting updated');this.editingKey=null;this.load();},
      error:e=>this.toast.error(e.error?.message||'Failed'),
    });
  }
}
