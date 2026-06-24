import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../core/services/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-portal-shell',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule],
  template: `
    <div class="min-h-screen flex" style="background: var(--cx-bg)">
      <!-- Sidebar (desktop) -->
      <aside class="hidden lg:flex flex-col w-[var(--cx-sidebar-width)] shrink-0 border-r"
        style="background: var(--cx-surface); border-color: var(--cx-border)">
        <div class="h-[var(--cx-topbar-height)] flex items-center gap-2.5 px-5 border-b" style="border-color: var(--cx-border)">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center"
            style="background: var(--cx-primary-600); color: #fff">
            <lucide-icon name="wallet" [size]="20"></lucide-icon>
          </div>
          <span class="text-lg font-bold tracking-tight" style="color: var(--cx-text)">CreditX</span>
        </div>
        <nav class="flex-1 p-3 flex flex-col gap-1">
          @for (item of nav; track item.route) {
            <a [routerLink]="item.route" routerLinkActive="cx-nav-active"
              class="cx-nav-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors">
              <lucide-icon [name]="item.icon" [size]="18"></lucide-icon>
              {{ item.label }}
            </a>
          }
        </nav>
        <div class="p-3 border-t" style="border-color: var(--cx-border)">
          <button (click)="logout()" class="cx-nav-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full">
            <lucide-icon name="log-out" [size]="18"></lucide-icon>
            Sign out
          </button>
        </div>
      </aside>

      <!-- Mobile drawer -->
      @if (drawerOpen()) {
        <div class="lg:hidden fixed inset-0 z-[1040]" (click)="drawerOpen.set(false)">
          <div class="absolute inset-0 bg-black/40"></div>
          <aside class="absolute left-0 top-0 bottom-0 w-64 flex flex-col border-r cx-animate-slide"
            style="background: var(--cx-surface); border-color: var(--cx-border)" (click)="$event.stopPropagation()">
            <div class="h-[var(--cx-topbar-height)] flex items-center justify-between px-5 border-b" style="border-color: var(--cx-border)">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-lg flex items-center justify-center" style="background: var(--cx-primary-600); color: #fff">
                  <lucide-icon name="wallet" [size]="20"></lucide-icon>
                </div>
                <span class="text-lg font-bold tracking-tight" style="color: var(--cx-text)">CreditX</span>
              </div>
              <button (click)="drawerOpen.set(false)" class="cx-btn-ghost !p-1.5 rounded-md">
                <lucide-icon name="x" [size]="18"></lucide-icon>
              </button>
            </div>
            <nav class="flex-1 p-3 flex flex-col gap-1">
              @for (item of nav; track item.route) {
                <a [routerLink]="item.route" routerLinkActive="cx-nav-active" (click)="drawerOpen.set(false)"
                  class="cx-nav-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium">
                  <lucide-icon [name]="item.icon" [size]="18"></lucide-icon>
                  {{ item.label }}
                </a>
              }
            </nav>
            <div class="p-3 border-t" style="border-color: var(--cx-border)">
              <button (click)="logout()" class="cx-nav-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full">
                <lucide-icon name="log-out" [size]="18"></lucide-icon>
                Sign out
              </button>
            </div>
          </aside>
        </div>
      }

      <!-- Main column -->
      <div class="flex-1 flex flex-col min-w-0">
        <header class="h-[var(--cx-topbar-height)] flex items-center justify-between px-4 sm:px-6 border-b sticky top-0 z-[1020]"
          style="background: var(--cx-surface); border-color: var(--cx-border)">
          <button (click)="drawerOpen.set(true)" class="lg:hidden cx-btn-ghost !p-1.5 rounded-md">
            <lucide-icon name="menu" [size]="20"></lucide-icon>
          </button>
          <div class="hidden lg:block"></div>
          <div class="flex items-center gap-3">
            <div class="text-right hidden sm:block">
              <p class="text-sm font-semibold leading-tight" style="color: var(--cx-text)">{{ displayName() }}</p>
              <p class="text-xs leading-tight" style="color: var(--cx-text-muted)">{{ customer()?.email }}</p>
            </div>
            <div class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold"
              style="background: var(--cx-primary-100); color: var(--cx-primary-700)">
              {{ initials() }}
            </div>
          </div>
        </header>

        <main class="flex-1 p-4 sm:p-6 max-w-5xl w-full mx-auto cx-animate-in">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: [`
    .cx-nav-link { color: var(--cx-text-secondary); }
    .cx-nav-link:hover { background: var(--cx-surface-hover); color: var(--cx-text); }
    .cx-nav-active { background: var(--cx-surface-subtle); color: var(--cx-primary-600) !important; font-weight: 600; }
  `],
})
export class PortalShellComponent {
  private auth = inject(AuthService);

  drawerOpen = signal(false);
  customer = this.auth.customer;

  nav: NavItem[] = [
    { label: 'Dashboard', icon: 'layout-dashboard', route: '/dashboard' },
    { label: 'My loans', icon: 'file-text', route: '/loans' },
    { label: 'Apply for a loan', icon: 'plus-circle', route: '/loans/apply' },
    { label: 'Profile', icon: 'user', route: '/profile' },
  ];

  displayName = computed(() => {
    const c = this.customer();
    return c?.full_name || c?.email || 'Customer';
  });

  initials = computed(() => {
    const name = this.displayName();
    return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || 'C';
  });

  logout(): void {
    this.auth.logout();
  }
}
