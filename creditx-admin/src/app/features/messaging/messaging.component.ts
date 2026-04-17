import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';

@Component({
  selector: 'app-messaging', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, FormDialogComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header title="Messaging" subtitle="Conversations, channels & groups">
        <button class="cx-btn cx-btn-primary" (click)="openNewChannel()"><lucide-icon name="plus" [size]="16"></lucide-icon> New Channel</button>
      </cx-page-header>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4" style="min-height: 70vh">
        <!-- Left Panel — Conversations + Channels -->
        <div class="cx-card !p-0 overflow-hidden flex flex-col">
          <!-- Tabs -->
          <div class="flex border-b border-[var(--cx-border)]">
            <button class="flex-1 py-2.5 text-xs font-semibold text-center transition-colors"
                    [class]="panel === 'conversations' ? 'text-[var(--cx-primary)] border-b-2 border-[var(--cx-primary)]' : 'text-[var(--cx-text-muted)]'"
                    (click)="panel = 'conversations'; loadConversations()">Direct Messages</button>
            <button class="flex-1 py-2.5 text-xs font-semibold text-center transition-colors"
                    [class]="panel === 'channels' ? 'text-[var(--cx-primary)] border-b-2 border-[var(--cx-primary)]' : 'text-[var(--cx-text-muted)]'"
                    (click)="panel = 'channels'; loadChannels()">Channels & Groups</button>
          </div>
          <!-- Search -->
          <div class="p-3 border-b border-[var(--cx-border)]">
            <div class="relative">
              <lucide-icon name="search" class="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" [size]="14"></lucide-icon>
              <input type="text" class="cx-input !pl-7 !py-1.5 !text-xs" placeholder="Search..." [(ngModel)]="listSearch" />
            </div>
          </div>
          <!-- List -->
          <div class="flex-1 overflow-y-auto">
            @if (panel === 'conversations') {
              @for (c of filteredConversations(); track c.id) {
                <button class="w-full text-left px-4 py-3 border-b border-[var(--cx-border)] hover:bg-[var(--cx-surface-hover)] transition-colors"
                        [class.bg-[var(--cx-primary-50)]]="activeId === c.id" (click)="selectConversation(c)">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-[var(--cx-primary)] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {{ c.other_user_name?.[0] || '?' }}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-medium text-[var(--cx-text)] truncate">{{ c.other_user_name }}</div>
                      <div class="text-xs text-[var(--cx-text-muted)] truncate">{{ c.last_message || 'No messages yet' }}</div>
                    </div>
                  </div>
                </button>
              }
              @if (conversations().length === 0) {
                <div class="p-6 text-center text-xs text-[var(--cx-text-muted)]">No conversations yet</div>
              }
            }
            @if (panel === 'channels') {
              @for (ch of filteredChannels(); track ch.id) {
                <button class="w-full text-left px-4 py-3 border-b border-[var(--cx-border)] hover:bg-[var(--cx-surface-hover)] transition-colors"
                        [class.bg-[var(--cx-primary-50)]]="activeId === ch.id" (click)="selectChannel(ch)">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                         [class]="ch.type === 'channel' ? 'bg-[var(--cx-info)]' : 'bg-[var(--cx-accent)]'">
                      <lucide-icon [name]="ch.type === 'channel' ? 'hash' : 'users'" [size]="14"></lucide-icon>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-medium text-[var(--cx-text)] truncate">{{ ch.name }}</div>
                      <div class="text-xs text-[var(--cx-text-muted)]">{{ ch.type | titlecase }}</div>
                    </div>
                  </div>
                </button>
              }
              @if (channels().length === 0) {
                <div class="p-6 text-center text-xs text-[var(--cx-text-muted)]">No channels yet</div>
              }
            }
          </div>
        </div>

        <!-- Right Panel — Message Thread -->
        <div class="lg:col-span-2 cx-card !p-0 overflow-hidden flex flex-col">
          @if (!activeId) {
            <div class="flex-1 flex flex-col items-center justify-center">
              <lucide-icon name="message-square" [size]="48" class="text-[var(--cx-text-muted)] opacity-20 mb-3"></lucide-icon>
              <p class="text-sm text-[var(--cx-text-muted)]">Select a conversation or channel</p>
            </div>
          } @else {
            <!-- Header -->
            <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--cx-border)]">
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-semibold text-[var(--cx-text)]">{{ activeName }}</h3>
                @if (activeType === 'channel') {
                  <button class="cx-btn cx-btn-ghost cx-btn-sm" (click)="openAddMembers()">
                    <lucide-icon name="users" [size]="14"></lucide-icon> Members
                  </button>
                }
              </div>
            </div>
            <!-- Messages -->
            <div class="flex-1 overflow-y-auto p-4 space-y-3" #msgContainer>
              @for (msg of messages(); track msg.id) {
                <div class="flex gap-3" [class.flex-row-reverse]="msg.sender_id === auth.user()?.id">
                  <div class="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                       [style.background]="msg.sender_id === auth.user()?.id ? 'var(--cx-primary)' : 'var(--cx-accent)'">
                    {{ msg.sender_name?.[0] }}
                  </div>
                  <div class="max-w-[70%]">
                    <div class="text-[10px] font-medium mb-0.5" [class]="msg.sender_id === auth.user()?.id ? 'text-right text-[var(--cx-text-muted)]' : 'text-[var(--cx-text-muted)]'">
                      {{ msg.sender_name }}
                    </div>
                    <div class="rounded-xl px-3 py-2 text-sm"
                         [class]="msg.sender_id === auth.user()?.id ? 'bg-[var(--cx-primary)] text-white rounded-tr-sm' : 'bg-[var(--cx-surface-hover)] text-[var(--cx-text)] rounded-tl-sm'">
                      {{ msg.body || msg.content }}
                    </div>
                    <div class="text-[9px] text-[var(--cx-text-muted)] mt-0.5" [class]="msg.sender_id === auth.user()?.id ? 'text-right' : ''">
                      {{ msg.created_at | date:'short' }}
                    </div>
                  </div>
                </div>
              }
              @if (messages().length === 0) {
                <div class="text-center text-xs text-[var(--cx-text-muted)] py-8">No messages yet. Start the conversation!</div>
              }
            </div>
            <!-- Input -->
            <div class="border-t border-[var(--cx-border)] p-3">
              <div class="flex gap-2">
                <input type="text" class="cx-input flex-1" placeholder="Type a message..." [(ngModel)]="newMessage"
                       (keydown.enter)="sendMessage()" />
                <button class="cx-btn cx-btn-primary" [disabled]="!newMessage.trim()" (click)="sendMessage()">
                  <lucide-icon name="arrow-up" [size]="16"></lucide-icon>
                </button>
              </div>
            </div>
          }
        </div>
      </div>
    </div>

    <!-- Create Channel Dialog -->
    <cx-form-dialog [open]="showNewChannel()" title="Create Channel / Group" [saving]="channelSaving()" (close)="showNewChannel.set(false)" (save)="saveChannel()">
      <div class="space-y-4">
        <div><label class="cx-label">Name *</label><input class="cx-input" [(ngModel)]="channelForm.name" /></div>
        <div><label class="cx-label">Description</label><textarea class="cx-input" rows="2" [(ngModel)]="channelForm.description"></textarea></div>
        <div><label class="cx-label">Type</label>
          <div class="flex gap-2 mt-1">
            @for (t of ['group','channel']; track t) {
              <button class="cx-btn cx-btn-sm" [class]="channelForm.type === t ? 'cx-btn-primary' : 'cx-btn-outline'" (click)="channelForm.type = t">{{ t | titlecase }}</button>
            }
          </div>
        </div>
        <div><label class="cx-label">Add Members by Department</label>
          <div class="flex flex-wrap gap-2 mt-1">
            @for (d of departments(); track d.id) {
              <label class="text-xs cursor-pointer px-3 py-1.5 rounded-lg border transition-all"
                     [class]="selDepts.includes(d.id) ? 'bg-[var(--cx-primary-50)] border-[var(--cx-primary)] text-[var(--cx-primary)] font-medium' : 'border-[var(--cx-border)] text-[var(--cx-text-secondary)]'">
                <input type="checkbox" [checked]="selDepts.includes(d.id)" (change)="toggle('selDepts', d.id)" class="sr-only" /> {{ d.name }}
              </label>
            }
          </div>
        </div>
        <div><label class="cx-label">Add Members by Team</label>
          <div class="flex flex-wrap gap-2 mt-1">
            @for (t of teams(); track t.id) {
              <label class="text-xs cursor-pointer px-3 py-1.5 rounded-lg border transition-all"
                     [class]="selTeams.includes(t.id) ? 'bg-[var(--cx-accent-50)] border-[var(--cx-accent)] text-[var(--cx-accent-dark)] font-medium' : 'border-[var(--cx-border)] text-[var(--cx-text-secondary)]'">
                <input type="checkbox" [checked]="selTeams.includes(t.id)" (change)="toggle('selTeams', t.id)" class="sr-only" /> {{ t.name }}
              </label>
            }
          </div>
        </div>
        <div><label class="cx-label">Add Individual Users</label>
          <select class="cx-select" (change)="addUser($event)">
            <option value="">Select user to add...</option>
            @for (u of users(); track u.id) { <option [value]="u.id">{{ u.full_name }}</option> }
          </select>
          @if (selUsers.length) {
            <div class="flex flex-wrap gap-1 mt-2">
              @for (uid of selUsers; track uid) {
                <span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--cx-surface-hover)] text-xs">
                  {{ getUserName(uid) }}
                  <button (click)="selUsers = selUsers.filter(x => x !== uid)" class="text-[var(--cx-text-muted)] hover:text-[var(--cx-danger)]">&times;</button>
                </span>
              }
            </div>
          }
        </div>
      </div>
    </cx-form-dialog>

    <!-- Add Members Dialog -->
    <cx-form-dialog [open]="showAddMembers()" title="Add Members" [saving]="addMembersSaving()" (close)="showAddMembers.set(false)" (save)="saveAddMembers()">
      <div class="space-y-4">
        <div><label class="cx-label">By Department</label>
          <div class="flex flex-wrap gap-2 mt-1">
            @for (d of departments(); track d.id) {
              <label class="text-xs cursor-pointer px-3 py-1.5 rounded-lg border transition-all"
                     [class]="addDepts.includes(d.id) ? 'bg-[var(--cx-primary-50)] border-[var(--cx-primary)] text-[var(--cx-primary)] font-medium' : 'border-[var(--cx-border)] text-[var(--cx-text-secondary)]'">
                <input type="checkbox" [checked]="addDepts.includes(d.id)" (change)="toggle('addDepts', d.id)" class="sr-only" /> {{ d.name }}
              </label>
            }
          </div>
        </div>
        <div><label class="cx-label">By Team</label>
          <div class="flex flex-wrap gap-2 mt-1">
            @for (t of teams(); track t.id) {
              <label class="text-xs cursor-pointer px-3 py-1.5 rounded-lg border transition-all"
                     [class]="addTeams.includes(t.id) ? 'bg-[var(--cx-accent-50)] border-[var(--cx-accent)] text-[var(--cx-accent-dark)] font-medium' : 'border-[var(--cx-border)] text-[var(--cx-text-secondary)]'">
                <input type="checkbox" [checked]="addTeams.includes(t.id)" (change)="toggle('addTeams', t.id)" class="sr-only" /> {{ t.name }}
              </label>
            }
          </div>
        </div>
        <div><label class="cx-label">Individual Users</label>
          <select class="cx-select" (change)="addIndivUser($event)">
            <option value="">Select user...</option>
            @for (u of users(); track u.id) { <option [value]="u.id">{{ u.full_name }}</option> }
          </select>
          @if (addUserIds.length) {
            <div class="flex flex-wrap gap-1 mt-2">
              @for (uid of addUserIds; track uid) {
                <span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--cx-surface-hover)] text-xs">
                  {{ getUserName(uid) }} <button (click)="addUserIds = addUserIds.filter(x => x !== uid)" class="hover:text-[var(--cx-danger)]">&times;</button>
                </span>
              }
            </div>
          }
        </div>
      </div>
    </cx-form-dialog>
  `,
})
export class MessagingComponent implements OnInit, OnDestroy {
  panel: 'conversations' | 'channels' = 'conversations';
  conversations = signal<any[]>([]); channels = signal<any[]>([]);
  messages = signal<any[]>([]);
  listSearch = ''; activeId = ''; activeName = ''; activeType: 'conversation' | 'channel' = 'conversation';
  newMessage = '';

  // Create channel
  showNewChannel = signal(false); channelSaving = signal(false);
  channelForm: any = { name: '', description: '', type: 'group' };
  departments = signal<any[]>([]); teams = signal<any[]>([]); users = signal<any[]>([]);
  selDepts: string[] = []; selTeams: string[] = []; selUsers: string[] = [];

  // Add members
  showAddMembers = signal(false); addMembersSaving = signal(false);
  addDepts: string[] = []; addTeams: string[] = []; addUserIds: string[] = [];

  private pollInterval: any;

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() {
    this.loadConversations();
    this.api.get('/departments', { per_page: 100 }).subscribe({ next: r => this.departments.set(r.data || []) });
    this.api.get('/teams', { per_page: 100 }).subscribe({ next: r => this.teams.set(r.data || []) });
    this.api.get('/users', { per_page: 500 }).subscribe({ next: r => this.users.set(r.data || []) });
  }

  ngOnDestroy() { clearInterval(this.pollInterval); }

  loadConversations() { this.api.get('/conversations').subscribe({ next: r => this.conversations.set(r.data || []) }); }
  loadChannels() { this.api.get('/channels').subscribe({ next: r => this.channels.set(r.data || []) }); }

  filteredConversations() { const s = this.listSearch.toLowerCase(); return this.conversations().filter(c => !s || (c.other_user_name || '').toLowerCase().includes(s)); }
  filteredChannels() { const s = this.listSearch.toLowerCase(); return this.channels().filter(c => !s || c.name.toLowerCase().includes(s)); }

  selectConversation(c: any) {
    this.activeId = c.id; this.activeName = c.other_user_name; this.activeType = 'conversation';
    this.loadMessages();
    clearInterval(this.pollInterval);
    this.pollInterval = setInterval(() => this.loadMessages(), 5000);
  }

  selectChannel(ch: any) {
    this.activeId = ch.id; this.activeName = ch.name; this.activeType = 'channel';
    this.loadMessages();
    clearInterval(this.pollInterval);
    this.pollInterval = setInterval(() => this.loadMessages(), 5000);
  }

  loadMessages() {
    const url = this.activeType === 'conversation' ? `/conversations/${this.activeId}/messages` : `/channels/${this.activeId}/messages`;
    this.api.get(url).subscribe({ next: r => this.messages.set(r.data || []) });
  }

  sendMessage() {
    if (!this.newMessage.trim()) return;
    const url = this.activeType === 'conversation' ? `/conversations/${this.activeId}/messages` : `/channels/${this.activeId}/messages`;
    this.api.post(url, { body: this.newMessage }).subscribe({
      next: () => { this.newMessage = ''; this.loadMessages(); },
      error: e => this.toast.error(e.error?.message || 'Failed to send'),
    });
  }

  // Create channel
  openNewChannel() {
    this.channelForm = { name: '', description: '', type: 'group' };
    this.selDepts = []; this.selTeams = []; this.selUsers = [];
    this.showNewChannel.set(true);
  }

  saveChannel() {
    this.channelSaving.set(true);
    this.api.post('/channels', { ...this.channelForm, department_ids: this.selDepts, team_ids: this.selTeams, user_ids: this.selUsers }).subscribe({
      next: r => { this.channelSaving.set(false); this.toast.success(r.message || 'Created'); this.showNewChannel.set(false); this.panel = 'channels'; this.loadChannels(); },
      error: e => { this.channelSaving.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }

  // Add members to existing channel
  openAddMembers() { this.addDepts = []; this.addTeams = []; this.addUserIds = []; this.showAddMembers.set(true); }

  saveAddMembers() {
    this.addMembersSaving.set(true);
    this.api.post(`/channels/${this.activeId}/members`, { department_ids: this.addDepts, team_ids: this.addTeams, user_ids: this.addUserIds }).subscribe({
      next: r => { this.addMembersSaving.set(false); this.toast.success(r.message || 'Members added'); this.showAddMembers.set(false); },
      error: e => { this.addMembersSaving.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }

  toggle(arr: string, id: string) { (this as any)[arr] = (this as any)[arr].includes(id) ? (this as any)[arr].filter((x: string) => x !== id) : [...(this as any)[arr], id]; }
  addUser(event: Event) { const v = (event.target as HTMLSelectElement).value; if (v && !this.selUsers.includes(v)) this.selUsers = [...this.selUsers, v]; (event.target as HTMLSelectElement).value = ''; }
  addIndivUser(event: Event) { const v = (event.target as HTMLSelectElement).value; if (v && !this.addUserIds.includes(v)) this.addUserIds = [...this.addUserIds, v]; (event.target as HTMLSelectElement).value = ''; }
  getUserName(uid: string): string { return this.users().find((u: any) => u.id === uid)?.full_name || uid.slice(0, 8); }
}
