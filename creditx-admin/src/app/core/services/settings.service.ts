import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Shape of the /api/settings/public response data field.
 * Each key is optional — the backend skips missing keys rather than
 * returning null, so consumers should always use the typed accessors
 * (currencySymbol(), companyName(), etc.) which apply fallbacks.
 */
interface PublicSettingsMap {
  'general.currency'?: string;
  'general.currency_symbol'?: string;
  'general.company_name'?: string;
  'general.support_email'?: string;
  'general.date_format'?: string;
}

/**
 * Service for system-wide presentation settings.
 *
 * Loaded once at app boot via APP_INITIALIZER (see app.config.ts) by
 * calling load() before the first component renders. Components access
 * values through typed signal accessors that always return a usable
 * value — even before load() resolves, the hardcoded fallbacks render
 * so the UI never shows blank brand placeholders.
 *
 * Why a service rather than just hardcoding via the build:
 *   - Admins can rebrand without a redeploy (currency symbol, company
 *     name, support email change in the Settings UI and propagate on
 *     next page load for all users).
 *   - The login screen reads the company name BEFORE auth, so the
 *     endpoint is unauthenticated.
 *
 * Why APP_INITIALIZER and not lazy-load:
 *   - Components display these values on first render. A reactive
 *     "wait for settings" pattern would either show blanks first or
 *     wrap every consumer in a loading guard. Loading once at boot
 *     (the request is small + cached on backend) avoids both.
 *   - If load() fails (network blip, backend down), the fallback
 *     values render. The UI never blocks on a settings fetch.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly settings = signal<PublicSettingsMap>({});
  private loaded = false;

  // Hardcoded fallbacks. These mirror the seed values in
  // backend/bin/seed.php so dev-without-backend and post-failure
  // behavior matches what an admin would see if they hadn't yet
  // changed anything. Keeping them in sync is a manual concern —
  // there's no automated test to catch divergence.
  private static readonly FALLBACKS: Required<PublicSettingsMap> = {
    'general.currency': 'NGN',
    'general.currency_symbol': '₦',
    'general.company_name': 'CreditX',
    'general.support_email': 'support@dostsuite.com',
    'general.date_format': 'Y-m-d',
  };

  /**
   * Fetch settings from the backend. Called once by APP_INITIALIZER
   * during app bootstrap. Failures are swallowed — the service falls
   * back to hardcoded defaults and the app continues to render. This
   * is deliberate: a failed settings fetch should never block login.
   */
  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const res = await firstValueFrom(
        this.http.get<{ status: string; data: PublicSettingsMap }>(
          `${environment.apiUrl}/settings/public`
        )
      );
      this.settings.set(res?.data || {});
    } catch {
      // Intentional: keep going with fallbacks. Logging here would
      // pollute the console on offline/dev scenarios; the fallback
      // values produce a working UI either way.
      this.settings.set({});
    }
    this.loaded = true;
  }

  // ─── Typed signal accessors ─────────────────────────────────────
  // Each accessor returns the configured value when present, else the
  // hardcoded fallback. Computed signals re-evaluate when the underlying
  // settings signal changes, so a future "reload settings" flow would
  // propagate to all consumers automatically.

  readonly currency = computed(() =>
    this.settings()['general.currency'] || SettingsService.FALLBACKS['general.currency']
  );

  readonly currencySymbol = computed(() =>
    this.settings()['general.currency_symbol'] || SettingsService.FALLBACKS['general.currency_symbol']
  );

  readonly companyName = computed(() =>
    this.settings()['general.company_name'] || SettingsService.FALLBACKS['general.company_name']
  );

  readonly supportEmail = computed(() =>
    this.settings()['general.support_email'] || SettingsService.FALLBACKS['general.support_email']
  );

  readonly dateFormat = computed(() =>
    this.settings()['general.date_format'] || SettingsService.FALLBACKS['general.date_format']
  );

  // ─── Formatting helpers ─────────────────────────────────────────
  // Components that build strings (chart axes, exports, PDFs) call
  // these directly rather than depending on the | money pipe, since
  // a pipe only works inside Angular templates.

  /**
   * Format a numeric amount with the configured currency symbol.
   * Examples (with default ₦):
   *   formatMoney(1234567)   -> "₦1,234,567"
   *   formatMoney(1234.5)    -> "₦1,234.5"
   *   formatMoney('1000')    -> "₦1,000"
   *   formatMoney(null)      -> "₦0"
   *   formatMoney(undefined) -> "₦0"
   *
   * Locale formatting uses 'en-NG' which matches the existing
   * platform default; if we ever add multi-locale support, this
   * should accept a locale param.
   */
  formatMoney(value: string | number | null | undefined, options?: { fractionDigits?: number }): string {
    const symbol = this.currencySymbol();
    if (value === null || value === undefined || value === '') return `${symbol}0`;
    const n = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(n)) return `${symbol}0`;
    const fd = options?.fractionDigits ?? 0;
    const formatted = n.toLocaleString('en-NG', {
      maximumFractionDigits: fd,
      minimumFractionDigits: fd,
    });
    return `${symbol}${formatted}`;
  }

  /**
   * Compact money format for chart axis labels and tight UI spaces.
   *   1_234_567 -> ₦1.2M
   *   45_000    -> ₦45K
   *   8_500     -> ₦8,500
   *   0         -> ₦0
   * Matches the formatter previously inlined in chart components.
   */
  formatMoneyCompact(value: string | number | null | undefined): string {
    const symbol = this.currencySymbol();
    if (value === null || value === undefined || value === '' || value === 0) return `${symbol}0`;
    const n = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(n)) return `${symbol}0`;
    if (n >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${symbol}${(n / 1_000).toFixed(0)}K`;
    return `${symbol}${Math.round(n).toLocaleString()}`;
  }
}
