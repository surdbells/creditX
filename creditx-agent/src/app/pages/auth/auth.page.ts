import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonButton, IonInput, IonItem, IonLabel, IonSpinner, IonIcon, IonText } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { eyeOutline, eyeOffOutline, logInOutline } from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonButton, IonInput, IonItem, IonLabel, IonSpinner, IonIcon, IonText],
  template: `
    <ion-content class="ion-padding" [fullscreen]="true">
      <div class="flex flex-col items-center justify-center min-h-full px-4">
        <div class="w-full max-w-sm">
          <div class="text-center mb-8">
            <h1 class="text-3xl font-bold"><span class="text-[#0A4F2A]">Credit</span><span class="text-[#C9A227]">X</span></h1>
            <p class="text-sm text-gray-500 mt-1">Agent Portal</p>
          </div>

          @if (error()) {
            <div class="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm text-center">{{ error() }}</div>
          }

          <div class="space-y-4">
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Email Address</label>
              <input type="email" class="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-[#0A4F2A] focus:outline-none focus:ring-2 focus:ring-[#0A4F2A]/10"
                     [(ngModel)]="email" placeholder="agent@creditx.com" [disabled]="loading()" />
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500 mb-1 block">Password</label>
              <div class="relative">
                <input [type]="showPwd() ? 'text' : 'password'" class="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200 text-sm focus:border-[#0A4F2A] focus:outline-none focus:ring-2 focus:ring-[#0A4F2A]/10"
                       [(ngModel)]="password" placeholder="Enter password" [disabled]="loading()" />
                <button type="button" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" (click)="showPwd.set(!showPwd())">
                  <ion-icon [name]="showPwd() ? 'eye-off-outline' : 'eye-outline'" class="text-lg"></ion-icon>
                </button>
              </div>
            </div>
            <button class="w-full py-3 rounded-xl bg-[#0A4F2A] text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    [disabled]="loading()" (click)="login()">
              @if (loading()) {
                <ion-spinner name="crescent" class="w-5 h-5"></ion-spinner> Signing in...
              } @else {
                <ion-icon name="log-in-outline"></ion-icon> Sign In
              }
            </button>
          </div>
          <p class="text-center text-xs text-gray-400 mt-8">&copy; {{ year }} Kodek Innovations Limited</p>
        </div>
      </div>
    </ion-content>
  `,
})
export class AuthPage {
  email = ''; password = ''; showPwd = signal(false);
  loading = signal(false); error = signal<string | null>(null);
  year = new Date().getFullYear();

  constructor(private auth: AuthService, private router: Router) {
    addIcons({ eyeOutline, eyeOffOutline, logInOutline });
  }

  login(): void {
    if (!this.email || !this.password) { this.error.set('Email and password are required'); return; }
    this.loading.set(true); this.error.set(null);
    this.auth.login({ email: this.email, password: this.password }).subscribe({
      next: res => { this.loading.set(false); if (res.status === 'success') this.router.navigate(['/dashboard']); else this.error.set(res.message || 'Login failed'); },
      error: err => { this.loading.set(false); this.error.set(err.error?.message || 'Connection error'); },
    });
  }
}
