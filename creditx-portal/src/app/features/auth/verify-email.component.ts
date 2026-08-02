import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { SettingsService } from '../../core/services/settings.service';
import { AuthShell } from './auth-shell';

@Component({
  selector: 'app-verify-email',
  imports: [CommonModule, FormsModule, LucideAngularModule, AuthShell],
  template: `
    <app-auth-shell
      title="Verify your email"
      subtitle="Enter the 6-digit code we sent you to activate your account."
    >
      <form (ngSubmit)="verify()" class="cx-form-stack">
        <div>
          <label class="cx-label" for="email">Email address</label>
          <input id="email" name="email" type="email" class="cx-input" placeholder="you@example.com"
            [(ngModel)]="email" autocomplete="email" required />
        </div>
        <div>
          <label class="cx-label" for="code">Verification code</label>
          <input id="code" name="code" type="text" inputmode="numeric" maxlength="6"
            class="cx-input text-center tracking-[0.5em] text-lg" placeholder="000000" [(ngModel)]="code" required />
        </div>
        <button type="submit" class="cx-btn cx-btn-primary cx-btn-lg cx-btn-block" [disabled]="loading()">
          @if (loading()) { <lucide-icon name="loader-2" [size]="17" class="animate-spin"></lucide-icon> }
          Verify & continue
        </button>
        <button type="button" class="cx-btn cx-btn-ghost cx-btn-block" (click)="resend()" [disabled]="resending()">
          @if (resending()) { <lucide-icon name="loader-2" [size]="16" class="animate-spin"></lucide-icon> }
          Resend code
        </button>
      </form>
    </app-auth-shell>
  `,
})
export class VerifyEmailComponent implements OnInit {
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private settings = inject(SettingsService);

  loading = signal(false);
  resending = signal(false);

  email = '';
  code = '';

  ngOnInit(): void {
    const qpEmail = this.route.snapshot.queryParamMap.get('email');
    if (qpEmail) {
      this.email = qpEmail;
    }
  }

  /** Trim: a pasted code or an autocompleted email often carries a space,
   *  which failed the 6-digit length check or server-side email validation. */
  private normalise(): void {
    this.email = this.email.trim();
    this.code = this.code.trim();
  }

  verify(): void {
    this.normalise();
    if (!this.email || this.code.length !== 6) {
      this.toast.error('Enter your email and the 6-digit code.');
      return;
    }
    this.loading.set(true);
    this.auth.verifyEmail(this.email, this.code).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.status === 'success') {
          this.toast.success(`Email verified. Welcome to ${this.settings.companyName()}!`);
          this.router.navigate(['/dashboard']);
        } else {
          this.toast.error(res.message || 'Verification failed.');
        }
      },
      error: err => {
        this.loading.set(false);
        this.toast.error(err?.error?.message || 'Invalid or expired code.');
      },
    });
  }

  resend(): void {
    this.normalise();
    if (!this.email) {
      this.toast.error('Enter your email first.');
      return;
    }
    this.resending.set(true);
    this.auth.resendVerification(this.email).subscribe({
      next: () => {
        this.resending.set(false);
        this.toast.success('If your account needs verifying, a new code is on its way.');
      },
      error: () => {
        this.resending.set(false);
        this.toast.error('Could not resend code. Try again shortly.');
      },
    });
  }
}
