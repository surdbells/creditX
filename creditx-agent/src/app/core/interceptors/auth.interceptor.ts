import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

let isRefreshing = false;

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<any>, next: HttpHandlerFn) => {
  const auth = inject(AuthService);
  if (req.url.includes('/auth/login') || req.url.includes('/auth/refresh')) return next(req);
  const token = auth.getAccessToken();
  if (token) req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !isRefreshing && !req.url.includes('/auth/')) {
        isRefreshing = true;
        return auth.refreshToken().pipe(
          switchMap(() => { isRefreshing = false; return next(req.clone({ setHeaders: { Authorization: `Bearer ${auth.getAccessToken()}` } })); }),
          catchError(e => { isRefreshing = false; auth.logout(); return throwError(() => e); })
        );
      }
      return throwError(() => err);
    })
  );
};
