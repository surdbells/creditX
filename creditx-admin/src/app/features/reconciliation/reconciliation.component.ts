import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-reconciliation', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Reconciliation" subtitle="Match and resolve transaction discrepancies">
        <button class="cx-btn cx-btn-primary" (click)="runRecon()">
          <lucide-icon name="refresh-cw" [size]="16"></lucide-icon> Run Reconciliation
        </button>
      </cx-page-header>

      <div class="cx-card !p-0 overflow-hidden">
        @if (loading()) {
          <div class="flex items-center justify-center py-16"><div class="w-8 h-8 border-3 border-[var(--cx-primary)] border-t-transparent rounded-full animate-spin"></div></div>
        } @else if (rows().length === 0) {
          <div class="flex flex-col items-center justify-center py-16">
            <lucide-icon name="check-circle" [size]="48" class="text-[var(--cx-success)] opacity-50 mb-3"></lucide-icon>
            <h3 class="text-base font-semibold text-[var(--cx-text)]">All Clear</h3>
            <p class="text-sm text-[var(--cx-text-muted)] mt-1">No reconciliation records found. Run a reconciliation to check for discrepancies.</p>
          </div>
        } @else {
          <table class="w-full">
            <thead><tr class="border-b border-[var(--cx-border)]">
              <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Date</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Type</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Description</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Amount</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Status</th>
              <th class="px-4 py-3 w-20"></th>
            </tr></thead>
            <tbody>
              @for (row of rows(); track row.id) {
                <tr class="border-b border-[var(--cx-border)] hover:bg-[var(--cx-surface-hover)]">
                  <td class="px-4 py-3 text-xs font-mono text-[var(--cx-text-muted)]">{{ row.created_at | date:'shortDate' }}</td>
                  <td class="px-4 py-3 text-sm text-[var(--cx-text)]">{{ row.type || row.reconciliation_type || '—' }}</td>
                  <td class="px-4 py-3 text-sm text-[var(--cx-text-secondary)]">{{ row.description || '—' }}</td>
                  <td class="px-4 py-3 text-right text-sm font-medium">@if (row.amount) { ₦{{ row.amount | number:'1.2-2' }} } @else { — }</td>
                  <td class="px-4 py-3">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          [class]="row.status === 'resolved' ? 'bg-[var(--cx-success-light)] text-[var(--cx-success)]' : 'bg-[var(--cx-warning-light)] text-[var(--cx-warning)]'">
                      {{ row.status | titlecase }}
                    </span>
                  </td>
                  <td class="px-4 py-3">
                    @if (row.status !== 'resolved') {
                      <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="resolve(row.id)">Resolve</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
})
export class ReconciliationComponent implements OnInit {
  rows = signal<any[]>([]); loading = signal(true);
  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}
  ngOnInit() { this.load(); }
  load() { this.loading.set(true); this.api.get('/reconciliations', { per_page: 50 }).subscribe({ next: r => { this.rows.set(r.data || []); this.loading.set(false); }, error: () => this.loading.set(false) }); }
  runRecon() { this.api.post('/reconciliations', {}).subscribe({ next: r => { this.toast.success(r.message || 'Reconciliation started'); this.load(); }, error: e => this.toast.error(e.error?.message || 'Failed') }); }
  resolve(id: string) { this.api.post('/reconciliations/' + id + '/resolve', {}).subscribe({ next: r => { this.toast.success('Resolved'); this.load(); }, error: e => this.toast.error(e.error?.message || 'Failed') }); }
}
