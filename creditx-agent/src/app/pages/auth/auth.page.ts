import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonSpinner, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { eyeOutline, eyeOffOutline, logInOutline } from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { PushService } from '../../core/services/push.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonSpinner, IonIcon],
  template: `
    <ion-content [fullscreen]="true">
      <div class="min-h-full flex items-center justify-center bg-gradient-to-b from-cx-primary-dark to-cx-primary px-6">
        <div class="w-full max-w-sm">
          <!-- Logo Card -->
          <div class="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-8">
            <div class="text-center mb-8">
              <div class="w-16 h-16 bg-gradient-to-br from-cx-primary to-cx-primary-light rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <span class="text-2xl font-black text-white">CX</span>
              </div>
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                <span class="text-cx-primary">Credit</span><span class="text-cx-accent">X</span>
              </h1>
              <p class="text-xs font-medium text-gray-400 dark:text-gray-500 mt-1 tracking-wider uppercase">Agent Portal</p>
            </div>

            @if (error()) {
              <div class="mb-5 p-3 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30">
                <p class="text-xs font-medium text-red-600 dark:text-red-400 text-center">{{ error() }}</p>
              </div>
            }

            <div class="space-y-4">
              <div>
                <label class="text-[11px] font-semibold text-gray-400 dark:text-gray-500 mb-1.5 block uppercase tracking-wider">Email Address</label>
                <input type="email"
                  class="w-full px-4 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-cx-primary focus:ring-2 focus:ring-cx-primary/10 focus:outline-none transition-all"
                  [(ngModel)]="email" placeholder="agent@company.com" [disabled]="loading()" />
              </div>
              <div>
                <label class="text-[11px] font-semibold text-gray-400 dark:text-gray-500 mb-1.5 block uppercase tracking-wider">Password</label>
                <div class="relative">
                  <input [type]="showPwd() ? 'text' : 'password'"
                    class="w-full px-4 py-3.5 pr-12 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-cx-primary focus:ring-2 focus:ring-cx-primary/10 focus:outline-none transition-all"
                    [(ngModel)]="password" placeholder="Enter your password" [disabled]="loading()" />
                  <button type="button" class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" (click)="showPwd.set(!showPwd())">
                    <ion-icon [name]="showPwd() ? 'eye-off-outline' : 'eye-outline'" class="text-xl"></ion-icon>
                  </button>
                </div>
              </div>

              <button class="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cx-primary to-cx-primary-light text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-cx-primary/25 hover:shadow-xl hover:shadow-cx-primary/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none"
                      [disabled]="loading()" (click)="login()">
                @if (loading()) {
                  <ion-spinner name="crescent" class="w-5 h-5 text-white"></ion-spinner>
                  <span>Signing in...</span>
                } @else {
                  <ion-icon name="log-in-outline" class="text-lg"></ion-icon>
                  <span>Sign In</span>
                }
              </button>
            </div>
          </div>

          <p class="text-center text-[10px] text-white/50 mt-6 font-medium">&copy; {{ year }} Kodek Innovations Limited</p>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    :host { display: block; }
    ion-content { --background: transparent; }
  `],
})
export class AuthPage {
  email = ''; password = ''; showPwd = signal(false);
  loading = signal(false); error = signal<string | null>(null);
  year = new Date().getFullYear();

  private readonly ALLOWED_ROLES = ['agent', 'dsa', 'field_agent', 'loan_officer'];

  constructor(private auth: AuthService, private router: Router, private push: PushService) {
    addIcons({ eyeOutline, eyeOffOutline, logInOutline });
  }

  login(): void {
    if (!this.email || !this.password) { this.error.set('Email and password are required'); return; }
    this.loading.set(true); this.error.set(null);
    this.auth.login({ email: this.email, password: this.password }).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.status === 'success' && res.data) {
          // Check role — only agents can use the mobile app
          const userRoles = (res.data.user?.roles || []).map((r: any) => (r.slug || r.name || '').toLowerCase());
          const hasAgentRole = userRoles.some((r: string) => this.ALLOWED_ROLES.includes(r));
          if (!hasAgentRole) {
            this.auth.logout();
            this.error.set('Access denied. This app is for field agents only. Please use the admin portal.');
            return;
          }
          this.push.init();
          this.router.navigate(['/dashboard']);
        } else {
          this.error.set(res.message || 'Login failed');
        }
      },
      error: err => { this.loading.set(false); this.error.set(err.error?.message || 'Connection error. Please check your internet.'); },
    });
  }
}
