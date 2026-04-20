import { Injectable, effect, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { debounceTime, Subject } from 'rxjs';

export type FontScaleStep = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface FontScaleOption {
  step: FontScaleStep;
  value: number;
  label: string;
}

/**
 * FontScaleService
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

  private static readonly STORAGE_KEY = 'cx_font_scale';
  private static readonly DEFAULT = 1.00;

  private scale = signal<number>(this.resolveInitial());
  readonly scale$ = this.scale.asReadonly();
  readonly currentStep = signal<FontScaleStep>('md');

  private persistSubject = new Subject<number>();

  constructor(private http: HttpClient, private auth: AuthService) {
    // Apply initial scale immediately
    this.applyToDOM(this.scale());
    this.currentStep.set(this.stepForValue(this.scale()));

    // When scale changes, apply to DOM + localStorage immediately
    effect(() => {
      const val = this.scale();
      this.applyToDOM(val);
      this.currentStep.set(this.stepForValue(val));
      try { localStorage.setItem(FontScaleService.STORAGE_KEY, String(val)); } catch {}
    });

    // Sync to backend after auth loads — user.font_scale is source of truth
    effect(() => {
      const user = this.auth.user();
      if (user && typeof (user as any).font_scale === 'number') {
        const remoteScale = (user as any).font_scale as number;
        if (Math.abs(remoteScale - this.scale()) > 0.001) {
          this.scale.set(this.clamp(remoteScale));
        }
      }
    });

    // Debounced persistence to backend
    this.persistSubject.pipe(debounceTime(600)).subscribe(value => {
      if (!this.auth.isAuthenticated()) return;
      this.http.patch(`${environment.apiUrl}/users/me/preferences`, { font_scale: value }).subscribe({
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

  // ─── Internals ───

  private resolveInitial(): number {
    // Check localStorage first (fast path on reload before user loads)
    try {
      const stored = localStorage.getItem(FontScaleService.STORAGE_KEY);
      if (stored) {
        const parsed = parseFloat(stored);
        if (!isNaN(parsed)) return this.clamp(parsed);
      }
    } catch {}
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
    // Find closest step
    let best: FontScaleStep = 'md';
    let bestDist = Infinity;
    for (const opt of FontScaleService.OPTIONS) {
      const d = Math.abs(opt.value - value);
      if (d < bestDist) { bestDist = d; best = opt.step; }
    }
    return best;
  }
}
