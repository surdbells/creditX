import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

/**
 * Bank Reconciliation — import a bank statement and reconcile it against the
 * BANK GL. Create a session, paste statement CSV, auto-match, manually
 * pair leftovers (select a statement line then a book entry), and complete.
 *
 * Gated by reports.reconciliation.
 */
@Component({
  selector: 'app-bank-reconciliation',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, MoneyPipe],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Bank Reconciliation"
        subtitle="Reconcile a bank statement against the BANK general ledger"
        eyebrow="Accounting"></cx-page-header>

      @if (!current()) {
        <!-- Session list + create -->
        <div class="cx-br-new">
          <div class="cx-br-field"><label class="cx-label">GL Code</label>
            <input class="cx-input" [(ngModel)]="form.gl_code" placeholder="BANK" /></div>
          <div class="cx-br-field"><label class="cx-label">Statement Date</label>
            <input type="date" class="cx-input" [(ngModel)]="form.statement_date" /></div>
          <div class="cx-br-field"><label class="cx-label">Opening Balance</label>
            <input type="number" class="cx-input" [(ngModel)]="form.opening_balance" /></div>
          <div class="cx-br-field"><label class="cx-label">Closing Balance</label>
            <input type="number" class="cx-input" [(ngModel)]="form.closing_balance" /></div>
          <button class="cx-btn cx-btn-primary" (click)="create()" [disabled]="busy()">
            <lucide-icon name="plus" [size]="14"></lucide-icon><span>Start</span>
          </button>
        </div>

        <div class="cx-br-table-wrap">
          <table class="cx-br-table">
            <thead><tr><th>GL</th><th>Statement Date</th><th class="r">Closing</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @if (sessions().length === 0) {
                <tr><td colspan="5" class="cx-br-state">No reconciliations yet.</td></tr>
              } @else {
                @for (s of sessions(); track s.id) {
                  <tr>
                    <td>{{ s.gl_code }}</td>
                    <td class="tabular-nums">{{ s.statement_date }}</td>
                    <td class="r tabular-nums">{{ s.closing_balance | money:2 }}</td>
                    <td><span class="cx-br-badge" [class.done]="s.status === 'completed'">{{ s.status }}</span></td>
                    <td class="r"><button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="open(s.id)">Open</button></td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      } @else {
        <!-- Detail -->
        <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="close()">
          <lucide-icon name="arrow-left" [size]="14"></lucide-icon><span>Back</span>
        </button>

        @if (detail(); as d) {
          <div class="cx-br-summary">
            <div><div class="cx-br-sl">Book Balance</div><div class="cx-br-sv tabular-nums">{{ d.summary.book_balance | money:2 }}</div></div>
            <div><div class="cx-br-sl">Statement Closing</div><div class="cx-br-sv tabular-nums">{{ d.summary.statement_closing | money:2 }}</div></div>
            <div><div class="cx-br-sl">Unmatched (Book)</div><div class="cx-br-sv tabular-nums">{{ d.summary.unmatched_book_total | money:2 }}</div></div>
            <div><div class="cx-br-sl">Unmatched (Stmt)</div><div class="cx-br-sv tabular-nums">{{ d.summary.unmatched_statement_total | money:2 }}</div></div>
            <div><div class="cx-br-sl">Difference</div>
              <div class="cx-br-sv tabular-nums" [class.ok]="d.summary.is_reconciled" [class.bad]="!d.summary.is_reconciled">
                {{ d.summary.difference | money:2 }}
                <lucide-icon [name]="d.summary.is_reconciled ? 'check-circle' : 'alert-triangle'" [size]="14"></lucide-icon>
              </div>
            </div>
          </div>

          @if (d.reconciliation.status !== 'completed') {
            <div class="cx-br-import">
              <label class="cx-label">Paste statement CSV (header: value_date,description,reference,amount — amount signed +in/-out)</label>
              <textarea class="cx-input" rows="4" [(ngModel)]="csv"
                placeholder="value_date,description,reference,amount&#10;2026-06-30,POS settlement,REF123,15000&#10;2026-06-30,Bank charge,,-250"></textarea>
              <div class="cx-br-import-actions">
                <button class="cx-btn cx-btn-outline" (click)="importCsv()" [disabled]="busy() || !csv.trim()">
                  <lucide-icon name="upload" [size]="14"></lucide-icon><span>Import</span>
                </button>
                <button class="cx-btn cx-btn-outline" (click)="autoMatch()" [disabled]="busy()">
                  <lucide-icon name="link" [size]="14"></lucide-icon><span>Auto-match</span>
                </button>
                <button class="cx-btn cx-btn-primary" (click)="complete()" [disabled]="busy()">
                  <lucide-icon name="check" [size]="14"></lucide-icon><span>Complete</span>
                </button>
              </div>
            </div>
          }

          <div class="cx-br-cols">
            <div class="cx-br-col">
              <h3 class="cx-br-h">Statement Lines</h3>
              <div class="cx-br-table-wrap">
                <table class="cx-br-table">
                  <thead><tr><th>Date</th><th>Description</th><th class="r">Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    @for (l of d.lines; track l.id) {
                      <tr [class.sel]="selectedLine() === l.id" (click)="selectLine(l)">
                        <td class="tabular-nums">{{ l.value_date }}</td>
                        <td>{{ l.description }}</td>
                        <td class="r tabular-nums">{{ l.amount | money:2 }}</td>
                        <td>
                          <span class="cx-br-badge" [class.done]="l.status === 'matched'">{{ l.status }}</span>
                          @if (l.status === 'matched') {
                            <button class="cx-br-x" (click)="unmatch(l, $event)" title="Unmatch">×</button>
                          }
                        </td>
                      </tr>
                    }
                    @if (d.lines.length === 0) { <tr><td colspan="4" class="cx-br-state">No lines imported.</td></tr> }
                  </tbody>
                </table>
              </div>
            </div>

            <div class="cx-br-col">
              <h3 class="cx-br-h">Unmatched Book Entries
                @if (selectedLine()) { <span class="cx-br-hint">— click one to match the selected line</span> }
              </h3>
              <div class="cx-br-table-wrap">
                <table class="cx-br-table">
                  <thead><tr><th>Date</th><th>Narration</th><th class="r">Amount</th></tr></thead>
                  <tbody>
                    @for (e of d.unmatched_book; track e.id) {
                      <tr [class.click]="!!selectedLine()" (click)="matchBook(e)">
                        <td class="tabular-nums">{{ e.date }}</td>
                        <td>{{ e.narration }}</td>
                        <td class="r tabular-nums">{{ e.signed | money:2 }}</td>
                      </tr>
                    }
                    @if (d.unmatched_book.length === 0) { <tr><td colspan="3" class="cx-br-state">All book entries matched.</td></tr> }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .cx-br-new { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 14px;
      padding: 14px 16px; background: var(--cx-surface-2); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-xl, 12px); }
    .cx-br-field { display: flex; flex-direction: column; gap: 4px; }
    .cx-br-summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 12px 0 14px;
      padding: 12px 16px; background: var(--cx-surface); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-md); }
    .cx-br-sl { font-size: 10px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--cx-text-muted); }
    .cx-br-sv { font-size: 16px; font-weight: 600; color: var(--cx-text); display: inline-flex; align-items: center; gap: 4px; }
    .cx-br-sv.ok { color: #166534; } .cx-br-sv.bad { color: #b45309; }
    .cx-br-import { margin-bottom: 14px; padding: 14px 16px; background: var(--cx-surface); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-md); }
    .cx-br-import-actions { display: flex; gap: 8px; margin-top: 8px; }
    .cx-br-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    @media (max-width: 900px) { .cx-br-cols { grid-template-columns: 1fr; } .cx-br-summary { grid-template-columns: repeat(2, 1fr); } }
    .cx-br-h { font-size: 13px; font-weight: 600; margin: 6px 0 8px; }
    .cx-br-hint { font-weight: 400; color: var(--cx-text-muted); font-size: 11px; }
    .cx-br-table-wrap { background: var(--cx-surface); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-xl, 12px); overflow: hidden; margin-bottom: 14px; }
    .cx-br-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .cx-br-table th { text-align: left; padding: 9px 12px; background: var(--cx-surface-2); font-size: 10px; font-weight: 600;
      letter-spacing: .06em; text-transform: uppercase; color: var(--cx-text-muted); border-bottom: 1px solid var(--cx-border); }
    .cx-br-table th.r, .cx-br-table td.r { text-align: right; }
    .cx-br-table td { padding: 9px 12px; border-bottom: 1px solid var(--cx-border-subtle); }
    .cx-br-table tbody tr.sel { background: var(--cx-primary-50, #eff6ff); }
    .cx-br-table tbody tr.click { cursor: pointer; }
    .cx-br-table tbody tr.click:hover { background: var(--cx-surface-2); }
    .cx-br-state { padding: 24px; text-align: center; color: var(--cx-text-muted); }
    .cx-br-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;
      background: var(--cx-surface-2); color: var(--cx-text-muted); text-transform: capitalize; }
    .cx-br-badge.done { background: #f0fdf4; color: #166534; }
    .cx-br-x { margin-left: 6px; border: none; background: none; color: var(--cx-danger); cursor: pointer; font-size: 14px; }
  `],
})
export class BankReconciliationComponent {
  form: any = { gl_code: 'BANK', statement_date: new Date().toISOString().slice(0, 10), opening_balance: 0, closing_balance: 0 };
  sessions = signal<any[]>([]);
  current = signal<string | null>(null);
  detail = signal<any>(null);
  csv = '';
  busy = signal(false);
  selectedLine = signal<string | null>(null);

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {
    this.loadSessions();
  }

  loadSessions() {
    this.api.get('/accounting/bank-reconciliations', { limit: 25 }).subscribe({
      next: r => this.sessions.set(r.data?.reconciliations || []),
      error: () => {},
    });
  }

  create() {
    this.busy.set(true);
    this.api.post('/accounting/bank-reconciliations', this.form).subscribe({
      next: r => { this.busy.set(false); this.toast.success('Started'); this.loadSessions(); this.open(r.data.id); },
      error: e => { this.busy.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }

  open(id: string) { this.current.set(id); this.selectedLine.set(null); this.refresh(); }
  close() { this.current.set(null); this.detail.set(null); this.loadSessions(); }

  refresh() {
    const id = this.current();
    if (!id) return;
    this.api.get(`/accounting/bank-reconciliations/${id}`).subscribe({
      next: r => this.detail.set(r.data),
      error: e => this.toast.error(e.error?.message || 'Load failed'),
    });
  }

  importCsv() {
    this.busy.set(true);
    this.api.post(`/accounting/bank-reconciliations/${this.current()}/import`, { csv: this.csv }).subscribe({
      next: () => { this.busy.set(false); this.csv = ''; this.toast.success('Imported'); this.refresh(); },
      error: e => { this.busy.set(false); this.toast.error(e.error?.message || 'Import failed'); },
    });
  }

  autoMatch() {
    this.busy.set(true);
    this.api.post(`/accounting/bank-reconciliations/${this.current()}/auto-match`, {}).subscribe({
      next: r => { this.busy.set(false); this.toast.success(r.message || 'Matched'); this.refresh(); },
      error: e => { this.busy.set(false); this.toast.error(e.error?.message || 'Auto-match failed'); },
    });
  }

  selectLine(l: any) {
    if (l.status === 'matched') return;
    this.selectedLine.set(this.selectedLine() === l.id ? null : l.id);
  }

  matchBook(entry: any) {
    const lineId = this.selectedLine();
    if (!lineId) return;
    this.api.post(`/accounting/bank-reconciliations/${this.current()}/lines/${lineId}/match`, { ledger_transaction_id: entry.id }).subscribe({
      next: () => { this.toast.success('Matched'); this.selectedLine.set(null); this.refresh(); },
      error: e => this.toast.error(e.error?.message || 'Match failed'),
    });
  }

  unmatch(l: any, ev: Event) {
    ev.stopPropagation();
    this.api.post(`/accounting/bank-reconciliations/${this.current()}/lines/${l.id}/unmatch`, {}).subscribe({
      next: () => { this.toast.success('Unmatched'); this.refresh(); },
      error: e => this.toast.error(e.error?.message || 'Unmatch failed'),
    });
  }

  complete() {
    if (!confirm('Mark this reconciliation as completed?')) return;
    this.busy.set(true);
    this.api.post(`/accounting/bank-reconciliations/${this.current()}/complete`, {}).subscribe({
      next: () => { this.busy.set(false); this.toast.success('Completed'); this.refresh(); },
      error: e => { this.busy.set(false); this.toast.error(e.error?.message || 'Complete failed'); },
    });
  }
}
