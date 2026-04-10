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
        <div class="flex justify-center py-16"><ion-spinner name="crescent"></ion-spinner></div>
      } @else {
        <div class="p-4 space-y-3 pb-20">
          @for (msg of messages(); track msg.id) {
            <div class="flex" [class]="msg.sender_id === userId ? 'justify-end' : 'justify-start'">
              <div class="max-w-[80%] p-3 rounded-2xl text-sm"
                   [class]="msg.sender_id === userId ? 'bg-[#0A4F2A] text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'">
                <div>{{ msg.body }}</div>
                @if (msg.attachment_name) {
                  <div class="mt-1 text-xs opacity-70 flex items-center gap-1">
                    <ion-icon name="attach-outline" class="text-xs"></ion-icon> {{ msg.attachment_name }}
                  </div>
                }
                <div class="text-[10px] mt-1 opacity-60 text-right">{{ msg.created_at }}</div>
              </div>
            </div>
          }
        </div>
      }
    </ion-content>
    <ion-footer class="ion-no-border">
      <div class="flex items-center gap-2 p-3 bg-white border-t border-gray-100">
        <input type="text" class="flex-1 px-4 py-2.5 rounded-full bg-gray-100 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-[#0A4F2A]/20"
               [(ngModel)]="messageText" placeholder="Type a message..." (keyup.enter)="send()" />
        <button class="w-10 h-10 rounded-full bg-[#0A4F2A] text-white flex items-center justify-center disabled:opacity-50"
                [disabled]="sending() || !messageText.trim()" (click)="send()">
          @if (sending()) { <ion-spinner name="crescent" class="w-4 h-4"></ion-spinner> }
          @else { <ion-icon name="send-outline"></ion-icon> }
        </button>
      </div>
    </ion-footer>
  `,
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
}
