import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AccountingDateService } from '../../../core/services/accounting-date.service';

/**
 * The posting-date control every financial screen shows (§13).
 *
 * Displays the system date beside the accounting date — the two differing is
 * the whole point — and then either:
 *   - a date picker, when the user holds accounting.override_date or
 *     accounting.backdate, or
 *   - the accounting date read-only, when they do not.
 *
 * Emits the chosen date so the host form can submit it. When enforcement is
 * off it renders a plain date input, because the accounting date is not
 * governing anything yet and pretending otherwise would mislead.
 *
 * Usage:
 *   <cx-posting-date [(date)]="form.posting_date"></cx-posting-date>
 */
@Component({
  selector: 'cx-posting-date',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="cx-pd">
      <label class="cx-label">{{ label }}</label>

      @if (loading()) {
        <input class="cx-input" [value]="date || ''" disabled />
      } @else if (!status()?.enforced) {
        <!-- Framework off: an ordinary date field, no implied control. -->
        <input class="cx-input" type="date" [ngModel]="date" (ngModelChange)="emit($event)" />
      } @else {
        <div class="cx-pd-dates">
          <span><i>System</i>{{ status()?.server_date }}</span>
          <span class="cx-pd-acc"><i>Accounting</i>{{ status()?.accounting_date }}</span>
        </div>

        @if (canChoose()) {
          <input class="cx-input" type="date"
                 [ngModel]="date || status()?.accounting_date"
                 (ngModelChange)="emit($event)"
                 [max]="status()?.accounting_date" />
          @if (isBackdated()) {
            <p class="cx-pd-warn">
              <lucide-icon name="alert-triangle" [size]="13"></lucide-icon>
              <span>
                Backdated by {{ daysBack() }} day(s).
                @if (status()?.settings?.require_approval) { Requires manager approval. }
              </span>
            </p>
          }
        } @else {
          <input class="cx-input" [value]="status()?.accounting_date" disabled />
          <p class="cx-pd-hint">
            Posts to the current accounting date. You do not have permission to change it.
          </p>
        }
      }
    </div>
  `,
  styles: [`
    .cx-pd-dates { display:flex; gap:14px; margin-bottom:6px; font-size:12px; }
    .cx-pd-dates span { display:flex; flex-direction:column; }
    .cx-pd-dates i { font-style:normal; font-size:10px; text-transform:uppercase; letter-spacing:.04em; color:var(--cx-text-muted); }
    .cx-pd-acc { color:var(--cx-primary-600); font-weight:600; }
    .cx-pd-warn { display:flex; gap:6px; align-items:center; font-size:11.5px; margin:5px 0 0; color:var(--cx-warning); }
    .cx-pd-hint { font-size:11.5px; color:var(--cx-text-muted); margin:5px 0 0; }
  `],
})
export class PostingDateComponent implements OnInit {
  private svc = inject(AccountingDateService);

  @Input() label = 'Posting date';
  @Input() date: string | null = null;
  @Output() dateChange = new EventEmitter<string>();

  loading = signal(true);
  status = this.svc.status;

  ngOnInit(): void {
    this.svc.load().subscribe({
      next: () => {
        this.loading.set(false);
        // Default to the accounting date unless the host already set one.
        if (!this.date && this.status()?.accounting_date) {
          this.emit(this.status()!.accounting_date);
        }
      },
      error: () => this.loading.set(false),
    });
  }

  canChoose(): boolean {
    const c = this.status()?.can;
    return !!c && (c.override_date || c.backdate);
  }

  isBackdated(): boolean {
    const acc = this.status()?.accounting_date;
    return !!acc && !!this.date && this.date < acc;
  }

  daysBack(): number {
    const acc = this.status()?.accounting_date;
    if (!acc || !this.date) return 0;
    return Math.max(0, Math.round(
      (new Date(acc + 'T00:00:00').getTime() - new Date(this.date + 'T00:00:00').getTime()) / 86400000,
    ));
  }

  emit(v: string): void {
    this.date = v;
    this.dateChange.emit(v);
  }
}
