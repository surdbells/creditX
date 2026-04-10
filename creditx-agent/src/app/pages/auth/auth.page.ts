import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent, IonItem, IonInput, IonButton, IonSpinner, IonText
} from '@ionic/angular/standalone';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonItem, IonInput, IonButton, IonSpinner, IonText],
  template: `
    <ion-content class="ion-padding">
      <div class="auth-container">
        <div class="auth-header">
          <h1>CreditX Agent</h1>
          <p>Sign in to continue</p>
        </div>

        @if (error()) {
          <ion-text color="danger"><p class="error-msg">{{ error() }}</p></ion-text>
        }

        <form (ngSubmit)="onLogin()">
          <ion-item>
            <ion-input
              label="Email"
              labelPlacement="floating"
              type="email"
              [(ngModel)]="email"
              name="email"
              [disabled]="loading()"
            ></ion-input>
          </ion-item>
          <ion-item>
            <ion-input
              label="Password"
              labelPlacement="floating"
              type="password"
              [(ngModel)]="password"
              name="password"
              [disabled]="loading()"
            ></ion-input>
          </ion-item>
          <ion-button expand="block" type="submit" [disabled]="loading()" class="ion-margin-top">
            @if (loading()) {
              <ion-spinner name="crescent"></ion-spinner>
            } @else {
              Sign In
            }
          </ion-button>
        </form>
      </div>
    </ion-content>
  `,
  styles: [`
    .auth-container { max-width: 400px; margin: 4rem auto 0; }
    .auth-header { text-align: center; margin-bottom: 2rem; }
    .auth-header h1 { color: var(--ion-color-primary); font-size: 1.8rem; margin: 0 0 0.25rem; }
    .auth-header p { color: var(--ion-color-medium); margin: 0; }
    .error-msg { font-size: 0.9rem; padding: 0.5rem 0; }
    ion-item { --background: transparent; margin-bottom: 0.5rem; }
  `]
})
export class AuthPage {
  email = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);

  constructor(private authService: AuthService, private router: Router) {}

  onLogin(): void {
    if (!this.email || !this.password) { this.error.set('Email and password are required'); return; }
    this.loading.set(true);
    this.error.set(null);
    this.authService.login({ email: this.email, password: this.password }).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.status === 'success') this.router.navigate(['/dashboard']);
        else this.error.set(res.message);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err.error?.message || 'Login failed');
      }
    });
  }
}
