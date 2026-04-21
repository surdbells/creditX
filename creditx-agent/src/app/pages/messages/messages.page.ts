import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonRefresher, IonRefresherContent } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, chatbubbleEllipsesOutline, timeOutline } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, RouterLink, IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonRefresher, IonRefresherContent],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar><ion-title>Messages</ion-title></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($event)"><ion-refresher-content></ion-refresher-content></ion-refresher>

      <div class="cxm-page-header cx-animate-in">
        <div class="cxm-eyebrow cxm-eyebrow-primary">Inbox</div>
        <h1 class="cxm-title">Messages</h1>
        <p class="cxm-subtitle">Conversations with your team and admin</p>
      </div>

      <div class="px-4 pb-6">
        @if (loading() && conversations().length === 0) {
          <div class="cxm-loading">
            <div class="cxm-loading-dots"><span></span><span></span><span></span></div>
            <span class="cxm-loading-text">Loading conversations...</span>
          </div>
        } @else if (conversations().length === 0) {
          <div class="cxm-empty">
            <div class="cxm-empty-icon">
              <ion-icon name="chatbubble-ellipses-outline" style="font-size: 24px"></ion-icon>
            </div>
            <div class="cxm-empty-title">No conversations yet</div>
            <div class="cxm-empty-desc">When you start a conversation, it'll show up here.</div>
          </div>
        } @else {
          <div class="flex flex-col gap-2 cxm-stagger">
            @for (conv of conversations(); track conv.id) {
              <a [routerLink]="['/messages', conv.id]" class="cxm-row">
                <div class="cxm-avatar cxm-avatar-gold">
                  <ion-icon name="chatbubble-ellipses-outline" style="font-size: 16px"></ion-icon>
                </div>
                <div class="cxm-row-main">
                  <div class="flex items-center justify-between gap-2">
                    <span class="cxm-row-primary">{{ conv.subject }}</span>
                    @if (conv.unread_count > 0) {
                      <span class="cxm-unread-dot tabular-nums">{{ conv.unread_count }}</span>
                    }
                  </div>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="cxm-status" [attr.data-tone]="conv.status === 'open' ? 'success' : 'neutral'">
                      <span class="cxm-status-dot"></span>
                      <span>{{ conv.status | titlecase }}</span>
                    </span>
                    <span class="cxm-row-secondary" style="margin: 0">{{ conv.message_count }} {{ conv.message_count === 1 ? 'message' : 'messages' }}</span>
                  </div>
                </div>
              </a>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    .cxm-unread-dot {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      background: var(--cx-danger);
      color: #fff;
      border-radius: var(--cx-radius-pill);
      font-size: 10px;
      font-weight: 600;
      flex-shrink: 0;
    }
  `],
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
