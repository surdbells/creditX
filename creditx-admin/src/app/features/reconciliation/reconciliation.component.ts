import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-reconciliation', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, StatusBadgeComponent, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Reconciliation"
        subtitle="Match and resolve transaction discrepancies"
        eyebrow="Finance Operations">
        <button class="cx-btn cx-btn-primary" (click)="runRecon()">
          <lucide-icon name="refresh-cw" [size]="14"></lucide-icon>
          <span>Run Reconciliation</span>
        </button>
      </cx-page-header>

      <div class="cx-recon-wrap">
        @if (loading()) {
          <cx-loading message="Loading reconciliations..."></cx-loading>
        } @else if (rows().length === 0) {
          <cx-empty-state title="All Clear" description="No reconciliation records found. Run a reconciliation to check for discrepancies." icon="check-circle"></cx-empty-state>
        } @else {
          <div class="cx-recon-scroll">
            <table class="cx-recon-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th class="cx-recon-right">Amount</th>
                  <th>Status</th>
                  <th class="cx-recon-actions-col"></th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.id) {
                  <tr>
                    <td class="cx-recon-date">{{ row.created_at | date:'MMM d, y' }}</td>
                    <td class="cx-recon-type">{{ row.type || row.reconciliation_type || '—' }}</td>
                    <td class="cx-recon-desc">{{ row.description || '—' }}</td>
                    <td class="cx-recon-right cx-recon-amount tabular-nums">
                      @if (row.amount) { ₦{{ row.amount | number:'1.2-2' }} } @else { — }
                    </td>
                    <td><cx-status-badge [status]="row.status"></cx-status-badge></td>
                    <td class="cx-recon-actions-col">
                      @if (row.status !== 'resolved') {
                        <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="resolve(row.id)">Resolve</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .cx-recon-wrap {
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      overflow: hidden;
    }
    .cx-recon-scroll { overflow-x: auto; }
    .cx-recon-table { width: 100%; border-collapse: collapse; }
    .cx-recon-table thead { background: var(--cx-surface-2); }
    .cx-recon-table thead tr { border-bottom: 1px solid var(--cx-border); }
    .cx-recon-table th {
      padding: 0.75rem 1rem;
      font-size: var(--cx-text-xs); font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.05em;
      color: var(--cx-text-muted);
      text-align: left;
      white-space: nowrap;
    }
    .cx-recon-right { text-align: right; }
    .cx-recon-actions-col { width: 100px; text-align: right; }
    .cx-recon-table tbody td {
      padding: 0.75rem 1rem;
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cx-recon-table tbody tr { transition: background var(--cx-dur-fast) var(--cx-ease-premium); }
    .cx-recon-table tbody tr:hover { background: var(--cx-surface-hover); }
    .cx-recon-table tbody tr:last-child td { border-bottom: none; }
    .cx-recon-date { font-size: var(--cx-text-xs); color: var(--cx-text-muted); }
    .cx-recon-type { font-weight: 500; }
    .cx-recon-desc { color: var(--cx-text-secondary); }
    .cx-recon-amount { font-weight: 500; }
  `],
})
export class ReconciliationComponent implements OnInit {
  rows = signal<any[]>([]); loading = signal(true);
  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit() { this.load(); }
  load() { this.loading.set(true); this.api.get('/reconciliations', { per_page: 50 }).subscribe({ next: r => { this.rows.set(r.data || []); this.loading.set(false); }, error: () => this.loading.set(false) }); }
  runRecon() { this.api.post('/reconciliations', {}).subscribe({ next: r => { this.toast.success(r.message || 'Reconciliation started'); this.load(); }, error: e => this.toast.error(e.error?.message || 'Failed') }); }
  resolve(id: string) { this.api.post('/reconciliations/' + id + '/resolve', {}).subscribe({ next: r => { this.toast.success('Resolved'); this.load(); }, error: e => this.toast.error(e.error?.message || 'Failed') }); }
}
