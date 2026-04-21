import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonRefresher, IonRefresherContent, IonInfiniteScroll, IonInfiniteScrollContent, IonFab, IonFabButton } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, searchOutline, documentTextOutline } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-loan-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonRefresher, IonRefresherContent, IonInfiniteScroll, IonInfiniteScrollContent, IonFab, IonFabButton],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>My Loans</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <div class="px-4 pt-1 pb-2">
          <div class="cxm-search-wrap">
            <ion-icon name="search-outline" class="cxm-search-icon"></ion-icon>
            <input type="text" class="cxm-search-input"
                   [(ngModel)]="search" placeholder="Search by App ID, customer..." (input)="onSearch()" />
          </div>
        </div>
        <div class="px-4 pb-2">
          <div class="cx-tabs cx-tabs-full cx-tabs-sm">
            <button class="cx-tabs-tab" [class.is-active]="activeTab() === 'all'" (click)="activeTab.set('all'); load(true)">All</button>
            <button class="cx-tabs-tab" [class.is-active]="activeTab() === 'active'" (click)="activeTab.set('active'); load(true)">Active</button>
            <button class="cx-tabs-tab" [class.is-active]="activeTab() === 'pending'" (click)="activeTab.set('pending'); load(true)">Pending</button>
          </div>
        </div>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <div class="px-4 pt-3 pb-6">
        @if (loading() && loans().length === 0) {
          <div class="cxm-loading">
            <div class="cxm-loading-dots"><span></span><span></span><span></span></div>
            <span class="cxm-loading-text">Loading loans...</span>
          </div>
        } @else if (loans().length === 0) {
          <div class="cxm-empty">
            <div class="cxm-empty-icon">
              <ion-icon name="document-text-outline" style="font-size: 24px"></ion-icon>
            </div>
            <div class="cxm-empty-title">No loans found</div>
            <div class="cxm-empty-desc">Try adjusting your search or filter, or capture a new application.</div>
          </div>
        } @else {
          <div class="flex flex-col gap-2 cxm-stagger">
            @for (loan of loans(); track loan.id) {
              <a [routerLink]="['/loans', loan.id]" class="cxm-loan-card">
                <div class="cxm-loan-card-top">
                  <div class="cxm-loan-card-customer">
                    <div class="cxm-row-primary">{{ loan.customer_name }}</div>
                    <div class="cxm-loan-card-meta">
                      <span class="cxm-loan-card-app-id">{{ loan.application_id }}</span>
                      <span class="cxm-loan-card-dot">·</span>
                      <span>{{ loan.product_name }}</span>
                    </div>
                  </div>
                  <div class="cxm-loan-card-amount tabular-nums">₦{{ loan.amount_requested | number:'1.0-0' }}</div>
                </div>
                <div class="cxm-loan-card-bottom">
                  <span class="cxm-status" [attr.data-tone]="statusTone(loan.status)">
                    <span class="cxm-status-dot"></span>
                    <span>{{ loan.status?.replace('_', ' ') | titlecase }}</span>
                  </span>
                </div>
              </a>
            }
          </div>
        }
      </div>

      <ion-infinite-scroll (ionInfinite)="loadMore($event)" [disabled]="!hasMore()">
        <ion-infinite-scroll-content></ion-infinite-scroll-content>
      </ion-infinite-scroll>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button routerLink="/loans/new" color="primary">
          <ion-icon name="add-outline"></ion-icon>
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
  styles: [`
    .cxm-search-wrap {
      position: relative;
    }
    .cxm-search-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--cx-text-muted);
      font-size: 16px;
      pointer-events: none;
    }
    .cxm-search-input {
      width: 100%;
      padding: 10px 16px 10px 38px;
      background: var(--cx-surface-2);
      border: 1px solid transparent;
      border-radius: var(--cx-radius-lg);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      outline: none;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-search-input:focus {
      background: var(--cx-surface);
      border-color: var(--cx-primary-600);
    }

    .cxm-loan-card {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 14px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-xl);
      text-decoration: none;
      color: inherit;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-loan-card:active {
      transform: scale(0.99);
      background: var(--cx-surface-hover);
    }
    .cxm-loan-card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .cxm-loan-card-customer {
      min-width: 0;
      flex: 1;
    }
    .cxm-loan-card-meta {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      margin-top: 2px;
      overflow: hidden;
    }
    .cxm-loan-card-app-id {
      font-family: var(--cx-font-mono, monospace);
      color: var(--cx-primary-700);
      font-weight: 500;
    }
    .cxm-loan-card-dot { color: var(--cx-text-subtle, var(--cx-stone-400)); }
    .cxm-loan-card-amount {
      font-size: var(--cx-text-md);
      font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
      flex-shrink: 0;
    }
    .cxm-loan-card-bottom {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    ion-segment { --background: transparent; }
    ion-fab-button { --background: var(--cx-primary-600); --background-activated: var(--cx-primary-700); }
  `],
})
export class LoanListPage implements OnInit {
  loans = signal<any[]>([]);
  loading = signal(false);
  activeTab = signal('all');
  search = '';
  page = 1;
  hasMore = signal(true);
  private searchTimeout: any;

  constructor(private api: ApiService) {
    addIcons({ addOutline, searchOutline, documentTextOutline });
  }

  ngOnInit(): void { this.load(true); }

  load(reset = false): void {
    if (reset) { this.page = 1; this.loans.set([]); this.hasMore.set(true); }
    this.loading.set(true);
    const params: any = { page: this.page, per_page: 20, sort_by: 'created_at', sort_dir: 'DESC' };
    if (this.search) params.search = this.search;
    const tab = this.activeTab();
    if (tab === 'active') params.status = 'active,overdue,disbursed';
    else if (tab === 'pending') params.status = 'submitted,under_review,captured';

    this.api.get('/loans', params).subscribe({
      next: res => {
        const items = res.data || [];
        if (reset) this.loans.set(items);
        else this.loans.update(prev => [...prev, ...items]);
        this.hasMore.set(items.length >= 20);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onSearch(): void { clearTimeout(this.searchTimeout); this.searchTimeout = setTimeout(() => this.load(true), 400); }
  doRefresh(event: any): void { this.load(true); setTimeout(() => event.target.complete(), 800); }
  loadMore(event: any): void { this.page++; this.load(); setTimeout(() => event.target.complete(), 500); }

  statusTone(status: string): string {
    const s = (status || '').toLowerCase();
    if (['active', 'approved', 'disbursed', 'closed'].includes(s)) return 'success';
    if (['submitted', 'under_review', 'captured', 'draft'].includes(s)) return 'warning';
    if (['rejected', 'overdue'].includes(s)) return 'danger';
    return 'neutral';
  }

  statusClass(status: string): string {
    const map: Record<string,string> = {
      active:'bg-green-100 text-green-700', approved:'bg-green-100 text-green-700',
      submitted:'bg-yellow-100 text-yellow-700', under_review:'bg-yellow-100 text-yellow-700',
      captured:'bg-amber-100 text-amber-700', draft:'bg-gray-100 text-gray-600',
      overdue:'bg-red-100 text-red-700', rejected:'bg-red-100 text-red-700',
      disbursed:'bg-blue-100 text-blue-700', closed:'bg-blue-100 text-blue-700',
    };
    return map[status] || 'bg-gray-100 text-gray-600';
  }
}
