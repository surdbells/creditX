import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { CxViewDialogComponent } from '../../shared/components/view-dialog/view-dialog.component';
import { SearchableSelectComponent, SelectOption } from '../../shared/components/searchable-select/searchable-select.component';
import { LoanDetailComponent } from '../loans/loan-detail.component';

@Component({
  selector: 'app-messaging', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, PageHeaderComponent, FormDialogComponent, CxViewDialogComponent, SearchableSelectComponent, LoanDetailComponent],
  template: `
    <div class="cx-animate-in">
      <cx-page-header
        title="Messaging"
        subtitle="Direct messages, channels, and team groups"
        eyebrow="Communications">
        <button class="cx-btn cx-btn-primary" (click)="openNewChannel()">
          <lucide-icon name="plus" [size]="14"></lucide-icon>
          <span>New Channel</span>
        </button>
      </cx-page-header>

      <div class="cx-msg-shell">
        <!-- Left panel — list -->
        <aside class="cx-msg-sidebar">
          <div class="cx-msg-sidebar-tabs">
            <button class="cx-msg-tab"
                    [class.is-active]="panel === 'conversations'"
                    (click)="panel = 'conversations'; loadConversations()">
              <lucide-icon name="message-square" [size]="14"></lucide-icon>
              <span>Direct</span>
            </button>
            <button class="cx-msg-tab"
                    [class.is-active]="panel === 'channels'"
                    (click)="panel = 'channels'; loadChannels()">
              <lucide-icon name="hash" [size]="14"></lucide-icon>
              <span>Channels</span>
            </button>
          </div>
          <div class="cx-msg-sidebar-search">
            <lucide-icon name="search" [size]="14" class="cx-msg-search-icon"></lucide-icon>
            <input type="text" class="cx-msg-search-input" placeholder="Search..." [(ngModel)]="listSearch" />
          </div>
          <div class="cx-msg-sidebar-list">
            @if (panel === 'conversations') {
              @for (c of filteredConversations(); track c.id) {
                <button class="cx-msg-list-item"
                        [class.is-active]="activeId === c.id"
                        [class.is-unread]="(c.unread_count || 0) > 0"
                        (click)="selectConversation(c)">
                  <div class="cx-msg-avatar" [style.background]="'linear-gradient(135deg, var(--cx-primary-600), var(--cx-primary-500))'">
                    {{ (c.other_user_name || c.agent_name || c.subject || '?').charAt(0).toUpperCase() }}
                  </div>
                  <div class="cx-msg-item-meta">
                    <div class="cx-msg-item-name">
                      <span>{{ c.other_user_name || c.agent_name || c.subject }}</span>
                      @if ((c.unread_count || 0) > 0) {
                        <span class="cx-msg-item-badge">{{ c.unread_count > 99 ? '99+' : c.unread_count }}</span>
                      }
                    </div>
                    <div class="cx-msg-item-preview">
                      {{ c.last_message || c.subject || 'No messages yet' }}
                    </div>
                  </div>
                </button>
              }
              @if (filteredConversations().length === 0) {
                <div class="cx-msg-sidebar-empty">No conversations yet</div>
              }
            }
            @if (panel === 'channels') {
              @for (ch of filteredChannels(); track ch.id) {
                <button class="cx-msg-list-item"
                        [class.is-active]="activeId === ch.id"
                        [class.is-unread]="(ch.unread_count || 0) > 0"
                        (click)="selectChannel(ch)">
                  <div class="cx-msg-avatar cx-msg-avatar-square"
                       [class.is-channel]="ch.type === 'channel'"
                       [class.is-group]="ch.type !== 'channel'">
                    <lucide-icon [name]="ch.type === 'channel' ? 'hash' : 'users'" [size]="14"></lucide-icon>
                  </div>
                  <div class="cx-msg-item-meta">
                    <div class="cx-msg-item-name">
                      <span>{{ ch.name }}</span>
                      @if ((ch.unread_count || 0) > 0) {
                        <span class="cx-msg-item-badge">{{ ch.unread_count > 99 ? '99+' : ch.unread_count }}</span>
                      }
                    </div>
                    <div class="cx-msg-item-preview">{{ ch.type | titlecase }}</div>
                  </div>
                </button>
              }
              @if (filteredChannels().length === 0) {
                <div class="cx-msg-sidebar-empty">No channels yet</div>
              }
            }
          </div>
        </aside>

        <!-- Right panel — thread -->
        <main class="cx-msg-thread">
          @if (!activeId) {
            <div class="cx-msg-thread-empty">
              <div class="cx-msg-thread-empty-icon">
                <lucide-icon name="message-square" [size]="32"></lucide-icon>
              </div>
              <div class="cx-msg-thread-empty-title">Pick a conversation</div>
              <div class="cx-msg-thread-empty-sub">Select someone from the left to view or continue a conversation.</div>
            </div>
          } @else {
            <header class="cx-msg-thread-header">
              <div class="cx-msg-thread-header-meta">
                <div class="cx-eyebrow">{{ activeType === 'channel' ? 'Channel' : 'Direct Message' }}</div>
                <h3 class="cx-msg-thread-title">{{ activeName }}</h3>
              </div>
              <div class="cx-msg-thread-header-actions">
                @if (activeLoanId) {
                  <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="openLoanDetail()" title="View loan details">
                    <lucide-icon name="info" [size]="14"></lucide-icon>
                    <span>Loan Info</span>
                  </button>
                }
                @if (activeType === 'channel') {
                  <button class="cx-btn cx-btn-outline cx-btn-sm" (click)="openManageMembers()">
                    <lucide-icon name="users" [size]="14"></lucide-icon>
                    <span>Members</span>
                  </button>
                }
              </div>
            </header>
            <div class="cx-msg-thread-scroll" #msgContainer>
              @for (msg of messages(); track msg.id) {
                <div class="cx-msg-bubble-row" [class.is-me]="msg.sender_id === auth.user()?.id">
                  <div class="cx-msg-avatar cx-msg-avatar-sm"
                       [style.background]="msg.sender_id === auth.user()?.id ? 'linear-gradient(135deg, var(--cx-primary-600), var(--cx-primary-500))' : 'linear-gradient(135deg, var(--cx-accent-600), var(--cx-accent-500))'">
                    {{ (msg.sender_name || '?').charAt(0).toUpperCase() }}
                  </div>
                  <div class="cx-msg-bubble-col">
                    <div class="cx-msg-sender">{{ msg.sender_name }}</div>
                    <div class="cx-msg-bubble">
                      {{ msg.body || msg.content }}
                    </div>
                    <div class="cx-msg-time tabular-nums">{{ msg.created_at | date:'short' }}</div>
                  </div>
                </div>
              }
              @if (messages().length === 0) {
                <div class="cx-msg-thread-empty-small">
                  <lucide-icon name="message-square" [size]="20"></lucide-icon>
                  <span>No messages yet. Start the conversation.</span>
                </div>
              }
            </div>
            <footer class="cx-msg-composer">
              <input type="text" class="cx-msg-composer-input" placeholder="Type a message..."
                     [(ngModel)]="newMessage" (keydown.enter)="sendMessage()" />
              <button class="cx-btn cx-btn-primary cx-btn-icon" [disabled]="!newMessage.trim()" (click)="sendMessage()" aria-label="Send">
                <lucide-icon name="arrow-up" [size]="16"></lucide-icon>
              </button>
            </footer>
          }
        </main>
      </div>
    </div>

    <!-- Create Channel Dialog -->
    <cx-form-dialog
      [open]="showNewChannel()"
      title="Create Channel / Group"
      subtitle="Invite members by department, team, or individually"
      [saving]="channelSaving()" (close)="showNewChannel.set(false)" (save)="saveChannel()">
      <div class="cx-form-stack">
        <div class="cx-form-row cx-form-row-2">
          <div><label class="cx-label">Name *</label><input class="cx-input" [(ngModel)]="channelForm.name" placeholder="e.g. Disbursement Desk" /></div>
          <div>
            <label class="cx-label">Type</label>
            <div class="cx-msg-type-switch">
              @for (t of ['group','channel']; track t) {
                <button type="button" class="cx-msg-type-opt"
                        [class.is-active]="channelForm.type === t"
                        (click)="channelForm.type = t">
                  <lucide-icon [name]="t === 'channel' ? 'hash' : 'users'" [size]="12"></lucide-icon>
                  <span>{{ t | titlecase }}</span>
                </button>
              }
            </div>
          </div>
        </div>
        <div><label class="cx-label">Description</label><textarea class="cx-input" rows="2" [(ngModel)]="channelForm.description" placeholder="What this channel is for..."></textarea></div>

        <h4 class="cx-form-section-title">Add members</h4>
        <div>
          <label class="cx-label">By Department</label>
          <div class="cx-msg-chips">
            @for (d of departments(); track d.id) {
              <button type="button" class="cx-msg-chip"
                      [class.is-selected]="selDepts.includes(d.id)"
                      (click)="toggle('selDepts', d.id)">
                @if (selDepts.includes(d.id)) { <lucide-icon name="check" [size]="11"></lucide-icon> }
                {{ d.name }}
              </button>
            }
          </div>
        </div>
        <div>
          <label class="cx-label">By Team</label>
          <div class="cx-msg-chips">
            @for (t of teams(); track t.id) {
              <button type="button" class="cx-msg-chip cx-msg-chip-gold"
                      [class.is-selected]="selTeams.includes(t.id)"
                      (click)="toggle('selTeams', t.id)">
                @if (selTeams.includes(t.id)) { <lucide-icon name="check" [size]="11"></lucide-icon> }
                {{ t.name }}
              </button>
            }
          </div>
        </div>
        <div>
          <label class="cx-label">Individual Users</label>
          <cx-searchable-select [options]="userOptions()" placeholder="Search user to add..." [clearable]="true"
            (ngModelChange)="onUserSelected($event)" [ngModel]="null"></cx-searchable-select>
          @if (selUsers.length) {
            <div class="cx-msg-user-tags">
              @for (uid of selUsers; track uid) {
                <span class="cx-msg-user-tag">
                  <span>{{ getUserName(uid) }}</span>
                  <button type="button" (click)="selUsers = selUsers.filter(x => x !== uid)" aria-label="Remove">×</button>
                </span>
              }
            </div>
          }
        </div>
      </div>
    </cx-form-dialog>

    <!-- Manage Members Dialog -->
    <cx-form-dialog
      [open]="showManageMembers()"
      title="Manage Members"
      subtitle="View, add, or remove members in this channel"
      [saving]="manageSaving()" (close)="closeManageMembers()" (save)="saveAddMembers()"
      saveLabel="Add selected">
      <div class="cx-form-stack">

        <!-- Current members -->
        <div>
          <div class="cx-msg-members-head">
            <label class="cx-label" style="margin: 0">Current members</label>
            <span class="cx-msg-members-count">{{ currentMembers().length }}</span>
          </div>
          @if (membersLoading()) {
            <div class="cx-msg-members-loading">Loading...</div>
          } @else if (currentMembers().length === 0) {
            <div class="cx-msg-members-empty">No members yet</div>
          } @else {
            <div class="cx-msg-member-list">
              @for (m of currentMembers(); track m.id) {
                <div class="cx-msg-member-row">
                  <div class="cx-msg-member-avatar">
                    {{ (m.user_name || '?').charAt(0).toUpperCase() }}
                  </div>
                  <div class="cx-msg-member-meta">
                    <div class="cx-msg-member-name">{{ m.user_name }}</div>
                    <div class="cx-msg-member-sub">{{ m.email }}</div>
                  </div>
                  @if (m.role === 'admin') {
                    <span class="cx-msg-member-role">Admin</span>
                  }
                  <button type="button" class="cx-msg-member-remove"
                          [disabled]="removingUserId() === m.user_id"
                          (click)="removeMember(m)" aria-label="Remove">
                    @if (removingUserId() === m.user_id) {
                      <span>…</span>
                    } @else {
                      <lucide-icon name="x" [size]="14"></lucide-icon>
                    }
                  </button>
                </div>
              }
            </div>
          }
        </div>

        <!-- Add new -->
        <div style="border-top: 1px solid var(--cx-border); padding-top: 16px; margin-top: 4px">
          <label class="cx-label">Add new members</label>
          <div class="cx-msg-members-subtle">Pick departments, teams, or individual users to add</div>
        </div>

        <div>
          <label class="cx-label">By Department</label>
          <div class="cx-msg-chips">
            @for (d of departments(); track d.id) {
              <button type="button" class="cx-msg-chip"
                      [class.is-selected]="addDepts.includes(d.id)"
                      (click)="toggle('addDepts', d.id)">
                @if (addDepts.includes(d.id)) { <lucide-icon name="check" [size]="11"></lucide-icon> }
                {{ d.name }}
              </button>
            }
          </div>
        </div>
        <div>
          <label class="cx-label">By Team</label>
          <div class="cx-msg-chips">
            @for (t of teams(); track t.id) {
              <button type="button" class="cx-msg-chip cx-msg-chip-gold"
                      [class.is-selected]="addTeams.includes(t.id)"
                      (click)="toggle('addTeams', t.id)">
                @if (addTeams.includes(t.id)) { <lucide-icon name="check" [size]="11"></lucide-icon> }
                {{ t.name }}
              </button>
            }
          </div>
        </div>
        <div>
          <label class="cx-label">Individual Users</label>
          <cx-searchable-select [options]="userOptions()" placeholder="Search user..." [clearable]="true"
            (ngModelChange)="onAddUserSelected($event)" [ngModel]="null"></cx-searchable-select>
          @if (addUserIds.length) {
            <div class="cx-msg-user-tags">
              @for (uid of addUserIds; track uid) {
                <span class="cx-msg-user-tag">
                  <span>{{ getUserName(uid) }}</span>
                  <button type="button" (click)="addUserIds = addUserIds.filter(x => x !== uid)" aria-label="Remove">×</button>
                </span>
              }
            </div>
          }
        </div>
      </div>
    </cx-form-dialog>

    <!-- Loan Detail View Dialog — shown when the user clicks the Loan Info -->
    <!-- button on a conversation header. The full loan-detail component is  -->
    <!-- embedded inside (embedded=true suppresses its own page-header so    -->
    <!-- we don't double-up titles).                                         -->
    <cx-view-dialog
      [open]="showLoanDetail()"
      title="Loan Details"
      [subtitle]="activeName || ''"
      maxWidth="800px"
      (close)="closeLoanDetail()">
      @if (showLoanDetail() && activeLoanId) {
        <app-loan-detail [id]="activeLoanId" [embedded]="true"></app-loan-detail>
      }
    </cx-view-dialog>
  `,
  styles: [`
    :host { display: block; }

    /* ═══ Shell ═══ */
    .cx-msg-shell {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-2xl);
      min-height: 70vh;
      overflow: hidden;
    }
    @media (min-width: 900px) {
      .cx-msg-shell { grid-template-columns: 320px 1fr; }
    }

    /* ═══ Sidebar ═══ */
    .cx-msg-sidebar {
      display: flex; flex-direction: column;
      border-right: 1px solid var(--cx-border);
      background: var(--cx-surface);
      min-height: 0;
    }
    .cx-msg-sidebar-tabs {
      display: flex;
      padding: 0.5rem;
      gap: 4px;
      border-bottom: 1px solid var(--cx-border);
      background: var(--cx-surface-2);
    }
    .cx-msg-tab {
      flex: 1;
      display: inline-flex; align-items: center; justify-content: center;
      gap: 6px;
      padding: 0.45rem 0.65rem;
      background: transparent; border: 1px solid transparent;
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-xs); font-weight: 500;
      color: var(--cx-text-muted);
      cursor: pointer;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-msg-tab:hover:not(.is-active) {
      color: var(--cx-text);
      background: var(--cx-surface-hover);
    }
    .cx-msg-tab.is-active {
      background: var(--cx-surface);
      color: var(--cx-primary-700);
      border-color: var(--cx-border);
      box-shadow: var(--cx-shadow-xs);
    }

    .cx-msg-sidebar-search { position: relative; padding: 0.75rem 0.75rem 0.5rem; }
    .cx-msg-search-icon {
      position: absolute; left: 1.35rem; top: 50%;
      transform: translateY(-50%);
      color: var(--cx-text-muted);
      pointer-events: none;
    }
    .cx-msg-search-input {
      width: 100%;
      padding: 0.45rem 0.75rem 0.45rem 2rem;
      background: var(--cx-surface-2);
      border: 1px solid transparent;
      border-radius: var(--cx-radius-md);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      outline: none;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-msg-search-input:focus {
      background: var(--cx-surface);
      border-color: var(--cx-primary-600);
      box-shadow: var(--cx-ring-focus);
    }

    .cx-msg-sidebar-list {
      flex: 1; overflow-y: auto;
      padding: 0.25rem;
    }
    .cx-msg-list-item {
      display: flex; align-items: center; gap: 0.65rem;
      padding: 0.65rem 0.75rem;
      width: 100%;
      background: transparent; border: none;
      border-radius: var(--cx-radius-md);
      cursor: pointer;
      text-align: left;
      transition: background var(--cx-dur-fast) var(--cx-ease-premium);
      margin-bottom: 2px;
    }
    .cx-msg-list-item:hover { background: var(--cx-surface-hover); }
    .cx-msg-list-item.is-active {
      background: var(--cx-primary-50);
    }
    .cx-msg-list-item.is-active .cx-msg-item-name { color: var(--cx-primary-700); }
    /* Unread row: bolder name + subtle tint. The per-row badge carries
       the actual count; this style is just the 'something new'
       indicator at a glance. */
    .cx-msg-list-item.is-unread .cx-msg-item-name span:first-child {
      font-weight: 700;
      color: var(--cx-text);
    }
    .cx-msg-list-item.is-unread .cx-msg-item-preview {
      color: var(--cx-text);
      font-weight: 500;
    }
    .cx-msg-avatar {
      width: 32px; height: 32px; flex-shrink: 0;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: #fff;
      font-size: var(--cx-text-xs); font-weight: 600;
    }
    .cx-msg-avatar-square {
      border-radius: var(--cx-radius-sm);
    }
    .cx-msg-avatar-square.is-channel { background: var(--cx-info); }
    .cx-msg-avatar-square.is-group { background: linear-gradient(135deg, var(--cx-accent-600), var(--cx-accent-500)); }
    .cx-msg-item-meta { flex: 1; min-width: 0; }
    .cx-msg-item-name {
      font-size: var(--cx-text-sm); font-weight: 500;
      color: var(--cx-text);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      display: flex; align-items: center; gap: 6px;
    }
    .cx-msg-item-name > span:first-child {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      flex: 1;
    }
    .cx-msg-item-badge {
      flex-shrink: 0;
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 18px; height: 18px;
      padding: 0 6px;
      border-radius: 9px;
      background: var(--cx-primary-600);
      color: #fff;
      font-size: 10px; font-weight: 700;
      line-height: 1;
    }
    .cx-msg-item-preview {
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .cx-msg-sidebar-empty {
      padding: 2rem 1rem;
      text-align: center;
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
    }

    /* ═══ Thread ═══ */
    .cx-msg-thread {
      display: flex; flex-direction: column;
      min-height: 0;
      background: var(--cx-bg);
    }
    .cx-msg-thread-empty {
      flex: 1;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 2rem;
      text-align: center;
    }
    .cx-msg-thread-empty-icon {
      width: 72px; height: 72px;
      border-radius: 50%;
      background: var(--cx-stone-100);
      color: var(--cx-text-muted);
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 1rem;
      position: relative;
    }
    .cx-msg-thread-empty-icon::before {
      content: '';
      position: absolute; inset: -4px;
      border-radius: 50%;
      border: 1px dashed var(--cx-border-strong);
    }
    .cx-msg-thread-empty-title {
      font-size: var(--cx-text-md); font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
    }
    .cx-msg-thread-empty-sub {
      font-size: var(--cx-text-sm);
      color: var(--cx-text-muted);
      margin-top: 0.35rem;
      max-width: 24rem;
      line-height: 1.5;
    }

    .cx-msg-thread-header {
      display: flex; align-items: center; justify-content: space-between;
      gap: 1rem;
      padding: 0.85rem 1.25rem;
      border-bottom: 1px solid var(--cx-border);
      background: var(--cx-surface);
      flex-shrink: 0;
    }
    .cx-msg-thread-header-meta { display: flex; flex-direction: column; }
    .cx-msg-thread-header-actions {
      display: flex; align-items: center; gap: 0.5rem;
      flex-shrink: 0;
    }
    .cx-msg-thread-title {
      margin: 1px 0 0;
      font-size: var(--cx-text-md); font-weight: 600;
      color: var(--cx-text);
      letter-spacing: -0.005em;
    }

    .cx-msg-thread-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 1rem 1.25rem;
      display: flex; flex-direction: column;
      gap: 0.85rem;
      background: var(--cx-bg);
    }
    .cx-msg-thread-empty-small {
      display: flex; align-items: center; justify-content: center;
      gap: 8px;
      padding: 2rem 1rem;
      font-size: var(--cx-text-xs);
      color: var(--cx-text-muted);
    }

    .cx-msg-bubble-row {
      display: flex; gap: 0.65rem;
      max-width: 75%;
    }
    .cx-msg-bubble-row.is-me {
      flex-direction: row-reverse;
      align-self: flex-end;
    }
    .cx-msg-avatar-sm {
      width: 28px; height: 28px;
      font-size: 11px;
    }
    .cx-msg-bubble-col {
      display: flex; flex-direction: column;
      min-width: 0;
    }
    .cx-msg-bubble-row.is-me .cx-msg-bubble-col { align-items: flex-end; }
    .cx-msg-sender {
      font-size: 11px;
      color: var(--cx-text-muted);
      margin-bottom: 3px;
      padding: 0 2px;
    }
    .cx-msg-bubble {
      padding: 0.55rem 0.85rem;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border-subtle);
      border-radius: var(--cx-radius-lg);
      border-top-left-radius: var(--cx-radius-xs);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      line-height: 1.5;
      word-break: break-word;
    }
    .cx-msg-bubble-row.is-me .cx-msg-bubble {
      background: var(--cx-primary-600);
      color: #fff;
      border-color: var(--cx-primary-600);
      border-top-left-radius: var(--cx-radius-lg);
      border-top-right-radius: var(--cx-radius-xs);
    }
    .cx-msg-time {
      font-size: 10px;
      color: var(--cx-text-subtle);
      margin-top: 3px;
      padding: 0 2px;
    }

    .cx-msg-composer {
      display: flex; gap: 0.5rem;
      padding: 0.85rem 1.25rem;
      border-top: 1px solid var(--cx-border);
      background: var(--cx-surface);
      flex-shrink: 0;
    }
    .cx-msg-composer-input {
      flex: 1;
      padding: 0.55rem 0.85rem;
      background: var(--cx-surface-2);
      border: 1px solid transparent;
      border-radius: var(--cx-radius-pill);
      font-size: var(--cx-text-sm);
      color: var(--cx-text);
      outline: none;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-msg-composer-input:hover { border-color: var(--cx-border); }
    .cx-msg-composer-input:focus {
      background: var(--cx-surface);
      border-color: var(--cx-primary-600);
      box-shadow: var(--cx-ring-focus);
    }

    /* ═══ Chip-style forms ═══ */
    .cx-msg-chips {
      display: flex; flex-wrap: wrap; gap: 6px;
      margin-top: 4px;
    }
    .cx-msg-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 10px;
      background: var(--cx-surface);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-pill);
      font-size: var(--cx-text-xs);
      color: var(--cx-text-secondary);
      cursor: pointer;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-msg-chip:hover { border-color: var(--cx-primary-200); color: var(--cx-text); }
    .cx-msg-chip.is-selected {
      background: var(--cx-primary-50);
      border-color: var(--cx-primary-600);
      color: var(--cx-primary-700);
      font-weight: 500;
    }
    .cx-msg-chip-gold.is-selected {
      background: var(--cx-accent-50);
      border-color: var(--cx-accent-500);
      color: var(--cx-accent-700);
    }

    /* Type switch (group/channel) */
    .cx-msg-type-switch {
      display: flex; gap: 6px;
      padding: 4px;
      background: var(--cx-surface-2);
      border-radius: var(--cx-radius-md);
      border: 1px solid var(--cx-border-subtle);
    }
    .cx-msg-type-opt {
      flex: 1;
      display: inline-flex; align-items: center; justify-content: center;
      gap: 6px;
      padding: 6px 10px;
      background: transparent; border: none;
      border-radius: var(--cx-radius-sm);
      font-size: var(--cx-text-xs); font-weight: 500;
      color: var(--cx-text-muted);
      cursor: pointer;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-msg-type-opt:hover:not(.is-active) { color: var(--cx-text); }
    .cx-msg-type-opt.is-active {
      background: var(--cx-surface);
      color: var(--cx-primary-700);
      box-shadow: var(--cx-shadow-xs);
    }

    .cx-msg-user-tags {
      display: flex; flex-wrap: wrap; gap: 4px;
      margin-top: 0.5rem;
    }
    .cx-msg-user-tag {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 4px 3px 10px;
      background: var(--cx-primary-50);
      color: var(--cx-primary-700);
      border-radius: var(--cx-radius-pill);
      font-size: var(--cx-text-xs);
      font-weight: 500;
    }
    .cx-msg-user-tag button {
      background: transparent; border: none;
      width: 18px; height: 18px;
      border-radius: 50%;
      display: inline-flex; align-items: center; justify-content: center;
      color: var(--cx-primary-600);
      cursor: pointer;
      font-size: 14px; line-height: 1;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-msg-user-tag button:hover { background: var(--cx-primary-100); }

    /* ═══ Manage Members dialog — current members list ═══ */
    .cx-msg-members-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .cx-msg-members-count {
      padding: 2px 8px;
      background: var(--cx-surface-2);
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-pill);
      font-size: 11px;
      font-weight: 600;
      color: var(--cx-text-secondary);
    }
    .cx-msg-members-subtle {
      font-size: 12px;
      color: var(--cx-text-muted);
      margin-top: 2px;
      margin-bottom: 8px;
    }
    .cx-msg-members-loading,
    .cx-msg-members-empty {
      padding: 16px;
      text-align: center;
      color: var(--cx-text-muted);
      font-size: 13px;
      background: var(--cx-surface-2);
      border: 1px dashed var(--cx-border);
      border-radius: var(--cx-radius-md);
    }
    .cx-msg-member-list {
      display: flex;
      flex-direction: column;
      max-height: 280px;
      overflow-y: auto;
      border: 1px solid var(--cx-border);
      border-radius: var(--cx-radius-md);
    }
    .cx-msg-member-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--cx-border-subtle);
    }
    .cx-msg-member-row:last-child { border-bottom: none; }
    .cx-msg-member-row:hover { background: var(--cx-surface-2); }

    .cx-msg-member-avatar {
      width: 32px; height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--cx-accent-600), var(--cx-accent-500));
      color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-weight: 600; font-size: 13px;
      flex-shrink: 0;
    }
    .cx-msg-member-meta {
      flex: 1;
      min-width: 0;
    }
    .cx-msg-member-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--cx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cx-msg-member-sub {
      font-size: 11px;
      color: var(--cx-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cx-msg-member-role {
      padding: 2px 8px;
      background: rgba(201, 162, 39, 0.12);
      border: 1px solid rgba(201, 162, 39, 0.35);
      color: var(--cx-gold-700, #8a6f1a);
      border-radius: var(--cx-radius-pill);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      flex-shrink: 0;
    }
    .cx-msg-member-remove {
      width: 28px; height: 28px;
      display: flex; align-items: center; justify-content: center;
      background: transparent;
      border: 1px solid var(--cx-border);
      border-radius: 50%;
      color: var(--cx-danger);
      cursor: pointer;
      flex-shrink: 0;
      transition: all var(--cx-dur-fast) var(--cx-ease-premium);
    }
    .cx-msg-member-remove:hover:not(:disabled) {
      background: var(--cx-danger);
      color: #fff;
      border-color: var(--cx-danger);
    }
    .cx-msg-member-remove:disabled {
      opacity: 0.5;
      cursor: wait;
    }
  `],
})
export class MessagingComponent implements OnInit, OnDestroy {
  panel: 'conversations' | 'channels' = 'conversations';
  conversations = signal<any[]>([]); channels = signal<any[]>([]);
  messages = signal<any[]>([]);
  listSearch = ''; activeId = ''; activeName = ''; activeType: 'conversation' | 'channel' = 'conversation';
  // Loan linked to the currently-open conversation, if any. Used by the
  // 'Loan Info' header button to render loan-detail inside a view dialog
  // without leaving the messaging page. Null when the active thread is a
  // channel or a loan-less direct conversation.
  activeLoanId: string | null = null;
  showLoanDetail = signal(false);
  newMessage = '';

  // Create channel
  showNewChannel = signal(false); channelSaving = signal(false);
  channelForm: any = { name: '', description: '', type: 'group' };
  departments = signal<any[]>([]); teams = signal<any[]>([]); users = signal<any[]>([]);
  selDepts: string[] = []; selTeams: string[] = []; selUsers: string[] = [];

  // Add members
  showAddMembers = signal(false); addMembersSaving = signal(false);
  // Manage members dialog state (replaces / wraps add-members)
  showManageMembers = signal(false);
  currentMembers = signal<any[]>([]);
  membersLoading = signal(false);
  manageSaving = signal(false);
  removingUserId = signal<string | null>(null);
  addDepts: string[] = []; addTeams: string[] = []; addUserIds: string[] = [];

  private pollInterval: any;
  // Separate interval for the sidebar list so unread counts stay
  // fresh even when the user has no thread selected. 15s keeps the
  // request rate reasonable for a background-tab.
  private listPollInterval: any;

  constructor(public auth: AuthService, private api: ApiService, private toast: ToastService) {}

  ngOnInit() {
    this.loadConversations();
    this.loadChannels();
    this.api.get('/departments', { per_page: 100 }).subscribe({ next: r => this.departments.set(r.data || []) });
    this.api.get('/teams', { per_page: 100 }).subscribe({ next: r => this.teams.set(r.data || []) });
    this.api.get('/users', { per_page: 500 }).subscribe({ next: r => this.users.set(r.data || []) });

    // Poll both conversation and channel lists every 15 seconds so
    // the unread badges in the sidebar update without needing a tab
    // click. The detail-panel poll (loadMessages, 5s) is separate and
    // only runs while a thread is active.
    this.listPollInterval = setInterval(() => {
      if (this.panel === 'conversations') {
        this.loadConversations();
      } else {
        this.loadChannels();
      }
    }, 15000);
  }

  ngOnDestroy() {
    clearInterval(this.pollInterval);
    clearInterval(this.listPollInterval);
  }

  loadConversations() { this.api.get('/conversations').subscribe({ next: r => this.conversations.set(r.data || []) }); }
  loadChannels() { this.api.get('/channels').subscribe({ next: r => this.channels.set(r.data || []) }); }

  // Filter tolerates either name field — agent_name is the canonical
  // backoffice-facing label, other_user_name is derived per-caller.
  filteredConversations() {
    const s = this.listSearch.toLowerCase();
    return this.conversations().filter(c => !s ||
      (c.other_user_name || c.agent_name || c.subject || '').toLowerCase().includes(s));
  }
  filteredChannels() { const s = this.listSearch.toLowerCase(); return this.channels().filter(c => !s || c.name.toLowerCase().includes(s)); }

  selectConversation(c: any) {
    this.activeId = c.id;
    this.activeName = c.other_user_name || c.agent_name || c.subject;
    this.activeType = 'conversation';
    // Conversations created from an approval flow get a loan_id (see
    // ApprovalEngineService::createConversation on the backend). Capture
    // it here so the header's Loan Info button knows what to open.
    // Manually-created direct messages that aren't tied to a loan will
    // have loan_id null — the button hides in that case.
    this.activeLoanId = c.loan_id || null;
    // If a previous thread had the loan modal open, close it now that
    // we've switched context — the old loan id is no longer relevant.
    if (this.showLoanDetail()) this.showLoanDetail.set(false);
    this.loadMessages();
    // Mark the thread as read now that the user has explicitly
    // opened it. Optimistically clear the unread count in the list
    // too so the badge disappears immediately — the backend PATCH
    // confirms it server-side.
    if ((c.unread_count || 0) > 0) {
      this.api.post(`/conversations/${c.id}/read`, {}).subscribe({
        next: () => {
          this.conversations.set(this.conversations().map(x =>
            x.id === c.id ? { ...x, unread_count: 0 } : x));
        },
        // Silent failure — the unread count will sync on next poll.
        error: () => {},
      });
    }
    clearInterval(this.pollInterval);
    this.pollInterval = setInterval(() => this.loadMessages(), 5000);
  }

  selectChannel(ch: any) {
    this.activeId = ch.id; this.activeName = ch.name; this.activeType = 'channel';
    // Channels aren't loan-scoped — clear any carry-over state so the
    // Loan Info button disappears and a leftover modal closes.
    this.activeLoanId = null;
    if (this.showLoanDetail()) this.showLoanDetail.set(false);
    this.loadMessages();
    // Same user-intent mark-read pattern as conversations. The
    // channel endpoint is mark-read, not read — mirrors the existing
    // route name (see MarkChannelReadAction).
    if ((ch.unread_count || 0) > 0) {
      this.api.post(`/channels/${ch.id}/mark-read`, {}).subscribe({
        next: () => {
          this.channels.set(this.channels().map(x =>
            x.id === ch.id ? { ...x, unread_count: 0 } : x));
        },
        error: () => {},
      });
    }
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

  /**
   * Open the Loan Details modal for the loan tied to the active
   * conversation. The loan-detail component fetches its own data via
   * its id input on instantiation, so no pre-load here — the modal
   * renders with its own loading spinner while the GET fires.
   *
   * Guarded on activeLoanId so a stray keystroke or stale state
   * doesn't surface an empty modal.
   */
  openLoanDetail() {
    if (!this.activeLoanId) return;
    this.showLoanDetail.set(true);
  }

  closeLoanDetail() {
    this.showLoanDetail.set(false);
  }

  saveChannel() {
    this.channelSaving.set(true);
    this.api.post('/channels', { ...this.channelForm, department_ids: this.selDepts, team_ids: this.selTeams, user_ids: this.selUsers }).subscribe({
      next: r => { this.channelSaving.set(false); this.toast.success(r.message || 'Created'); this.showNewChannel.set(false); this.panel = 'channels'; this.loadChannels(); },
      error: e => { this.channelSaving.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }

  /**
   * Open the Manage Members dialog for the currently-active channel.
   * Loads the member list from the server; the add-members picker
   * state (addDepts/addTeams/addUserIds) resets so it starts clean.
   *
   * Members are re-fetched every open because admin churn (somebody
   * joins/leaves another session) is real and stale data creates
   * confusing 'why is X still here' UX.
   */
  openManageMembers() {
    if (!this.activeId || this.activeType !== 'channel') return;
    this.addDepts = []; this.addTeams = []; this.addUserIds = [];
    this.showManageMembers.set(true);
    this.loadCurrentMembers();
  }

  closeManageMembers() {
    this.showManageMembers.set(false);
    this.currentMembers.set([]);
  }

  loadCurrentMembers() {
    if (!this.activeId) return;
    this.membersLoading.set(true);
    this.api.get(`/channels/${this.activeId}/members`).subscribe({
      next: r => { this.currentMembers.set(r.data || []); this.membersLoading.set(false); },
      error: () => this.membersLoading.set(false),
    });
  }

  /**
   * Remove a single member from the active channel.
   *
   * Optimistic-ish: we disable the row's X button via removingUserId
   * (spinner-like ellipsis) while the DELETE is in flight, then on
   * success we remove the row client-side. On error we clear the
   * spinner and surface the server's message (e.g. 'cannot remove
   * the last admin').
   */
  removeMember(m: any) {
    if (!this.activeId || !m?.user_id) return;
    if (!confirm(`Remove ${m.user_name} from this channel?`)) return;
    this.removingUserId.set(m.user_id);
    this.api.delete(`/channels/${this.activeId}/members/${m.user_id}`).subscribe({
      next: r => {
        this.removingUserId.set(null);
        this.toast.success(r.message || 'Member removed');
        // Local list update
        this.currentMembers.update(list => list.filter(x => x.user_id !== m.user_id));
      },
      error: e => {
        this.removingUserId.set(null);
        this.toast.error(e.error?.message || 'Failed to remove');
      },
    });
  }

  /**
   * Kept as a thin alias so legacy callsites (if any) still work.
   * The UI now only exposes openManageMembers via the thread header.
   */
  openAddMembers() { this.openManageMembers(); }

  saveAddMembers() {
    if (!this.activeId) return;
    // If nothing is selected, close the dialog gracefully — the user
    // may have opened Manage just to view/remove members and is clicking
    // the dialog's primary button to dismiss.
    if (this.addDepts.length === 0 && this.addTeams.length === 0 && this.addUserIds.length === 0) {
      this.closeManageMembers();
      return;
    }
    this.manageSaving.set(true);
    this.api.post(`/channels/${this.activeId}/members`, { department_ids: this.addDepts, team_ids: this.addTeams, user_ids: this.addUserIds }).subscribe({
      next: r => {
        this.manageSaving.set(false);
        this.toast.success(r.message || 'Members added');
        // Refresh the member list so the newly-added show up
        this.loadCurrentMembers();
        // Reset the add pickers so subsequent opens don't show stale selections
        this.addDepts = []; this.addTeams = []; this.addUserIds = [];
      },
      error: e => { this.manageSaving.set(false); this.toast.error(e.error?.message || 'Failed'); },
    });
  }

  toggle(arr: string, id: string) { (this as any)[arr] = (this as any)[arr].includes(id) ? (this as any)[arr].filter((x: string) => x !== id) : [...(this as any)[arr], id]; }
  userOptions(): SelectOption[] { return this.users().map((u: any) => ({ value: u.id, label: u.full_name, sublabel: u.email })); }
  onUserSelected(uid: string | null) { if (uid && !this.selUsers.includes(uid)) this.selUsers = [...this.selUsers, uid]; }
  onAddUserSelected(uid: string | null) { if (uid && !this.addUserIds.includes(uid)) this.addUserIds = [...this.addUserIds, uid]; }
  getUserName(uid: string): string { return this.users().find((u: any) => u.id === uid)?.full_name || uid.slice(0, 8); }
}
