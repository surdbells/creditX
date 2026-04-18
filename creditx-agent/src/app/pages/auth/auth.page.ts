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
      <div class="min-h-full flex items-center justify-center bg-gradient-to-b from-cx-primary-dark to-cx-primary px-6">
        <div class="w-full max-w-sm">
          <div class="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-8">
            <!-- Logo -->
            <div class="text-center mb-8">
              <div class="w-16 h-16 bg-gradient-to-br from-cx-primary to-cx-primary-light rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <span class="text-2xl font-black text-white">CX</span>
              </div>
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                <span class="text-cx-primary">Credit</span><span class="text-cx-accent">X</span>
              </h1>
              <p class="text-xs font-medium text-gray-400 mt-1 tracking-wider uppercase">Agent Portal</p>
            </div>

            @if (error()) {
              <div class="mb-5 p-3 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30">
                <p class="text-xs font-medium text-red-600 dark:text-red-400 text-center">{{ error() }}</p>
              </div>
            }

            <!-- Login Form -->
            @if (!requires2FA()) {
              <div class="space-y-4">
                <div>
                  <label class="text-[11px] font-semibold text-gray-400 mb-1.5 block uppercase tracking-wider">Email</label>
                  <input type="email" class="w-full px-4 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-cx-primary focus:ring-2 focus:ring-cx-primary/10 focus:outline-none"
                    [(ngModel)]="email" placeholder="agent@company.com" [disabled]="loading()" />
                </div>
                <div>
                  <label class="text-[11px] font-semibold text-gray-400 mb-1.5 block uppercase tracking-wider">Password</label>
                  <div class="relative">
                    <input [type]="showPwd() ? 'text' : 'password'" class="w-full px-4 py-3.5 pr-12 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-cx-primary focus:ring-2 focus:ring-cx-primary/10 focus:outline-none"
                      [(ngModel)]="password" placeholder="Enter password" [disabled]="loading()" />
                    <button type="button" class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" (click)="showPwd.set(!showPwd())">
                      <ion-icon [name]="showPwd() ? 'eye-off-outline' : 'eye-outline'" class="text-xl"></ion-icon>
                    </button>
                  </div>
                </div>
                <button class="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cx-primary to-cx-primary-light text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-cx-primary/25 active:scale-[0.98] transition-all disabled:opacity-50"
                        [disabled]="loading()" (click)="login()">
                  @if (loading()) {
                    <ion-spinner name="crescent" class="w-5 h-5 text-white"></ion-spinner> Signing in...
                  } @else {
                    <ion-icon name="log-in-outline" class="text-lg"></ion-icon> Sign In
                  }
                </button>
              </div>
            }

            <!-- 2FA OTP Screen -->
            @if (requires2FA()) {
              <div class="text-center mb-6">
                <div class="w-14 h-14 mx-auto mb-3 rounded-2xl bg-cx-primary/10 flex items-center justify-center">
                  <ion-icon name="shield-checkmark-outline" class="text-3xl text-cx-primary"></ion-icon>
                </div>
                <h2 class="text-base font-bold text-gray-900 dark:text-white">Verification</h2>
                <p class="text-xs text-gray-400 mt-1">Enter the 6-digit code sent to <strong class="text-gray-600 dark:text-gray-300">{{ otpEmail }}</strong></p>
              </div>
              <div class="space-y-4">
                <input type="text" class="w-full px-4 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-center text-2xl tracking-[0.5em] font-bold text-gray-900 dark:text-white focus:border-cx-primary focus:outline-none"
                  maxlength="6" [(ngModel)]="otpCode" placeholder="000000" [disabled]="loading()" />
                <button class="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cx-primary to-cx-primary-light text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all disabled:opacity-50"
                        [disabled]="loading() || otpCode.length < 6" (click)="verifyOtp()">
                  @if (loading()) {
                    <ion-spinner name="crescent" class="w-5 h-5 text-white"></ion-spinner> Verifying...
                  } @else {
                    <ion-icon name="shield-checkmark-outline" class="text-lg"></ion-icon> Verify
                  }
                </button>
                <div class="flex items-center justify-between">
                  <button class="text-xs text-gray-400" (click)="requires2FA.set(false); otpCode = ''">
                    <ion-icon name="arrow-back-outline" class="align-middle mr-1"></ion-icon>Back
                  </button>
                  <button class="text-xs text-cx-primary font-semibold" (click)="login()" [disabled]="loading()">Resend Code</button>
                </div>
              </div>
            }
          </div>
          <p class="text-center text-[10px] text-white/50 mt-6 font-medium">&copy; {{ year }} Kodek Innovations Limited</p>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`:host { display: block; } ion-content { --background: transparent; }`],
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
          localStorage.setItem('cxa_access_token', res.data.tokens.access_token);
          localStorage.setItem('cxa_refresh_token', res.data.tokens.refresh_token);
          localStorage.setItem('cxa_user', JSON.stringify(res.data.user));
          const userRoles = (res.data.user?.roles || []).map((r: any) => (r.slug || r.name || '').toLowerCase());
          if (!userRoles.some((r: string) => this.ALLOWED_ROLES.includes(r))) {
            this.auth.logout();
            this.error.set('Access denied. This app is for field agents only.');
            return;
          }
          this.push.init();
          this.router.navigate(['/dashboard']);
        } else { this.error.set(res.message || 'Verification failed'); }
      },
      error: err => { this.loading.set(false); this.error.set(err.error?.message || 'Invalid code'); },
    });
  }
}
