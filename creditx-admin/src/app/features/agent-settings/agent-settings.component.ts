import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';

/**
 * Agent Settings
 * ----------------------------------------------------------------------------
 * A focused, dedicated UI for configuring agent-related organizational rules
 * that would otherwise be buried in the generic Settings page. Currently the
 * only setting exposed here is the per-agent monthly disbursed-loan target,
 * which drives the progress ring on the field agent dashboard.
 *
 * The page talks to the same REST resource as Settings (/api/settings) but
 * locks the scope to the specific keys it owns — this keeps the UX simple
 * ('save the number', not 'edit a row') while staying compatible with the
 * generic settings admin.
 */
@Component({
  selector: 'app-agent-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, LoadingSpinnerComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Agent Settings"
        subtitle="Targets and rules that apply to field agents"
        eyebrow="Configuration"></cx-page-header>

      @if (loading()) {
        <cx-loading message="Loading agent settings..."></cx-loading>
      } @else {
        <div class="cx-as-sections">
          <!-- Monthly Target Card -->
          <section class="cx-as-section">
            <header class="cx-as-section-head">
              <div class="cx-as-section-icon">
                <lucide-icon name="target" [size]="18"></lucide-icon>
              </div>
              <div class="cx-as-section-meta">
                <h3 class="cx-as-section-title">Monthly Disbursement Target</h3>
                <p class="cx-as-section-desc">
                  Each agent is expected to disburse this many loans per calendar month.
                  This number powers the progress ring on the agent's dashboard.
                </p>
              </div>
            </header>

            <div class="cx-as-control">
              <label class="cx-as-control-label">Target per agent</label>
              <div class="cx-as-control-row">
                <button
                  type="button"
                  class="cx-as-step-btn"
                  [disabled]="saving() || !canEdit || targetValue <= 1"
                  (click)="adjustTarget(-1)"
                  aria-label="Decrease by 1">
                  <lucide-icon name="minus" [size]="16"></lucide-icon>
                </button>
                <input
                  type="number"
                  class="cx-as-control-input tabular-nums"
                  [(ngModel)]="targetValue"
                  min="1"
                  max="1000"
                  [disabled]="saving() || !canEdit" />
                <button
                  type="button"
                  class="cx-as-step-btn"
                  [disabled]="saving() || !canEdit || targetValue >= 1000"
                  (click)="adjustTarget(1)"
                  aria-label="Increase by 1">
                  <lucide-icon name="plus" [size]="16"></lucide-icon>
                </button>
                <span class="cx-as-control-suffix">loans / month</span>
              </div>
              <p class="cx-as-control-hint">
                Current value: <strong class="tabular-nums">{{ originalTarget() }}</strong>.
                @if (isDirty()) {
                  <span class="cx-as-dirty">Unsaved changes</span>
                }
              </p>
            </div>

            @if (canEdit) {
              <footer class="cx-as-section-footer">
                <button
                  type="button"
                  class="cx-btn cx-btn-outline"
                  [disabled]="saving() || !isDirty()"
                  (click)="reset()">
                  Reset
                </button>
                <button
                  type="button"
                  class="cx-btn cx-btn-primary"
                  [disabled]="saving() || !isDirty() || !isValidTarget()"
                  (click)="save()">
                  @if (saving()) {
                    <span class="cx-as-saving-dots"><span></span><span></span><span></span></span>
                    <span>Saving...</span>
                  } @else {
                    <lucide-icon name="check" [size]="14"></lucide-icon>
                    <span>Save Target</span>
                  }
                </button>
              </footer>
            } @else {
              <div class="cx-as-readonly-note">
                <lucide-icon name="lock" [size]="14"></lucide-icon>
                <span>You don't have permission to change this setting.</span>
              </div>
            }
          </section>

          <!-- Placeholder for future agent settings -->
          <section class="cx-as-placeholder">
            <lucide-icon name="plus-circle" [size]="16"></lucide-icon>
            <span>More agent-specific settings will appear here as they're added.</span>
          </section>
        </div>
      }
    </div>
  `,
  styles: [`
    .cx-as-sections {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      max-width: 720px;
    }

    .cx-as-section {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      overflow: hidden;
    }

    .cx-as-section-head {
      display: flex;
      gap: 14px;
      padding: 18px 20px 14px;
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cx-as-section-icon {
      flex-shrink: 0;
      width: 40px; height: 40px;
      border-radius: var(--cx-radius-md);
      background: var(--cx-accent-50);
      color: var(--cx-accent-700);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .cx-as-section-meta { min-width: 0; flex: 1; }
    .cx-as-section-title {
      margin: 0;
      font-size: var(--cx-text-md);
      font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.01em;
    }
    .cx-as-section-desc {
      margin: 4px 0 0;
      font-size: var(--cx-text-sm);
      color: var(--cx-text-secondary);
      line-height: 1.5;
    }

    .cx-as-control {
      padding: 18px 20px;
    }
    .cx-as-control-label {
      display: block;
      font-size: var(--cx-text-xs);
      font-weight: 500;
      color: var(--cx-text-secondary);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .cx-as-control-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cx-as-step-btn {
      width: 40px; height: 40px;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      color: var(--cx-text-secondary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-as-step-btn:hover:not(:disabled) {
      background: var(--cx-primary-50);
      border-color: var(--cx-primary-200);
      color: var(--cx-primary-600);
    }
    .cx-as-step-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .cx-as-control-input {
      width: 120px;
      padding: 10px 14px;
      text-align: center;
      font-size: var(--cx-text-lg);
      font-weight: 600;
      color: var(--cx-text);
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
      outline: none;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
      /* Hide native number spinners — we render our own buttons */
      -moz-appearance: textfield;
    }
    .cx-as-control-input::-webkit-outer-spin-button,
    .cx-as-control-input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .cx-as-control-input:focus {
      background: var(--cx-surface);
      border-color: var(--cx-primary-600);
      box-shadow: 0 0 0 3px rgba(10, 79, 42, 0.1);
    }
    .cx-as-control-input:disabled { opacity: 0.6; }
    .cx-as-control-suffix {
      font-size: var(--cx-text-sm);
      color: var(--cx-text-muted);
      margin-left: 4px;
    }
    .cx-as-control-hint {
      margin: 10px 0 0;
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
    }
    .cx-as-control-hint strong {
      color: var(--cx-text-secondary);
      font-weight: 600;
    }
    .cx-as-dirty {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: 8px;
      padding: 2px 8px;
      background: var(--cx-accent-50);
      color: var(--cx-accent-700);
      border-radius: var(--cx-radius-pill);
      font-weight: 500;
    }

    .cx-as-section-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 14px 20px;
      border-top: 1px solid var(--cx-border-subtle);
      background: var(--cx-surface-2);
    }

    .cx-as-readonly-note {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 20px;
      border-top: 1px solid var(--cx-border-subtle);
      background: var(--cx-surface-2);
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
    }

    .cx-as-placeholder {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 14px 18px;
      background: var(--cx-surface-2);
      border: 1px dashed var(--cx-border-strong);
      border-radius: var(--cx-radius-lg);
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      font-style: italic;
    }

    /* Inline 3-dot save spinner (matches design system) */
    .cx-as-saving-dots {
      display: inline-flex;
      gap: 3px;
      align-items: center;
    }
    .cx-as-saving-dots span {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: currentColor;
      animation: cx-as-pulse 1.2s infinite var(--cx-ease-premium);
    }
    .cx-as-saving-dots span:nth-child(2) { animation-delay: 0.2s; }
    .cx-as-saving-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes cx-as-pulse {
      0%, 100% { opacity: 0.3; transform: scale(0.8); }
      50% { opacity: 1; transform: scale(1.15); }
    }
  `],
})
export class AgentSettingsComponent implements OnInit {
  private static readonly TARGET_KEY = 'agent.monthly_target';
  private static readonly DEFAULT_TARGET = 20;

  loading = signal(true);
  saving = signal(false);

  /** The underlying system_settings row — we need the id for PUT. */
  private targetSetting = signal<{ id: string; value: string } | null>(null);

  /** Live value bound to the input. */
  targetValue = AgentSettingsComponent.DEFAULT_TARGET;

  /** The last-persisted target (used for 'Reset' and dirty detection). */
  originalTarget = computed(() => {
    const row = this.targetSetting();
    if (!row) return AgentSettingsComponent.DEFAULT_TARGET;
    const n = parseInt(row.value, 10);
    return Number.isFinite(n) && n > 0 ? n : AgentSettingsComponent.DEFAULT_TARGET;
  });

  isDirty = computed(() => this.targetValue !== this.originalTarget());

  get canEdit(): boolean {
    return this.auth.hasPermission('settings.edit');
  }

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    // ListSettingsAction supports a `search` param that matches against the
    // key — narrower than pulling every setting. We still filter on the
    // client in case search widens the match set.
    this.api.get('/settings', { search: AgentSettingsComponent.TARGET_KEY, per_page: 10 }).subscribe({
      next: (res: any) => {
        const rows = res?.data || [];
        // Fall back to client-side filter in case the search matches more
        // than just our key. We pick the exact-key match if present, else
        // the first row (defensive).
        const match = rows.find((r: any) => r.key === AgentSettingsComponent.TARGET_KEY) || rows[0] || null;
        if (match) {
          this.targetSetting.set({ id: match.id, value: String(match.value) });
          this.targetValue = this.originalTarget();
        } else {
          this.targetSetting.set(null);
          this.targetValue = AgentSettingsComponent.DEFAULT_TARGET;
          this.toast.error(`Setting '${AgentSettingsComponent.TARGET_KEY}' not found. Run the seed script or create it manually.`);
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Failed to load agent settings');
      },
    });
  }

  /** Nudges the input by +/- 1. Clamps to the allowed range. */
  adjustTarget(delta: number): void {
    const n = Number(this.targetValue) || 0;
    const next = Math.min(1000, Math.max(1, n + delta));
    this.targetValue = next;
  }

  isValidTarget(): boolean {
    const n = Number(this.targetValue);
    return Number.isFinite(n) && n >= 1 && n <= 1000 && Number.isInteger(n);
  }

  reset(): void {
    this.targetValue = this.originalTarget();
  }

  save(): void {
    if (!this.isDirty() || !this.isValidTarget()) return;
    const row = this.targetSetting();
    if (!row) {
      this.toast.error('Cannot save: underlying setting row is missing');
      return;
    }

    this.saving.set(true);
    // The generic Settings update action accepts `value` as the payload.
    this.api.put('/settings/' + row.id, { value: String(this.targetValue) }).subscribe({
      next: (res: any) => {
        const newVal = String(res?.data?.value ?? this.targetValue);
        this.targetSetting.set({ id: row.id, value: newVal });
        this.targetValue = this.originalTarget();
        this.saving.set(false);
        this.toast.success('Target updated');
      },
      error: (err: any) => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'Failed to save');
      },
    });
  }
}
