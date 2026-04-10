import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonRefresher, IonRefresherContent, IonIcon, IonBadge } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { searchOutline, addOutline, documentTextOutline, chatbubbleEllipsesOutline, notificationsOutline, trendingUpOutline, walletOutline, peopleOutline, timeOutline } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, IonContent, IonHeader, IonToolbar, IonTitle, IonRefresher, IonRefresherContent, IonIcon, IonBadge],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>
          <span class="text-[#0A4F2A] font-bold">Credit</span><span class="text-[#C9A227] font-bold">X</span>
        </ion-title>
        <div slot="end" class="flex items-center gap-2 pr-4">
          <a routerLink="/notifications" class="relative p-2">
            <ion-icon name="notifications-outline" class="text-xl text-gray-600"></ion-icon>
            @if (unreadCount() > 0) {
              <span class="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                {{ unreadCount() > 9 ? '9+' : unreadCount() }}
              </span>
            }
          </a>
        </div>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <div class="p-4 space-y-4">
        <!-- Welcome -->
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Welcome, {{ auth.user()?.first_name }}</h2>
          <p class="text-xs text-gray-500">{{ today }}</p>
        </div>

        <!-- Quick Actions -->
        <div class="grid grid-cols-2 gap-3">
          <a routerLink="/lookup" class="flex items-center gap-3 p-4 rounded-2xl bg-[#0A4F2A]/5 border border-[#0A4F2A]/10">
            <div class="w-10 h-10 rounded-xl bg-[#0A4F2A] flex items-center justify-center">
              <ion-icon name="search-outline" class="text-white text-lg"></ion-icon>
            </div>
            <div><div class="text-sm font-semibold text-gray-800">Lookup</div><div class="text-[10px] text-gray-500">Staff records</div></div>
          </a>
          <a routerLink="/loans/new" class="flex items-center gap-3 p-4 rounded-2xl bg-[#C9A227]/5 border border-[#C9A227]/10">
            <div class="w-10 h-10 rounded-xl bg-[#C9A227] flex items-center justify-center">
              <ion-icon name="add-outline" class="text-white text-lg"></ion-icon>
            </div>
            <div><div class="text-sm font-semibold text-gray-800">New Loan</div><div class="text-[10px] text-gray-500">Capture application</div></div>
          </a>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-3 gap-3">
          @for (stat of stats(); track stat.label) {
            <div class="p-3 rounded-2xl bg-white border border-gray-100 shadow-sm text-center">
              <div class="text-xs text-gray-500">{{ stat.label }}</div>
              <div class="text-lg font-bold mt-0.5" [style.color]="stat.color">{{ stat.value }}</div>
            </div>
          }
        </div>

        <!-- Recent Loans -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-semibold text-gray-800">Recent Applications</h3>
            <a routerLink="/loans" class="text-xs font-medium text-[#0A4F2A]">View All</a>
          </div>
          @if (recentLoans().length === 0) {
            <div class="p-6 rounded-2xl bg-gray-50 text-center">
              <ion-icon name="document-text-outline" class="text-3xl text-gray-300"></ion-icon>
              <p class="text-xs text-gray-400 mt-2">No loan applications yet</p>
            </div>
          } @else {
            <div class="space-y-2">
              @for (loan of recentLoans(); track loan.id) {
                <a [routerLink]="['/loans', loan.id]" class="flex items-center justify-between p-3 rounded-xl bg-white border border-gray-100 shadow-sm">
                  <div>
                    <div class="text-sm font-medium text-gray-800">{{ loan.customer_name }}</div>
                    <div class="text-xs text-gray-400">{{ loan.application_id }}</div>
                  </div>
                  <div class="text-right">
                    <div class="text-sm font-semibold text-gray-800">₦{{ loan.amount_requested | number:'1.0-0' }}</div>
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-medium"
                          [class]="statusClass(loan.status)">
                      {{ loan.status | titlecase }}
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
})
export class DashboardPage implements OnInit {
  stats = signal<{label: string; value: string|number; color: string}[]>([]);
  recentLoans = signal<any[]>([]);
  unreadCount = signal(0);
  today = new Date().toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  constructor(public auth: AuthService, private api: ApiService) {
    addIcons({ searchOutline, addOutline, documentTextOutline, chatbubbleEllipsesOutline, notificationsOutline, trendingUpOutline, walletOutline, peopleOutline, timeOutline });
  }

  ngOnInit(): void { this.loadData(); }

  loadData(): void {
    this.api.get('/loans', { per_page: 5, sort_by: 'created_at', sort_dir: 'DESC' }).subscribe({
      next: res => {
        this.recentLoans.set(res.data || []);
        const total = res.meta?.total || 0;
        const active = (res.data || []).filter((l: any) => ['active','overdue','disbursed'].includes(l.status)).length;
        const pending = (res.data || []).filter((l: any) => ['submitted','under_review','captured'].includes(l.status)).length;
        this.stats.set([
          { label: 'Total', value: total, color: '#0A4F2A' },
          { label: 'Active', value: active, color: '#16a34a' },
          { label: 'Pending', value: pending, color: '#C9A227' },
        ]);
      },
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
}
