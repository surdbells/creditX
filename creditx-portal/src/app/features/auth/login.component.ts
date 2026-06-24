import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthShell } from './auth-shell';

type Mode = 'password' | 'otp';

@Component({
  selector: 'app-login',
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, AuthShell],
  template: `
    <app-auth-shell
      title="Welcome back"
      subtitle="Sign in to manage your loans and applications."
    >
      <div class="cx-tabs cx-tabs-full mb-5">
        <button class="cx-tabs-tab" [class.is-active]="mode() === 'password'" (click)="setMode('password')" type="button">
          Password
        </button>
        <button class="cx-tabs-tab" [class.is-active]="mode() === 'otp'" (click)="setMode('otp')" type="button">
          Email code
        </button>
      </div>

      <!-- Password login -->
      @if (mode() === 'password') {
        <form (ngSubmit)="passwordLogin()" class="cx-form-stack">
          <div>
            <label class="cx-label" for="email">Email address</label>
            <input id="email" name="email" type="email" class="cx-input" placeholder="you@example.com"
              [(ngModel)]="email" autocomplete="email" required />
          </div>
          <div>
            <label class="cx-label" for="password">Password</label>
            <div class="relative">
              <input id="password" name="password" [type]="showPassword() ? 'text' : 'password'"
                class="cx-input pr-10" placeholder="••••••••" [(ngModel)]="password" autocomplete="current-password" required />
              <button type="button" (click)="showPassword.set(!showPassword())"
                class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)] hover:text-[var(--cx-text)]">
                <lucide-icon [name]="showPassword() ? 'eye-off' : 'eye'" [size]="17"></lucide-icon>
              </button>
            </div>
          </div>
          <button type="submit" class="cx-btn cx-btn-primary cx-btn-lg cx-btn-block" [disabled]="loading()">
            @if (loading()) { <lucide-icon name="loader-2" [size]="17" class="animate-spin"></lucide-icon> }
            Sign in
          </button>
        </form>
      }

      <!-- Email OTP login -->
      @if (mode() === 'otp') {
        @if (otpStep() === 'request') {
          <form (ngSubmit)="requestOtp()" class="cx-form-stack">
            <div>
              <label class="cx-label" for="otp-email">Email address</label>
              <input id="otp-email" name="otpEmail" type="email" class="cx-input" placeholder="you@example.com"
                [(ngModel)]="email" autocomplete="email" required />
            </div>
            <p class="cx-field-hint">We'll email you a 6-digit code to sign in — no password needed.</p>
            <button type="submit" class="cx-btn cx-btn-primary cx-btn-lg cx-btn-block" [disabled]="loading()">
              @if (loading()) { <lucide-icon name="loader-2" [size]="17" class="animate-spin"></lucide-icon> }
              Send me a code
            </button>
          </form>
        } @else {
          <form (ngSubmit)="verifyOtp()" class="cx-form-stack">
            <div>
              <label class="cx-label" for="otp-code">Enter the 6-digit code</label>
              <input id="otp-code" name="otpCode" type="text" inputmode="numeric" maxlength="6"
                class="cx-input text-center tracking-[0.5em] text-lg" placeholder="000000" [(ngModel)]="code" required />
              <p class="cx-field-hint">Sent to {{ email }}.</p>
            </div>
            <button type="submit" class="cx-btn cx-btn-primary cx-btn-lg cx-btn-block" [disabled]="loading()">
              @if (loading()) { <lucide-icon name="loader-2" [size]="17" class="animate-spin"></lucide-icon> }
              Verify & sign in
            </button>
            <button type="button" class="cx-btn cx-btn-ghost cx-btn-block" (click)="otpStep.set('request')">
              Use a different email
            </button>
          </form>
        }
      }

      <p class="text-center text-sm mt-6" style="color: var(--cx-text-secondary)">
        New to CreditX?
        <a routerLink="/auth/register" class="font-semibold" style="color: var(--cx-primary-600)">Create an account</a>
      </p>
    </app-auth-shell>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);

  mode = signal<Mode>('password');
  otpStep = signal<'request' | 'verify'>('request');
  showPassword = signal(false);
  loading = signal(false);

  email = '';
  password = '';
  code = '';

  setMode(m: Mode): void {
    this.mode.set(m);
    this.otpStep.set('request');
  }

  passwordLogin(): void {
    if (!this.email || !this.password) {
      this.toast.error('Please enter your email and password.');
      return;
    }
    this.loading.set(true);
    this.auth.login({ email: this.email, password: this.password }).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.status === 'success') {
          this.router.navigate(['/dashboard']);
        } else {
          this.toast.error(res.message || 'Login failed.');
        }
      },
      error: err => {
        this.loading.set(false);
        const body = err?.error;
        if (body?.errors?.requires_verification) {
          this.toast.info('Please verify your email first.');
          this.router.navigate(['/auth/verify-email'], { queryParams: { email: this.email } });
          return;
        }
        this.toast.error(body?.message || 'Invalid email or password.');
      },
    });
  }

  requestOtp(): void {
    if (!this.email) {
      this.toast.error('Please enter your email.');
      return;
    }
    this.loading.set(true);
    this.auth.requestOtp(this.email).subscribe({
      next: () => {
        this.loading.set(false);
        this.otpStep.set('verify');
        this.toast.success('If an account exists, a code is on its way.');
      },
      error: err => {
        this.loading.set(false);
        this.toast.error(err?.error?.message || 'Could not send code. Try again.');
      },
    });
  }

  verifyOtp(): void {
    if (this.code.length !== 6) {
      this.toast.error('Enter the 6-digit code.');
      return;
    }
    this.loading.set(true);
    this.auth.verifyOtpLogin(this.email, this.code).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.status === 'success') {
          this.router.navigate(['/dashboard']);
        } else {
          this.toast.error(res.message || 'Invalid code.');
        }
      },
      error: err => {
        this.loading.set(false);
        this.toast.error(err?.error?.message || 'Invalid or expired code.');
      },
    });
  }
}
