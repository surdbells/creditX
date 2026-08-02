import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { SettingsService } from '../../core/services/settings.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { applyBrandColors, applyFavicon } from '../../core/util/brand-color';
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import { PageGuide } from '../../shared/guide/page-guide.model';

/**
 * Branding — org admins set the company name, brand colours, and logo. Colours
 * preview live (the whole app recolours as you pick); Save persists them and
 * reloads settings so the change propagates everywhere. Gated by settings.edit.
 */
const BRANDING_GUIDE: PageGuide = {
  id: 'branding',
  titleKey: 'Branding',
  purposeKey: 'Puts your own name, logo and colours across the admin app and customer portal.',
  descriptionKey:
    'The platform is white-labelled: what customers see should be your institution, not the '
    + 'software. Set here, the name and colours flow through the portal, the sign-in screens, the '
    + 'browser tab and outgoing messages.',
  actionKeys: [
    'Set the institution name shown to customers',
    'Upload a logo',
    'Set the primary and accent colours',
  ],
  usedByKeys: ['Customer portal', 'Admin app', 'Notification emails'],
  businessRuleKeys: [
    'Branding is public by necessity — the portal reads it before anyone signs in. Never put anything sensitive in these fields.',
    'Changes apply immediately for everyone; there is no preview or staging.',
    'The logo is used at small sizes. A wide wordmark will be unreadable where a compact mark would not.',
  ],
  tipKeys: [
    'Check the customer portal after changing colours, not just the admin app — that is where customers meet your brand.',
    'Pick a primary colour with enough contrast for text on it, or buttons become hard to read.',
  ],
  permissionKeys: ['settings.edit'],
};

@Component({
  selector: 'app-branding',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, PageGuideComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Branding" subtitle="Make the admin & customer portal your own" eyebrow="System"></cx-page-header>

      <cx-page-guide [guide]="guide"></cx-page-guide>

      <div class="cx-brand-grid">
        <div class="cx-brand-card">
          <label class="cx-label">Company Name</label>
          <input class="cx-input" [(ngModel)]="form.company_name" placeholder="e.g. DOST HQ Limited" maxlength="120" />

          <label class="cx-label" style="margin-top:16px">Logo</label>
          <div class="cx-brand-logo-row">
            <div class="cx-brand-logo-preview">
              @if (form.logo_url) {
                <img [src]="form.logo_url" alt="Logo" />
              } @else {
                <span class="cx-brand-logo-empty">No logo</span>
              }
            </div>
            <div>
              <label class="cx-btn cx-btn-secondary cx-btn-sm" style="cursor:pointer">
                <lucide-icon name="upload" [size]="14"></lucide-icon>
                <span>{{ uploading() ? 'Uploading…' : 'Upload logo' }}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden (change)="onLogo($event)" [disabled]="uploading()" />
              </label>
              <div class="cx-field-hint">PNG, JPEG, WebP or SVG. Shown on login and in emails.</div>
            </div>
          </div>

          <label class="cx-label" style="margin-top:16px">Brand Colours</label>
          <div class="cx-brand-colors">
            <div class="cx-brand-color">
              <span>Primary</span>
              <input type="color" [ngModel]="form.primary_color" (ngModelChange)="setColor('primary_color', $event)" />
              <input class="cx-input cx-input-sm" [ngModel]="form.primary_color" (ngModelChange)="setColor('primary_color', $event)" maxlength="7" />
            </div>
            <div class="cx-brand-color">
              <span>Accent</span>
              <input type="color" [ngModel]="form.accent_color" (ngModelChange)="setColor('accent_color', $event)" />
              <input class="cx-input cx-input-sm" [ngModel]="form.accent_color" (ngModelChange)="setColor('accent_color', $event)" maxlength="7" />
            </div>
          </div>

          <div class="cx-brand-actions">
            <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="reset()" [disabled]="saving()">Reset to CreditX</button>
            <button class="cx-btn cx-btn-primary" (click)="save()" [disabled]="saving() || uploading()">
              {{ saving() ? 'Saving…' : 'Save Branding' }}
            </button>
          </div>
        </div>

        <div class="cx-brand-card">
          <div class="cx-label">Preview</div>
          <div class="cx-brand-preview">
            <div class="cx-brand-preview-bar">
              @if (form.logo_url) { <img [src]="form.logo_url" alt="" /> }
              <strong>{{ form.company_name || 'Your Company' }}</strong>
            </div>
            <button class="cx-btn cx-btn-primary cx-btn-sm">Primary button</button>
            <button class="cx-btn cx-btn-accent cx-btn-sm">Accent button</button>
            <span class="cx-badge cx-badge-success">Success badge</span>
          </div>
          <div class="cx-field-hint" style="margin-top:12px">Colours apply live across the app as you edit. Save to make them permanent for everyone.</div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .cx-brand-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 360px); gap: 16px; }
    @media (max-width: 900px) { .cx-brand-grid { grid-template-columns: 1fr; } }
    .cx-brand-card { background: var(--cx-surface); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-xl, 12px); padding: 20px; }
    .cx-brand-logo-row { display: flex; gap: 16px; align-items: center; }
    .cx-brand-logo-preview { width: 88px; height: 88px; border: 1px dashed var(--cx-border); border-radius: 12px;
      display: flex; align-items: center; justify-content: center; overflow: hidden; background: var(--cx-surface-2); flex: none; }
    .cx-brand-logo-preview img { width: 100%; height: 100%; object-fit: contain; }
    .cx-brand-logo-empty { font-size: 12px; color: var(--cx-text-muted); }
    .cx-brand-colors { display: flex; gap: 24px; flex-wrap: wrap; }
    .cx-brand-color { display: flex; align-items: center; gap: 8px; }
    .cx-brand-color span { font-size: 13px; color: var(--cx-text-secondary); width: 56px; }
    .cx-brand-color input[type=color] { width: 40px; height: 34px; padding: 0; border: 1px solid var(--cx-border); border-radius: 8px; background: none; cursor: pointer; }
    .cx-brand-color .cx-input-sm { width: 90px; }
    .cx-brand-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 22px; gap: 12px; }
    .cx-brand-preview { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
    .cx-brand-preview-bar { display: flex; align-items: center; gap: 8px; }
    .cx-brand-preview-bar img { height: 28px; max-width: 120px; object-fit: contain; }
  `],
})
export class BrandingComponent {
  readonly guide = BRANDING_GUIDE;

  form: any = { company_name: '', primary_color: '#0A4F2A', accent_color: '#C9A227', logo_url: '' };
  saving = signal(false);
  uploading = signal(false);

  constructor(private api: ApiService, private toast: ToastService, private settings: SettingsService) {
    this.api.get('/branding').subscribe({
      next: r => {
        const d = r.data || {};
        this.form = {
          company_name: d.company_name || '',
          primary_color: d.primary_color || '#0A4F2A',
          accent_color: d.accent_color || '#C9A227',
          logo_url: d.logo_url || '',
        };
      },
      error: () => {},
    });
  }

  setColor(key: 'primary_color' | 'accent_color', v: string): void {
    this.form[key] = v;
    // Live preview across the whole app.
    applyBrandColors(this.form.primary_color, this.form.accent_color);
  }

  onLogo(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('logo', file);
    this.uploading.set(true);
    this.api.upload('/branding/logo', fd).subscribe({
      next: r => {
        this.uploading.set(false);
        this.form.logo_url = r.data?.logo_url || this.form.logo_url;
        applyFavicon(this.form.logo_url);
        this.toast.success('Logo updated');
      },
      error: e => { this.uploading.set(false); this.toast.error(e.error?.message || 'Upload failed'); },
    });
    input.value = '';
  }

  save(): void {
    this.saving.set(true);
    this.api.put('/branding', {
      primary_color: this.form.primary_color,
      accent_color: this.form.accent_color,
      company_name: this.form.company_name,
    }).subscribe({
      next: async r => {
        this.saving.set(false);
        this.toast.success(r.message || 'Branding saved');
        await this.settings.reload();
      },
      error: e => { this.saving.set(false); this.toast.error(e.error?.message || 'Save failed'); },
    });
  }

  reset(): void {
    this.form.primary_color = '#0A4F2A';
    this.form.accent_color = '#C9A227';
    applyBrandColors(this.form.primary_color, this.form.accent_color);
  }
}
