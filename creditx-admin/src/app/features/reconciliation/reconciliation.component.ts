import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { environment } from '../../../environments/environment';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

/**
 * Bank Reconciliation — list + detail workflow.
 *
 * Two views rendered by a single component, swapped via `mode` signal:
 *
 * - LIST: recent reconciliations with period, totals, matched /
 *   exception / resolved counts, status badge. Upload button opens
 *   modal to run a new one.
 * - DETAIL: three-panel layout (Bank-only / Matched / System-only)
 *   for one reconciliation, per-row Match and Resolve actions.
 *
 * Gated by reports.reconciliation.
 */
@Component({
  selector: 'app-reconciliation',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, MoneyPipe],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        [title]="mode() === 'list' ? 'Reconciliation' : 'Reconciliation · ' + (detail()?.period || '')"
        [subtitle]="mode() === 'list'
          ? 'Match bank statements against system ledger entries'
          : 'Per-item matching and exception resolution'"
        eyebrow="Finance Operations">
        @if (mode() === 'list') {
          <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="loadList()" [disabled]="loading()">
            <lucide-icon name="refresh-cw" [size]="14"></lucide-icon>
            <span>{{ loading() ? 'Loading…' : 'Refresh' }}</span>
          </button>
          <button class="cx-btn cx-btn-primary cx-btn-sm" (click)="openUploadModal()">
            <lucide-icon name="upload" [size]="14"></lucide-icon>
            <span>Upload Bank Statement</span>
          </button>
        } @else {
          <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="backToList()">
            <lucide-icon name="chevron-left" [size]="14"></lucide-icon>
            <span>Back to list</span>
          </button>
          <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="loadDetail(detail()?.id)" [disabled]="loading()">
            <lucide-icon name="refresh-cw" [size]="14"></lucide-icon>
            <span>{{ loading() ? 'Loading…' : 'Refresh' }}</span>
          </button>
        }
      </cx-page-header>

      <!-- ═══ LIST MODE ═══ -->
      @if (mode() === 'list') {
        @if (loading()) {
          <div class="cx-re-loading">
            <lucide-icon name="loader-2" [size]="20" class="cx-re-spin"></lucide-icon>
            <span>Loading reconciliations…</span>
          </div>
        } @else if (rows().length === 0) {
          <div class="cx-re-empty">
            <lucide-icon name="file-spreadsheet" [size]="32"></lucide-icon>
            <p><strong>No reconciliations yet</strong></p>
            <p class="cx-re-empty-sub">Upload a bank statement to match it against your system's payment records.</p>
          </div>
        } @else {
          <div class="cx-re-table-wrap">
            <table class="cx-re-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Status</th>
                  <th class="cx-re-right">Bank Total</th>
                  <th class="cx-re-right">System Total</th>
                  <th class="cx-re-right">Difference</th>
                  <th class="cx-re-right">Items</th>
                  <th>Created</th>
                  <th class="cx-re-right"></th>
                </tr>
              </thead>
              <tbody>
                @for (r of rows(); track r.id) {
                  <tr>
                    <td class="cx-re-mono">{{ r.period }}</td>
                    <td>
                      <span class="cx-re-status" [attr.data-status]="r.status">
                        {{ r.status | titlecase }}
                      </span>
                    </td>
                    <td class="cx-re-right tabular-nums">{{ r.bank_total | money:2 }}</td>
                    <td class="cx-re-right tabular-nums">{{ r.system_total | money:2 }}</td>
                    <td class="cx-re-right tabular-nums"
                        [class.cx-re-pos]="+r.difference > 0"
                        [class.cx-re-neg]="+r.difference < 0">
                      @if (+r.difference === 0) { {{ 0 | money:2 }} }
                      @else if (+r.difference > 0) { +{{ r.difference | money:2 }} }
                      @else { −{{ (-r.difference) | money:2 }} }
                    </td>
                    <td class="cx-re-right tabular-nums">{{ r.item_count }}</td>
                    <td class="cx-re-small">{{ r.created_at | date:'MMM d, y · HH:mm' }}</td>
                    <td class="cx-re-right">
                      <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="openDetail(r.id)">
                        <lucide-icon name="eye" [size]="12"></lucide-icon>
                        <span>Open</span>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }

      <!-- ═══ DETAIL MODE ═══ -->
      @if (mode() === 'detail' && detail(); as d) {
        <!-- Summary cards -->
        <div class="cx-re-summary">
          <div class="cx-re-stat">
            <div class="cx-re-stat-label">Bank Total</div>
            <div class="cx-re-stat-value tabular-nums">{{ d.bank_total | money:2 }}</div>
          </div>
          <div class="cx-re-stat">
            <div class="cx-re-stat-label">System Total</div>
            <div class="cx-re-stat-value tabular-nums">{{ d.system_total | money:2 }}</div>
          </div>
          <div class="cx-re-stat cx-re-stat-emphasis"
               [class.cx-re-stat-ok]="+d.difference === 0"
               [class.cx-re-stat-warn]="+d.difference !== 0">
            <div class="cx-re-stat-label">Difference</div>
            <div class="cx-re-stat-value tabular-nums">
              @if (+d.difference === 0) { {{ 0 | money:2 }} }
              @else if (+d.difference > 0) { +{{ d.difference | money:2 }} }
              @else { −{{ (-d.difference) | money:2 }} }
            </div>
            <div class="cx-re-stat-hint">
              @if (+d.difference === 0) { Perfectly balanced }
              @else if (+d.difference > 0) { Bank shows more than system }
              @else { System shows more than bank }
            </div>
          </div>
          <div class="cx-re-stat">
            <div class="cx-re-stat-label">Status</div>
            <div class="cx-re-stat-value">
              <span class="cx-re-status" [attr.data-status]="d.status">{{ d.status | titlecase }}</span>
            </div>
          </div>
        </div>

        <!-- Three-panel breakdown -->
        <div class="cx-re-panels">
          <!-- Bank-only (unmatched bank rows) -->
          <section class="cx-re-panel">
            <header class="cx-re-panel-head">
              <div>
                <h3>Bank-only</h3>
                <p>On the bank statement, not yet in the system</p>
              </div>
              <span class="cx-re-panel-count">{{ bankOnly().length }}</span>
            </header>
            @if (bankOnly().length === 0) {
              <div class="cx-re-panel-empty">No bank-only rows — everything reconciled.</div>
            } @else {
              <div class="cx-re-panel-list">
                @for (i of bankOnly(); track i.id) {
                  <article class="cx-re-item" [class.is-resolved]="i.status === 'resolved'">
                    <div class="cx-re-item-head">
                      <div class="cx-re-item-ref cx-re-mono">{{ i.bank_reference || '—' }}</div>
                      <div class="cx-re-item-amount tabular-nums">{{ i.bank_amount | money:2 }}</div>
                    </div>
                    @if (i.status === 'resolved') {
                      <div class="cx-re-item-resolved">
                        <lucide-icon name="check-circle" [size]="12"></lucide-icon>
                        <span>{{ resolutionLabel(i.resolution_category) }}</span>
                        @if (i.resolution_note) { · {{ i.resolution_note }} }
                      </div>
                    } @else {
                      <div class="cx-re-item-actions">
                        <button class="cx-btn cx-btn-outline cx-btn-xs" (click)="openMatchModal(i)">
                          <lucide-icon name="link" [size]="11"></lucide-icon>
                          <span>Match</span>
                        </button>
                        <button class="cx-btn cx-btn-ghost cx-btn-xs" (click)="openResolveModal(i)">
                          <lucide-icon name="check" [size]="11"></lucide-icon>
                          <span>Resolve</span>
                        </button>
                      </div>
                    }
                  </article>
                }
              </div>
            }
          </section>

          <!-- Matched -->
          <section class="cx-re-panel">
            <header class="cx-re-panel-head">
              <div>
                <h3>Matched</h3>
                <p>Bank row paired with system transaction</p>
              </div>
              <span class="cx-re-panel-count">{{ matched().length }}</span>
            </header>
            @if (matched().length === 0) {
              <div class="cx-re-panel-empty">No matches yet.</div>
            } @else {
              <div class="cx-re-panel-list">
                @for (i of matched(); track i.id) {
                  <article class="cx-re-item is-matched">
                    <div class="cx-re-item-pair">
                      <div class="cx-re-item-side">
                        <div class="cx-re-item-sidelabel">Bank</div>
                        <div class="cx-re-mono">{{ i.bank_reference || '—' }}</div>
                        <div class="tabular-nums">{{ i.bank_amount | money:2 }}</div>
                      </div>
                      <lucide-icon name="arrow-left-right" [size]="14" class="cx-re-item-linkicon"></lucide-icon>
                      <div class="cx-re-item-side">
                        <div class="cx-re-item-sidelabel">System</div>
                        <div class="cx-re-mono">{{ i.system_reference || '—' }}</div>
                        <div class="tabular-nums">{{ i.system_amount | money:2 }}</div>
                      </div>
                    </div>
                    <div class="cx-re-item-matchtype" [attr.data-type]="i.match_type">
                      {{ matchTypeLabel(i.match_type) }}
                      @if (+i.bank_amount !== +i.system_amount) {
                        · Δ {{ absDiff(i.bank_amount, i.system_amount) | money:2 }}
                      }
                    </div>
                  </article>
                }
              </div>
            }
          </section>

          <!-- System-only -->
          <section class="cx-re-panel">
            <header class="cx-re-panel-head">
              <div>
                <h3>System-only</h3>
                <p>In the system, not on the bank statement</p>
              </div>
              <span class="cx-re-panel-count">{{ systemOnly().length }}</span>
            </header>
            @if (systemOnly().length === 0) {
              <div class="cx-re-panel-empty">No system-only rows.</div>
            } @else {
              <div class="cx-re-panel-list">
                @for (i of systemOnly(); track i.id) {
                  <article class="cx-re-item" [class.is-resolved]="i.status === 'resolved'">
                    <div class="cx-re-item-head">
                      <div class="cx-re-item-ref cx-re-mono">{{ i.system_reference || '—' }}</div>
                      <div class="cx-re-item-amount tabular-nums">{{ i.system_amount | money:2 }}</div>
                    </div>
                    @if (i.status === 'resolved') {
                      <div class="cx-re-item-resolved">
                        <lucide-icon name="check-circle" [size]="12"></lucide-icon>
                        <span>{{ resolutionLabel(i.resolution_category) }}</span>
                        @if (i.resolution_note) { · {{ i.resolution_note }} }
                      </div>
                    } @else {
                      <div class="cx-re-item-actions">
                        <button class="cx-btn cx-btn-ghost cx-btn-xs" (click)="openResolveModal(i)">
                          <lucide-icon name="check" [size]="11"></lucide-icon>
                          <span>Resolve</span>
                        </button>
                      </div>
                    }
                  </article>
                }
              </div>
            }
          </section>
        </div>
      }
    </div>

    <!-- ═══ Upload modal ═══ -->
    @if (uploadOpen()) {
      <div class="cx-re-backdrop" (click)="uploadOpen.set(false)"></div>
      <div class="cx-re-modal" role="dialog">
        <div class="cx-re-modal-head">
          <lucide-icon name="upload" [size]="22"></lucide-icon>
          <div>
            <div class="cx-re-modal-eyebrow">New Reconciliation</div>
            <h2 class="cx-re-modal-title">Upload bank statement</h2>
            <div class="cx-re-modal-sub">
              Expected CSV format: columns named
              <code>reference</code> and <code>amount</code> (case-insensitive,
              whitespace tolerated). Other columns are ignored. The system
              matches each bank row against ledger transactions in the
              chosen period by reference first, then by exact amount.
            </div>
          </div>
        </div>
        <div class="cx-re-modal-body">
          <div class="cx-re-modal-row">
            <label>
              <span>Year</span>
              <input type="number" class="cx-input" min="2000" max="2099"
                     [(ngModel)]="uploadYear" style="width:110px" />
            </label>
            <label>
              <span>Month</span>
              <select class="cx-input" [(ngModel)]="uploadMonth" style="width:140px">
                @for (m of months; track m.v) {
                  <option [value]="m.v">{{ m.l }}</option>
                }
              </select>
            </label>
          </div>
          <label class="cx-re-file">
            <span>Bank statement CSV</span>
            <input type="file" accept=".csv,text/csv" (change)="onFileChosen($event)" />
            @if (uploadFile()) {
              <div class="cx-re-file-chosen">
                <lucide-icon name="file-spreadsheet" [size]="14"></lucide-icon>
                <span>{{ uploadFile()!.name }}</span>
                <span class="cx-re-file-size">({{ fileSizeLabel(uploadFile()!.size) }})</span>
              </div>
            }
          </label>
        </div>
        <div class="cx-re-modal-actions">
          <button class="cx-btn cx-btn-ghost" (click)="uploadOpen.set(false)" [disabled]="busy()">
            Cancel
          </button>
          <button class="cx-btn cx-btn-primary" (click)="submitUpload()"
                  [disabled]="busy() || !uploadFile()">
            @if (busy()) { <span>Reconciling…</span> }
            @else {
              <lucide-icon name="upload" [size]="14"></lucide-icon>
              <span>Run Reconciliation</span>
            }
          </button>
        </div>
      </div>
    }

    <!-- ═══ Match modal ═══ -->
    @if (matchOpen()) {
      <div class="cx-re-backdrop" (click)="matchOpen.set(false)"></div>
      <div class="cx-re-modal cx-re-modal-wide" role="dialog">
        <div class="cx-re-modal-head">
          <lucide-icon name="link" [size]="22"></lucide-icon>
          <div>
            <div class="cx-re-modal-eyebrow">Manual Match</div>
            <h2 class="cx-re-modal-title">Pair bank row with system transaction</h2>
            <div class="cx-re-modal-sub">
              Matching <strong class="cx-re-mono">{{ matchTarget()?.bank_reference || '—' }}</strong>
              · <strong class="tabular-nums">{{ matchTarget()?.bank_amount | money:2 }}</strong>.
              Candidates within ±1% of the bank amount in the same period,
              sorted by closest amount.
            </div>
          </div>
        </div>
        <div class="cx-re-modal-body cx-re-modal-body-scroll">
          @if (candidatesLoading()) {
            <div class="cx-re-loading"><lucide-icon name="loader-2" [size]="16" class="cx-re-spin"></lucide-icon> Searching candidates…</div>
          } @else if (candidates().length === 0) {
            <div class="cx-re-empty-inline">
              No candidates found. Try Resolve instead if the bank
              row has no system counterpart.
            </div>
          } @else {
            <table class="cx-re-cand-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Reference</th>
                  <th class="cx-re-right">Amount</th>
                  <th class="cx-re-right">Δ</th>
                  <th>Date</th>
                  <th>Narration</th>
                </tr>
              </thead>
              <tbody>
                @for (c of candidates(); track c.id) {
                  <tr [class.is-selected]="selectedCandidate() === c.id"
                      (click)="selectedCandidate.set(c.id)">
                    <td><input type="radio" name="cand" [value]="c.id"
                               [checked]="selectedCandidate() === c.id"
                               (change)="selectedCandidate.set(c.id)" /></td>
                    <td class="cx-re-mono">{{ c.reference }}</td>
                    <td class="cx-re-right tabular-nums">{{ c.amount | money:2 }}</td>
                    <td class="cx-re-right tabular-nums" [class.cx-re-muted]="+c.amount_diff === 0">
                      @if (+c.amount_diff === 0) { exact }
                      @else { {{ c.amount_diff | money:2 }} }
                    </td>
                    <td class="cx-re-small">{{ c.trans_date }}</td>
                    <td class="cx-re-small cx-re-truncate">{{ c.narration }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
        <div class="cx-re-modal-actions">
          <button class="cx-btn cx-btn-ghost" (click)="matchOpen.set(false)" [disabled]="busy()">
            Cancel
          </button>
          <button class="cx-btn cx-btn-primary" (click)="submitMatch()"
                  [disabled]="busy() || !selectedCandidate()">
            @if (busy()) { <span>Matching…</span> }
            @else {
              <lucide-icon name="link" [size]="14"></lucide-icon>
              <span>Match Selected</span>
            }
          </button>
        </div>
      </div>
    }

    <!-- ═══ Resolve modal ═══ -->
    @if (resolveOpen()) {
      <div class="cx-re-backdrop" (click)="resolveOpen.set(false)"></div>
      <div class="cx-re-modal" role="dialog">
        <div class="cx-re-modal-head">
          <lucide-icon name="check-circle" [size]="22"></lucide-icon>
          <div>
            <div class="cx-re-modal-eyebrow">Resolve Exception</div>
            <h2 class="cx-re-modal-title">Disposition without pairing</h2>
            <div class="cx-re-modal-sub">
              Use this when the item has no counterpart on the other side.
              Category drives how it reports at month-end.
            </div>
          </div>
        </div>
        <div class="cx-re-modal-body">
          <label class="cx-re-radio-group">
            <span>Category</span>
            <div class="cx-re-radios">
              <label class="cx-re-radio">
                <input type="radio" name="cat" value="bank_fee" [(ngModel)]="resolveCategory" />
                <div>
                  <strong>Bank fee</strong>
                  <span>Bank charge with no internal counterpart</span>
                </div>
              </label>
              <label class="cx-re-radio">
                <input type="radio" name="cat" value="timing" [(ngModel)]="resolveCategory" />
                <div>
                  <strong>Timing</strong>
                  <span>In transit — will reconcile next period</span>
                </div>
              </label>
              <label class="cx-re-radio">
                <input type="radio" name="cat" value="other" [(ngModel)]="resolveCategory" />
                <div>
                  <strong>Other</strong>
                  <span>One-off; note required</span>
                </div>
              </label>
            </div>
          </label>
          <label>
            <span>Note {{ resolveCategory === 'other' ? '(required)' : '(optional)' }}</span>
            <textarea class="cx-input" rows="2" [(ngModel)]="resolveNote"
                      placeholder="What happened here…"></textarea>
          </label>
        </div>
        <div class="cx-re-modal-actions">
          <button class="cx-btn cx-btn-ghost" (click)="resolveOpen.set(false)" [disabled]="busy()">
            Cancel
          </button>
          <button class="cx-btn cx-btn-primary" (click)="submitResolve()"
                  [disabled]="busy() || !resolveCategory || (resolveCategory === 'other' && !resolveNote.trim())">
            @if (busy()) { <span>Resolving…</span> }
            @else {
              <lucide-icon name="check" [size]="14"></lucide-icon>
              <span>Resolve</span>
            }
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    /* ── Table ── */
    .cx-re-table-wrap {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      overflow-x: auto;
    }
    .cx-re-table { width: 100%; border-collapse: collapse; }
    .cx-re-table th {
      background: var(--cx-surface-2);
      padding: 10px 12px;
      text-align: left;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--cx-text-muted);
      border-bottom: 1px solid var(--cx-border);
      white-space: nowrap;
    }
    .cx-re-table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--cx-border);
      font-size: 13px;
      color: var(--cx-text);
      white-space: nowrap;
    }
    .cx-re-table tbody tr:last-child td { border-bottom: none; }
    .cx-re-right { text-align: right; }
    .cx-re-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    .cx-re-small { font-size: 12px; color: var(--cx-text-secondary); }
    .cx-re-pos { color: var(--cx-danger, #dc2626); }
    .cx-re-neg { color: var(--cx-warning, #d97706); }
    .cx-re-muted { color: var(--cx-text-muted); }

    /* ── Status pill ── */
    .cx-re-status {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 999px;
      font-size: 10px; font-weight: 700;
    }
    .cx-re-status[data-status="matched"] { background: rgba(22, 163, 74, 0.15); color: #15803d; }
    .cx-re-status[data-status="resolved"] { background: rgba(22, 163, 74, 0.15); color: #15803d; }
    .cx-re-status[data-status="exception"] { background: rgba(220, 38, 38, 0.15); color: #b91c1c; }
    .cx-re-status[data-status="pending"] { background: rgba(234, 179, 8, 0.15); color: #a16207; }

    /* ── Summary ── */
    .cx-re-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .cx-re-stat {
      padding: 12px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
    }
    .cx-re-stat-emphasis { border-left-width: 3px; border-left-style: solid; }
    .cx-re-stat-ok { border-left-color: #16a34a; }
    .cx-re-stat-warn { border-left-color: #d97706; }
    .cx-re-stat-label {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
      margin-bottom: 4px;
    }
    .cx-re-stat-value { font-size: 18px; font-weight: 600; color: var(--cx-text); }
    .cx-re-stat-hint { font-size: 11px; color: var(--cx-text-muted); margin-top: 2px; }

    /* ── Three-panel layout ── */
    .cx-re-panels {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    @media (max-width: 1100px) {
      .cx-re-panels { grid-template-columns: 1fr; }
    }
    .cx-re-panel {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      display: flex; flex-direction: column;
      min-height: 300px;
    }
    .cx-re-panel-head {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 14px;
      border-bottom: 1px solid var(--cx-border);
    }
    .cx-re-panel-head h3 { margin: 0 0 2px; font-size: 13px; font-weight: 600; color: var(--cx-text); }
    .cx-re-panel-head p { margin: 0; font-size: 11px; color: var(--cx-text-muted); }
    .cx-re-panel-count {
      font-size: 13px; font-weight: 700;
      padding: 2px 10px;
      border-radius: 999px;
      background: var(--cx-surface-2);
      color: var(--cx-text);
    }
    .cx-re-panel-empty {
      padding: 24px 16px;
      text-align: center;
      color: var(--cx-text-muted);
      font-size: 12px;
      font-style: italic;
    }
    .cx-re-panel-list {
      padding: 8px;
      display: flex; flex-direction: column; gap: 6px;
      max-height: 560px;
      overflow-y: auto;
    }
    .cx-re-item {
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-sm);
      padding: 10px 12px;
      font-size: 12px;
    }
    .cx-re-item.is-matched { background: rgba(22, 163, 74, 0.04); border-color: rgba(22, 163, 74, 0.2); }
    .cx-re-item.is-resolved { opacity: 0.72; }
    .cx-re-item-head {
      display: flex; justify-content: space-between; align-items: baseline;
      gap: 8px; margin-bottom: 6px;
    }
    .cx-re-item-ref { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
    .cx-re-item-amount { font-weight: 600; font-size: 13px; }
    .cx-re-item-actions {
      display: flex; gap: 4px;
      padding-top: 6px;
      border-top: 1px dashed var(--cx-border);
    }
    .cx-re-item-resolved {
      display: flex; gap: 4px; align-items: center;
      padding-top: 6px;
      border-top: 1px dashed var(--cx-border);
      color: #15803d;
      font-size: 11px;
    }
    .cx-re-item-pair {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 8px;
      align-items: center;
    }
    .cx-re-item-side { min-width: 0; }
    .cx-re-item-side > div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cx-re-item-sidelabel {
      font-size: 9px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-re-item-linkicon { color: var(--cx-text-muted); }
    .cx-re-item-matchtype {
      margin-top: 6px;
      font-size: 10px;
      color: var(--cx-text-muted);
      padding-top: 6px;
      border-top: 1px dashed rgba(22, 163, 74, 0.2);
    }
    .cx-re-item-matchtype[data-type="manual"] { color: #6366f1; }
    .cx-re-item-matchtype[data-type="partial"] { color: #d97706; }

    /* ── xs button size for in-panel actions ── */
    .cx-btn-xs {
      padding: 3px 8px !important;
      font-size: 11px !important;
      gap: 3px !important;
    }

    /* ── Loading + empty ── */
    .cx-re-loading {
      display: flex; align-items: center; justify-content: center;
      gap: 10px;
      padding: 48px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      color: var(--cx-text-secondary);
      font-size: 13px;
    }
    .cx-re-spin { animation: cx-re-spin 1s linear infinite; }
    @keyframes cx-re-spin { to { transform: rotate(360deg); } }
    .cx-re-empty {
      padding: 56px 24px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      text-align: center;
      color: var(--cx-text-secondary);
    }
    .cx-re-empty lucide-icon { color: var(--cx-text-muted); margin-bottom: 10px; }
    .cx-re-empty p { margin: 4px 0; }
    .cx-re-empty-sub { font-size: 12px; color: var(--cx-text-muted); }
    .cx-re-empty-inline {
      padding: 24px;
      text-align: center;
      color: var(--cx-text-muted);
      font-size: 13px;
    }

    /* ── Modals ── */
    .cx-re-backdrop {
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.5);
      z-index: 100;
      backdrop-filter: blur(4px);
    }
    .cx-re-modal {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: min(560px, calc(100vw - 32px));
      max-height: calc(100vh - 48px);
      overflow: hidden;
      display: flex; flex-direction: column;
      background: var(--cx-surface);
      border-radius: var(--cx-radius-xl, 16px);
      box-shadow: 0 32px 80px rgba(0, 0, 0, 0.25);
      z-index: 101;
    }
    .cx-re-modal-wide { width: min(920px, calc(100vw - 32px)); }
    .cx-re-modal-head { display: flex; gap: 14px; padding: 20px 24px; }
    .cx-re-modal-head lucide-icon { margin-top: 2px; color: var(--cx-primary-600); }
    .cx-re-modal-eyebrow {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-re-modal-title {
      margin: 4px 0 6px;
      font-size: 18px; font-weight: 600;
      color: var(--cx-text);
    }
    .cx-re-modal-sub { font-size: 13px; color: var(--cx-text-secondary); line-height: 1.5; }
    .cx-re-modal-sub code {
      padding: 1px 6px;
      background: var(--cx-surface-2);
      border-radius: 4px;
      font-size: 11px;
    }
    .cx-re-modal-body { padding: 0 24px 16px; display: flex; flex-direction: column; gap: 12px; }
    .cx-re-modal-body-scroll { overflow-y: auto; flex: 1; }
    .cx-re-modal-body label {
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: var(--cx-text-secondary);
    }
    .cx-re-modal-body label > span {
      display: block;
      margin-bottom: 4px;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-re-modal-body textarea, .cx-re-modal-body input[type="number"],
    .cx-re-modal-body input[type="file"], .cx-re-modal-body select {
      font-size: 13px; padding: 8px 10px;
      width: 100%;
    }
    .cx-re-modal-body input[type="file"] { padding: 4px; }
    .cx-re-modal-row { display: flex; gap: 12px; flex-wrap: wrap; }
    .cx-re-modal-row > label { flex: 0 0 auto; }
    .cx-re-modal-actions {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 12px 24px 20px;
      border-top: 1px solid var(--cx-border);
    }
    .cx-re-file-chosen {
      display: flex; align-items: center; gap: 6px;
      margin-top: 6px;
      padding: 6px 10px;
      background: var(--cx-surface-2);
      border-radius: 6px;
      font-size: 12px;
      color: var(--cx-text);
    }
    .cx-re-file-size { color: var(--cx-text-muted); font-size: 11px; }

    /* ── Radio group ── */
    .cx-re-radio-group > span {
      display: block;
      margin-bottom: 6px;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-re-radios { display: flex; flex-direction: column; gap: 6px; }
    .cx-re-radio {
      display: flex !important; gap: 10px; align-items: flex-start;
      padding: 10px 12px;
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-sm);
      cursor: pointer;
      background: var(--cx-surface);
    }
    .cx-re-radio:has(input:checked) {
      border-color: var(--cx-primary-600);
      background: var(--cx-primary-50);
    }
    .cx-re-radio input { margin-top: 3px; }
    .cx-re-radio > div { display: flex; flex-direction: column; gap: 2px; }
    .cx-re-radio strong { font-size: 13px; color: var(--cx-text); }
    .cx-re-radio span { font-size: 11px; color: var(--cx-text-muted); font-weight: normal; }

    /* ── Candidates table ── */
    .cx-re-cand-table {
      width: 100%; border-collapse: collapse;
      font-size: 12px;
    }
    .cx-re-cand-table th {
      padding: 8px 10px;
      text-align: left;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--cx-text-muted);
      border-bottom: 1px solid var(--cx-border);
      position: sticky; top: 0;
      background: var(--cx-surface);
    }
    .cx-re-cand-table td {
      padding: 8px 10px;
      border-bottom: 1px solid var(--cx-border);
      color: var(--cx-text);
    }
    .cx-re-cand-table tbody tr { cursor: pointer; }
    .cx-re-cand-table tbody tr:hover { background: var(--cx-surface-hover); }
    .cx-re-cand-table tbody tr.is-selected {
      background: var(--cx-primary-50);
    }
    .cx-re-truncate {
      max-width: 280px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
  `],
})
export class ReconciliationComponent implements OnInit {
  mode = signal<'list' | 'detail'>('list');
  loading = signal(false);
  busy = signal(false);

  rows = signal<any[]>([]);
  detail = signal<any>(null);

  // Partition items into the three panels. match_type drives this:
  //   unmatched_bank → bank-only
  //   exact/partial/manual → matched
  //   unmatched_system → system-only
  bankOnly = computed(() =>
    (this.detail()?.items || []).filter((i: any) => i.match_type === 'unmatched_bank'));
  matched = computed(() =>
    (this.detail()?.items || []).filter((i: any) => ['exact', 'partial', 'manual'].includes(i.match_type)));
  systemOnly = computed(() =>
    (this.detail()?.items || []).filter((i: any) => i.match_type === 'unmatched_system'));

  // Upload modal
  uploadOpen = signal(false);
  uploadFile = signal<File | null>(null);
  uploadYear = new Date().getFullYear();
  uploadMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  months = [
    { v: '01', l: 'January' }, { v: '02', l: 'February' }, { v: '03', l: 'March' },
    { v: '04', l: 'April' }, { v: '05', l: 'May' }, { v: '06', l: 'June' },
    { v: '07', l: 'July' }, { v: '08', l: 'August' }, { v: '09', l: 'September' },
    { v: '10', l: 'October' }, { v: '11', l: 'November' }, { v: '12', l: 'December' },
  ];

  // Match modal
  matchOpen = signal(false);
  matchTarget = signal<any>(null);
  candidates = signal<any[]>([]);
  candidatesLoading = signal(false);
  selectedCandidate = signal<string | null>(null);

  // Resolve modal
  resolveOpen = signal(false);
  resolveTarget = signal<any>(null);
  resolveCategory = '';
  resolveNote = '';

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private http: HttpClient,
    private toast: ToastService,
  ) {}

  ngOnInit() { this.loadList(); }

  loadList() {
    this.loading.set(true);
    this.api.get('/reconciliations', { per_page: 50 }).subscribe({
      next: r => { this.rows.set(r.data || []); this.loading.set(false); },
      error: e => { this.loading.set(false); this.toast.error(e.error?.message || 'Failed to load'); },
    });
  }

  openDetail(id: string) {
    this.mode.set('detail');
    this.loadDetail(id);
  }
  backToList() {
    this.mode.set('list');
    this.detail.set(null);
    this.loadList();
  }
  loadDetail(id?: string) {
    if (!id) return;
    this.loading.set(true);
    this.api.get(`/reconciliations/${id}`).subscribe({
      next: r => { this.detail.set(r.data); this.loading.set(false); },
      error: e => { this.loading.set(false); this.toast.error(e.error?.message || 'Failed to load'); },
    });
  }

  openUploadModal() {
    this.uploadFile.set(null);
    this.uploadYear = new Date().getFullYear();
    this.uploadMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    this.uploadOpen.set(true);
  }
  onFileChosen(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0] || null;
    this.uploadFile.set(f);
  }
  fileSizeLabel(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  submitUpload() {
    const file = this.uploadFile();
    if (!file) return;
    this.busy.set(true);

    // The backend expects multipart/form-data with 'file', 'year', 'month'.
    // ApiService is JSON-first — use HttpClient directly here. The auth
    // interceptor attaches the bearer token automatically.
    const fd = new FormData();
    fd.append('file', file);
    fd.append('year', String(this.uploadYear));
    fd.append('month', String(this.uploadMonth));

    this.http.post<any>(`${environment.apiUrl}/reconciliations`, fd).subscribe({
      next: r => {
        this.busy.set(false);
        this.uploadOpen.set(false);
        this.toast.success(r.message || 'Reconciliation started');
        // Jump straight to detail view of the new run — user wants
        // to review matches/exceptions immediately.
        if (r.data?.id) this.openDetail(r.data.id);
        else this.loadList();
      },
      error: e => {
        this.busy.set(false);
        this.toast.error(e.error?.message || 'Upload failed');
      },
    });
  }

  openMatchModal(item: any) {
    const recon = this.detail();
    if (!recon) return;
    this.matchTarget.set(item);
    this.selectedCandidate.set(null);
    this.candidates.set([]);
    this.candidatesLoading.set(true);
    this.matchOpen.set(true);

    this.api.get(`/reconciliations/${recon.id}/available-matches`, { item_id: item.id }).subscribe({
      next: r => {
        this.candidates.set(r.data?.candidates || []);
        this.candidatesLoading.set(false);
      },
      error: e => {
        this.candidatesLoading.set(false);
        this.toast.error(e.error?.message || 'Failed to load candidates');
      },
    });
  }
  submitMatch() {
    const target = this.matchTarget();
    const txId = this.selectedCandidate();
    const recon = this.detail();
    if (!target || !txId || !recon) return;
    this.busy.set(true);
    this.api.post(`/reconciliations/${recon.id}/items/${target.id}/manual-match`, { system_tx_id: txId }).subscribe({
      next: r => {
        this.busy.set(false);
        this.matchOpen.set(false);
        this.toast.success(r.message || 'Matched');
        this.loadDetail(recon.id);
      },
      error: e => {
        this.busy.set(false);
        this.toast.error(e.error?.message || 'Match failed');
      },
    });
  }

  openResolveModal(item: any) {
    this.resolveTarget.set(item);
    this.resolveCategory = '';
    this.resolveNote = '';
    this.resolveOpen.set(true);
  }
  submitResolve() {
    const target = this.resolveTarget();
    const recon = this.detail();
    if (!target || !recon || !this.resolveCategory) return;
    this.busy.set(true);
    this.api.post(`/reconciliations/${recon.id}/items/${target.id}/resolve`, {
      category: this.resolveCategory,
      note: this.resolveNote,
    }).subscribe({
      next: r => {
        this.busy.set(false);
        this.resolveOpen.set(false);
        this.toast.success(r.message || 'Resolved');
        this.loadDetail(recon.id);
      },
      error: e => {
        this.busy.set(false);
        this.toast.error(e.error?.message || 'Resolve failed');
      },
    });
  }

  matchTypeLabel(t: string): string {
    switch (t) {
      case 'exact': return 'Exact match';
      case 'partial': return 'Partial / amount mismatch';
      case 'manual': return 'Manually matched';
      default: return t;
    }
  }
  resolutionLabel(cat: string | null): string {
    switch (cat) {
      case 'bank_fee': return 'Bank fee';
      case 'timing': return 'Timing difference';
      case 'other': return 'Other';
      default: return 'Resolved';
    }
  }
  absDiff(a: string | number, b: string | number): number {
    return Math.abs(+a - +b);
  }
}
