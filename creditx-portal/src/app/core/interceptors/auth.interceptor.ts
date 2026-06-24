import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

let isRefreshing = false;

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<any>, next: HttpHandlerFn) => {
  const authService = inject(AuthService);

  // Skip auth header for the unauthenticated portal auth endpoints.
  if (
    req.url.includes('/portal/auth/login') ||
    req.url.includes('/portal/auth/register') ||
    req.url.includes('/portal/auth/verify-email') ||
    req.url.includes('/portal/auth/verify-otp') ||
    req.url.includes('/portal/auth/request-otp') ||
    req.url.includes('/portal/auth/resend-verification') ||
    req.url.includes('/portal/auth/refresh')
  ) {
    return next(req);
  }

  const token = authService.getAccessToken();
  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isRefreshing && !req.url.includes('/portal/auth/')) {
        isRefreshing = true;
        return authService.refreshToken().pipe(
          switchMap(() => {
            isRefreshing = false;
            const newToken = authService.getAccessToken();
            const retryReq = req.clone({
              setHeaders: { Authorization: `Bearer ${newToken}` },
            });
            return next(retryReq);
          }),
          catchError(refreshError => {
            isRefreshing = false;
            authService.logout();
            return throwError(() => refreshError);
          }),
        );
      }
      return throwError(() => error);
    }),
  );
};
