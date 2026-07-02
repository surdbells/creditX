import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * TenantConfigService — resolves and persists WHICH organisation (tenant)
 * this install of the agent app talks to.
 *
 * A single app binary serves every CreditX client. Each client has its own
 * isolated backend at `{slug}.api.creditx.app`. On first run the agent enters
 * their org code; the app builds the API base URL, validates it against the
 * tenant's public settings, and stores it. Every request then uses the stored
 * base URL (see ApiService / AuthService). "Switch organisation" clears it.
 *
 * Persistence uses localStorage — the same store the app already uses for
 * auth tokens; it survives app restarts in the Capacitor WebView.
 */
@Injectable({ providedIn: 'root' })
export class TenantConfigService {
  private readonly API_URL_KEY = 'cxa_api_url';
  private readonly SLUG_KEY = 'cxa_tenant_slug';
  private readonly NAME_KEY = 'cxa_tenant_name';

  /** Reactive tenant display name (for branding in the shell). */
  readonly tenantName = signal<string | null>(localStorage.getItem(this.NAME_KEY));
  readonly tenantSlug = signal<string | null>(localStorage.getItem(this.SLUG_KEY));

  /**
   * The active API base URL (…/api). Returns the stored tenant URL, else the
   * environment fallback (used in dev where requireTenantSelection is false).
   */
  getApiUrl(): string {
    return localStorage.getItem(this.API_URL_KEY) || environment.apiUrl || '';
  }

  /** True once a tenant has been explicitly selected and stored. */
  isConfigured(): boolean {
    return !!localStorage.getItem(this.API_URL_KEY);
  }

  /**
   * Whether the app should force the tenant-selection screen before login.
   * In dev (requireTenantSelection = false) the environment fallback is used.
   */
  mustSelectTenant(): boolean {
    return environment.requireTenantSelection && !this.isConfigured();
  }

  /** Build a tenant API base URL from an org code using the env template. */
  buildApiUrl(code: string): string {
    const slug = code.trim().toLowerCase();
    return environment.apiUrlTemplate.replace('{slug}', slug);
  }

  /** Normalise an org code to a valid slug, or null if invalid. */
  normaliseCode(code: string): string | null {
    const slug = (code || '').trim().toLowerCase();
    return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) ? slug : null;
  }

  /** Persist the resolved tenant. */
  setTenant(slug: string, apiUrl: string, displayName: string | null): void {
    localStorage.setItem(this.API_URL_KEY, apiUrl);
    localStorage.setItem(this.SLUG_KEY, slug);
    if (displayName) localStorage.setItem(this.NAME_KEY, displayName);
    else localStorage.removeItem(this.NAME_KEY);
    this.tenantSlug.set(slug);
    this.tenantName.set(displayName);
  }

  /** Forget the tenant (Switch organisation). Does not touch auth tokens —
   *  callers should log out separately. */
  clear(): void {
    localStorage.removeItem(this.API_URL_KEY);
    localStorage.removeItem(this.SLUG_KEY);
    localStorage.removeItem(this.NAME_KEY);
    this.tenantSlug.set(null);
    this.tenantName.set(null);
  }

  /** This build's version, for min-version comparison. */
  appVersion(): string {
    return environment.appVersion;
  }

  /**
   * Semver-ish compare: returns true when `current` is older than `min`
   * (i.e. the app must update). Missing/blank min never forces an update.
   */
  isOutdated(current: string, min: string | null | undefined): boolean {
    if (!min) return false;
    const a = current.split('.').map(n => parseInt(n, 10) || 0);
    const b = min.split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] || 0, y = b[i] || 0;
      if (x < y) return true;
      if (x > y) return false;
    }
    return false;
  }
}
