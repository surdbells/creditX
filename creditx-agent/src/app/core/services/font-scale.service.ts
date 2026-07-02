import { Injectable, effect, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { TenantConfigService } from './tenant-config.service';
import { debounceTime, Subject } from 'rxjs';

export type FontScaleStep = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface FontScaleOption {
  step: FontScaleStep;
  value: number;
  label: string;
}

/**
 * FontScaleService (agent app)
 *
 * Manages the global UI font-size scale driven by the `--cx-font-scale` CSS variable.
 * - 5 steps: XS(0.85) / SM(0.925) / MD(1.00) / LG(1.10) / XL(1.20)
 * - Reads initial value from auth user.font_scale, falls back to localStorage, then MD (1.00)
 * - Applies to document.documentElement on change
 * - Persists to backend via PATCH /api/users/me/preferences (debounced 600ms)
 * - Persists to localStorage immediately (fast restore on reload)
 */
@Injectable({ providedIn: 'root' })
export class FontScaleService {
  static readonly OPTIONS: FontScaleOption[] = [
    { step: 'xs', value: 0.85,  label: 'XS' },
    { step: 'sm', value: 0.925, label: 'S' },
    { step: 'md', value: 1.00,  label: 'M' },
    { step: 'lg', value: 1.10,  label: 'L' },
    { step: 'xl', value: 1.20,  label: 'XL' },
  ];

  private static readonly STORAGE_KEY = 'cxa_font_scale';
  private static readonly DEFAULT = 1.00;

  private scale = signal<number>(this.resolveInitial());
  readonly scale$ = this.scale.asReadonly();
  readonly currentStep = signal<FontScaleStep>('md');

  private persistSubject = new Subject<number>();

  private readonly tenant = inject(TenantConfigService);
  constructor(private http: HttpClient, private auth: AuthService) {
    // Hydrate from auth.user() synchronously if it's already loaded.
    // auth.user() is backed by localStorage on service init, so this will
    // pick up the last-known server value on page reload. Only applies
    // when the user hasn't yet saved a local preference — user's most
    // recent interaction always wins over stale remote state.
    const hasLocal = this.readLocalStorage() !== null;
    if (!hasLocal) {
      const user = this.auth.user();
      const remote = user ? (user as any).font_scale : undefined;
      if (typeof remote === 'number' && !isNaN(remote)) {
        this.scale.set(this.clamp(remote));
      }
    }

    this.applyToDOM(this.scale());
    this.currentStep.set(this.stepForValue(this.scale()));

    // Effect: whenever scale changes, reflect to DOM + step signal + localStorage.
    // PREVIOUS BUG: a second effect used to write to the scale signal from
    // inside an effect body whenever auth.user() emitted, creating a
    // feedback loop that snapped user clicks back to the cached remote
    // value. Fixed by moving hydration to a one-shot synchronous read above.
    effect(() => {
      const val = this.scale();
      this.applyToDOM(val);
      this.currentStep.set(this.stepForValue(val));
      try { localStorage.setItem(FontScaleService.STORAGE_KEY, String(val)); } catch {}
    });

    this.persistSubject.pipe(debounceTime(600)).subscribe(value => {
      if (!this.auth.isAuthenticated()) return;
      this.http.patch(`${this.tenant.getApiUrl()}/users/me/preferences`, { font_scale: value }).subscribe({
        error: () => { /* silent — localStorage keeps it working */ },
      });
    });
  }

  setStep(step: FontScaleStep): void {
    const opt = FontScaleService.OPTIONS.find(o => o.step === step);
    if (!opt) return;
    this.setValue(opt.value);
  }

  setValue(value: number): void {
    const clamped = this.clamp(value);
    this.scale.set(clamped);
    this.persistSubject.next(clamped);
  }

  reset(): void {
    this.setValue(FontScaleService.DEFAULT);
  }

  /** Raw localStorage read. Returns null if absent or unparseable. */
  private readLocalStorage(): number | null {
    try {
      const stored = localStorage.getItem(FontScaleService.STORAGE_KEY);
      if (!stored) return null;
      const parsed = parseFloat(stored);
      return isNaN(parsed) ? null : this.clamp(parsed);
    } catch {
      return null;
    }
  }

  private resolveInitial(): number {
    const fromStorage = this.readLocalStorage();
    if (fromStorage !== null) return fromStorage;
    return FontScaleService.DEFAULT;
  }

  private clamp(value: number): number {
    if (value < 0.85) return 0.85;
    if (value > 1.20) return 1.20;
    return value;
  }

  private applyToDOM(value: number): void {
    document.documentElement.style.setProperty('--cx-font-scale', String(value));
  }

  private stepForValue(value: number): FontScaleStep {
    let best: FontScaleStep = 'md';
    let bestDist = Infinity;
    for (const opt of FontScaleService.OPTIONS) {
      const d = Math.abs(opt.value - value);
      if (d < bestDist) { bestDist = d; best = opt.step; }
    }
    return best;
  }
}
