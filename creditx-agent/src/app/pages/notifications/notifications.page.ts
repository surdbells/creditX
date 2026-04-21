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
          <button class="cxm-mark-read-btn" (click)="markAllRead()">
            <ion-icon name="checkmark-done-outline" style="font-size: 14px"></ion-icon>
            <span>Mark all read</span>
          </button>
        </div>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($event)"><ion-refresher-content></ion-refresher-content></ion-refresher>

      <div class="cxm-page-header cx-animate-in">
        <div class="cxm-eyebrow cxm-eyebrow-primary">Activity</div>
        <h1 class="cxm-title">Notifications</h1>
        <p class="cxm-subtitle">Updates from approvals, disbursements, and announcements</p>
      </div>

      <div class="px-4 pb-6">
        @if (loading()) {
          <div class="cxm-loading">
            <div class="cxm-loading-dots"><span></span><span></span><span></span></div>
            <span class="cxm-loading-text">Loading notifications...</span>
          </div>
        } @else if (notifications().length === 0) {
          <div class="cxm-empty">
            <div class="cxm-empty-icon">
              <ion-icon name="notifications-outline" style="font-size: 24px"></ion-icon>
            </div>
            <div class="cxm-empty-title">You're all caught up</div>
            <div class="cxm-empty-desc">New notifications will appear here.</div>
          </div>
        } @else {
          <div class="flex flex-col gap-2 cxm-stagger">
            @for (n of notifications(); track n.id) {
              <div class="cxm-notif" [class.is-unread]="!n.is_read">
                <div class="cxm-notif-icon" [class.is-unread]="!n.is_read">
                  <ion-icon [name]="n.is_read ? 'mail-open-outline' : 'notifications-outline'" style="font-size: 15px"></ion-icon>
                </div>
                <div class="cxm-notif-body">
                  @if (n.subject) { <div class="cxm-notif-subject">{{ n.subject }}</div> }
                  <div class="cxm-notif-text">{{ n.body }}</div>
                  <div class="cxm-notif-time tabular-nums">{{ n.created_at }}</div>
                </div>
                @if (!n.is_read) { <span class="cxm-notif-marker"></span> }
              </div>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    .cxm-mark-read-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      background: var(--cx-primary-50);
      border: 1px solid transparent;
      border-radius: var(--cx-radius-pill);
      font-size: var(--cx-text-xs);
      font-weight: 500;
      color: var(--cx-primary-700);
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-mark-read-btn:active { background: var(--cx-primary-100); }

    .cxm-notif {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-lg);
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-notif.is-unread {
      background: var(--cx-primary-50);
      border-color: rgba(10, 79, 42, 0.12);
    }
    .cxm-notif-icon {
      width: 32px; height: 32px;
      border-radius: 50%;
      background: var(--cx-stone-100);
      color: var(--cx-text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .cxm-notif-icon.is-unread {
      background: var(--cx-primary-600);
      color: #fff;
    }
    .cxm-notif-body { flex: 1; min-width: 0; }
    .cxm-notif-subject {
      font-size: var(--cx-text-sm);
      font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
      margin-bottom: 2px;
    }
    .cxm-notif-text {
      font-size: var(--cx-text-sm);
      color: var(--cx-text-secondary);
      line-height: 1.5;
    }
    .cxm-notif-time {
      font-size: 10px;
      color: var(--cx-text-muted);
      margin-top: 4px;
    }
    .cxm-notif-marker {
      position: absolute;
      top: 14px; right: 14px;
      width: 7px; height: 7px;
      border-radius: 50%;
      background: var(--cx-accent-500);
      box-shadow: 0 0 0 3px rgba(201, 162, 39, 0.25);
    }
  `],
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
