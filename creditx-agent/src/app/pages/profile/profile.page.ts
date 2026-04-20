import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  personOutline, mailOutline, callOutline, shieldCheckmarkOutline,
  logOutOutline, moonOutline, informationCircleOutline, textOutline,
  refreshOutline,
} from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { FontScaleService } from '../../core/services/font-scale.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonHeader, IonToolbar, IonTitle, IonIcon],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar><ion-title>Profile</ion-title></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="cx-profile">
        <!-- Avatar + name -->
        <div class="cx-profile-hero cx-animate-in">
          <div class="cx-profile-avatar">
            {{ auth.user()?.first_name?.[0] }}{{ auth.user()?.last_name?.[0] }}
          </div>
          <h2 class="cx-profile-name">{{ auth.user()?.full_name }}</h2>
          <p class="cx-profile-role">{{ auth.user()?.roles?.[0]?.name || 'Agent' }}</p>
        </div>

        <!-- Profile details -->
        <div class="cx-profile-section">
          <div class="cx-profile-eyebrow">Account</div>
          <div class="cx-profile-card">
            @for (field of profileFields; track field.label; let last = $last) {
              <div class="cx-profile-row" [class.is-last]="last">
                <div class="cx-profile-row-icon">
                  <ion-icon [name]="field.icon"></ion-icon>
                </div>
                <div class="cx-profile-row-body">
                  <div class="cx-profile-row-label">{{ field.label }}</div>
                  <div class="cx-profile-row-value">{{ field.value || '—' }}</div>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Preferences -->
        <div class="cx-profile-section">
          <div class="cx-profile-eyebrow">Preferences</div>
          <div class="cx-profile-card cx-profile-preferences">
            <div class="cx-profile-pref-header">
              <div class="cx-profile-row-icon">
                <ion-icon name="text-outline"></ion-icon>
              </div>
              <div class="cx-profile-row-body">
                <div class="cx-profile-row-label">Text Size</div>
                <div class="cx-profile-row-value">{{ fsLabel() }}</div>
              </div>
              <button class="cx-profile-reset-btn" (click)="resetFontScale()" [disabled]="isDefault()">
                <ion-icon name="refresh-outline"></ion-icon>
              </button>
            </div>
            <div class="cx-profile-slider-row">
              <span class="cx-profile-end cx-profile-end-sm">A</span>
              <input type="range" class="cx-profile-slider"
                     min="0" max="4" step="1"
                     [value]="fsIndex()"
                     (input)="onFsSlide($event)" />
              <span class="cx-profile-end cx-profile-end-lg">A</span>
            </div>
            <div class="cx-profile-steps">
              @for (opt of fsOptions; track opt.step; let i = $index) {
                <button class="cx-profile-step"
                        [class.is-active]="i === fsIndex()"
                        (click)="setFsStep(i)">{{ opt.label }}</button>
              }
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="cx-profile-section">
          <button class="cx-profile-signout" (click)="logout()">
            <ion-icon name="log-out-outline"></ion-icon>
            <span>Sign Out</span>
          </button>
        </div>

        <p class="cx-profile-version">CreditX Agent v2.0 &bull; DOST HQ LIMITED</p>
      </div>
    </ion-content>
  `,
  styles: [`
    .cx-profile {
      padding: 1rem;
      display: flex; flex-direction: column; gap: 1.25rem;
    }

    .cx-profile-hero {
      display: flex; flex-direction: column; align-items: center;
      padding: 1.5rem 1rem 0.75rem;
    }
    .cx-profile-avatar {
      width: 84px; height: 84px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--cx-primary-600), var(--cx-primary-500));
      color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: var(--cx-text-2xl); font-weight: 600;
      letter-spacing: 0.02em;
      box-shadow: var(--cx-shadow-green);
      position: relative;
    }
    .cx-profile-avatar::after {
      content: '';
      position: absolute; inset: -3px;
      border-radius: 50%;
      border: 2px solid var(--cx-accent-500);
      opacity: 0.4;
    }
    .cx-profile-name {
      margin: 0.85rem 0 0.15rem;
      font-size: var(--cx-text-lg); font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.01em;
    }
    .cx-profile-role {
      margin: 0;
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
    }

    .cx-profile-section { display: flex; flex-direction: column; gap: 0.5rem; }
    .cx-profile-eyebrow {
      font-size: var(--cx-text-xs); font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
      padding-left: 0.35rem;
    }

    .cx-profile-card {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      padding: 0.25rem 1rem;
    }
    .cx-profile-row {
      display: flex; align-items: center; gap: 0.85rem;
      padding: 0.85rem 0;
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cx-profile-row.is-last { border-bottom: none; }
    .cx-profile-row-icon {
      width: 36px; height: 36px; flex-shrink: 0;
      border-radius: var(--cx-radius-md);
      background: var(--cx-primary-50);
      color: var(--cx-primary-600);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px;
    }
    .cx-profile-row-body { flex: 1; min-width: 0; }
    .cx-profile-row-label {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      margin-bottom: 2px;
    }
    .cx-profile-row-value {
      font-size: var(--cx-text-sm); font-weight: 500;
      color: var(--cx-text);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .cx-profile-preferences { padding: 0.85rem 1rem 1rem; }
    .cx-profile-pref-header {
      display: flex; align-items: center; gap: 0.85rem;
      margin-bottom: 1rem;
    }
    .cx-profile-reset-btn {
      width: 32px; height: 32px;
      border-radius: var(--cx-radius-md);
      background: var(--cx-stone-100);
      color: var(--cx-text-muted);
      border: none;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-profile-reset-btn:hover:not(:disabled) {
      background: var(--cx-primary-50);
      color: var(--cx-primary-600);
    }
    .cx-profile-reset-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    .cx-profile-slider-row {
      display: flex; align-items: center; gap: 0.75rem;
      margin-bottom: 0.5rem;
    }
    .cx-profile-end {
      color: var(--cx-text-muted);
      font-family: var(--cx-font-sans);
      user-select: none; flex-shrink: 0;
    }
    .cx-profile-end-sm { font-size: 13px; }
    .cx-profile-end-lg { font-size: 24px; }
    .cx-profile-slider {
      flex: 1;
      -webkit-appearance: none; appearance: none;
      height: 6px;
      background: var(--cx-stone-200);
      border-radius: var(--cx-radius-pill);
      outline: none;
    }
    .cx-profile-slider::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      width: 24px; height: 24px;
      background: var(--cx-primary-600);
      border: 3px solid var(--cx-surface);
      border-radius: 50%;
      box-shadow: var(--cx-shadow-md);
    }
    .cx-profile-slider::-moz-range-thumb {
      width: 24px; height: 24px;
      background: var(--cx-primary-600);
      border: 3px solid var(--cx-surface);
      border-radius: 50%;
      box-shadow: var(--cx-shadow-md);
    }

    .cx-profile-steps {
      display: flex; justify-content: space-between; gap: 4px;
      margin-top: 0.5rem;
    }
    .cx-profile-step {
      flex: 1;
      padding: 0.4rem;
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--cx-radius-sm);
      font-size: var(--cx-text-xs); font-weight: 500;
      color: var(--cx-text-muted);
      cursor: pointer;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-profile-step.is-active {
      background: var(--cx-primary-50);
      color: var(--cx-primary-700);
      border-color: var(--cx-primary-200);
    }

    .cx-profile-signout {
      display: flex; align-items: center; justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.9rem 1rem;
      background: var(--cx-danger-50);
      color: var(--cx-danger);
      border: 1px solid transparent;
      border-radius: var(--cx-radius-lg);
      font-size: var(--cx-text-sm); font-weight: 500;
      cursor: pointer;
      transition: all var(--cx-dur-base) var(--cx-ease-premium);
    }
    .cx-profile-signout:hover { background: #f7d5d4; border-color: var(--cx-danger); }

    .cx-profile-version {
      margin: 0.5rem 0 0;
      text-align: center;
      font-size: var(--cx-text-xs);
      color: var(--cx-text-subtle);
    }
  `],
})
export class ProfilePage {
  readonly fsOptions = FontScaleService.OPTIONS;

  constructor(
    public auth: AuthService,
    private router: Router,
    private fs: FontScaleService,
  ) {
    addIcons({
      personOutline, mailOutline, callOutline, shieldCheckmarkOutline,
      logOutOutline, moonOutline, informationCircleOutline, textOutline,
      refreshOutline,
    });
  }

  get profileFields(): {label:string;value:string;icon:string}[] {
    const u = this.auth.user();
    return [
      { label: 'Full Name', value: u?.full_name || '', icon: 'person-outline' },
      { label: 'Email', value: u?.email || '', icon: 'mail-outline' },
      { label: 'Phone', value: u?.phone || '', icon: 'call-outline' },
      { label: 'Role', value: u?.roles?.[0]?.name || 'Agent', icon: 'shield-checkmark-outline' },
    ];
  }

  fsIndex(): number {
    const step = this.fs.currentStep();
    return this.fsOptions.findIndex(o => o.step === step);
  }

  fsLabel(): string {
    const idx = this.fsIndex();
    const opt = idx >= 0 ? this.fsOptions[idx] : null;
    if (!opt) return 'Medium';
    const map: Record<string,string> = { xs: 'Extra Small', sm: 'Small', md: 'Medium', lg: 'Large', xl: 'Extra Large' };
    return map[opt.step] || opt.label;
  }

  isDefault(): boolean {
    return this.fs.currentStep() === 'md';
  }

  setFsStep(index: number): void {
    const opt = this.fsOptions[index];
    if (opt) this.fs.setStep(opt.step);
  }

  onFsSlide(event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    this.setFsStep(val);
  }

  resetFontScale(): void { this.fs.reset(); }

  logout(): void { this.auth.logout(); }
}
