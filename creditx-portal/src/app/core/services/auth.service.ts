import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, AuthResponse, Customer, LoginRequest, RegisterRequest } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API = environment.apiUrl;
  private readonly ACCESS_KEY = 'creditx_portal_access_token';
  private readonly REFRESH_KEY = 'creditx_portal_refresh_token';
  private readonly CUSTOMER_KEY = 'creditx_portal_customer';

  private http = inject(HttpClient);
  private router = inject(Router);

  private currentCustomer = signal<Customer | null>(this.loadStoredCustomer());

  readonly customer = this.currentCustomer.asReadonly();
  readonly isAuthenticated = computed(() => this.currentCustomer() !== null);

  // ─── Registration & verification ───
  register(payload: RegisterRequest): Observable<ApiResponse<Customer>> {
    return this.http.post<ApiResponse<Customer>>(`${this.API}/portal/auth/register`, payload);
  }

  verifyEmail(email: string, code: string): Observable<ApiResponse<AuthResponse>> {
    return this.http.post<ApiResponse<AuthResponse>>(`${this.API}/portal/auth/verify-email`, { email, code }).pipe(
      tap(res => this.persistSession(res)),
    );
  }

  resendVerification(email: string): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.API}/portal/auth/resend-verification`, { email });
  }

  // ─── Password login ───
  login(credentials: LoginRequest): Observable<ApiResponse<AuthResponse>> {
    return this.http.post<ApiResponse<AuthResponse>>(`${this.API}/portal/auth/login`, credentials).pipe(
      tap(res => this.persistSession(res)),
    );
  }

  // ─── Passwordless email-OTP login ───
  requestOtp(email: string): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.API}/portal/auth/request-otp`, { email });
  }

  verifyOtpLogin(email: string, code: string): Observable<ApiResponse<AuthResponse>> {
    return this.http.post<ApiResponse<AuthResponse>>(`${this.API}/portal/auth/verify-otp`, { email, code }).pipe(
      tap(res => this.persistSession(res)),
    );
  }

  refreshToken(): Observable<ApiResponse<AuthResponse>> {
    const refreshToken = this.getRefreshToken();
    return this.http.post<ApiResponse<AuthResponse>>(`${this.API}/portal/auth/refresh`, {
      refresh_token: refreshToken,
    }).pipe(
      tap(res => this.persistSession(res)),
      catchError(err => {
        this.clearSession();
        this.router.navigate(['/auth/login']);
        return throwError(() => err);
      }),
    );
  }

  logout(): void {
    const refreshToken = this.getRefreshToken();
    this.http.post(`${this.API}/portal/auth/logout`, { refresh_token: refreshToken }).pipe(
      catchError(() => throwError(() => new Error('Logout failed'))),
    ).subscribe({ complete: () => {}, error: () => {} });

    this.clearSession();
    this.router.navigate(['/auth/login']);
  }

  setCustomer(customer: Customer): void {
    this.storeCustomer(customer);
    this.currentCustomer.set(customer);
  }

  getAccessToken(): string | null {
    return localStorage.getItem(this.ACCESS_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_KEY);
  }

  private persistSession(res: ApiResponse<AuthResponse>): void {
    if (res.status === 'success' && res.data && res.data.tokens) {
      this.storeTokens(res.data.tokens.access_token, res.data.tokens.refresh_token);
      this.storeCustomer(res.data.customer);
      this.currentCustomer.set(res.data.customer);
    }
  }

  private storeTokens(access: string, refresh: string): void {
    localStorage.setItem(this.ACCESS_KEY, access);
    localStorage.setItem(this.REFRESH_KEY, refresh);
  }

  private storeCustomer(customer: Customer): void {
    localStorage.setItem(this.CUSTOMER_KEY, JSON.stringify(customer));
  }

  private loadStoredCustomer(): Customer | null {
    try {
      const stored = localStorage.getItem(this.CUSTOMER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  private clearSession(): void {
    localStorage.removeItem(this.ACCESS_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    localStorage.removeItem(this.CUSTOMER_KEY);
    this.currentCustomer.set(null);
  }
}
