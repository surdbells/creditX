import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonIcon, IonRefresher, IonRefresherContent } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { notificationsOutline, mailOpenOutline, checkmarkDoneOutline } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonIcon, IonRefresher, IonRefresherContent],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/dashboard"></ion-back-button></ion-buttons>
        <ion-title>Notifications</ion-title>
        <div slot="end" class="pr-4">
          <button class="text-xs text-[#0A4F2A] font-medium" (click)="markAllRead()">Mark All Read</button>
        </div>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($event)"><ion-refresher-content></ion-refresher-content></ion-refresher>
      <div class="p-4">
        @if (loading()) {
          <div class="flex justify-center py-12"><div class="w-6 h-6 border-2 border-[#0A4F2A] border-t-transparent rounded-full animate-spin"></div></div>
        } @else if (notifications().length === 0) {
          <div class="py-12 text-center">
            <ion-icon name="notifications-outline" class="text-4xl text-gray-300"></ion-icon>
            <p class="text-sm text-gray-400 mt-2">No notifications</p>
          </div>
        } @else {
          <div class="space-y-2">
            @for (n of notifications(); track n.id) {
              <div class="p-4 rounded-xl border shadow-sm" [class]="n.is_read ? 'bg-white border-gray-100' : 'bg-[#0A4F2A]/5 border-[#0A4F2A]/10'">
                <div class="flex items-start gap-3">
                  <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                       [class]="n.is_read ? 'bg-gray-100' : 'bg-[#0A4F2A]/20'">
                    <ion-icon [name]="n.is_read ? 'mail-open-outline' : 'notifications-outline'"
                              [class]="n.is_read ? 'text-gray-400 text-sm' : 'text-[#0A4F2A] text-sm'"></ion-icon>
                  </div>
                  <div class="flex-1 min-w-0">
                    @if (n.subject) { <div class="text-sm font-semibold text-gray-800">{{ n.subject }}</div> }
                    <div class="text-sm text-gray-600">{{ n.body }}</div>
                    <div class="text-xs text-gray-400 mt-1">{{ n.created_at }}</div>
                  </div>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class NotificationsPage implements OnInit {
  notifications = signal<any[]>([]);
  loading = signal(true);

  constructor(private api: ApiService) { addIcons({ notificationsOutline, mailOpenOutline, checkmarkDoneOutline }); }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.api.get('/notifications', { per_page: 50 }).subscribe({
      next: res => { this.notifications.set(res.data || []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  markAllRead(): void {
    this.api.post('/notifications/mark-read').subscribe({
      next: () => this.notifications.update(list => list.map(n => ({ ...n, is_read: true }))),
    });
  }

  doRefresh(event: any): void { this.load(); setTimeout(() => event.target.complete(), 800); }
}
