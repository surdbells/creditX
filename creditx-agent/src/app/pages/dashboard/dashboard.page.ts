import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonRefresher, IonRefresherContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { searchOutline, addOutline, documentTextOutline, chatbubbleEllipsesOutline, notificationsOutline, trendingUpOutline, walletOutline, peopleOutline, timeOutline } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, IonContent, IonHeader, IonToolbar, IonTitle, IonRefresher, IonRefresherContent, IonIcon],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>
          <span class="cxm-db-brand-credit">Credit</span><span class="cxm-db-brand-x">X</span>
        </ion-title>
        <div slot="end" class="cxm-db-toolbar-end">
          <a routerLink="/notifications" class="cxm-db-bell" aria-label="Notifications">
            <ion-icon name="notifications-outline" style="font-size: 20px"></ion-icon>
            @if (unreadCount() > 0) {
              <span class="cxm-db-bell-count tabular-nums">{{ unreadCount() > 9 ? '9+' : unreadCount() }}</span>
            }
          </a>
        </div>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <div class="px-4 pt-4 pb-6 flex flex-col gap-4 cxm-stagger">
        <!-- Welcome -->
        <div>
          <div class="cxm-eyebrow cxm-eyebrow-primary">{{ today }}</div>
          <h1 class="cxm-db-greeting">Hi, {{ auth.user()?.first_name }} 👋</h1>
        </div>

        <!-- Quick Actions -->
        <div class="grid grid-cols-2 gap-3">
          <a routerLink="/lookup" class="cxm-action-tile">
            <div class="cxm-action-icon cxm-action-icon-primary">
              <ion-icon name="search-outline" style="font-size: 18px"></ion-icon>
            </div>
            <div class="cxm-action-tile-meta">
              <div class="cxm-action-tile-label">Lookup</div>
              <div class="cxm-action-tile-desc">Staff records</div>
            </div>
          </a>
          <a routerLink="/loans/new" class="cxm-action-tile">
            <div class="cxm-action-icon cxm-action-icon-gold">
              <ion-icon name="add-outline" style="font-size: 18px"></ion-icon>
            </div>
            <div class="cxm-action-tile-meta">
              <div class="cxm-action-tile-label">New Loan</div>
              <div class="cxm-action-tile-desc">Capture application</div>
            </div>
          </a>
        </div>

        <!-- Monthly Target Progress -->
        @if (targetStats()) {
          <div class="cxm-db-target">
            <div class="cxm-db-target-header">
              <div>
                <div class="cxm-eyebrow" style="color: rgba(255, 255, 255, 0.7)">Monthly Target</div>
                <div class="cxm-db-target-month">{{ targetStats()?.month_label }}</div>
              </div>
              <ion-icon name="trending-up-outline" style="font-size: 22px; color: var(--cx-accent-400)"></ion-icon>
            </div>
            <div class="cxm-db-target-body">
              <!-- Circular Progress -->
              <div class="cxm-db-progress-ring">
                <svg viewBox="0 0 36 36" style="transform: rotate(-90deg)">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"></circle>
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--cx-accent-400)" stroke-width="3"
                          stroke-linecap="round"
                          [attr.stroke-dasharray]="100"
                          [attr.stroke-dashoffset]="100 - (targetStats()?.progress_pct || 0)"
                          style="transition: stroke-dashoffset 0.6s ease"></circle>
                </svg>
                <div class="cxm-db-progress-pct tabular-nums">{{ targetStats()?.progress_pct }}%</div>
              </div>
              <!-- Stats -->
              <div class="cxm-db-target-stats">
                <div class="cxm-db-target-row">
                  <span class="cxm-db-target-label">Disbursed</span>
                  <span class="cxm-db-target-value tabular-nums">
                    {{ targetStats()?.disbursed_count }}
                    <span class="cxm-db-target-of">of {{ targetStats()?.target }}</span>
                  </span>
                </div>
                <div class="cxm-db-target-row">
                  <span class="cxm-db-target-label">Remaining</span>
                  <span class="cxm-db-target-value cxm-db-target-gold tabular-nums">
                    {{ targetStats()?.remaining }} loans
                  </span>
                </div>
                <div class="cxm-db-target-row">
                  <span class="cxm-db-target-label">Value</span>
                  <span class="cxm-db-target-value tabular-nums">
                    ₦{{ targetStats()?.disbursed_amount | number:'1.0-0' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        }

        <!-- Stats -->
        <div class="grid grid-cols-3 gap-3">
          @for (stat of stats(); track stat.label) {
            <div class="cxm-db-stat">
              <div class="cxm-db-stat-label">{{ stat.label }}</div>
              <div class="cxm-db-stat-value tabular-nums" [style.color]="stat.color">{{ stat.value }}</div>
            </div>
          }
        </div>

        <!-- Recent Loans -->
        <div>
          <div class="cxm-section-header">
            <h3 class="cxm-section-title">Recent Applications</h3>
            <a routerLink="/loans" class="cxm-section-link">View all →</a>
          </div>
          @if (recentLoans().length === 0) {
            <div class="cxm-empty">
              <div class="cxm-empty-icon">
                <ion-icon name="document-text-outline" style="font-size: 24px"></ion-icon>
              </div>
              <div class="cxm-empty-title">No applications yet</div>
              <div class="cxm-empty-desc">Capture your first loan to see it here.</div>
            </div>
          } @else {
            <div class="flex flex-col gap-2">
              @for (loan of recentLoans(); track loan.id) {
                <a [routerLink]="['/loans', loan.id]" class="cxm-row">
                  <div class="cxm-row-main">
                    <div class="cxm-row-primary">{{ loan.customer_name }}</div>
                    <div class="cxm-row-secondary">{{ loan.application_id }}</div>
                  </div>
                  <div class="cxm-row-trail">
                    <div class="cxm-row-trail-primary tabular-nums">₦{{ loan.amount_requested | number:'1.0-0' }}</div>
                    <span class="cxm-status" [attr.data-tone]="statusTone(loan.status)" style="margin-top: 3px">
                      <span class="cxm-status-dot"></span>
                      <span>{{ loan.status | titlecase }}</span>
                    </span>
                  </div>
                </a>
              }
            </div>
          }
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    .cxm-db-brand-credit { color: var(--cx-primary-600); font-weight: 700; }
    .cxm-db-brand-x { color: var(--cx-accent-500); font-weight: 700; }

    .cxm-db-toolbar-end { padding-right: 12px; }
    .cxm-db-bell {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 38px; height: 38px;
      border-radius: 50%;
      background: var(--cx-surface-2);
      color: var(--cx-text-secondary);
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-db-bell:active {
      background: var(--cx-stone-200);
      transform: scale(0.92);
    }
    .cxm-db-bell-count {
      position: absolute;
      top: -2px; right: -2px;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      background: var(--cx-danger);
      color: #fff;
      border-radius: var(--cx-radius-pill);
      font-size: 10px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid var(--cx-surface);
    }

    .cxm-db-greeting {
      margin: 3px 0 0;
      font-size: var(--cx-text-xl);
      font-weight: 600;
      letter-spacing: -0.015em;
      color: var(--cx-text);
      line-height: 1.2;
    }

    /* Monthly target card */
    .cxm-db-target {
      padding: 16px;
      background: linear-gradient(135deg, var(--cx-primary-700) 0%, var(--cx-primary-600) 100%);
      color: #fff;
      border-radius: var(--cx-radius-2xl);
      box-shadow: 0 6px 16px rgba(10, 79, 42, 0.25);
      position: relative;
      overflow: hidden;
    }
    .cxm-db-target::before {
      content: '';
      position: absolute;
      top: -30%; right: -15%;
      width: 180px; height: 180px;
      background: radial-gradient(circle, rgba(201, 162, 39, 0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .cxm-db-target-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 12px;
      position: relative;
    }
    .cxm-db-target-month {
      font-size: var(--cx-text-xs);
      font-weight: 600;
      color: var(--cx-accent-400);
      margin-top: 2px;
    }
    .cxm-db-target-body {
      display: flex;
      align-items: center;
      gap: 16px;
      position: relative;
    }
    .cxm-db-progress-ring {
      position: relative;
      width: 76px;
      height: 76px;
      flex-shrink: 0;
    }
    .cxm-db-progress-ring svg { width: 100%; height: 100%; }
    .cxm-db-progress-pct {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--cx-text-md);
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .cxm-db-target-stats { flex: 1; display: flex; flex-direction: column; gap: 6px; }
    .cxm-db-target-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .cxm-db-target-label {
      font-size: var(--cx-text-xs);
      color: rgba(255, 255, 255, 0.7);
    }
    .cxm-db-target-value {
      font-size: var(--cx-text-sm);
      font-weight: 700;
    }
    .cxm-db-target-of {
      font-size: 11px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.6);
    }
    .cxm-db-target-gold { color: var(--cx-accent-400); }

    /* Stat cards */
    .cxm-db-stat {
      padding: 12px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      text-align: center;
    }
    .cxm-db-stat-label {
      font-size: 10px;
      font-weight: 500;
      color: var(--cx-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .cxm-db-stat-value {
      font-size: var(--cx-text-xl);
      font-weight: 700;
      letter-spacing: -0.015em;
      margin-top: 3px;
      line-height: 1;
    }
  `],
})
export class DashboardPage implements OnInit {
  stats = signal<{label: string; value: string|number; color: string}[]>([]);
  recentLoans = signal<any[]>([]);
  unreadCount = signal(0);
  targetStats = signal<any>(null);
  today = new Date().toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  constructor(public auth: AuthService, private api: ApiService) {
    addIcons({ searchOutline, addOutline, documentTextOutline, chatbubbleEllipsesOutline, notificationsOutline, trendingUpOutline, walletOutline, peopleOutline, timeOutline });
  }

  ngOnInit(): void { this.loadData(); }

  loadData(): void {
    // Agent monthly target stats
    this.api.get('/agent/dashboard-stats').subscribe({
      next: res => {
        this.targetStats.set(res.data);
        const bs = res.data?.by_status || {};
        this.stats.set([
          { label: 'Submitted', value: (bs.submitted || 0) + (bs.under_review || 0), color: 'var(--cx-accent-600)' },
          { label: 'Approved', value: bs.approved || 0, color: 'var(--cx-primary-600)' },
          { label: 'Rejected', value: bs.rejected || 0, color: 'var(--cx-danger)' },
        ]);
      },
      error: () => {
        // Fallback for non-agent users (admin view)
        this.api.get('/loans', { per_page: 5, sort_by: 'created_at', sort_dir: 'DESC' }).subscribe({
          next: res => {
            const total = res.meta?.total || 0;
            const active = (res.data || []).filter((l: any) => ['active','overdue','disbursed'].includes(l.status)).length;
            const pending = (res.data || []).filter((l: any) => ['submitted','under_review','captured'].includes(l.status)).length;
            this.stats.set([
              { label: 'Total', value: total, color: 'var(--cx-primary-700)' },
              { label: 'Active', value: active, color: 'var(--cx-primary-600)' },
              { label: 'Pending', value: pending, color: 'var(--cx-accent-600)' },
            ]);
          },
        });
      },
    });
    // Recent loans
    this.api.get('/loans', { per_page: 5, sort_by: 'created_at', sort_dir: 'DESC' }).subscribe({
      next: res => this.recentLoans.set(res.data || []),
    });
    this.api.get('/notifications', { per_page: 1, is_read: false }).subscribe({
      next: res => this.unreadCount.set((res as any).unread_count || 0),
      error: () => {},
    });
  }

  doRefresh(event: any): void {
    this.loadData();
    setTimeout(() => event.target.complete(), 1000);
  }

  statusClass(status: string): string {
    const map: Record<string,string> = {
      active: 'bg-green-100 text-green-700', approved: 'bg-green-100 text-green-700',
      submitted: 'bg-yellow-100 text-yellow-700', under_review: 'bg-yellow-100 text-yellow-700',
      captured: 'bg-amber-100 text-amber-700', draft: 'bg-gray-100 text-gray-600',
      overdue: 'bg-red-100 text-red-700', rejected: 'bg-red-100 text-red-700',
      disbursed: 'bg-blue-100 text-blue-700', closed: 'bg-blue-100 text-blue-700',
    };
    return map[status] || 'bg-gray-100 text-gray-600';
  }

  statusTone(status: string): string {
    const s = (status || '').toLowerCase();
    if (['active', 'approved', 'disbursed', 'closed'].includes(s)) return 'success';
    if (['submitted', 'under_review', 'captured', 'draft'].includes(s)) return 'warning';
    if (['rejected', 'overdue'].includes(s)) return 'danger';
    return 'neutral';
  }
}
