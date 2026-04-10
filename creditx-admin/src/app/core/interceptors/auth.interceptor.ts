import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

let isRefreshing = false;

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<any>, next: HttpHandlerFn) => {
  const authService = inject(AuthService);

  // Skip auth header for login/refresh endpoints
  if (req.url.includes('/auth/login') || req.url.includes('/auth/refresh')) {
    return next(req);
  }

  const token = authService.getAccessToken();
  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isRefreshing && !req.url.includes('/auth/')) {
        isRefreshing = true;
        return authService.refreshToken().pipe(
          switchMap(res => {
            isRefreshing = false;
            const newToken = authService.getAccessToken();
            const retryReq = req.clone({
              setHeaders: { Authorization: `Bearer ${newToken}` }
            });
            return next(retryReq);
          }),
          catchError(refreshError => {
            isRefreshing = false;
            authService.logout();
            return throwError(() => refreshError);
          })
        );
      }
      return throwError(() => error);
    })
  );
};
