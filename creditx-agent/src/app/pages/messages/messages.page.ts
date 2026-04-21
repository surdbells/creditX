import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonRefresher, IonRefresherContent } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, chatbubbleEllipsesOutline, timeOutline, peopleOutline, megaphoneOutline } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';

/**
 * Agent messages inbox — two tabs:
 *
 *   Direct    — 1:1 conversations (GET /conversations)
 *   Channels  — group / channel memberships (GET /channels)
 *
 * Tapping a direct conversation routes to /messages/:id (existing
 * message-thread page). Tapping a channel routes to /channels/:id
 * (new channel-thread page in Commit 6.3). Until 6.3 lands, the
 * channel route will 404 — the Channels tab is functional up to
 * the point of navigation.
 *
 * Both lists lazy-load when their tab is first shown. Switching back
 * to a previously-visited tab shows cached state (no reload); the
 * pull-to-refresh control reloads the active tab.
 */
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
        <p class="cxm-subtitle">Conversations, channels, and groups</p>
      </div>

      <!-- Tab switcher -->
      <div class="cxm-tabs-row">
        <button class="cxm-tab"
                [class.is-active]="tab() === 'direct'"
                (click)="switchTab('direct')">
          <ion-icon name="chatbubble-ellipses-outline" style="font-size: 14px"></ion-icon>
          <span>Direct</span>
          @if (conversations().length > 0) {
            <span class="cxm-tab-count tabular-nums">{{ conversations().length }}</span>
          }
        </button>
        <button class="cxm-tab"
                [class.is-active]="tab() === 'channels'"
                (click)="switchTab('channels')">
          <ion-icon name="megaphone-outline" style="font-size: 14px"></ion-icon>
          <span>Channels</span>
          @if (channels().length > 0) {
            <span class="cxm-tab-count tabular-nums">{{ channels().length }}</span>
          }
        </button>
      </div>

      <div class="px-4 pb-6">
        <!-- Direct conversations -->
        @if (tab() === 'direct') {
          @if (loadingDirect() && conversations().length === 0) {
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
        }

        <!-- Channels -->
        @if (tab() === 'channels') {
          @if (loadingChannels() && channels().length === 0) {
            <div class="cxm-loading">
              <div class="cxm-loading-dots"><span></span><span></span><span></span></div>
              <span class="cxm-loading-text">Loading channels...</span>
            </div>
          } @else if (channels().length === 0) {
            <div class="cxm-empty">
              <div class="cxm-empty-icon">
                <ion-icon name="megaphone-outline" style="font-size: 24px"></ion-icon>
              </div>
              <div class="cxm-empty-title">No channels yet</div>
              <div class="cxm-empty-desc">You'll see channels here once you've been added to one.</div>
            </div>
          } @else {
            <div class="flex flex-col gap-2 cxm-stagger">
              @for (ch of channels(); track ch.id) {
                <a [routerLink]="['/channels', ch.id]" class="cxm-row">
                  <div class="cxm-avatar cxm-avatar-primary">
                    <ion-icon
                      [name]="ch.type === 'channel' ? 'megaphone-outline' : 'people-outline'"
                      style="font-size: 16px"></ion-icon>
                  </div>
                  <div class="cxm-row-main">
                    <div class="flex items-center justify-between gap-2">
                      <span class="cxm-row-primary">{{ ch.name }}</span>
                      @if (ch.type === 'channel') {
                        <span class="cxm-chip">Channel</span>
                      } @else {
                        <span class="cxm-chip cxm-chip-gold">Group</span>
                      }
                    </div>
                    <div class="flex items-center gap-2 mt-0.5">
                      <ion-icon name="people-outline" style="font-size: 11px; color: var(--cx-text-muted)"></ion-icon>
                      <span class="cxm-row-secondary" style="margin: 0">
                        {{ ch.member_count || 0 }} {{ ch.member_count === 1 ? 'member' : 'members' }}
                      </span>
                      @if (ch.description) {
                        <span class="cxm-row-secondary" style="margin: 0 0 0 4px">· {{ ch.description }}</span>
                      }
                    </div>
                  </div>
                </a>
              }
            </div>
          }
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

    /* Tab strip — pills with active state, badge counts */
    .cxm-tabs-row {
      display: flex;
      gap: 8px;
      padding: 0 16px 12px;
    }
    .cxm-tab {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 10px 14px;
      background: var(--cx-surface-muted, rgba(0,0,0,0.03));
      color: var(--cx-text-secondary);
      border: 1px solid var(--cx-border-subtle);
      border-radius: var(--cx-radius-md);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-tab.is-active {
      background: var(--cx-primary-50, rgba(10, 79, 42, 0.06));
      color: var(--cx-primary-700);
      border-color: var(--cx-primary-200, rgba(10, 79, 42, 0.2));
      font-weight: 600;
    }
    .cxm-tab:active { transform: scale(0.98); }

    .cxm-tab-count {
      padding: 1px 6px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border-subtle);
      border-radius: var(--cx-radius-pill);
      font-size: 10px;
      font-weight: 600;
    }
    .cxm-tab.is-active .cxm-tab-count {
      background: var(--cx-primary-700);
      color: #fff;
      border-color: var(--cx-primary-700);
    }

    /* Channel row chips — small type labels */
    .cxm-chip {
      padding: 2px 8px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border-subtle);
      border-radius: var(--cx-radius-pill);
      font-size: 10px;
      font-weight: 500;
      color: var(--cx-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.03em;
      flex-shrink: 0;
    }
    .cxm-chip.cxm-chip-gold {
      background: rgba(201, 162, 39, 0.1);
      border-color: rgba(201, 162, 39, 0.3);
      color: var(--cx-gold-700, #8a6f1a);
    }

    .cxm-avatar-primary {
      background: linear-gradient(135deg, var(--cx-primary-600), var(--cx-primary-500));
      color: #fff;
    }
  `],
})
export class MessagesPage implements OnInit {
  tab = signal<'direct' | 'channels'>('direct');

  conversations = signal<any[]>([]);
  channels = signal<any[]>([]);

  loadingDirect = signal(true);
  loadingChannels = signal(false);

  // Track whether each tab's initial load has happened so switching
  // back doesn't re-fetch needlessly.
  private directLoaded = false;
  private channelsLoaded = false;

  constructor(private api: ApiService) {
    addIcons({ addOutline, chatbubbleEllipsesOutline, timeOutline, peopleOutline, megaphoneOutline });
  }

  ngOnInit(): void {
    this.loadConversations();
  }

  switchTab(t: 'direct' | 'channels'): void {
    if (this.tab() === t) return;
    this.tab.set(t);
    if (t === 'direct' && !this.directLoaded) this.loadConversations();
    if (t === 'channels' && !this.channelsLoaded) this.loadChannels();
  }

  loadConversations(): void {
    this.loadingDirect.set(true);
    this.api.get('/conversations', { per_page: 50 }).subscribe({
      next: res => {
        this.conversations.set(res.data || []);
        this.loadingDirect.set(false);
        this.directLoaded = true;
      },
      error: () => { this.loadingDirect.set(false); this.directLoaded = true; },
    });
  }

  loadChannels(): void {
    this.loadingChannels.set(true);
    this.api.get('/channels').subscribe({
      next: res => {
        this.channels.set(res.data || []);
        this.loadingChannels.set(false);
        this.channelsLoaded = true;
      },
      error: () => { this.loadingChannels.set(false); this.channelsLoaded = true; },
    });
  }

  doRefresh(event: any): void {
    // Reload whichever tab is active. The inactive tab's cached state
    // stays — user can pull-refresh it themselves if they switch.
    if (this.tab() === 'direct') this.loadConversations();
    else this.loadChannels();
    setTimeout(() => event.target.complete(), 800);
  }
}
