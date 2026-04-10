import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, LoginRequest, LoginResponse, User } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API = environment.apiUrl;
  private readonly ACCESS_KEY = 'cxa_access_token';
  private readonly REFRESH_KEY = 'cxa_refresh_token';
  private readonly USER_KEY = 'cxa_user';

  private currentUser = signal<User | null>(this.loadStoredUser());
  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  constructor(private http: HttpClient, private router: Router) {}

  login(credentials: LoginRequest): Observable<ApiResponse<LoginResponse>> {
    return this.http.post<ApiResponse<LoginResponse>>(`${this.API}/auth/login`, credentials).pipe(
      tap(res => {
        if (res.status === 'success' && res.data) {
          localStorage.setItem(this.ACCESS_KEY, res.data.tokens.access_token);
          localStorage.setItem(this.REFRESH_KEY, res.data.tokens.refresh_token);
          localStorage.setItem(this.USER_KEY, JSON.stringify(res.data.user));
          this.currentUser.set(res.data.user);
        }
      })
    );
  }

  logout(): void {
    const rt = localStorage.getItem(this.REFRESH_KEY);
    this.http.post(`${this.API}/auth/logout`, { refresh_token: rt }).pipe(
      catchError(() => throwError(() => new Error()))
    ).subscribe();
    localStorage.removeItem(this.ACCESS_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.currentUser.set(null);
    this.router.navigate(['/auth']);
  }

  refreshToken(): Observable<ApiResponse<LoginResponse>> {
    const rt = localStorage.getItem(this.REFRESH_KEY);
    return this.http.post<ApiResponse<LoginResponse>>(`${this.API}/auth/refresh`, { refresh_token: rt }).pipe(
      tap(res => {
        if (res.status === 'success' && res.data) {
          localStorage.setItem(this.ACCESS_KEY, res.data.tokens.access_token);
          localStorage.setItem(this.REFRESH_KEY, res.data.tokens.refresh_token);
          localStorage.setItem(this.USER_KEY, JSON.stringify(res.data.user));
          this.currentUser.set(res.data.user);
        }
      }),
      catchError(err => { this.logout(); return throwError(() => err); })
    );
  }

  getAccessToken(): string | null { return localStorage.getItem(this.ACCESS_KEY); }

  private loadStoredUser(): User | null {
    try { const s = localStorage.getItem(this.USER_KEY); return s ? JSON.parse(s) : null; }
    catch { return null; }
  }
}
