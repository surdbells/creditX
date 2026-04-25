import { Pipe, PipeTransform, inject } from '@angular/core';
import { SettingsService } from '../../core/services/settings.service';

/**
 * Format a numeric amount with the system-configured currency symbol.
 *
 * Usage in templates:
 *   {{ loan.amount_requested | money }}             -> ₦1,234,567
 *   {{ loan.amount_requested | money:2 }}            -> ₦1,234,567.00
 *   {{ loan.amount_requested | money:0:'compact' }}  -> ₦1.2M
 *
 * Replaces 220+ hardcoded ₦ literals across the app. The symbol is
 * read from SettingsService at format time, so an admin updating
 * general.currency_symbol via Settings UI propagates on next page
 * load (the service caches per page session).
 *
 * NOT pure (`pure: false`) so the rendered value reacts when the
 * underlying SettingsService signal changes during the same view —
 * matters for SSR-style boot where the initial load() resolves
 * after a component first renders. The performance cost is
 * negligible compared to the alternative of forcing every consumer
 * to subscribe explicitly.
 */
@Pipe({ name: 'money', standalone: true, pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly settings = inject(SettingsService);

  transform(
    value: string | number | null | undefined,
    fractionDigits: number = 0,
    mode: 'standard' | 'compact' = 'standard',
  ): string {
    if (mode === 'compact') {
      return this.settings.formatMoneyCompact(value);
    }
    return this.settings.formatMoney(value, { fractionDigits });
  }
}
