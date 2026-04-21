import { Component, OnInit, signal, Input, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonSpinner, IonIcon, IonFooter } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { sendOutline, attachOutline } from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-message-thread',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonHeader, IonToolbar, IonTitle, IonBackButton, IonButtons, IonSpinner, IonIcon, IonFooter],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/messages"></ion-back-button></ion-buttons>
        <ion-title>{{ conversation()?.subject || 'Thread' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      @if (loading()) {
        <div class="cxm-loading">
          <div class="cxm-loading-dots"><span></span><span></span><span></span></div>
          <span class="cxm-loading-text">Loading thread...</span>
        </div>
      } @else if (messages().length === 0) {
        <div class="cxm-empty">
          <div class="cxm-empty-icon">
            <ion-icon name="chatbubble-outline" style="font-size: 24px"></ion-icon>
          </div>
          <div class="cxm-empty-title">No messages yet</div>
          <div class="cxm-empty-desc">Send a message to start the conversation.</div>
        </div>
      } @else {
        <div class="cxm-thread">
          @for (msg of messages(); track msg.id) {
            <div class="cxm-bubble-row" [class.is-me]="msg.sender_id === userId">
              <div class="cxm-avatar cxm-avatar-sm" [class.cxm-avatar-gold]="msg.sender_id !== userId">
                {{ getInitial(msg) }}
              </div>
              <div class="cxm-bubble-col">
                @if (msg.sender_id !== userId && msg.sender_name) {
                  <div class="cxm-bubble-sender">{{ msg.sender_name }}</div>
                }
                <div class="cxm-bubble" [class.is-me]="msg.sender_id === userId">
                  <div class="cxm-bubble-text">{{ msg.body }}</div>
                  @if (msg.attachment_name) {
                    <div class="cxm-bubble-attach">
                      <ion-icon name="attach-outline" style="font-size: 12px"></ion-icon>
                      <span>{{ msg.attachment_name }}</span>
                    </div>
                  }
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
               [(ngModel)]="messageText" placeholder="Type a message..." (keyup.enter)="send()" />
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
  `,
  styles: [`
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
    .cxm-bubble-attach {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 5px;
      padding-top: 5px;
      border-top: 1px solid rgba(255, 255, 255, 0.15);
      font-size: 10px;
      opacity: 0.85;
    }
    .cxm-bubble:not(.is-me) .cxm-bubble-attach {
      border-top-color: var(--cx-border-subtle);
      color: var(--cx-text-muted);
    }
    .cxm-bubble-time {
      font-size: 10px;
      color: var(--cx-text-subtle, var(--cx-text-muted));
      margin-top: 3px;
      padding: 0 2px;
    }

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
  `],
})
export class MessageThreadPage implements OnInit {
  @Input() id = '';
  conversation = signal<any>(null);
  messages = signal<any[]>([]);
  loading = signal(true);
  sending = signal(false);
  messageText = '';
  userId = '';

  constructor(private api: ApiService, private auth: AuthService) {
    addIcons({ sendOutline, attachOutline });
    this.userId = this.auth.user()?.id || '';
  }

  ngOnInit(): void {
    if (this.id) {
      this.api.get(`/conversations/${this.id}`).subscribe({
        next: res => {
          this.conversation.set(res.data);
          this.messages.set(res.data?.messages || []);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    }
  }

  send(): void {
    if (!this.messageText.trim()) return;
    this.sending.set(true);
    this.api.post(`/conversations/${this.id}/messages`, { message: this.messageText }).subscribe({
      next: res => {
        this.messages.update(msgs => [...msgs, res.data]);
        this.messageText = '';
        this.sending.set(false);
      },
      error: () => this.sending.set(false),
    });
  }

  getInitial(msg: any): string {
    const name = msg.sender_name || (msg.sender_id === this.userId ? (this.auth.user()?.first_name || 'M') : '?');
    return (name || '?').charAt(0).toUpperCase();
  }
}
