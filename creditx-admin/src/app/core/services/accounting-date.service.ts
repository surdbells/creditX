import { Injectable, inject, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { ApiService } from './api.service';

export interface AccountingPeriodStatus {
  server_date: string;
  accounting_date: string;
  status: string;
  status_label: string;
  next_accounting_date: string;
  last_eod_date: string | null;
  last_eod_completed_at: string | null;
  enforced: boolean;
  open_dates: string[];
  settings: {
    allow_backdating: boolean;
    max_backdate_days: number;
    require_approval: boolean;
    allow_reopen: boolean;
    allow_weekend: boolean;
  };
  can: {
    post_current: boolean;
    backdate: boolean;
    override_date: boolean;
    reopen: boolean;
    run_eod: boolean;
  };
}

/**
 * Shared accounting-date state for posting screens (§13).
 *
 * Cached after the first fetch: every posting form needs the same answer, and
 * the accounting date only moves when End-of-Day runs — so refetching it per
 * form would be pure noise. Call refresh() after an EOD to pick up the new date.
 */
@Injectable({ providedIn: 'root' })
export class AccountingDateService {
  private api = inject(ApiService);

  readonly status = signal<AccountingPeriodStatus | null>(null);
  private inFlight: Observable<any> | null = null;

  /** Fetch once and cache; subsequent callers get the cached value. */
  load(): Observable<any> {
    if (this.status()) return of({ data: this.status() });
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.api.get<AccountingPeriodStatus>('/accounting/period/status').pipe(
      tap({
        next: r => { this.status.set(r.data as AccountingPeriodStatus); this.inFlight = null; },
        error: () => { this.inFlight = null; },
      }),
    );
    return this.inFlight;
  }

  /** Drop the cache and refetch — call after End-of-Day advances the date. */
  refresh(): Observable<any> {
    this.status.set(null);
    this.inFlight = null;
    return this.load();
  }
}
