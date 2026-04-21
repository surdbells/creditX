import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { IonContent, IonSpinner, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { eyeOutline, eyeOffOutline, logInOutline, shieldCheckmarkOutline, arrowBackOutline } from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { PushService } from '../../core/services/push.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-auth', standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonSpinner, IonIcon],
  template: `
    <ion-content [fullscreen]="true">
      <div class="cxm-auth-shell">
        <div class="cxm-auth-bg"></div>
        <div class="cxm-auth-card cx-animate-in">
          <!-- Logo -->
          <div class="cxm-auth-logo-wrap">
            <div class="cxm-auth-logo">
              <span>CX</span>
            </div>
            <h1 class="cxm-auth-brand">
              <span class="cxm-auth-brand-credit">Credit</span><span class="cxm-auth-brand-x">X</span>
            </h1>
            <div class="cxm-auth-portal">Agent Portal</div>
          </div>

          @if (error()) {
            <div class="cxm-auth-error">
              <ion-icon name="alert-circle-outline" style="font-size: 14px"></ion-icon>
              <span>{{ error() }}</span>
            </div>
          }

          <!-- Login Form -->
          @if (!requires2FA()) {
            <div class="cxm-auth-form">
              <div class="cxm-auth-field">
                <label class="cxm-auth-label">Email</label>
                <input type="email" class="cxm-auth-input"
                  [(ngModel)]="email" placeholder="agent@company.com" [disabled]="loading()" />
              </div>
              <div class="cxm-auth-field">
                <label class="cxm-auth-label">Password</label>
                <div class="cxm-auth-input-wrap">
                  <input [type]="showPwd() ? 'text' : 'password'" class="cxm-auth-input cxm-auth-input-pwd"
                    [(ngModel)]="password" placeholder="Enter password" [disabled]="loading()" (keyup.enter)="login()" />
                  <button type="button" class="cxm-auth-pwd-toggle" (click)="showPwd.set(!showPwd())" aria-label="Toggle password">
                    <ion-icon [name]="showPwd() ? 'eye-off-outline' : 'eye-outline'" style="font-size: 18px"></ion-icon>
                  </button>
                </div>
              </div>
              <button class="cxm-auth-cta" [disabled]="loading()" (click)="login()">
                @if (loading()) {
                  <ion-spinner name="crescent" style="width: 18px; height: 18px"></ion-spinner>
                  <span>Signing in...</span>
                } @else {
                  <ion-icon name="log-in-outline" style="font-size: 18px"></ion-icon>
                  <span>Sign In</span>
                }
              </button>
            </div>
          }

          <!-- 2FA OTP Screen -->
          @if (requires2FA()) {
            <div>
              <div class="cxm-auth-2fa-head">
                <div class="cxm-auth-2fa-icon">
                  <ion-icon name="shield-checkmark-outline" style="font-size: 28px"></ion-icon>
                </div>
                <div class="cxm-auth-2fa-title">Verification</div>
                <div class="cxm-auth-2fa-sub">
                  Enter the 6-digit code sent to <strong>{{ otpEmail }}</strong>
                </div>
              </div>
              <div class="cxm-auth-form">
                <input type="text" class="cxm-auth-otp-input tabular-nums"
                  maxlength="6" [(ngModel)]="otpCode" placeholder="000000" [disabled]="loading()" />
                <button class="cxm-auth-cta" [disabled]="loading() || otpCode.length < 6" (click)="verifyOtp()">
                  @if (loading()) {
                    <ion-spinner name="crescent" style="width: 18px; height: 18px"></ion-spinner>
                    <span>Verifying...</span>
                  } @else {
                    <ion-icon name="shield-checkmark-outline" style="font-size: 18px"></ion-icon>
                    <span>Verify</span>
                  }
                </button>
                <div class="cxm-auth-2fa-actions">
                  <button class="cxm-auth-back-btn" (click)="requires2FA.set(false); otpCode = ''">
                    <ion-icon name="arrow-back-outline" style="font-size: 14px"></ion-icon>
                    <span>Back</span>
                  </button>
                  <button class="cxm-auth-resend-btn" (click)="login()" [disabled]="loading()">Resend Code</button>
                </div>
              </div>
            </div>
          }
        </div>
        <p class="cxm-auth-footer">&copy; {{ year }} DOST HQ LIMITED</p>
      </div>
    </ion-content>
  `,
  styles: [`
    :host { display: block; }
    ion-content { --background: transparent; }

    .cxm-auth-shell {
      position: relative;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 20px;
      padding-top: calc(24px + env(safe-area-inset-top));
      padding-bottom: calc(24px + env(safe-area-inset-bottom));
    }
    .cxm-auth-bg {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 15% 20%, rgba(201, 162, 39, 0.08) 0%, transparent 50%),
        radial-gradient(circle at 85% 80%, rgba(10, 79, 42, 0.3) 0%, transparent 50%),
        linear-gradient(160deg, var(--cx-primary-800) 0%, var(--cx-primary-600) 50%, var(--cx-primary-700) 100%);
      z-index: 0;
    }

    .cxm-auth-card {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 380px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-2xl);
      padding: 28px 24px;
      box-shadow: 0 20px 48px rgba(4, 32, 16, 0.35), 0 8px 16px rgba(4, 32, 16, 0.2);
    }

    .cxm-auth-logo-wrap {
      text-align: center;
      margin-bottom: 24px;
    }
    .cxm-auth-logo {
      width: 56px; height: 56px;
      background: linear-gradient(135deg, var(--cx-primary-600), var(--cx-primary-500));
      border-radius: var(--cx-radius-xl);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 12px;
      box-shadow: 0 8px 20px rgba(10, 79, 42, 0.3);
    }
    .cxm-auth-logo span {
      font-size: var(--cx-text-xl);
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.02em;
    }
    .cxm-auth-brand {
      margin: 0;
      font-size: var(--cx-text-xl);
      font-weight: 700;
      letter-spacing: -0.015em;
    }
    .cxm-auth-brand-credit { color: var(--cx-primary-600); }
    .cxm-auth-brand-x { color: var(--cx-accent-500); }
    .cxm-auth-portal {
      font-size: 10px;
      font-weight: 600;
      color: var(--cx-text-muted);
      margin-top: 3px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .cxm-auth-error {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 10px 12px;
      background: var(--cx-danger-50);
      border: 1px solid rgba(193, 48, 48, 0.15);
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-xs);
      color: var(--cx-danger);
      margin-bottom: 16px;
      text-align: left;
    }

    .cxm-auth-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .cxm-auth-field { display: flex; flex-direction: column; }
    .cxm-auth-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--cx-text-muted);
      margin-bottom: 6px;
    }
    .cxm-auth-input-wrap { position: relative; }
    .cxm-auth-input {
      width: 100%;
      padding: 12px 14px;
      background: var(--cx-surface-2);
      border: 1px solid transparent;
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      outline: none;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-auth-input-pwd { padding-right: 44px; }
    .cxm-auth-input:focus {
      background: var(--cx-surface);
      border-color: var(--cx-primary-600);
      box-shadow: 0 0 0 3px rgba(10, 79, 42, 0.1);
    }
    .cxm-auth-input:disabled { opacity: 0.5; }
    .cxm-auth-pwd-toggle {
      position: absolute;
      right: 10px; top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: none;
      color: var(--cx-text-muted);
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .cxm-auth-cta {
      margin-top: 4px;
      padding: 13px;
      background: linear-gradient(135deg, var(--cx-primary-600), var(--cx-primary-500));
      color: #fff;
      border: none;
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm);
      font-weight: 600;
      letter-spacing: -0.005em;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 6px 14px rgba(10, 79, 42, 0.25);
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-auth-cta:disabled { opacity: 0.6; box-shadow: none; }
    .cxm-auth-cta:not(:disabled):active {
      transform: scale(0.985);
      box-shadow: 0 2px 8px rgba(10, 79, 42, 0.2);
    }

    /* 2FA */
    .cxm-auth-2fa-head {
      text-align: center;
      margin-bottom: 20px;
    }
    .cxm-auth-2fa-icon {
      width: 52px; height: 52px;
      margin: 0 auto 10px;
      border-radius: var(--cx-radius-xl);
      background: var(--cx-primary-50);
      color: var(--cx-primary-600);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .cxm-auth-2fa-title {
      font-size: var(--cx-text-md);
      font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.01em;
    }
    .cxm-auth-2fa-sub {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      margin-top: 3px;
    }
    .cxm-auth-2fa-sub strong { color: var(--cx-text-secondary); }

    .cxm-auth-otp-input {
      width: 100%;
      padding: 14px;
      background: var(--cx-surface-2);
      border: 1px solid transparent;
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-2xl);
      font-weight: 700;
      letter-spacing: 0.4em;
      text-align: center;
      color: var(--cx-text);
      outline: none;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-auth-otp-input:focus {
      background: var(--cx-surface);
      border-color: var(--cx-primary-600);
      box-shadow: 0 0 0 3px rgba(10, 79, 42, 0.1);
    }

    .cxm-auth-2fa-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 2px;
    }
    .cxm-auth-back-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: transparent;
      border: none;
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      padding: 4px 0;
    }
    .cxm-auth-resend-btn {
      background: transparent;
      border: none;
      font-size: var(--cx-text-xs);
      font-weight: 600;
      color: var(--cx-primary-600);
      padding: 4px 0;
    }

    .cxm-auth-footer {
      position: relative;
      z-index: 1;
      margin-top: 20px;
      font-size: 10px;
      color: rgba(255, 255, 255, 0.5);
      font-weight: 500;
    }
  `],
})
export class AuthPage {
  email = ''; password = ''; otpCode = ''; showPwd = signal(false);
  loading = signal(false); error = signal<string | null>(null);
  requires2FA = signal(false);
  otpUserId = ''; otpEmail = '';
  year = new Date().getFullYear();

  private readonly ALLOWED_ROLES = ['agent', 'dsa', 'field_agent', 'loan_officer'];

  constructor(private auth: AuthService, private router: Router, private push: PushService, private http: HttpClient) {
    addIcons({ eyeOutline, eyeOffOutline, logInOutline, shieldCheckmarkOutline, arrowBackOutline });
  }

  login(): void {
    if (!this.email || !this.password) { this.error.set('Email and password are required'); return; }
    this.loading.set(true); this.error.set(null);
    this.auth.login({ email: this.email, password: this.password }).subscribe({
      next: (res: any) => {
        this.loading.set(false);
        if (res.data?.requires_2fa) {
          this.requires2FA.set(true);
          this.otpUserId = res.data.user_id;
          this.otpEmail = res.data.email;
          return;
        }
        if (res.status === 'success' && res.data) {
          const userRoles = (res.data.user?.roles || []).map((r: any) => (r.slug || r.name || '').toLowerCase());
          if (!userRoles.some((r: string) => this.ALLOWED_ROLES.includes(r))) {
            this.auth.logout();
            this.error.set('Access denied. This app is for field agents only.');
            return;
          }
          this.push.init();
          this.router.navigate(['/dashboard']);
        } else { this.error.set(res.message || 'Login failed'); }
      },
      error: err => { this.loading.set(false); this.error.set(err.error?.message || 'Connection error.'); },
    });
  }

  verifyOtp(): void {
    if (this.otpCode.length < 6) { this.error.set('Enter 6-digit code'); return; }
    this.loading.set(true); this.error.set(null);
    this.http.post<any>(`${environment.apiUrl}/auth/verify-otp`, { user_id: this.otpUserId, code: this.otpCode }).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.status === 'success' && res.data?.tokens) {
          const userRoles = (res.data.user?.roles || []).map((r: any) => (r.slug || r.name || '').toLowerCase());
          if (!userRoles.some((r: string) => this.ALLOWED_ROLES.includes(r))) {
            this.error.set('Access denied. This app is for field agents only.');
            return;
          }
          this.auth.setSession(res.data);
          this.push.init();
          this.router.navigate(['/dashboard']);
        } else { this.error.set(res.message || 'Verification failed'); }
      },
      error: err => { this.loading.set(false); this.error.set(err.error?.message || 'Invalid code'); },
    });
  }
}
