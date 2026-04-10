import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule, Eye, EyeOff, LogIn } from 'lucide-angular';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  email = '';
  password = '';
  showPassword = signal(false);
  loading = signal(false);
  error = signal<string | null>(null);
  currentYear = new Date().getFullYear();

  constructor(private authService: AuthService, private router: Router) {}

  onSubmit(): void {
    if (!this.email || !this.password) { this.error.set('Email and password are required'); return; }
    this.loading.set(true);
    this.error.set(null);
    this.authService.login({ email: this.email, password: this.password }).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.status === 'success') this.router.navigate(['/dashboard']);
        else this.error.set(res.message || 'Login failed');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message || 'An error occurred. Please try again.');
      },
    });
  }
}
