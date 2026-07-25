import { ErrorHandler, Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import * as Sentry from '@sentry/angular';

/**
 * Global error handler that filters two classes of NON-defect error out of
 * Sentry before delegating everything else to Sentry's handler.
 *
 * Why this exists: every one of these reached Angular's global ErrorHandler
 * because a component subscribed to an Observable with only a `next:` callback,
 * or a lazy route chunk 404'd after a deploy. They are operational, not code
 * bugs, and they drowned the real signal (Sentry PHP-2 hit 99 events, 0 users).
 *
 *  1. HttpErrorResponse — a failed API call. 401 is already handled by the
 *     auth interceptor (token refresh); user-facing failures are shown as
 *     toasts; and the backend reports its own 5xx with a real PHP stacktrace.
 *     The browser copy carries "No stacktrace available", so it is pure noise.
 *
 *  2. Dynamic-import / chunk-load failures — a tab holding an old bundle
 *     requests a hashed chunk that no longer exists after a Cloudflare deploy.
 *     We reload ONCE to pull the fresh index.html + chunk map. A timestamp
 *     guard prevents a reload loop if the reload doesn't resolve it, in which
 *     case the error is reported as genuine.
 *
 * Anything else is a real uncaught error and goes straight to Sentry.
 */
@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private readonly sentry = Sentry.createErrorHandler();

  /** Min gap between chunk-error reloads — long enough to recover a deploy, short of a loop. */
  private static readonly RELOAD_GUARD_MS = 10_000;
  private static readonly RELOAD_KEY = 'cx_chunk_reload_at';

  private static readonly CHUNK_PATTERNS: RegExp[] = [
    /Failed to fetch dynamically imported module/i,
    /error loading dynamically imported module/i,
    /Importing a module script failed/i,
    /ChunkLoadError/i,
  ];

  handleError(error: any): void {
    // Angular wraps rejected promises as { rejection }, and HttpClient errors
    // sometimes arrive wrapped as { error }. Unwrap to the real cause.
    const cause = error?.rejection ?? error?.error ?? error;

    if (cause instanceof HttpErrorResponse || error instanceof HttpErrorResponse) {
      const e = (cause instanceof HttpErrorResponse ? cause : error) as HttpErrorResponse;
      // Keep a local trace for devs; do not report.
      console.warn(`[http] ${e.status} ${e.url ?? ''}`);
      return;
    }

    const message = String(cause?.message ?? cause ?? '');
    if (AppErrorHandler.CHUNK_PATTERNS.some(p => p.test(message))) {
      if (this.shouldReload()) {
        location.reload();
        return;
      }
      // Reload already tried recently and it still failed — this is real.
    }

    this.sentry.handleError(error);
  }

  /** True at most once per guard window; records the attempt so a loop can't form. */
  private shouldReload(): boolean {
    try {
      const last = Number(sessionStorage.getItem(AppErrorHandler.RELOAD_KEY) ?? 0);
      const now = Date.now();
      if (now - last < AppErrorHandler.RELOAD_GUARD_MS) return false;
      sessionStorage.setItem(AppErrorHandler.RELOAD_KEY, String(now));
      return true;
    } catch {
      // sessionStorage unavailable (private mode quota) — don't risk a loop.
      return false;
    }
  }
}
