import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonRefresher, IonRefresherContent } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline, chatbubbleEllipsesOutline, timeOutline, peopleOutline, megaphoneOutline,
  ellipsisVerticalOutline, notificationsOffOutline, notificationsOutline,
  pinOutline, archiveOutline, closeOutline
} from 'ionicons/icons';
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
                <div class="cxm-row-wrap">
                  <a [routerLink]="['/channels', ch.id]" class="cxm-row">
                    <div class="cxm-avatar cxm-avatar-primary">
                      <ion-icon
                        [name]="ch.type === 'channel' ? 'megaphone-outline' : 'people-outline'"
                        style="font-size: 16px"></ion-icon>
                    </div>
                    <div class="cxm-row-main">
                      <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-1 min-w-0 flex-1">
                          @if (ch.is_pinned) {
                            <ion-icon name="pin-outline" style="font-size: 11px; color: var(--cx-gold-700, #8a6f1a); flex-shrink: 0"></ion-icon>
                          }
                          <span class="cxm-row-primary truncate">{{ ch.name }}</span>
                          @if (ch.is_muted) {
                            <ion-icon name="notifications-off-outline" style="font-size: 11px; color: var(--cx-text-muted); flex-shrink: 0"></ion-icon>
                          }
                        </div>
                        @if (ch.unread_count > 0) {
                          <span class="cxm-unread-dot tabular-nums">{{ ch.unread_count > 99 ? '99+' : ch.unread_count }}</span>
                        }
                      </div>
                      <div class="flex items-center gap-2 mt-0.5">
                        <ion-icon name="people-outline" style="font-size: 11px; color: var(--cx-text-muted)"></ion-icon>
                        <span class="cxm-row-secondary" style="margin: 0">
                          {{ ch.member_count || 0 }} {{ ch.member_count === 1 ? 'member' : 'members' }}
                        </span>
                        @if (ch.description) {
                          <span class="cxm-row-secondary truncate" style="margin: 0 0 0 4px">· {{ ch.description }}</span>
                        }
                      </div>
                    </div>
                  </a>
                  <button class="cxm-row-more" (click)="openChannelMenu(ch)" aria-label="More">
                    <ion-icon name="ellipsis-vertical-outline" style="font-size: 18px"></ion-icon>
                  </button>
                </div>
              }
            </div>
          }
        }
      </div>

      <!-- Archived toggle -->
      @if (tab() === 'channels' && (channels().length > 0 || showArchived())) {
        <div class="cxm-archive-toggle-row">
          <button class="cxm-archive-toggle" (click)="toggleArchived()">
            <ion-icon name="archive-outline" style="font-size: 13px"></ion-icon>
            <span>{{ showArchived() ? 'Hide archived' : 'Show archived' }}</span>
          </button>
        </div>
      }

      <!-- Channel action sheet -->
      @if (menuChannel(); as mc) {
        <div class="cxm-sheet-backdrop" (click)="closeChannelMenu()"></div>
        <div class="cxm-sheet cx-animate-in">
          <div class="cxm-sheet-handle"></div>
          <div class="cxm-sheet-head">
            <h3 class="cxm-sheet-title">{{ mc.name }}</h3>
            <button class="cxm-sheet-close" (click)="closeChannelMenu()" aria-label="Close">
              <ion-icon name="close-outline" style="font-size: 18px"></ion-icon>
            </button>
          </div>
          <div class="cxm-sheet-actions">
            <button class="cxm-sheet-action" (click)="togglePin(mc)">
              <ion-icon name="pin-outline" style="font-size: 18px"></ion-icon>
              <span>{{ mc.is_pinned ? 'Unpin' : 'Pin to top' }}</span>
            </button>
            <button class="cxm-sheet-action" (click)="toggleMute(mc)">
              <ion-icon [name]="mc.is_muted ? 'notifications-outline' : 'notifications-off-outline'" style="font-size: 18px"></ion-icon>
              <span>{{ mc.is_muted ? 'Unmute notifications' : 'Mute notifications' }}</span>
            </button>
            <button class="cxm-sheet-action" (click)="toggleArchive(mc)">
              <ion-icon name="archive-outline" style="font-size: 18px"></ion-icon>
              <span>{{ mc.archived_at ? 'Unarchive' : 'Archive' }}</span>
            </button>
          </div>
        </div>
      }
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

    /* Truncate helper for text inside flex rows */
    .truncate {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Row-wrap holds the tappable row + the overflow button side-by-side */
    .cxm-row-wrap {
      display: flex;
      align-items: stretch;
      gap: 4px;
    }
    .cxm-row-wrap .cxm-row { flex: 1; min-width: 0; }

    .cxm-row-more {
      width: 36px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: var(--cx-radius-md);
      color: var(--cx-text-muted);
      cursor: pointer;
    }
    .cxm-row-more:active {
      background: var(--cx-surface-muted, rgba(0,0,0,0.04));
      transform: scale(0.95);
    }

    /* Show-archived toggle */
    .cxm-archive-toggle-row {
      display: flex;
      justify-content: center;
      padding: 8px 16px 24px;
    }
    .cxm-archive-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: transparent;
      border: 1px solid var(--cx-border-subtle);
      border-radius: var(--cx-radius-pill);
      font-size: 11px;
      font-weight: 500;
      color: var(--cx-text-secondary);
      cursor: pointer;
    }
    .cxm-archive-toggle:active {
      background: var(--cx-surface-muted, rgba(0,0,0,0.04));
      transform: scale(0.98);
    }

    /* Action sheet (channel overflow menu) */
    .cxm-sheet-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      z-index: 100;
    }
    .cxm-sheet {
      position: fixed;
      left: 0; right: 0; bottom: 0;
      background: var(--cx-surface);
      border-top-left-radius: 20px;
      border-top-right-radius: 20px;
      z-index: 101;
      padding-bottom: env(safe-area-inset-bottom);
    }
    .cxm-sheet-handle {
      width: 36px; height: 4px;
      background: var(--cx-border);
      border-radius: 2px;
      margin: 8px auto 4px;
    }
    .cxm-sheet-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 16px 12px;
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cxm-sheet-title {
      margin: 0;
      font-size: var(--cx-text-md);
      font-weight: 600;
      color: var(--cx-text);
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cxm-sheet-close {
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      background: var(--cx-surface-muted, rgba(0,0,0,0.04));
      border: none;
      border-radius: 50%;
      color: var(--cx-text-secondary);
      cursor: pointer;
      flex-shrink: 0;
    }
    .cxm-sheet-actions {
      display: flex;
      flex-direction: column;
      padding: 8px 4px 12px;
    }
    .cxm-sheet-action {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 20px;
      background: transparent;
      border: none;
      text-align: left;
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      cursor: pointer;
      border-radius: var(--cx-radius-md);
      margin: 0 8px;
    }
    .cxm-sheet-action:active {
      background: var(--cx-surface-muted, rgba(0,0,0,0.05));
    }
  `],
})
export class MessagesPage implements OnInit {
  tab = signal<'direct' | 'channels'>('direct');

  conversations = signal<any[]>([]);
  channels = signal<any[]>([]);

  loadingDirect = signal(true);
  loadingChannels = signal(false);

  /**
   * Action-sheet state — the channel whose '⋯' was tapped. Null means
   * the sheet is closed. We store the whole channel object (not just
   * the id) so the sheet can read current state (is_pinned, is_muted,
   * archived_at) to label its buttons correctly without re-looking-up.
   */
  menuChannel = signal<any | null>(null);

  /**
   * Whether to include archived channels in the list. Off by default
   * — archive is 'out of sight, out of mind' with a footer link to
   * un-hide.
   */
  showArchived = signal(false);

  // Track whether each tab's initial load has happened so switching
  // back doesn't re-fetch needlessly.
  private directLoaded = false;
  private channelsLoaded = false;

  constructor(private api: ApiService) {
    addIcons({
      addOutline, chatbubbleEllipsesOutline, timeOutline, peopleOutline, megaphoneOutline,
      ellipsisVerticalOutline, notificationsOffOutline, notificationsOutline,
      pinOutline, archiveOutline, closeOutline,
    });
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
    const params: any = {};
    if (this.showArchived()) params.include_archived = 1;
    this.api.get('/channels', params).subscribe({
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

  toggleArchived(): void {
    this.showArchived.update(v => !v);
    this.loadChannels();
  }

  // ── Per-channel action sheet ──────────────────────────────────────

  openChannelMenu(ch: any): void {
    this.menuChannel.set(ch);
  }

  closeChannelMenu(): void {
    this.menuChannel.set(null);
  }

  /**
   * Toggle a single flag on the caller's ChannelMember row. Optimistic:
   * we update the in-memory channels list immediately, then PATCH the
   * server. On success: no-op (the UI is already correct). On error:
   * reload the channel list to reconcile state.
   *
   * The sheet stays open so the user can flip multiple settings (e.g.
   * pin + mute) without repeatedly tapping ⋯. They close it via the
   * backdrop or X.
   */
  private patchMemberSettings(ch: any, patch: any): void {
    // Optimistic UI update — merge patch into the channel row in-place.
    this.channels.update(list =>
      list.map(c => c.id === ch.id ? { ...c, ...patch } : c)
    );
    // Keep the menuChannel signal in sync so the sheet labels update.
    this.menuChannel.update(m => m && m.id === ch.id ? { ...m, ...patch } : m);

    this.api.patch(`/channels/${ch.id}/member-settings`, patch).subscribe({
      next: () => {},
      error: () => {
        // Revert via full reload — cheap for small channel lists
        this.loadChannels();
      },
    });
  }

  togglePin(ch: any): void {
    this.patchMemberSettings(ch, { is_pinned: !ch.is_pinned });
  }

  toggleMute(ch: any): void {
    this.patchMemberSettings(ch, { is_muted: !ch.is_muted });
  }

  toggleArchive(ch: any): void {
    const archived = ch.archived_at === null || ch.archived_at === undefined || ch.archived_at === '';
    // archived is true when we WANT to archive; ch.archived_at absent
    // means currently not archived.
    this.patchMemberSettings(ch, { archived: archived });
    // Close the sheet — archive typically removes the row from view,
    // so keeping the sheet open would feel broken.
    this.closeChannelMenu();
    // If we just archived and we're not showing archived, the row will
    // vanish from the list on next reload. Force a reload so sorting
    // and filter apply.
    if (archived && !this.showArchived()) {
      setTimeout(() => this.loadChannels(), 100);
    }
  }
}
