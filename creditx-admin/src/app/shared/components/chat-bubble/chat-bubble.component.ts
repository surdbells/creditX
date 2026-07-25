import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'cx-chat-bubble',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule],
  template: `
    <a routerLink="/messaging" class="cx-btn cx-btn-ghost cx-btn-icon chat-bubble"
       [class.has-unread]="unreadCount() > 0" title="Messages" aria-label="Messages">
      <lucide-icon name="message-square" [size]="18"></lucide-icon>
      @if (unreadCount() > 0) {
        <span class="badge">{{ unreadCount() > 99 ? '99+' : unreadCount() }}</span>
      }
    </a>
  `,
  styles: [`
    /* Inline header button (sits next to the font-size control), no longer floating. */
    .chat-bubble { position: relative; text-decoration: none; }
    .badge {
      position: absolute; top: -3px; right: -3px;
      min-width: 16px; height: 16px; padding: 0 4px;
      background: var(--cx-danger); color: white;
      border-radius: 8px; font-size: 9px; font-weight: 700; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid var(--cx-surface, var(--cx-bg));
    }
  `],
})
export class ChatBubbleComponent implements OnInit, OnDestroy {
  unreadCount = signal(0);
  private interval: any;
  private audio: HTMLAudioElement | null = null;
  private lastCount = 0;

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.fetchUnread();
    this.interval = setInterval(() => this.fetchUnread(), 15000);
    // Preload notification sound
    try {
      this.audio = new Audio('data:audio/wav;base64,UklGRlQFAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YTAFAACAgICAgICAgICBhYqPk5aYmJaUkIuGgX17eHZ1dXV3eX2ChoqOkZOUlJORjoqFgHt3dHJxcXJ0d3uAhIiMj5GTlJSSj4yHgn14dXNycnN1eH2BhouOkZOUlJOSkI2IhIB7d3RycXFydHd7f4OHi46RkpOTkpCNiYWBfHh1c3FxcnR3e3+DiIyPkpSUlJOSj4yIhIB7eHVzcnJzdXh7f4OHi46Rk5SUlJKQjYmFgXx4dXNycXJzdnh8gISIjI+Sk5SUk5GQjYmFgXx5dnRzcnN1eHt/g4eLjpGTlJSTkpCNiYWBfHl2dHNyc3R3e3+Dh4uOkZOUlJOSkI2JhYF8eXZ0c3Jzc3Z5fIGFiYyPkpOUlJKQjomFgX16d3VzcnJzdXh8gISIjI+Sk5SUk5GPjImFgX16d3V0c3N0dnh8gISIjI+SkpOTkpCOioeEgH16d3V0c3N1d3p+goaJjZCSkpOTkpCOi4eDf3x5d3V0dHR2eXx/g4eKjZCSk5OTkZCOi4eDf3x5d3Z1dHV3eXx/goaJjI+Rk5OTkpGPjIiEgH17eHZ1dHV2eHt+goWJjI+RkpOTkpCOi4iEgH17eXd2dXV2eHt+gYWIi46QkpOTkpGPjImGg396eHZ1dXV3eXx/goaJjI6QkpKSkZCOi4iFgn98eXd2dXZ3eXt+gYWIi46QkpKSkZCOjIiGg4B9e3l3d3Z3eHp9gIKFiIuNj5GRkZCPjYuIhYOAfnx6eHd3d3h6fH6BhIeKjI6QkZGRkI+NjIqHhIKAfnx6eXh4eHl6fH6AgoWHio2PkJGRkI+OjIqIhoOBf317enl4eHl6e31/gYSHioyOkJGRkJCOjYuJhoSCgH58e3p5eXl6e31/gYOGiYuNj5CRkJCPjo2LiYeEgoB/fXt6enl6ent9f4GDhoiLjY+QkZCQj46NjImHhYKAf317e3p6ent8foCBg4aIi42PkJCQkI+OjYuJh4WDgX9+fHt7enp7fH5/gYOGiIqMjpCQkJCPjo2LiYeGhIKAf358fHt7e3x9fn+Bg4WIioyOkJCQkI+OjYyKiIaEg4GAf358fHt7e3x9fn+BgoSGiIqMjpCQkJCPj46Mi4mHhYSCgYB+fXx8e3t8fH5/gIKEhoiKjI6Pj4+Pj46NjIqJh4aEg4KBf358fHt8fH1+f4CCg4WHiYqMjo+Pj4+Ojo2Mi4mIhoWEg4KBf359fHx8fH1+f4CBgoSGiImLjI6Ojo6OjY2Mi4qIh4aFhIOCgYB/fn19fHx9fn5/gIGCg4WHiImLjI2Ojo6OjY2MjIqJiIeGhYSEg4KBgH9+fX19fX1+fn9/gIGCg4WHiImLjI2NjY2NjYyMi4qJiIeGhYWEg4KCAYB/f35+fn1+fn5/f4CBgoOEhoeIiouMjI2NjY2NjIyLi4qJiIiHhoaFhISDg4KBgYCAf39/fn5+f39/gICBgoKDhIWGh4iJiouLjIyMjIyMjIuLi4qKiYmIiIeHhoaFhYWEhIODgoKBgYGAgICAgA==');
    } catch (e) {}
  }

  ngOnDestroy(): void { clearInterval(this.interval); }

  private fetchUnread(): void {
    this.api.get('/messaging/unread-count').subscribe({
      next: res => {
        const count = res.data?.total || 0;
        if (count > this.lastCount && this.lastCount > 0) this.playSound();
        this.lastCount = count;
        this.unreadCount.set(count);
      },
      error: () => {},
    });
  }

  private playSound(): void {
    // play() returns a promise that REJECTS (not throws) when autoplay is
    // blocked before a user gesture — a try/catch can't catch it, so the
    // rejection escaped to the global ErrorHandler (Sentry PHP-6/PHP-7).
    this.audio?.play()?.catch(() => {});
  }
}
