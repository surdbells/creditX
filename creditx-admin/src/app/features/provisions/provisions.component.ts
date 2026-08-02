import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import { PageGuide } from '../../shared/guide/page-guide.model';

/**
 * Loan Loss Provisioning admin page.
 *
 * Two tabs:
 *   Preview — shows what a run WOULD post for the selected as-of
 *     date, with per-loan lines + summary. 'Post Provision Run'
 *     button commits the calculation to a new ProvisionRun.
 *   History — list of past runs with drill-in + reverse.
 *
 * Delta semantics: the 'Delta' column is what actually hits the GL
 * for each loan (required - prior). Negative deltas are releases.
 *
 * Gated by accounting.provision.
 */
const PROVISIONS_GUIDE: PageGuide = {
  id: 'provisions',
  titleKey: 'Loan Loss Provisioning',
  purposeKey: 'Recognises the expected loss on loans that are unlikely to be repaid in full.',
  descriptionKey:
    'Prudence requires that a loan going bad is recognised as it deteriorates, not at the moment it '
    + 'is finally written off. CBN prudential guidelines set a provision rate per arrears band; this '
    + 'run applies them and posts the difference from what is already provided, so the charge to '
    + 'profit each month is the change rather than the whole balance again.',
  actionKeys: [
    'Preview the provision required at a date',
    'Post the movement to the ledger',
    'See the provision held per arrears band',
  ],
  workflowKeys: [
    'Loans age into arrears bands',
    'Provision computed against prudential rates',
    'Delta posted to the ledger',
    'Period closed',
  ],
  dependsOnKeys: ['Repayment schedules', 'GL Mappings', 'Portfolio at Risk'],
  usedByKeys: ['Income Statement', 'Balance Sheet', 'CBN returns'],
  businessRuleKeys: [
    'Only the CHANGE since the last run is posted. Posting the full requirement again each month would overstate the charge many times over.',
    'A provision is a charge against profit, not a cash movement. Nothing leaves the bank.',
    'Provisioning is not writing off. The loan is still owed and still collected against; a write-off is a separate, later decision.',
    'Recoveries on provided loans release the provision back to income.',
    'Rates follow prudential guidelines — changing them is a policy decision, not an operational one.',
  ],
  tipKeys: [
    'Run provisioning after accrual and before close, every month, in that order.',
    'A jump in the charge is usually a jump in arrears. Read it alongside Portfolio at Risk rather than as an accounting surprise.',
  ],
  permissionKeys: ['accounting.journal'],
};

@Component({
  selector: 'app-provisions',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, MoneyPipe, PageGuideComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Loan Loss Provisioning"
        subtitle="CBN prudential provisioning with cumulative delta posting"
        eyebrow="Accounting">
        <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="refresh()" [disabled]="loading()">
          <lucide-icon name="refresh-cw" [size]="14"></lucide-icon>
          <span>{{ loading() ? 'Loading…' : 'Refresh' }}</span>
        </button>
      </cx-page-header>

      <cx-page-guide [guide]="guide"></cx-page-guide>

      <div class="cx-pv-intro">
        <lucide-icon name="info" [size]="16"></lucide-icon>
        <div>
          Provisioning is cumulative — each run posts only the
          <strong>delta</strong> between the required provision today and
          what was already provisioned in the most recent non-reversed
          run. Positive deltas: DR Loan Loss Provision / CR Allowance
          for Loan Losses. Negative deltas (releases): DR Allowance / CR
          LLP. Both GLs must be seeded — if missing, preview will
          return a clear error.
        </div>
      </div>

      <!-- Tab strip -->
      <div class="cx-pv-tabs">
        <button class="cx-pv-tab" [class.is-active]="tab() === 'preview'" (click)="setTab('preview')">
          <lucide-icon name="eye" [size]="14"></lucide-icon>
          <span>Preview</span>
        </button>
        <button class="cx-pv-tab" [class.is-active]="tab() === 'history'" (click)="setTab('history')">
          <lucide-icon name="history" [size]="14"></lucide-icon>
          <span>History</span>
        </button>
      </div>

      <!-- ═══ Preview tab ═══ -->
      @if (tab() === 'preview') {
        <div class="cx-pv-controls">
          <label>
            <span>As of</span>
            <input type="date" class="cx-input" [(ngModel)]="asOf" (change)="loadPreview()" />
          </label>
          <div class="cx-pv-actions">
            <button class="cx-btn cx-btn-primary cx-btn-sm"
                    (click)="openRunModal()"
                    [disabled]="loading() || !preview() || busy()">
              <lucide-icon name="shield-alert" [size]="14"></lucide-icon>
              <span>Post Provision Run</span>
            </button>
          </div>
        </div>

        @if (loading()) {
          <div class="cx-pv-loading">
            <lucide-icon name="loader-2" [size]="20" class="cx-pv-spin"></lucide-icon>
            <span>Computing provisions…</span>
          </div>
        } @else if (preview(); as p) {
          <!-- Summary strip -->
          <div class="cx-pv-summary">
            <div class="cx-pv-stat">
              <div class="cx-pv-stat-label">NPL Loans</div>
              <div class="cx-pv-stat-value tabular-nums">{{ p.summary.loan_count | number }}</div>
            </div>
            <div class="cx-pv-stat">
              <div class="cx-pv-stat-label">Required Provision</div>
              <div class="cx-pv-stat-value tabular-nums">{{ p.summary.total_required | money }}</div>
            </div>
            <div class="cx-pv-stat">
              <div class="cx-pv-stat-label">Prior Provision</div>
              <div class="cx-pv-stat-value tabular-nums cx-pv-muted">{{ p.summary.total_prior | money }}</div>
            </div>
            <div class="cx-pv-stat cx-pv-stat-emphasis">
              <div class="cx-pv-stat-label">Net Δ to Post</div>
              <div class="cx-pv-stat-value tabular-nums"
                   [class.cx-pv-pos]="+p.summary.total_delta > 0"
                   [class.cx-pv-neg]="+p.summary.total_delta < 0">
                @if (+p.summary.total_delta >= 0) {
                  +{{ p.summary.total_delta | money:2 }}
                } @else {
                  −{{ (-p.summary.total_delta) | money:2 }}
                }
              </div>
              <div class="cx-pv-stat-hint">
                @if (+p.summary.total_delta > 0) { New provision }
                @else if (+p.summary.total_delta < 0) { Release }
                @else { No change }
              </div>
            </div>
          </div>

          <!-- Lines table -->
          @if (p.lines.length === 0) {
            <div class="cx-pv-empty">
              🎉 No non-performing loans as of {{ p.as_of }}. Nothing to provision.
            </div>
          } @else {
            <div class="cx-pv-table-wrap">
              <table class="cx-pv-table">
                <thead>
                  <tr>
                    <th>Application</th>
                    <th>Borrower</th>
                    <th class="cx-pv-right">DPD</th>
                    <th>Class</th>
                    <th class="cx-pv-right">Outstanding</th>
                    <th class="cx-pv-right">Rate</th>
                    <th class="cx-pv-right">Required</th>
                    <th class="cx-pv-right">Prior</th>
                    <th class="cx-pv-right">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  @for (l of p.lines; track l.loan_id) {
                    <tr>
                      <td class="cx-pv-mono">{{ l.application_id }}</td>
                      <td>{{ l.borrower_name }}</td>
                      <td class="cx-pv-right tabular-nums">{{ l.days_overdue }}</td>
                      <td>
                        <span class="cx-pv-class" [attr.data-cls]="l.classification">
                          {{ l.classification | titlecase }}
                        </span>
                      </td>
                      <td class="cx-pv-right tabular-nums">{{ l.outstanding | money }}</td>
                      <td class="cx-pv-right tabular-nums">{{ (+l.provision_rate * 100) | number:'1.0-0' }}%</td>
                      <td class="cx-pv-right tabular-nums">{{ l.provision_amount_required | money }}</td>
                      <td class="cx-pv-right tabular-nums cx-pv-muted">{{ l.prior_provision_amount | money }}</td>
                      <td class="cx-pv-right tabular-nums"
                          [class.cx-pv-pos]="+l.delta_amount > 0"
                          [class.cx-pv-neg]="+l.delta_amount < 0">
                        @if (+l.delta_amount >= 0) {
                          +{{ l.delta_amount | money }}
                        } @else {
                          −{{ (-l.delta_amount) | money }}
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        } @else if (previewError()) {
          <div class="cx-pv-error">
            <lucide-icon name="alert-triangle" [size]="18"></lucide-icon>
            <span>{{ previewError() }}</span>
          </div>
        }
      }

      <!-- ═══ History tab ═══ -->
      @if (tab() === 'history') {
        @if (loading()) {
          <div class="cx-pv-loading">
            <lucide-icon name="loader-2" [size]="20" class="cx-pv-spin"></lucide-icon>
            <span>Loading run history…</span>
          </div>
        } @else if (runs().length === 0) {
          <div class="cx-pv-empty">No provision runs yet. Start on the Preview tab.</div>
        } @else {
          <div class="cx-pv-table-wrap">
            <table class="cx-pv-table">
              <thead>
                <tr>
                  <th>As Of</th>
                  <th>Status</th>
                  <th class="cx-pv-right">Loans</th>
                  <th class="cx-pv-right">Required</th>
                  <th class="cx-pv-right">Prior</th>
                  <th class="cx-pv-right">Delta Posted</th>
                  <th>Notes</th>
                  <th class="cx-pv-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (r of runs(); track r.id) {
                  <tr>
                    <td class="cx-pv-mono">{{ r.as_of }}</td>
                    <td>
                      <span class="cx-pv-status" [attr.data-status]="r.status">
                        {{ r.status | titlecase }}
                      </span>
                    </td>
                    <td class="cx-pv-right tabular-nums">{{ r.loan_count | number }}</td>
                    <td class="cx-pv-right tabular-nums">{{ r.total_provision_required | money }}</td>
                    <td class="cx-pv-right tabular-nums cx-pv-muted">{{ r.total_prior_provision | money }}</td>
                    <td class="cx-pv-right tabular-nums"
                        [class.cx-pv-pos]="+r.total_delta_posted > 0"
                        [class.cx-pv-neg]="+r.total_delta_posted < 0">
                      @if (+r.total_delta_posted >= 0) {
                        +{{ r.total_delta_posted | money }}
                      } @else {
                        −{{ (-r.total_delta_posted) | money }}
                      }
                    </td>
                    <td class="cx-pv-notes">{{ r.notes || '—' }}</td>
                    <td class="cx-pv-right">
                      <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="viewRun(r.id)">
                        <lucide-icon name="eye" [size]="12"></lucide-icon>
                        <span>View</span>
                      </button>
                      @if (r.status === 'posted') {
                        <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="openReverseModal(r)">
                          <lucide-icon name="refresh-cw" [size]="12"></lucide-icon>
                          <span>Reverse</span>
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </div>

    <!-- Run confirmation modal -->
    @if (runModalOpen()) {
      <div class="cx-pv-backdrop" (click)="runModalOpen.set(false)"></div>
      <div class="cx-pv-modal" role="dialog">
        <div class="cx-pv-modal-head">
          <lucide-icon name="shield-alert" [size]="22"></lucide-icon>
          <div>
            <div class="cx-pv-modal-eyebrow">Post Provision Run</div>
            <h2 class="cx-pv-modal-title">Commit provisions as of {{ asOf }}?</h2>
            <div class="cx-pv-modal-sub">
              @if (preview(); as p) {
                This will post journal entries and create a permanent
                ProvisionRun record for audit:
                <ul class="cx-pv-modal-list">
                  <li>{{ p.summary.loan_count }} NPL loan(s) covered</li>
                  <li>Net delta: <strong class="tabular-nums">
                    @if (+p.summary.total_delta >= 0) { +{{ p.summary.total_delta | money:2 }} }
                    @else { −{{ (-p.summary.total_delta) | money:2 }} }
                  </strong></li>
                  <li>
                    @if (+p.summary.total_delta > 0) {
                      DR Loan Loss Provision · CR Allowance for Loan Losses
                    } @else if (+p.summary.total_delta < 0) {
                      DR Allowance for Loan Losses · CR Loan Loss Provision
                    } @else {
                      No GL entries (zero delta) — audit row only
                    }
                  </li>
                </ul>
              }
            </div>
          </div>
        </div>
        <div class="cx-pv-modal-body">
          <label>Notes (optional)
            <textarea class="cx-input" rows="2" [(ngModel)]="runNotes"
                      placeholder="Anything noteworthy about this run…"></textarea>
          </label>
        </div>
        <div class="cx-pv-modal-actions">
          <button class="cx-btn cx-btn-ghost" (click)="runModalOpen.set(false)" [disabled]="busy()">
            Cancel
          </button>
          <button class="cx-btn cx-btn-primary" (click)="submitRun()" [disabled]="busy()">
            @if (busy()) { <span>Posting…</span> }
            @else {
              <lucide-icon name="shield-alert" [size]="14"></lucide-icon>
              <span>Post Run</span>
            }
          </button>
        </div>
      </div>
    }

    <!-- Reverse confirmation modal -->
    @if (reverseModalOpen()) {
      <div class="cx-pv-backdrop" (click)="reverseModalOpen.set(false)"></div>
      <div class="cx-pv-modal" role="dialog">
        <div class="cx-pv-modal-head">
          <lucide-icon name="refresh-cw" [size]="22"></lucide-icon>
          <div>
            <div class="cx-pv-modal-eyebrow">Reverse Provision Run</div>
            <h2 class="cx-pv-modal-title">Reverse run from {{ reverseTarget()?.as_of }}?</h2>
            <div class="cx-pv-modal-sub">
              Posts a mirror journal that unwinds the original entries.
              The run row is kept for audit with status 'reversed'.
              Next month's provision run will skip this row and walk
              back to the preceding posted run for its prior-provision
              baseline.
            </div>
          </div>
        </div>
        <div class="cx-pv-modal-body">
          <label>Reason (recommended)
            <textarea class="cx-input" rows="2" [(ngModel)]="reverseReason"
                      placeholder="Why this run is being reversed…"></textarea>
          </label>
        </div>
        <div class="cx-pv-modal-actions">
          <button class="cx-btn cx-btn-ghost" (click)="reverseModalOpen.set(false)" [disabled]="busy()">
            Cancel
          </button>
          <button class="cx-btn cx-btn-danger" (click)="submitReverse()" [disabled]="busy()">
            @if (busy()) { <span>Reversing…</span> }
            @else {
              <lucide-icon name="refresh-cw" [size]="14"></lucide-icon>
              <span>Reverse Run</span>
            }
          </button>
        </div>
      </div>
    }

    <!-- Run detail modal -->
    @if (detailRun(); as d) {
      <div class="cx-pv-backdrop" (click)="detailRun.set(null)"></div>
      <div class="cx-pv-modal cx-pv-modal-wide" role="dialog">
        <div class="cx-pv-modal-head">
          <lucide-icon name="file-text" [size]="22"></lucide-icon>
          <div>
            <div class="cx-pv-modal-eyebrow">Provision Run Detail</div>
            <h2 class="cx-pv-modal-title">Run from {{ d.as_of }}
              <span class="cx-pv-status" [attr.data-status]="d.status">{{ d.status | titlecase }}</span>
            </h2>
            <div class="cx-pv-modal-sub">
              @if (d.callback_ref) { Callback: <code>{{ d.callback_ref }}</code> }
            </div>
          </div>
        </div>
        <div class="cx-pv-modal-body cx-pv-modal-body-scroll">
          <div class="cx-pv-summary">
            <div class="cx-pv-stat">
              <div class="cx-pv-stat-label">Loans</div>
              <div class="cx-pv-stat-value tabular-nums">{{ d.loan_count }}</div>
            </div>
            <div class="cx-pv-stat">
              <div class="cx-pv-stat-label">Required</div>
              <div class="cx-pv-stat-value tabular-nums">{{ d.total_provision_required | money }}</div>
            </div>
            <div class="cx-pv-stat">
              <div class="cx-pv-stat-label">Prior</div>
              <div class="cx-pv-stat-value tabular-nums">{{ d.total_prior_provision | money }}</div>
            </div>
            <div class="cx-pv-stat">
              <div class="cx-pv-stat-label">Delta</div>
              <div class="cx-pv-stat-value tabular-nums">
                @if (+d.total_delta_posted >= 0) { +{{ d.total_delta_posted | money }} }
                @else { −{{ (-d.total_delta_posted) | money }} }
              </div>
            </div>
          </div>

          <table class="cx-pv-table" style="margin-top: 14px">
            <thead>
              <tr>
                <th>Application</th>
                <th class="cx-pv-right">DPD</th>
                <th>Class</th>
                <th class="cx-pv-right">Outstanding</th>
                <th class="cx-pv-right">Required</th>
                <th class="cx-pv-right">Prior</th>
                <th class="cx-pv-right">Delta</th>
              </tr>
            </thead>
            <tbody>
              @for (l of (d.lines || []); track l.id) {
                <tr>
                  <td class="cx-pv-mono">{{ l.application_id }}</td>
                  <td class="cx-pv-right tabular-nums">{{ l.days_overdue }}</td>
                  <td><span class="cx-pv-class" [attr.data-cls]="l.classification">{{ l.classification | titlecase }}</span></td>
                  <td class="cx-pv-right tabular-nums">{{ l.outstanding | money }}</td>
                  <td class="cx-pv-right tabular-nums">{{ l.provision_amount_required | money }}</td>
                  <td class="cx-pv-right tabular-nums cx-pv-muted">{{ l.prior_provision_amount | money }}</td>
                  <td class="cx-pv-right tabular-nums">
                    @if (+l.delta_amount >= 0) { +{{ l.delta_amount | money }} }
                    @else { −{{ (-l.delta_amount) | money }} }
                  </td>
                </tr>
              }
            </tbody>
          </table>

          @if (d.reversed_at) {
            <div class="cx-pv-reversal-note">
              <strong>Reversed {{ d.reversed_at }}.</strong>
              @if (d.reversal_reason) { Reason: {{ d.reversal_reason }} }
            </div>
          }
        </div>
        <div class="cx-pv-modal-actions">
          <button class="cx-btn cx-btn-ghost" (click)="detailRun.set(null)">Close</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .cx-pv-intro {
      display: flex; gap: 10px; align-items: flex-start;
      padding: 12px 16px;
      background: rgba(59, 130, 246, 0.06);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
      font-size: 12px;
      color: var(--cx-text-secondary);
      line-height: 1.5;
    }

    .cx-pv-tabs {
      display: flex; gap: 2px;
      padding: 4px;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      margin-bottom: 12px;
      width: fit-content;
    }
    .cx-pv-tab {
      padding: 8px 14px;
      background: transparent;
      border: none;
      border-radius: calc(var(--cx-radius-md) - 4px);
      font-size: 13px; font-weight: 500;
      color: var(--cx-text-secondary);
      cursor: pointer;
      display: flex; align-items: center; gap: 6px;
    }
    .cx-pv-tab:hover { background: var(--cx-surface); color: var(--cx-text); }
    .cx-pv-tab.is-active {
      background: var(--cx-surface);
      color: var(--cx-text);
      font-weight: 600;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }

    .cx-pv-controls {
      display: flex; justify-content: space-between; align-items: flex-end;
      padding: 14px 16px; gap: 12px; flex-wrap: wrap;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      margin-bottom: 14px;
    }
    .cx-pv-controls label {
      display: flex; flex-direction: column; gap: 4px;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-pv-controls input { font-size: 13px; padding: 6px 10px; }

    .cx-pv-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .cx-pv-stat {
      padding: 12px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
    }
    .cx-pv-stat-emphasis { border-left: 3px solid var(--cx-primary-600); }
    .cx-pv-stat-label {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
      margin-bottom: 4px;
    }
    .cx-pv-stat-value {
      font-size: 18px; font-weight: 600;
      color: var(--cx-text);
    }
    .cx-pv-stat-hint {
      font-size: 11px;
      color: var(--cx-text-muted);
      margin-top: 2px;
    }
    .cx-pv-muted { color: var(--cx-text-muted); }
    .cx-pv-pos { color: var(--cx-danger, #dc2626); }    /* more provision = more loss recognised */
    .cx-pv-neg { color: var(--cx-success, #16a34a); }   /* release = loans recovering */

    .cx-pv-table-wrap {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      overflow-x: auto;
    }
    .cx-pv-table { width: 100%; border-collapse: collapse; }
    .cx-pv-table th {
      background: var(--cx-surface-2);
      padding: 10px 12px;
      text-align: left;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--cx-text-muted);
      border-bottom: 1px solid var(--cx-border);
      white-space: nowrap;
    }
    .cx-pv-table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--cx-border);
      font-size: 13px;
      color: var(--cx-text);
      white-space: nowrap;
    }
    .cx-pv-table tbody tr:last-child td { border-bottom: none; }
    .cx-pv-right { text-align: right; }
    .cx-pv-mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
    }
    .cx-pv-notes { color: var(--cx-text-secondary); font-size: 12px; max-width: 260px; }

    .cx-pv-class {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 999px;
      font-size: 10px; font-weight: 700;
    }
    .cx-pv-class[data-cls="substandard"] {
      background: rgba(245, 158, 11, 0.15); color: #b45309;
    }
    .cx-pv-class[data-cls="doubtful"] {
      background: rgba(234, 88, 12, 0.15); color: #c2410c;
    }
    .cx-pv-class[data-cls="lost"] {
      background: rgba(220, 38, 38, 0.15); color: var(--cx-danger, #dc2626);
    }

    .cx-pv-status {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 999px;
      font-size: 10px; font-weight: 600;
      margin-left: 6px;
    }
    .cx-pv-status[data-status="posted"] {
      background: rgba(22, 163, 74, 0.12); color: #15803d;
    }
    .cx-pv-status[data-status="reversed"] {
      background: rgba(107, 114, 128, 0.15); color: var(--cx-text-muted);
    }
    .cx-pv-status[data-status="draft"] {
      background: rgba(234, 179, 8, 0.15); color: #a16207;
    }

    .cx-pv-empty {
      padding: 40px 20px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      text-align: center;
      color: var(--cx-text-secondary);
      font-size: 13px;
    }
    .cx-pv-error {
      display: flex; gap: 10px; align-items: center;
      padding: 14px 18px;
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: var(--cx-radius-md);
      color: var(--cx-danger, #dc2626);
      font-size: 13px;
    }
    .cx-pv-loading {
      display: flex; align-items: center; justify-content: center;
      gap: 10px;
      padding: 48px 16px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      color: var(--cx-text-secondary);
      font-size: 13px;
    }
    .cx-pv-spin { animation: cx-pv-spin 1s linear infinite; }
    @keyframes cx-pv-spin { to { transform: rotate(360deg); } }

    /* Modal (reused pattern from period-close) */
    .cx-pv-backdrop {
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.5);
      z-index: 100;
      backdrop-filter: blur(4px);
    }
    .cx-pv-modal {
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
    .cx-pv-modal-wide { width: min(900px, calc(100vw - 32px)); }
    .cx-pv-modal-head {
      display: flex; gap: 14px;
      padding: 20px 24px;
    }
    .cx-pv-modal-head lucide-icon { margin-top: 2px; color: var(--cx-primary-600); }
    .cx-pv-modal-eyebrow {
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--cx-text-muted);
    }
    .cx-pv-modal-title {
      margin: 4px 0 6px;
      font-size: 18px; font-weight: 600;
      color: var(--cx-text);
    }
    .cx-pv-modal-sub {
      font-size: 13px;
      color: var(--cx-text-secondary);
      line-height: 1.5;
    }
    .cx-pv-modal-list {
      margin: 8px 0 0;
      padding-left: 18px;
    }
    .cx-pv-modal-list li { margin-bottom: 4px; }
    .cx-pv-modal-body {
      padding: 0 24px 16px;
    }
    .cx-pv-modal-body-scroll {
      overflow-y: auto;
      flex: 1;
    }
    .cx-pv-modal-body label {
      display: block;
      font-size: 12px;
      color: var(--cx-text-secondary);
      font-weight: 500;
      margin-bottom: 4px;
    }
    .cx-pv-modal-body textarea {
      width: 100%; padding: 8px 12px;
      font-family: inherit; font-size: 13px;
    }
    .cx-pv-modal-actions {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 12px 24px 20px;
      border-top: 1px solid var(--cx-border);
    }
    .cx-pv-actions { display: flex; gap: 6px; }
    .cx-pv-reversal-note {
      margin-top: 14px;
      padding: 10px 14px;
      background: rgba(107, 114, 128, 0.1);
      border-radius: var(--cx-radius-md);
      font-size: 12px;
      color: var(--cx-text-secondary);
    }
  `],
})
export class ProvisionsComponent implements OnInit {
  readonly guide = PROVISIONS_GUIDE;

  tab = signal<'preview' | 'history'>('preview');
  loading = signal(false);
  busy = signal(false);

  // Preview state
  asOf = '';
  preview = signal<any>(null);
  previewError = signal<string | null>(null);

  // Post-run modal
  runModalOpen = signal(false);
  runNotes = '';

  // History state
  runs = signal<any[]>([]);

  // Reverse modal
  reverseModalOpen = signal(false);
  reverseTarget = signal<any>(null);
  reverseReason = '';

  // Detail modal
  detailRun = signal<any>(null);

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private toast: ToastService,
  ) {}

  ngOnInit() {
    this.asOf = new Date().toISOString().slice(0, 10);
    this.loadPreview();
  }

  setTab(t: 'preview' | 'history') {
    this.tab.set(t);
    if (t === 'history' && this.runs().length === 0) this.loadHistory();
  }

  refresh() {
    if (this.tab() === 'preview') this.loadPreview();
    else this.loadHistory();
  }

  loadPreview() {
    if (!this.asOf) return;
    this.loading.set(true);
    this.previewError.set(null);
    this.api.get('/reports/provisions/preview', { as_of: this.asOf }).subscribe({
      next: r => {
        this.preview.set(r.data);
        this.loading.set(false);
      },
      error: e => {
        this.loading.set(false);
        this.preview.set(null);
        this.previewError.set(e.error?.message || 'Failed to load preview');
      },
    });
  }

  loadHistory() {
    this.loading.set(true);
    this.api.get('/accounting/provisions/runs', { limit: 50 }).subscribe({
      next: r => {
        this.runs.set(r.data?.runs || []);
        this.loading.set(false);
      },
      error: e => {
        this.loading.set(false);
        this.toast.error(e.error?.message || 'Failed to load history');
      },
    });
  }

  /** Post-run flow ---------------------------------------------- */
  openRunModal() {
    this.runNotes = '';
    this.runModalOpen.set(true);
  }

  submitRun() {
    this.busy.set(true);
    this.api.post('/accounting/provisions/runs', {
      as_of: this.asOf,
      notes: this.runNotes,
    }).subscribe({
      next: r => {
        this.busy.set(false);
        this.runModalOpen.set(false);
        this.toast.success(r.message || 'Provision run posted');
        this.loadPreview();      // refreshes the prior column on next preview
        this.runs.set([]);        // force history re-fetch on next tab view
      },
      error: e => {
        this.busy.set(false);
        this.toast.error(e.error?.message || 'Run failed');
      },
    });
  }

  /** Reverse flow ----------------------------------------------- */
  openReverseModal(run: any) {
    this.reverseTarget.set(run);
    this.reverseReason = '';
    this.reverseModalOpen.set(true);
  }

  submitReverse() {
    const target = this.reverseTarget();
    if (!target) return;
    this.busy.set(true);
    this.api.post(`/accounting/provisions/runs/${target.id}/reverse`, {
      reason: this.reverseReason,
    }).subscribe({
      next: r => {
        this.busy.set(false);
        this.reverseModalOpen.set(false);
        this.toast.success(r.message || 'Run reversed');
        this.loadHistory();
      },
      error: e => {
        this.busy.set(false);
        this.toast.error(e.error?.message || 'Reversal failed');
      },
    });
  }

  /** Detail drill-in -------------------------------------------- */
  viewRun(id: string) {
    this.api.get(`/accounting/provisions/runs/${id}`).subscribe({
      next: r => this.detailRun.set(r.data),
      error: e => this.toast.error(e.error?.message || 'Failed to load detail'),
    });
  }
}
