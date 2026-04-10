import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, LoginRequest, LoginResponse, User } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API = environment.apiUrl;
  private readonly ACCESS_KEY = 'creditx_access_token';
  private readonly REFRESH_KEY = 'creditx_refresh_token';
  private readonly USER_KEY = 'creditx_user';

  private currentUser = signal<User | null>(this.loadStoredUser());

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly userRoles = computed(() => this.currentUser()?.roles?.map(r => r.slug) ?? []);
  readonly userPermissions = computed(() => {
    const perms: string[] = [];
    this.currentUser()?.roles?.forEach(r => {
      r.permissions?.forEach(p => perms.push(p.slug));
    });
    return [...new Set(perms)];
  });

  constructor(private http: HttpClient, private router: Router) {}

  login(credentials: LoginRequest): Observable<ApiResponse<LoginResponse>> {
    return this.http.post<ApiResponse<LoginResponse>>(`${this.API}/auth/login`, credentials).pipe(
      tap(res => {
        if (res.status === 'success' && res.data) {
          this.storeTokens(res.data.tokens.access_token, res.data.tokens.refresh_token);
          this.storeUser(res.data.user);
          this.currentUser.set(res.data.user);
        }
      })
    );
  }

  logout(): void {
    const refreshToken = this.getRefreshToken();
    this.http.post(`${this.API}/auth/logout`, { refresh_token: refreshToken }).pipe(
      catchError(() => throwError(() => new Error('Logout failed')))
    ).subscribe({ complete: () => {} });

    this.clearSession();
    this.router.navigate(['/auth/login']);
  }

  refreshToken(): Observable<ApiResponse<LoginResponse>> {
    const refreshToken = this.getRefreshToken();
    return this.http.post<ApiResponse<LoginResponse>>(`${this.API}/auth/refresh`, {
      refresh_token: refreshToken
    }).pipe(
      tap(res => {
        if (res.status === 'success' && res.data) {
          this.storeTokens(res.data.tokens.access_token, res.data.tokens.refresh_token);
          this.storeUser(res.data.user);
          this.currentUser.set(res.data.user);
        }
      }),
      catchError(err => {
        this.clearSession();
        this.router.navigate(['/auth/login']);
        return throwError(() => err);
      })
    );
  }

  getAccessToken(): string | null {
    return localStorage.getItem(this.ACCESS_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_KEY);
  }

  hasPermission(permission: string): boolean {
    if (this.userRoles().includes('super_admin')) return true;
    return this.userPermissions().includes(permission);
  }

  hasRole(role: string): boolean {
    return this.userRoles().includes(role);
  }

  hasAnyRole(roles: string[]): boolean {
    return roles.some(r => this.hasRole(r));
  }

  private storeTokens(access: string, refresh: string): void {
    localStorage.setItem(this.ACCESS_KEY, access);
    localStorage.setItem(this.REFRESH_KEY, refresh);
  }

  private storeUser(user: User): void {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  }

  private loadStoredUser(): User | null {
    try {
      const stored = localStorage.getItem(this.USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  private clearSession(): void {
    localStorage.removeItem(this.ACCESS_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.currentUser.set(null);
  }
}
