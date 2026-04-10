import { Injectable, signal, effect } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'creditx_theme';
  private _isDark = signal(this.loadTheme());

  readonly isDark = this._isDark.asReadonly();

  constructor() {
    effect(() => {
      const dark = this._isDark();
      document.documentElement.classList.toggle('dark', dark);
      localStorage.setItem(this.STORAGE_KEY, dark ? 'dark' : 'light');
    });
  }

  toggle(): void {
    this._isDark.update(v => !v);
  }

  private loadTheme(): boolean {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
}
