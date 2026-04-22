import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';

/**
 * Auto-toast HTTP errors.
 *
 * Rationale: historically every callsite swallowed errors with
 * `error: () => this.submitting.set(false)`, discarding the server's
 * message field. Users saw nothing — UI just stopped responding.
 * This interceptor surfaces every failed request as a toast so
 * agents immediately know WHY something failed (validation, 403,
 * 500, etc.) without developers having to remember to wire toasts
 * at every callsite.
 *
 * Decisions:
 *
 *   1. Skip 401s — those are handled by the refresh-token flow in
 *      authInterceptor. Showing 'Unauthorized' toasts mid-refresh
 *      would confuse users who are about to silently re-authenticate.
 *
 *   2. Skip auth endpoints (login, refresh, logout) — the login page
 *      renders errors inline. A duplicate toast is noisy.
 *
 *   3. Skip explicit no-toast requests — any request with header
 *      'X-Skip-Error-Toast: 1' is passed through. This is the escape
 *      hatch for silent background polls (e.g. refreshPauseState on
 *      the loan-capture page, which polls every 15s — toasting every
 *      stale network blip would be dreadful). The header is stripped
 *      before leaving the client so the server never sees it.
 *
 *   4. Extract message from server's ApiResponse shape:
 *        { status: 'error', message: '...', errors?: { field: msg } }
 *      Falls back to err.message then a generic 'Something went wrong'.
 *
 *   5. Validation errors (422 with .errors) get the FIRST field error
 *      as the toast message so users see which specific field is
 *      wrong. A more sophisticated display would be per-field
 *      inline; toast is the 80% solution.
 *
 *   6. Always rethrows so component-level error handlers still fire.
 *      The toast is additive, not a replacement.
 */
export const errorInterceptor: HttpInterceptorFn = (req: HttpRequest<any>, next: HttpHandlerFn) => {
  const toast = inject(ToastService);

  // Escape hatch: allow callers to opt out per-request
  const skip = req.headers.has('X-Skip-Error-Toast');
  const cleanReq = skip
    ? req.clone({ headers: req.headers.delete('X-Skip-Error-Toast') })
    : req;

  return next(cleanReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (skip) return throwError(() => err);
      if (err.status === 401) return throwError(() => err); // auth interceptor handles
      if (cleanReq.url.includes('/auth/')) return throwError(() => err);

      const serverBody: any = err.error || {};
      let message: string;

      if (serverBody.errors && typeof serverBody.errors === 'object') {
        // 422 validation — take first field's message so the user sees
        // *which* field is wrong rather than a generic 'Validation failed'.
        const firstKey = Object.keys(serverBody.errors)[0];
        message = firstKey ? String(serverBody.errors[firstKey]) : (serverBody.message || 'Validation failed');
      } else if (serverBody.message) {
        message = String(serverBody.message);
      } else if (err.status === 0) {
        message = 'Network error. Check your connection and try again.';
      } else if (err.status >= 500) {
        message = 'Server error. Please try again in a moment.';
      } else {
        message = err.message || 'Something went wrong';
      }

      // Network errors are warnings (user can retry); everything else is error
      if (err.status === 0) {
        toast.warning(message);
      } else {
        toast.error(message);
      }

      return throwError(() => err);
    })
  );
};
