import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Subject, catchError, switchMap, take, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

let isRefreshing = false;

/**
 * Emits once per refresh attempt: the new access token, or null if the refresh
 * failed. Requests that 401 while a refresh is already in flight wait on this
 * instead of failing — the dashboard fires several calls at once, and without
 * it only the first one recovered while the rest showed "could not load".
 */
const refreshDone$ = new Subject<string | null>();

const withToken = (req: HttpRequest<any>, token: string | null): HttpRequest<any> =>
  token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

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

  const authed = withToken(req, authService.getAccessToken());

  return next(authed).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || req.url.includes('/portal/auth/')) {
        return throwError(() => error);
      }

      // Nothing to refresh with. The loan calculator is a PUBLIC page that
      // runs signed out, so a 401 there must surface as an ordinary error
      // rather than bouncing a prospective customer to the login screen.
      if (!authService.getRefreshToken()) {
        return throwError(() => error);
      }

      if (isRefreshing) {
        return refreshDone$.pipe(
          take(1),
          switchMap(token => (token ? next(withToken(req, token)) : throwError(() => error))),
        );
      }

      isRefreshing = true;
      return authService.refreshToken().pipe(
        switchMap(() => {
          isRefreshing = false;
          const newToken = authService.getAccessToken();
          refreshDone$.next(newToken);
          return next(withToken(req, newToken));
        }),
        catchError(refreshError => {
          isRefreshing = false;
          // Release the waiters instead of leaving them subscribed forever.
          refreshDone$.next(null);
          authService.logout();
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
