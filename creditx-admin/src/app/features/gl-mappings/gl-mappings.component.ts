import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, Observable } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { SearchableSelectDirective } from '../../shared/directives/searchable-select.directive';

interface GlRole {
  key: string;
  label: string;
  category: string;
  stage: string;
  description: string;
  default_code: string;
  gl_account_id: string | null;
  is_overridden: boolean;
  resolved: any | null;
  is_configured: boolean;
  updated_at: string | null;
  /** Local edit state — the currently selected account id, '' = use default. */
  _sel?: string;
}

/**
 * Default Ledgers — the GL account each loan-lifecycle operation posts to.
 *
 * Since the platform runs double-entry, every disbursement, repayment, penalty,
 * accrual, write-off and provision must hit the right GL for the trial balance
 * to stay accurate. Each named role ships pointed at a default account; an
 * operator can repoint it here without a deploy. Leaving a role on "default"
 * uses the seeded account, so an untouched deployment behaves exactly as before.
 */
@Component({
  selector: 'app-gl-mappings',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, SearchableSelectDirective],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Default Ledgers"
        subtitle="The GL account each loan-lifecycle operation posts to — keeps double-entry accurate"
        eyebrow="Accounting"></cx-page-header>

      <div class="cx-glm-note">
        <lucide-icon name="info" [size]="15"></lucide-icon>
        <span>
          Each operation posts to its mapped account. Leave a role on <strong>Default</strong> to use the shipped
          account (shown in brackets). Changes apply to <strong>new</strong> postings only — historical entries are unchanged.
        </span>
      </div>

      @if (loading()) {
        <div class="cx-glm-loading">
          <lucide-icon name="loader-2" [size]="18" class="cx-glm-spin"></lucide-icon>
          <span>Loading ledger roles…</span>
        </div>
      } @else {
        @for (group of grouped(); track group.category) {
          <section class="cx-card cx-glm-group">
            <h3 class="cx-glm-group-title">{{ group.category }}</h3>
            <div class="cx-glm-rows">
              @for (role of group.roles; track role.key) {
                <div class="cx-glm-row" [class.is-unconfigured]="!role.is_configured">
                  <div class="cx-glm-role">
                    <div class="cx-glm-role-head">
                      <span class="cx-glm-label">{{ role.label }}</span>
                      @if (role.is_overridden) {
                        <span class="cx-glm-tag is-custom">Custom</span>
                      } @else {
                        <span class="cx-glm-tag">Default</span>
                      }
                      @if (!role.is_configured) {
                        <span class="cx-glm-tag is-warn">No account</span>
                      }
                    </div>
                    <p class="cx-glm-desc">{{ role.description }}</p>
                    <div class="cx-glm-stage">
                      <lucide-icon name="arrow-left-right" [size]="12"></lucide-icon>
                      <span>{{ role.stage }}</span>
                    </div>
                  </div>

                  <div class="cx-glm-pick">
                    <select class="cx-select" [(ngModel)]="role._sel" (ngModelChange)="onChange(role, $event)"
                            [disabled]="!canEdit || saving().has(role.key)" [attr.aria-label]="role.label + ' account'">
                      <option value="">Default — {{ role.default_code }}{{ defaultName(role) }}</option>
                      @for (g of glAccounts(); track g.id) {
                        <option [value]="g.id">{{ g.account_code }} — {{ g.account_name }}</option>
                      }
                    </select>
                    <div class="cx-glm-resolved">
                      @if (saving().has(role.key)) {
                        <lucide-icon name="loader-2" [size]="12" class="cx-glm-spin"></lucide-icon>
                        <span>Saving…</span>
                      } @else if (role.resolved) {
                        <span>Posts to <strong>{{ role.resolved.account_code }}</strong> — {{ role.resolved.account_name }}</span>
                      } @else {
                        <span class="cx-glm-resolved-warn">No account resolves — postings for this operation will fail until set.</span>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: [`
    .cx-glm-note { display: flex; gap: 9px; align-items: flex-start; font-size: 13px; color: var(--cx-text-secondary);
      background: var(--cx-surface-2, var(--cx-stone-100)); border-radius: var(--cx-radius-lg, 10px); padding: 11px 13px; margin-bottom: 16px; }
    .cx-glm-note lucide-icon { flex-shrink: 0; margin-top: 1px; color: var(--cx-text-muted); }

    .cx-glm-loading { display: flex; align-items: center; gap: 10px; padding: 40px 0; justify-content: center; color: var(--cx-text-muted); font-size: 13px; }
    .cx-glm-spin { animation: cx-glm-spin 1s linear infinite; }
    @keyframes cx-glm-spin { to { transform: rotate(360deg); } }

    .cx-glm-group { padding: 4px 0 6px; margin-bottom: 16px; }
    .cx-glm-group-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
      color: var(--cx-text-muted); margin: 0; padding: 12px 18px; border-bottom: 1px solid var(--cx-border); }
    .cx-glm-rows { display: flex; flex-direction: column; }
    .cx-glm-row { display: grid; grid-template-columns: 1fr minmax(280px, 400px); gap: 20px; align-items: center;
      padding: 16px 18px; border-bottom: 1px solid var(--cx-border); }
    .cx-glm-row:last-child { border-bottom: none; }
    .cx-glm-row.is-unconfigured { background: color-mix(in srgb, var(--cx-danger) 4%, transparent); }
    @media (max-width: 720px) { .cx-glm-row { grid-template-columns: 1fr; gap: 12px; } }

    .cx-glm-role-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .cx-glm-label { font-size: 14px; font-weight: 600; color: var(--cx-text); }
    .cx-glm-tag { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 2px 8px;
      border-radius: 999px; background: var(--cx-stone-100); color: var(--cx-text-secondary); }
    .cx-glm-tag.is-custom { background: color-mix(in srgb, var(--cx-primary-600) 12%, transparent); color: var(--cx-primary-600); }
    .cx-glm-tag.is-warn { background: color-mix(in srgb, var(--cx-danger) 12%, transparent); color: var(--cx-danger); }
    .cx-glm-desc { font-size: 12.5px; color: var(--cx-text-muted); margin: 5px 0 0; line-height: 1.45; max-width: 62ch; }
    .cx-glm-stage { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--cx-text-muted); margin-top: 6px; }
    .cx-glm-stage lucide-icon { color: var(--cx-text-muted); }

    .cx-glm-pick { display: flex; flex-direction: column; gap: 6px; }
    .cx-glm-resolved { font-size: 11.5px; color: var(--cx-text-muted); display: flex; align-items: center; gap: 5px; }
    .cx-glm-resolved strong { color: var(--cx-text-secondary); font-weight: 600; }
    .cx-glm-resolved-warn { color: var(--cx-danger); }
  `],
})
export class GlMappingsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  roles = signal<GlRole[]>([]);
  glAccounts = signal<any[]>([]);
  loading = signal(true);
  saving = signal<Set<string>>(new Set());

  get canEdit(): boolean { return this.auth.hasPermission('accounting.edit'); }

  grouped = computed(() => {
    const groups: { category: string; roles: GlRole[] }[] = [];
    for (const r of this.roles()) {
      let g = groups.find(x => x.category === r.category);
      if (!g) { g = { category: r.category, roles: [] }; groups.push(g); }
      g.roles.push(r);
    }
    return groups;
  });

  ngOnInit(): void {
    // Load the GL account list (for the selects) and the role mappings together
    // so the selects render with their current selections resolved.
    forkJoin({
      accounts: this.loadAllGlAccounts$(),
      mappings: this.api.get('/accounting/gl-mappings'),
    }).subscribe({
      next: ({ accounts, mappings }) => {
        this.glAccounts.set(accounts);
        this.roles.set((mappings.data || []).map((r: GlRole) => ({ ...r, _sel: r.gl_account_id ?? '' })));
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.toast.error('Failed to load ledger roles.'); },
    });
  }

  /** Fetch every GL account across pages (per_page caps at 100 server-side). */
  private loadAllGlAccounts$(): Observable<any[]> {
    return new Observable<any[]>(observer => {
      const all: any[] = [];
      const fetchPage = (page: number) => {
        this.api.get('/gl-accounts', { per_page: 100, page, sort_by: 'account_code', sort_dir: 'ASC' }).subscribe({
          next: r => {
            all.push(...(r.data || []));
            const totalPages = r.meta?.total_pages ?? 1;
            if (page < totalPages) { fetchPage(page + 1); }
            else { observer.next(all.filter(a => a.is_active)); observer.complete(); }
          },
          error: e => observer.error(e),
        });
      };
      fetchPage(1);
    });
  }

  defaultName(role: GlRole): string {
    // The resolved account IS the default when there's no override.
    if (!role.is_overridden && role.resolved) return ' · ' + role.resolved.account_name;
    return '';
  }

  onChange(role: GlRole, value: string): void {
    if (!this.canEdit) return;
    const glId = value || null;
    // No-op guard: selecting what's already saved.
    if ((role.gl_account_id ?? null) === glId) return;

    this.saving.update(s => new Set(s).add(role.key));
    this.api.put(`/accounting/gl-mappings/${role.key}`, { gl_account_id: glId }).subscribe({
      next: r => {
        this.applyUpdate(role.key, r.data);
        this.saving.update(s => { const n = new Set(s); n.delete(role.key); return n; });
        this.toast.success(r.message || 'Ledger mapping updated');
      },
      error: e => {
        // Revert the select to the last saved value.
        this.applyUpdate(role.key, null);
        this.saving.update(s => { const n = new Set(s); n.delete(role.key); return n; });
        this.toast.error(e.error?.errors?.gl_account_id || e.error?.message || 'Failed to update mapping');
      },
    });
  }

  /** Merge the server's fresh role state back into the row (or just revert _sel). */
  private applyUpdate(key: string, data: any | null): void {
    this.roles.update(rows => rows.map(r => {
      if (r.key !== key) return r;
      if (data === null) return { ...r, _sel: r.gl_account_id ?? '' }; // revert
      return {
        ...r,
        gl_account_id: data.gl_account_id ?? null,
        is_overridden: data.is_overridden,
        resolved: data.resolved ?? null,
        is_configured: data.is_configured,
        _sel: data.gl_account_id ?? '',
      };
    }));
  }
}
