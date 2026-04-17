import { Component, OnInit, OnDestroy, signal, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'cx-floating-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <!-- Floating Button -->
    @if (!isOpen()) {
      <button class="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 w-14 h-14 rounded-full bg-[var(--cx-primary)] text-white shadow-xl flex items-center justify-center hover:scale-105 transition-transform"
              (click)="toggle()">
        <lucide-icon name="message-square" [size]="22"></lucide-icon>
        @if (unreadCount() > 0) {
          <span class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--cx-danger)] text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
            {{ unreadCount() > 9 ? '9+' : unreadCount() }}
          </span>
        }
      </button>
    }

    <!-- Chat Window -->
    @if (isOpen()) {
      <div class="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-50 w-[360px] max-h-[520px] bg-[var(--cx-surface)] border border-[var(--cx-border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden cx-animate-in">

        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 bg-[var(--cx-primary)] text-white flex-shrink-0">
          @if (activeChannel()) {
            <div class="flex items-center gap-2 min-w-0">
              <button (click)="backToList()" class="hover:opacity-80"><lucide-icon name="chevron-left" [size]="18"></lucide-icon></button>
              <span class="text-sm font-semibold truncate">{{ activeChannel()?.name }}</span>
            </div>
          } @else {
            <span class="text-sm font-semibold">Messages</span>
          }
          <div class="flex items-center gap-1">
            @if (!activeChannel()) {
              <button class="w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors" (click)="showCreate.set(true)">
                <lucide-icon name="plus" [size]="16"></lucide-icon>
              </button>
            }
            <button class="w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors" (click)="toggle()">
              <lucide-icon name="x" [size]="16"></lucide-icon>
            </button>
          </div>
        </div>

        <!-- Channel List -->
        @if (!activeChannel() && !showCreate()) {
          <div class="flex-1 overflow-y-auto">
            @if (channels().length === 0) {
              <div class="flex flex-col items-center justify-center py-12 px-4">
                <lucide-icon name="message-square" [size]="36" class="text-[var(--cx-text-muted)] opacity-30 mb-2"></lucide-icon>
                <p class="text-xs text-[var(--cx-text-muted)] text-center">No channels yet. Create one to start messaging.</p>
              </div>
            }
            @for (ch of channels(); track ch.id) {
              <button class="w-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--cx-surface-hover)] transition-colors border-b border-[var(--cx-border)] text-left"
                      (click)="openChannel(ch)">
                <div class="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                     [style.background]="ch.type === 'channel' ? '#2563eb' : '#0A4F2A'">
                  {{ ch.name[0] }}{{ ch.name[1] || '' }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-[var(--cx-text)] truncate">{{ ch.name }}</div>
                  <div class="text-xs text-[var(--cx-text-muted)]">{{ ch.member_count }} members · {{ ch.type }}</div>
                </div>
              </button>
            }
          </div>
        }

        <!-- Create Channel Form -->
        @if (showCreate()) {
          <div class="flex-1 overflow-y-auto p-4 space-y-3">
            <div><label class="cx-label">Channel Name *</label><input class="cx-input" [(ngModel)]="newChannel.name" placeholder="e.g. Operations Team" /></div>
            <div><label class="cx-label">Type</label>
              <select class="cx-select" [(ngModel)]="newChannel.type"><option value="group">Group</option><option value="channel">Channel</option></select>
            </div>
            <div><label class="cx-label">Description</label><input class="cx-input" [(ngModel)]="newChannel.description" /></div>
            <div><label class="cx-label">Add by Department</label>
              <select class="cx-select" [(ngModel)]="newChannel.dept_id" (change)="addDept()">
                <option value="">— Select —</option>
                @for (d of departments(); track d.id) { <option [value]="d.id">{{ d.name }}</option> }
              </select>
            </div>
            <div><label class="cx-label">Add by Team</label>
              <select class="cx-select" [(ngModel)]="newChannel.team_id" (change)="addTeam()">
                <option value="">— Select —</option>
                @for (t of teams(); track t.id) { <option [value]="t.id">{{ t.name }}</option> }
              </select>
            </div>
            <div class="flex gap-2 pt-2">
              <button class="cx-btn cx-btn-outline cx-btn-sm flex-1" (click)="showCreate.set(false)">Cancel</button>
              <button class="cx-btn cx-btn-primary cx-btn-sm flex-1" (click)="createChannel()">Create</button>
            </div>
          </div>
        }

        <!-- Messages View -->
        @if (activeChannel()) {
          <div class="flex-1 overflow-y-auto px-4 py-3 space-y-3" #msgContainer>
            @for (msg of messages(); track msg.id) {
              <div class="flex gap-2" [class]="msg.sender_id === auth.user()?.id ? 'flex-row-reverse' : ''">
                <div class="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 bg-[var(--cx-primary)]">
                  {{ msg.sender_name?.[0] }}
                </div>
                <div class="max-w-[75%]">
                  <div class="text-[10px] font-medium mb-0.5" [class]="msg.sender_id === auth.user()?.id ? 'text-right text-[var(--cx-text-muted)]' : 'text-[var(--cx-text-muted)]'">{{ msg.sender_name }}</div>
                  <div class="px-3 py-2 rounded-xl text-sm leading-relaxed"
                       [class]="msg.sender_id === auth.user()?.id ? 'bg-[var(--cx-primary)] text-white rounded-br-sm' : 'bg-[var(--cx-surface-hover)] text-[var(--cx-text)] rounded-bl-sm'">
                    {{ msg.body }}
                  </div>
                  <div class="text-[9px] text-[var(--cx-text-muted)] mt-0.5" [class]="msg.sender_id === auth.user()?.id ? 'text-right' : ''">{{ msg.created_at | date:'shortTime' }}</div>
                </div>
              </div>
            }
          </div>

          <!-- Message Input -->
          <div class="flex items-center gap-2 px-3 py-2.5 border-t border-[var(--cx-border)] flex-shrink-0">
            <input type="text" class="cx-input !py-2 flex-1 !text-sm" placeholder="Type a message..."
                   [(ngModel)]="msgBody" (keydown.enter)="sendMessage()" />
            <button class="w-9 h-9 rounded-xl bg-[var(--cx-primary)] text-white flex items-center justify-center hover:bg-[var(--cx-primary-light)] transition-colors"
                    (click)="sendMessage()" [disabled]="!msgBody.trim()">
              <lucide-icon name="arrow-up" [size]="16"></lucide-icon>
            </button>
          </div>
        }
      </div>
    }
  `,
})
export class FloatingChatComponent implements OnInit, OnDestroy {
  @ViewChild('msgContainer') msgContainer!: ElementRef;

  isOpen = signal(false);
  channels = signal<any[]>([]);
  activeChannel = signal<any>(null);
  messages = signal<any[]>([]);
  unreadCount = signal(0);
  showCreate = signal(false);
  departments = signal<any[]>([]);
  teams = signal<any[]>([]);

  msgBody = '';
  newChannel: any = { name: '', type: 'group', description: '', dept_id: '', team_id: '', department_ids: [] as string[], team_ids: [] as string[] };
  private pollInterval: any;
  private notifSound: HTMLAudioElement | null = null;

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() {
    this.loadChannels();
    this.pollInterval = setInterval(() => { if (this.isOpen() && this.activeChannel()) this.loadMessages(this.activeChannel().id); }, 5000);
    // Create notification sound
    try { this.notifSound = new Audio('data:audio/wav;base64,UklGRl9vT19teleXAgIABAAQAEAAIABAAQAEAAIAbGlzdFRZUEUAAABJTkZPSUFSVA=='); } catch(e) {}
  }

  ngOnDestroy() { clearInterval(this.pollInterval); }

  toggle() { this.isOpen.set(!this.isOpen()); if (this.isOpen()) { this.loadChannels(); this.loadLookups(); } }

  loadChannels() {
    this.api.get('/channels').subscribe({ next: r => this.channels.set(r.data || []) });
  }

  loadLookups() {
    this.api.get('/departments', { per_page: 100 }).subscribe({ next: r => this.departments.set(r.data || []) });
    this.api.get('/teams', { per_page: 100 }).subscribe({ next: r => this.teams.set(r.data || []) });
  }

  openChannel(ch: any) {
    this.activeChannel.set(ch);
    this.loadMessages(ch.id);
  }

  backToList() { this.activeChannel.set(null); this.messages.set([]); this.loadChannels(); }

  loadMessages(channelId: string) {
    const prevCount = this.messages().length;
    this.api.get('/channels/' + channelId + '/messages').subscribe({
      next: r => {
        const msgs = r.data || [];
        this.messages.set(msgs);
        if (msgs.length > prevCount && prevCount > 0) {
          this.playNotif();
        }
        setTimeout(() => this.scrollToBottom(), 100);
      },
    });
  }

  sendMessage() {
    if (!this.msgBody.trim() || !this.activeChannel()) return;
    const body = this.msgBody.trim();
    this.msgBody = '';
    this.api.post('/channels/' + this.activeChannel().id + '/messages', { body }).subscribe({
      next: r => {
        this.messages.set([...this.messages(), r.data]);
        setTimeout(() => this.scrollToBottom(), 50);
      },
      error: () => this.toast.error('Failed to send'),
    });
  }

  createChannel() {
    if (!this.newChannel.name.trim()) { this.toast.error('Name is required'); return; }
    const payload: any = {
      name: this.newChannel.name, type: this.newChannel.type, description: this.newChannel.description,
      department_ids: this.newChannel.department_ids, team_ids: this.newChannel.team_ids,
    };
    this.api.post('/channels', payload).subscribe({
      next: r => { this.toast.success('Channel created'); this.showCreate.set(false); this.newChannel = { name: '', type: 'group', description: '', dept_id: '', team_id: '', department_ids: [], team_ids: [] }; this.loadChannels(); },
      error: e => this.toast.error(e.error?.message || 'Failed'),
    });
  }

  addDept() { if (this.newChannel.dept_id && !this.newChannel.department_ids.includes(this.newChannel.dept_id)) { this.newChannel.department_ids.push(this.newChannel.dept_id); } this.newChannel.dept_id = ''; }
  addTeam() { if (this.newChannel.team_id && !this.newChannel.team_ids.includes(this.newChannel.team_id)) { this.newChannel.team_ids.push(this.newChannel.team_id); } this.newChannel.team_id = ''; }

  private scrollToBottom() {
    try { if (this.msgContainer?.nativeElement) this.msgContainer.nativeElement.scrollTop = this.msgContainer.nativeElement.scrollHeight; } catch(e) {}
  }

  private playNotif() {
    try { this.notifSound?.play().catch(() => {}); } catch(e) {}
  }
}
