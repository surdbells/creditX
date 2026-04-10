import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  permission?: string;
}

@Component({
  selector: 'app-layout',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent {
  sidebarCollapsed = signal(false);

  navItems: NavItem[] = [
    { label: 'Dashboard', icon: '📊', route: '/dashboard' },
    { label: 'Users', icon: '👥', route: '/users', permission: 'users.view' },
    { label: 'Roles', icon: '🔐', route: '/roles', permission: 'roles.view' },
    { label: 'Locations', icon: '📍', route: '/locations', permission: 'locations.view' },
    { label: 'Settings', icon: '⚙️', route: '/settings', permission: 'settings.view' },
    { label: 'Audit Logs', icon: '📋', route: '/audit-logs', permission: 'audit.view' },
  ];

  constructor(public authService: AuthService) {}

  get visibleNavItems(): NavItem[] {
    return this.navItems.filter(item =>
      !item.permission || this.authService.hasPermission(item.permission)
    );
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update(v => !v);
  }

  logout(): void {
    this.authService.logout();
  }
}
