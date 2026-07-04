import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../../core/services/auth.service';
import { SettingsService } from '../../../core/services/settings.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-login', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  email = '';
  password = '';
  otpCode = '';
  showPassword = signal(false);
  loading = signal(false);
  error = signal<string | null>(null);
  currentYear = new Date().getFullYear();

  // 2FA state
  requires2FA = signal(false);
  otpUserId = '';
  otpEmail = '';
  otpMessage = '';

  constructor(private authService: AuthService, private router: Router, private http: HttpClient, public settings: SettingsService) {}

  onSubmit(): void {
    if (this.requires2FA()) { this.verifyOtp(); return; }
    if (!this.email || !this.password) { this.error.set('Email and password are required'); return; }
    this.loading.set(true);
    this.error.set(null);
    this.authService.login({ email: this.email, password: this.password }).subscribe({
      next: (res: any) => {
        this.loading.set(false);
        if (res.data?.requires_2fa) {
          this.requires2FA.set(true);
          this.otpUserId = res.data.user_id;
          this.otpEmail = res.data.email;
          this.otpMessage = res.message || 'Verification code sent';
          this.error.set(null);
          return;
        }
        if (res.status === 'success') this.router.navigate(['/dashboard']);
        else this.error.set(res.message || 'Login failed');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message || 'An error occurred.');
      },
    });
  }

  verifyOtp(): void {
    if (!this.otpCode || this.otpCode.length < 6) { this.error.set('Enter the 6-digit code'); return; }
    this.loading.set(true);
    this.error.set(null);
    this.http.post<any>(`${environment.apiUrl}/auth/verify-otp`, {
      user_id: this.otpUserId, code: this.otpCode,
    }).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.status === 'success' && res.data?.tokens) {
          localStorage.setItem('creditx_access_token', res.data.tokens.access_token);
          localStorage.setItem('creditx_refresh_token', res.data.tokens.refresh_token);
          localStorage.setItem('creditx_user', JSON.stringify(res.data.user));
          this.router.navigate(['/dashboard']).then(() => window.location.reload());
        } else { this.error.set(res.message || 'Verification failed'); }
      },
      error: (err) => { this.loading.set(false); this.error.set(err.error?.message || 'Invalid code'); },
    });
  }

  resendOtp(): void {
    this.loading.set(true);
    this.authService.login({ email: this.email, password: this.password }).subscribe({
      next: () => { this.loading.set(false); this.otpMessage = 'New code sent'; this.otpCode = ''; },
      error: () => { this.loading.set(false); },
    });
  }

  backToLogin(): void {
    this.requires2FA.set(false);
    this.otpCode = '';
    this.error.set(null);
  }
}
