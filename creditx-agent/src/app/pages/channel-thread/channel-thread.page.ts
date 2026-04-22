import { Component, OnInit, OnDestroy, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonSpinner, IonIcon, IonFooter } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { sendOutline, peopleOutline, closeOutline, megaphoneOutline, informationCircleOutline } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

/**
 * Channel thread — message display + composer for a single channel.
 *
 * Route: /channels/:id
 *
 * Differs from message-thread (1:1 DMs) in three ways:
 *
 *   1. Many senders. Each bubble shows the sender's name as a small
 *      header above the body (absent in 1:1 since the other party is
 *      fixed). "My" messages still suppress the name label since the
 *      agent is looking at their own outgoing bubble.
 *
 *   2. Channel metadata. The header shows the channel name. Tapping
 *      it (or the info icon) opens a member-list bottom sheet.
 *
 *   3. Different endpoints. GET /api/channels/:id for metadata,
 *      GET /api/channels/:id/messages for the thread, GET /:id/members
 *      for the participant list, POST /:id/messages to send.
 *
 * The message bubble styling matches the 1:1 thread exactly — agents
 * shouldn't have to learn a new visual language when they switch tabs.
 */
@Component({
  selector: 'app-channel-thread',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonSpinner, IonIcon, IonFooter],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/messages"></ion-back-button></ion-buttons>
        <ion-title>
          <button class="cxm-ch-title-btn" (click)="openMembers()">
            <ion-icon
              [name]="channel()?.type === 'channel' ? 'megaphone-outline' : 'people-outline'"
              style="font-size: 14px; flex-shrink: 0"></ion-icon>
            <span class="cxm-ch-title-text">{{ channel()?.name || 'Channel' }}</span>
          </button>
        </ion-title>
        <ion-buttons slot="end">
          <button class="cxm-ch-info-btn" (click)="openMembers()" aria-label="Members">
            <ion-icon name="information-circle-outline" style="font-size: 20px"></ion-icon>
          </button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true">
      @if (loading()) {
        <div class="cxm-loading">
          <div class="cxm-loading-dots"><span></span><span></span><span></span></div>
          <span class="cxm-loading-text">Loading messages...</span>
        </div>
      } @else if (messages().length === 0) {
        <div class="cxm-empty">
          <div class="cxm-empty-icon">
            <ion-icon name="megaphone-outline" style="font-size: 24px"></ion-icon>
          </div>
          <div class="cxm-empty-title">No messages yet</div>
          <div class="cxm-empty-desc">Be the first to post in this {{ channel()?.type === 'channel' ? 'channel' : 'group' }}.</div>
        </div>
      } @else {
        <div class="cxm-thread">
          @for (msg of messages(); track msg.id) {
            <div class="cxm-bubble-row" [class.is-me]="msg.sender_id === userId">
              <div class="cxm-avatar cxm-avatar-sm" [class.cxm-avatar-gold]="msg.sender_id !== userId">
                {{ getInitial(msg) }}
              </div>
              <div class="cxm-bubble-col">
                @if (msg.sender_id !== userId) {
                  <div class="cxm-bubble-sender">{{ msg.sender_name || 'Unknown' }}</div>
                }
                <div class="cxm-bubble" [class.is-me]="msg.sender_id === userId">
                  <div class="cxm-bubble-text">{{ msg.body }}</div>
                </div>
                <div class="cxm-bubble-time tabular-nums">{{ msg.created_at }}</div>
              </div>
            </div>
          }
        </div>
      }
    </ion-content>

    <ion-footer class="ion-no-border">
      <div class="cxm-composer">
        <input type="text" class="cxm-composer-input"
               [(ngModel)]="messageText"
               placeholder="Message {{ channel()?.name || 'channel' }}..."
               (keyup.enter)="send()" />
        <button class="cxm-composer-send"
                [disabled]="sending() || !messageText.trim()" (click)="send()">
          @if (sending()) {
            <ion-spinner name="crescent" style="width: 16px; height: 16px"></ion-spinner>
          } @else {
            <ion-icon name="send-outline" style="font-size: 16px"></ion-icon>
          }
        </button>
      </div>
    </ion-footer>

    <!-- Member list bottom sheet -->
    @if (membersOpen()) {
      <div class="cxm-sheet-backdrop" (click)="closeMembers()"></div>
      <div class="cxm-sheet cx-animate-in">
        <div class="cxm-sheet-handle"></div>
        <div class="cxm-sheet-head">
          <div class="cxm-sheet-title-row">
            <ion-icon
              [name]="channel()?.type === 'channel' ? 'megaphone-outline' : 'people-outline'"
              style="font-size: 18px; color: var(--cx-primary-700)"></ion-icon>
            <div class="cxm-sheet-titles">
              <h3 class="cxm-sheet-title">{{ channel()?.name || 'Channel' }}</h3>
              @if (channel()?.description) {
                <p class="cxm-sheet-sub">{{ channel()?.description }}</p>
              }
            </div>
            <button class="cxm-sheet-close" (click)="closeMembers()" aria-label="Close">
              <ion-icon name="close-outline" style="font-size: 18px"></ion-icon>
            </button>
          </div>
        </div>

        <div class="cxm-sheet-body">
          <div class="cxm-sheet-section-title">
            Members · {{ members().length }}
          </div>
          @if (membersLoading()) {
            <div class="cxm-loading" style="padding: 24px 0">
              <div class="cxm-loading-dots"><span></span><span></span><span></span></div>
            </div>
          } @else if (members().length === 0) {
            <div class="cxm-sheet-empty">No members</div>
          } @else {
            <div class="cxm-member-list">
              @for (m of members(); track m.id) {
                <div class="cxm-member-row">
                  <div class="cxm-avatar cxm-avatar-sm cxm-avatar-gold">
                    {{ (m.user_name || '?').charAt(0).toUpperCase() }}
                  </div>
                  <div class="cxm-member-meta">
                    <div class="cxm-member-name">{{ m.user_name }}</div>
                    @if (m.email) {
                      <div class="cxm-member-sub">{{ m.email }}</div>
                    }
                  </div>
                  @if (m.role === 'admin') {
                    <span class="cxm-chip cxm-chip-gold">Admin</span>
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    /* Title button — clickable area around name for opening member sheet */
    .cxm-ch-title-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      margin: 0 -8px;
      background: transparent;
      border: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
      border-radius: var(--cx-radius-sm);
      max-width: 100%;
      min-width: 0;
    }
    .cxm-ch-title-btn:active { background: var(--cx-surface-muted, rgba(0,0,0,0.04)); }
    .cxm-ch-title-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .cxm-ch-info-btn {
      width: 40px; height: 40px;
      display: flex; align-items: center; justify-content: center;
      background: transparent; border: none; color: var(--cx-text-secondary);
      cursor: pointer;
    }

    /* Thread bubble layout — mirrors message-thread exactly */
    .cxm-thread {
      padding: 16px;
      padding-bottom: 80px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .cxm-bubble-row {
      display: flex;
      gap: 8px;
      max-width: 85%;
    }
    .cxm-bubble-row.is-me {
      flex-direction: row-reverse;
      align-self: flex-end;
    }
    .cxm-bubble-col {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .cxm-bubble-row.is-me .cxm-bubble-col { align-items: flex-end; }
    .cxm-bubble-sender {
      font-size: 10px;
      color: var(--cx-text-muted);
      margin-bottom: 2px;
      padding: 0 2px;
      font-weight: 500;
    }
    .cxm-bubble {
      padding: 9px 13px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border-subtle);
      border-radius: var(--cx-radius-lg);
      border-top-left-radius: var(--cx-radius-sm);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      line-height: 1.5;
      word-break: break-word;
    }
    .cxm-bubble.is-me {
      background: var(--cx-primary-600);
      color: #fff;
      border-color: var(--cx-primary-600);
      border-top-left-radius: var(--cx-radius-lg);
      border-top-right-radius: var(--cx-radius-sm);
    }
    .cxm-bubble-text { white-space: pre-wrap; }
    .cxm-bubble-time {
      font-size: 10px;
      color: var(--cx-text-subtle, var(--cx-text-muted));
      margin-top: 3px;
      padding: 0 2px;
    }

    /* Composer — identical to message-thread */
    .cxm-composer {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: var(--cx-surface);
      border-top: 1px solid var(--cx-border);
      padding-bottom: calc(10px + env(safe-area-inset-bottom));
    }
    .cxm-composer-input {
      flex: 1;
      padding: 10px 16px;
      background: var(--cx-surface-2);
      border: 1px solid transparent;
      border-radius: var(--cx-radius-pill);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      outline: none;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-composer-input:focus {
      background: var(--cx-surface);
      border-color: var(--cx-primary-600);
    }
    .cxm-composer-send {
      width: 40px; height: 40px;
      border-radius: 50%;
      background: var(--cx-primary-600);
      color: #fff;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--cx-shadow-sm);
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cxm-composer-send:disabled {
      opacity: 0.4;
      box-shadow: none;
    }
    .cxm-composer-send:not(:disabled):active {
      transform: scale(0.92);
      background: var(--cx-primary-700);
    }

    /* Member bottom sheet */
    .cxm-sheet-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      z-index: 100;
    }
    .cxm-sheet {
      position: fixed;
      left: 0; right: 0; bottom: 0;
      max-height: 80vh;
      background: var(--cx-surface);
      border-top-left-radius: 20px;
      border-top-right-radius: 20px;
      z-index: 101;
      display: flex;
      flex-direction: column;
      padding-bottom: env(safe-area-inset-bottom);
    }
    .cxm-sheet-handle {
      width: 36px; height: 4px;
      background: var(--cx-border);
      border-radius: 2px;
      margin: 8px auto 4px;
      flex-shrink: 0;
    }
    .cxm-sheet-head {
      padding: 12px 16px 8px;
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cxm-sheet-title-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .cxm-sheet-titles {
      flex: 1;
      min-width: 0;
    }
    .cxm-sheet-title {
      margin: 0;
      font-size: var(--cx-text-md);
      font-weight: 600;
      color: var(--cx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cxm-sheet-sub {
      margin: 2px 0 0;
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
    }
    .cxm-sheet-close {
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      background: var(--cx-surface-muted, rgba(0,0,0,0.04));
      border: none;
      border-radius: 50%;
      color: var(--cx-text-secondary);
      cursor: pointer;
    }
    .cxm-sheet-body {
      flex: 1;
      overflow-y: auto;
      padding: 8px 16px 16px;
    }
    .cxm-sheet-section-title {
      font-size: 10px;
      font-weight: 600;
      color: var(--cx-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 8px 0 6px;
    }
    .cxm-sheet-empty {
      padding: 24px 0;
      text-align: center;
      color: var(--cx-text-muted);
      font-size: var(--cx-text-sm);
    }
    .cxm-member-list {
      display: flex;
      flex-direction: column;
    }
    .cxm-member-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 0;
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cxm-member-row:last-child { border-bottom: none; }
    .cxm-member-meta {
      flex: 1;
      min-width: 0;
    }
    .cxm-member-name {
      font-size: var(--cx-text-sm);
      font-weight: 500;
      color: var(--cx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cxm-member-sub {
      font-size: 11px;
      color: var(--cx-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
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
  `],
})
export class ChannelThreadPage implements OnInit, OnDestroy {
  @Input() id = '';

  channel = signal<any>(null);
  messages = signal<any[]>([]);
  members = signal<any[]>([]);

  loading = signal(true);
  sending = signal(false);
  membersOpen = signal(false);
  membersLoading = signal(false);

  messageText = '';
  userId = '';

  // Track whether members have been loaded this session. Opening the
  // sheet again after a first load re-shows cached — agent can pull to
  // refresh (or tap in and back out) if someone new joined.
  private membersLoaded = false;

  /**
   * Polling interval for new messages. Real-time delivery (WebSocket /
   * SSE) would be fancier but costs infra; a 10s poll while the thread
   * is open is cheap and Good Enough for typical channel chat cadence.
   * Interval cleared in ngOnDestroy so we don't leak timers across
   * route changes.
   */
  private pollTimer: any = null;
  private readonly POLL_INTERVAL_MS = 10000;

  constructor(private api: ApiService, private auth: AuthService) {
    addIcons({ sendOutline, peopleOutline, closeOutline, megaphoneOutline, informationCircleOutline });
    this.userId = this.auth.user()?.id || '';
  }

  ngOnInit(): void {
    if (!this.id) {
      this.loading.set(false);
      return;
    }
    this.loadChannel();
    this.loadMessages();
    this.markRead();
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  /**
   * Load channel metadata. The backend doesn't expose a GET /channels/:id
   * endpoint for a single channel, so we pull the whole list and find
   * our one. For a small channel count this is fine; if the list grows
   * we can add a dedicated single-fetch endpoint.
   */
  loadChannel(): void {
    this.api.get('/channels').subscribe({
      next: res => {
        const all = res.data || [];
        const found = all.find((c: any) => c.id === this.id);
        if (found) this.channel.set(found);
      },
    });
  }

  loadMessages(): void {
    this.loading.set(true);
    this.api.get(`/channels/${this.id}/messages`).subscribe({
      next: res => {
        this.messages.set(res.data || []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /**
   * Quiet refetch for the polling loop. Doesn't flip the loading flag
   * (that would make the UI flicker a loading indicator every 10s) and
   * doesn't swallow errors loudly — a transient network failure during
   * polling shouldn't blow up the UI.
   *
   * If the server returns a different set of messages than we have
   * in-memory (new arrivals), the signal update re-renders the thread.
   * Angular's change detection + @for's track-by-id keeps existing
   * bubbles stable; only the new ones animate in.
   */
  private pollMessages(): void {
    // Silent poll: every 10s while the thread is open. A transient
    // failure shouldn't fire a toast — the next tick retries.
    this.api.get(`/channels/${this.id}/messages`, undefined, { silent: true }).subscribe({
      next: res => {
        const incoming = res.data || [];
        // Only update if the count changed or last-id differs — avoids
        // needless re-renders when nothing's new.
        const cur = this.messages();
        if (incoming.length !== cur.length ||
            (incoming.length && cur.length && incoming[incoming.length - 1].id !== cur[cur.length - 1].id)) {
          this.messages.set(incoming);
          // New messages arrived — mark them read since the user is looking
          // at the thread right now.
          this.markRead();
        }
      },
      error: () => { /* swallow — next tick will retry */ },
    });
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.pollMessages(), this.POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Mark this channel as read. Fires on thread open and whenever new
   * messages arrive via polling while the thread is in view. Best-effort
   * — failures are silent since mark-read is idempotent (next success
   * just moves the timestamp forward).
   */
  markRead(): void {
    // Silent: mark-read is idempotent and high-frequency; a failed
    // call is corrected on the next thread open or polling tick.
    this.api.post(`/channels/${this.id}/mark-read`, {}, { silent: true }).subscribe({
      next: () => {},
      error: () => {},
    });
  }

  loadMembers(): void {
    if (this.membersLoaded) return;
    this.membersLoading.set(true);
    this.api.get(`/channels/${this.id}/members`).subscribe({
      next: res => {
        this.members.set(res.data || []);
        this.membersLoading.set(false);
        this.membersLoaded = true;
      },
      error: () => this.membersLoading.set(false),
    });
  }

  send(): void {
    const body = this.messageText.trim();
    if (!body || this.sending()) return;
    this.sending.set(true);
    this.api.post(`/channels/${this.id}/messages`, { body }).subscribe({
      next: res => {
        // Append optimistically — the returned message has the real
        // id, created_at, and sender info so we don't need a reload.
        this.messages.update(msgs => [...msgs, res.data]);
        this.messageText = '';
        this.sending.set(false);
      },
      error: () => this.sending.set(false),
    });
  }

  openMembers(): void {
    this.membersOpen.set(true);
    this.loadMembers();
  }

  closeMembers(): void {
    this.membersOpen.set(false);
  }

  getInitial(msg: any): string {
    const name = msg.sender_name || (msg.sender_id === this.userId ? (this.auth.user()?.first_name || 'M') : '?');
    return (name || '?').charAt(0).toUpperCase();
  }
}
