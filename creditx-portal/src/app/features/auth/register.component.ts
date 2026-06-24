import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthShell } from './auth-shell';

@Component({
  selector: 'app-register',
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, AuthShell],
  template: `
    <app-auth-shell
      title="Create your account"
      subtitle="It only takes a minute. Verify your email and you're in."
    >
      <form (ngSubmit)="submit()" class="cx-form-stack">
        <div>
          <label class="cx-label" for="full_name">Full name</label>
          <input id="full_name" name="full_name" type="text" class="cx-input" placeholder="Jane Doe"
            [(ngModel)]="fullName" autocomplete="name" required />
        </div>
        <div>
          <label class="cx-label" for="email">Email address</label>
          <input id="email" name="email" type="email" class="cx-input" placeholder="you@example.com"
            [(ngModel)]="email" autocomplete="email" required />
        </div>
        <div>
          <label class="cx-label" for="phone">Phone number</label>
          <input id="phone" name="phone" type="tel" class="cx-input" placeholder="080..."
            [(ngModel)]="phone" autocomplete="tel" required />
        </div>
        <div>
          <label class="cx-label" for="password">Password</label>
          <div class="relative">
            <input id="password" name="password" [type]="showPassword() ? 'text' : 'password'"
              class="cx-input pr-10" placeholder="••••••••" [(ngModel)]="password" autocomplete="new-password" required />
            <button type="button" (click)="showPassword.set(!showPassword())"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)] hover:text-[var(--cx-text)]">
              <lucide-icon [name]="showPassword() ? 'eye-off' : 'eye'" [size]="17"></lucide-icon>
            </button>
          </div>
          <p class="cx-field-hint">At least 8 characters with upper & lower case, a number and a symbol.</p>
        </div>
        <button type="submit" class="cx-btn cx-btn-primary cx-btn-lg cx-btn-block" [disabled]="loading()">
          @if (loading()) { <lucide-icon name="loader-2" [size]="17" class="animate-spin"></lucide-icon> }
          Create account
        </button>
      </form>

      <p class="text-center text-sm mt-6" style="color: var(--cx-text-secondary)">
        Already have an account?
        <a routerLink="/auth/login" class="font-semibold" style="color: var(--cx-primary-600)">Sign in</a>
      </p>
    </app-auth-shell>
  `,
})
export class RegisterComponent {
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);

  showPassword = signal(false);
  loading = signal(false);

  fullName = '';
  email = '';
  phone = '';
  password = '';

  submit(): void {
    if (!this.fullName || !this.email || !this.phone || !this.password) {
      this.toast.error('Please fill in all fields.');
      return;
    }
    this.loading.set(true);
    this.auth.register({
      full_name: this.fullName,
      email: this.email,
      phone: this.phone,
      password: this.password,
    }).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.status === 'success') {
          this.toast.success('Account created. Check your email for a verification code.');
          this.router.navigate(['/auth/verify-email'], { queryParams: { email: this.email } });
        } else {
          this.toast.error(res.message || 'Registration failed.');
        }
      },
      error: err => {
        this.loading.set(false);
        const body = err?.error;
        if (body?.errors && typeof body.errors === 'object') {
          const first = Object.values(body.errors)[0];
          this.toast.error(typeof first === 'string' ? first : (body.message || 'Registration failed.'));
        } else {
          this.toast.error(body?.message || 'Registration failed.');
        }
      },
    });
  }
}
