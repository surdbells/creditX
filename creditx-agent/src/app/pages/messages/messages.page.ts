import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonRefresher, IonRefresherContent, IonFab, IonFabButton, IonBadge } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, chatbubbleEllipsesOutline, timeOutline } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, RouterLink, IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonRefresher, IonRefresherContent, IonFab, IonFabButton, IonBadge],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar><ion-title>Messages</ion-title></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($event)"><ion-refresher-content></ion-refresher-content></ion-refresher>
      <div class="p-4">
        @if (loading() && conversations().length === 0) {
          <div class="flex justify-center py-12"><div class="w-6 h-6 border-2 border-[#0A4F2A] border-t-transparent rounded-full animate-spin"></div></div>
        } @else if (conversations().length === 0) {
          <div class="py-12 text-center">
            <ion-icon name="chatbubble-ellipses-outline" class="text-4xl text-gray-300"></ion-icon>
            <p class="text-sm text-gray-400 mt-2">No conversations yet</p>
          </div>
        } @else {
          <div class="space-y-2">
            @for (conv of conversations(); track conv.id) {
              <a [routerLink]="['/messages', conv.id]" class="flex items-center gap-3 p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
                <div class="w-10 h-10 rounded-full bg-[#0A4F2A]/10 flex items-center justify-center flex-shrink-0">
                  <ion-icon name="chatbubble-ellipses-outline" class="text-[#0A4F2A]"></ion-icon>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-semibold text-gray-800 truncate">{{ conv.subject }}</span>
                    @if (conv.unread_count > 0) {
                      <ion-badge color="danger" class="text-[10px]">{{ conv.unread_count }}</ion-badge>
                    }
                  </div>
                  <div class="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-medium"
                          [class]="conv.status === 'open' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'">
                      {{ conv.status | titlecase }}
                    </span>
                    <span>&bull; {{ conv.message_count }} messages</span>
                  </div>
                </div>
              </a>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class MessagesPage implements OnInit {
  conversations = signal<any[]>([]);
  loading = signal(true);

  constructor(private api: ApiService) { addIcons({ addOutline, chatbubbleEllipsesOutline, timeOutline }); }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.api.get('/conversations', { per_page: 50 }).subscribe({
      next: res => { this.conversations.set(res.data || []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  doRefresh(event: any): void { this.load(); setTimeout(() => event.target.complete(), 800); }
}
