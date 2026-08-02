import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { applyBrandColors, applyFavicon } from '../util/brand-color';

interface PublicSettingsMap {
  'general.company_name'?: string;
  'brand.primary_color'?: string;
  'brand.accent_color'?: string;
  'brand.logo_url'?: string;
}

/**
 * Public settings + branding for the customer portal. Loaded once at boot
 * (APP_INITIALIZER) so the org's colours, logo, and name theme the login
 * screen before auth. Failures fall back to CreditX defaults — never blocks.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly settings = signal<PublicSettingsMap>({});
  private loaded = false;

  readonly companyName = computed(() => this.settings()['general.company_name'] || 'CreditX');
  readonly primaryColor = computed(() => this.settings()['brand.primary_color'] || '#0A4F2A');
  readonly accentColor = computed(() => this.settings()['brand.accent_color'] || '#C9A227');
  readonly logoUrl = computed(() => this.settings()['brand.logo_url'] || null);

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const res = await firstValueFrom(
        this.http.get<{ status: string; data: PublicSettingsMap }>(`${environment.apiUrl}/settings/public`)
      );
      this.settings.set(res?.data || {});
      const s = this.settings();
      applyBrandColors(s['brand.primary_color'], s['brand.accent_color']);
      applyFavicon(s['brand.logo_url']);
      // The favicon was already white-labelled here; the tab title was not, so
      // every institution's customers still saw "CreditX" in the browser tab.
      const name = s['general.company_name'];
      if (name) {
        document.title = `${name} — Customer Portal`;
      }
    } catch {
      // Keep CreditX fallbacks; the portal must still boot.
    }
    this.loaded = true;
  }
}
