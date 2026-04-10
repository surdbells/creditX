import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonRefresher, IonRefresherContent, IonInfiniteScroll, IonInfiniteScrollContent, IonSegment, IonSegmentButton, IonLabel, IonFab, IonFabButton } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, searchOutline, documentTextOutline } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-loan-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonRefresher, IonRefresherContent, IonInfiniteScroll, IonInfiniteScrollContent, IonSegment, IonSegmentButton, IonLabel, IonFab, IonFabButton],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>My Loans</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <div class="px-4 pb-2">
          <div class="relative">
            <ion-icon name="search-outline" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></ion-icon>
            <input type="text" class="w-full pl-9 pr-4 py-2.5 rounded-xl bg-gray-100 border-0 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A4F2A]/20"
                   [(ngModel)]="search" placeholder="Search by App ID, customer..." (input)="onSearch()" />
          </div>
        </div>
        <ion-segment [value]="activeTab()" (ionChange)="onTabChange($event)" class="px-4">
          <ion-segment-button value="all"><ion-label>All</ion-label></ion-segment-button>
          <ion-segment-button value="active"><ion-label>Active</ion-label></ion-segment-button>
          <ion-segment-button value="pending"><ion-label>Pending</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <div class="p-4 space-y-2">
        @if (loading() && loans().length === 0) {
          <div class="flex justify-center py-12"><div class="w-6 h-6 border-2 border-[#0A4F2A] border-t-transparent rounded-full animate-spin"></div></div>
        } @else if (loans().length === 0) {
          <div class="py-12 text-center">
            <ion-icon name="document-text-outline" class="text-4xl text-gray-300"></ion-icon>
            <p class="text-sm text-gray-400 mt-2">No loans found</p>
          </div>
        } @else {
          @for (loan of loans(); track loan.id) {
            <a [routerLink]="['/loans', loan.id]" class="block p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-sm font-semibold text-gray-800">{{ loan.customer_name }}</div>
                  <div class="text-xs text-gray-400 mt-0.5">{{ loan.application_id }} &bull; {{ loan.product_name }}</div>
                </div>
                <div class="text-right">
                  <div class="text-sm font-bold text-gray-800">₦{{ loan.amount_requested | number:'1.0-0' }}</div>
                  <span class="text-[10px] px-2 py-0.5 rounded-full font-medium" [class]="statusClass(loan.status)">
                    {{ loan.status?.replace('_', ' ') | titlecase }}
                  </span>
                </div>
              </div>
            </a>
          }
        }
      </div>

      <ion-infinite-scroll (ionInfinite)="loadMore($event)" [disabled]="!hasMore()">
        <ion-infinite-scroll-content></ion-infinite-scroll-content>
      </ion-infinite-scroll>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button routerLink="/loans/new" color="primary" style="--background: #0A4F2A">
          <ion-icon name="add-outline"></ion-icon>
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
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

  onTabChange(event: any): void { this.activeTab.set(event.detail.value); this.load(true); }
  onSearch(): void { clearTimeout(this.searchTimeout); this.searchTimeout = setTimeout(() => this.load(true), 400); }
  doRefresh(event: any): void { this.load(true); setTimeout(() => event.target.complete(), 800); }
  loadMore(event: any): void { this.page++; this.load(); setTimeout(() => event.target.complete(), 500); }

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
