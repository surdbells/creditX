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
 * Fixed Assets — register, depreciate, and dispose fixed assets.
 * Reads gated by accounting.view; writes by accounting.journal.
 */
@Component({
  selector: 'app-fixed-assets',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, MoneyPipe],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Fixed Assets"
        subtitle="Asset register, straight-line depreciation, and disposals"
        eyebrow="Accounting"></cx-page-header>

      <!-- Depreciation run -->
      <div class="cx-fa-dep">
        <div class="cx-fa-field"><label class="cx-label">Depreciation Period</label>
          <input type="month" class="cx-input" [(ngModel)]="period" /></div>
        <button class="cx-btn cx-btn-outline" (click)="previewDep()" [disabled]="busy()">
          <lucide-icon name="search" [size]="14"></lucide-icon><span>Preview</span></button>
        @if (auth.hasPermission('accounting.journal')) {
          <button class="cx-btn cx-btn-primary" (click)="runDep()" [disabled]="busy() || !depPreview()">
            <lucide-icon name="play" [size]="14"></lucide-icon><span>Run & Post</span></button>
        }
        @if (depPreview(); as d) {
          <div class="cx-fa-dep-result">{{ d.summary.asset_count }} asset(s) · {{ d.summary.total | money:2 }} for {{ d.period }}</div>
        }
      </div>

      <!-- Register form -->
      @if (auth.hasPermission('accounting.journal')) {
        <div class="cx-fa-new">
          <div class="cx-fa-field"><label class="cx-label">Name</label><input class="cx-input" [(ngModel)]="form.name" /></div>
          <div class="cx-fa-field"><label class="cx-label">Category</label><input class="cx-input" [(ngModel)]="form.category" /></div>
          <div class="cx-fa-field"><label class="cx-label">Acquisition Date</label><input type="date" class="cx-input" [(ngModel)]="form.acquisition_date" /></div>
          <div class="cx-fa-field"><label class="cx-label">Cost</label><input type="number" class="cx-input" [(ngModel)]="form.cost" /></div>
          <div class="cx-fa-field"><label class="cx-label">Salvage</label><input type="number" class="cx-input" [(ngModel)]="form.salvage_value" /></div>
          <div class="cx-fa-field"><label class="cx-label">Life (months)</label><input type="number" class="cx-input" [(ngModel)]="form.useful_life_months" /></div>
          <div class="cx-fa-field"><label class="cx-label">Funding GL (optional)</label><input class="cx-input" [(ngModel)]="form.funding_gl_code" placeholder="e.g. BANK" /></div>
          <button class="cx-btn cx-btn-primary" (click)="create()" [disabled]="busy()">
            <lucide-icon name="plus" [size]="14"></lucide-icon><span>Register</span></button>
        </div>
      }

      <div class="cx-fa-table-wrap">
        <table class="cx-fa-table">
          <thead><tr>
            <th>Tag</th><th>Name</th><th>Category</th><th class="r">Cost</th>
            <th class="r">Accum. Dep.</th><th class="r">Book Value</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            @if (assets().length === 0) {
              <tr><td colspan="8" class="cx-fa-state">No fixed assets registered.</td></tr>
            } @else {
              @for (a of assets(); track a.id) {
                <tr>
                  <td class="tabular-nums">{{ a.asset_tag }}</td>
                  <td>{{ a.name }}</td>
                  <td>{{ a.category || '—' }}</td>
                  <td class="r tabular-nums">{{ a.cost | money:2 }}</td>
                  <td class="r tabular-nums">{{ a.accumulated_depreciation | money:2 }}</td>
                  <td class="r tabular-nums">{{ a.book_value | money:2 }}</td>
                  <td><span class="cx-fa-badge" [class.dis]="a.status === 'disposed'" [class.full]="a.status === 'fully_depreciated'">{{ prettyStatus(a.status) }}</span></td>
                  <td class="r">
                    @if (a.status !== 'disposed' && auth.hasPermission('accounting.journal')) {
                      <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="dispose(a)">Dispose</button>
                    }
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .cx-fa-dep, .cx-fa-new { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 14px;
      padding: 14px 16px; background: var(--cx-surface-2); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-xl, 12px); }
    .cx-fa-field { display: flex; flex-direction: column; gap: 4px; }
    .cx-fa-field .cx-input { min-width: 120px; }
    .cx-fa-dep-result { font-size: 13px; color: var(--cx-text-muted); margin-left: auto; align-self: center; }
    .cx-fa-table-wrap { background: var(--cx-surface); border: 1px solid var(--cx-border); border-radius: var(--cx-radius-xl, 12px); overflow: hidden; }
    .cx-fa-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .cx-fa-table th { text-align: left; padding: 9px 12px; background: var(--cx-surface-2); font-size: 10px; font-weight: 600;
      letter-spacing: .06em; text-transform: uppercase; color: var(--cx-text-muted); border-bottom: 1px solid var(--cx-border); }
    .cx-fa-table th.r, .cx-fa-table td.r { text-align: right; }
    .cx-fa-table td { padding: 9px 12px; border-bottom: 1px solid var(--cx-border-subtle); }
    .cx-fa-table tbody tr:last-child td { border-bottom: none; }
    .cx-fa-state { padding: 28px; text-align: center; color: var(--cx-text-muted); }
    .cx-fa-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;
      background: #f0fdf4; color: #166534; }
    .cx-fa-badge.full { background: var(--cx-surface-2); color: var(--cx-text-muted); }
    .cx-fa-badge.dis { background: #fef2f2; color: #991b1b; }
  `],
})
export class FixedAssetsComponent {
  period = new Date().toISOString().slice(0, 7);
  form: any = { name: '', category: '', acquisition_date: new Date().toISOString().slice(0, 10), cost: 0, salvage_value: 0, useful_life_months: 36, funding_gl_code: '' };
  assets = signal<any[]>([]);
  depPreview = signal<any>(null);
  busy = signal(false);

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {
    this.load();
  }

  prettyStatus(s: string): string {
    return { active: 'Active', fully_depreciated: 'Fully Depreciated', disposed: 'Disposed' }[s] ?? s;
  }

  private splitPeriod() { const [year, month] = (this.period || '').split('-'); return { year, month }; }

  load() {
    this.api.get('/accounting/fixed-assets', { limit: 200 }).subscribe({
      next: r => this.assets.set(r.data?.assets || []),
      error: () => {},
    });
  }

  create() {
    this.busy.set(true);
    this.api.post('/accounting/fixed-assets', this.form).subscribe({
      next: () => { this.busy.set(false); this.toast.success('Registered'); this.form.name = ''; this.form.cost = 0; this.load(); },
      error: e => { this.busy.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }

  previewDep() {
    this.busy.set(true);
    this.api.get('/reports/depreciation/preview', this.splitPeriod()).subscribe({
      next: r => { this.busy.set(false); this.depPreview.set(r.data); },
      error: e => { this.busy.set(false); this.toast.error(e.error?.message || 'Preview failed'); },
    });
  }

  runDep() {
    if (!confirm(`Post depreciation for ${this.period}?`)) return;
    this.busy.set(true);
    this.api.post('/accounting/depreciation/runs', this.splitPeriod()).subscribe({
      next: r => { this.busy.set(false); this.toast.success(r.message || 'Posted'); this.depPreview.set(null); this.load(); },
      error: e => { this.busy.set(false); this.toast.error(e.error?.message || 'Run failed'); },
    });
  }

  dispose(a: any) {
    const proceeds = prompt(`Dispose ${a.asset_tag} (book value ${a.book_value}). Enter sale proceeds:`, '0');
    if (proceeds === null) return;
    this.api.post(`/accounting/fixed-assets/${a.id}/dispose`, { proceeds, disposal_date: new Date().toISOString().slice(0, 10) }).subscribe({
      next: () => { this.toast.success('Disposed'); this.load(); },
      error: e => this.toast.error(e.error?.message || 'Dispose failed'),
    });
  }
}
