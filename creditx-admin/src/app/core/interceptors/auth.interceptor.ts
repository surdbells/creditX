import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Subject, catchError, switchMap, take, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

let isRefreshing = false;

/**
 * Emits once per refresh attempt: the new access token, or null if the refresh
 * failed. Requests that 401 while a refresh is already in flight wait on this
 * instead of failing outright — an admin page typically fires several calls at
 * once (list + lookups + settings), and with a plain `!isRefreshing` guard only
 * the first recovered while every other one surfaced an error toast.
 */
const refreshDone$ = new Subject<string | null>();

const withToken = (req: HttpRequest<any>, token: string | null): HttpRequest<any> =>
  token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<any>, next: HttpHandlerFn) => {
  const authService = inject(AuthService);

  // Skip auth header for login/refresh endpoints
  if (req.url.includes('/auth/login') || req.url.includes('/auth/refresh')) {
    return next(req);
  }

  const authed = withToken(req, authService.getAccessToken());

  return next(authed).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || req.url.includes('/auth/')) {
        return throwError(() => error);
      }

      // Nothing to refresh with — surface the 401 rather than bouncing
      // through a refresh that cannot succeed.
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
