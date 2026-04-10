import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { LucideAngularModule, LayoutDashboard, Users, Shield, MapPin, Settings, ScrollText, Database, FileText, UserCheck, Landmark, Building2, CreditCard, Banknote, BarChart3, ArrowLeftRight, Bell, MessageSquare, Menu, X, Moon, Sun, LogOut, ChevronDown, FolderKanban, Gavel, ChevronLeft } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  permission?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent {
  collapsed = signal(false);
  mobileMenuOpen = signal(false);

  navGroups: NavGroup[] = [
    {
      label: 'Overview',
      items: [
        { label: 'Dashboard', icon: 'layout-dashboard', route: '/dashboard' },
      ],
    },
    {
      label: 'Loan Operations',
      items: [
        { label: 'Customers', icon: 'users', route: '/customers', permission: 'customers.view' },
        { label: 'Loans', icon: 'file-text', route: '/loans', permission: 'loans.view' },
        { label: 'Approval Queue', icon: 'user-check', route: '/approval-queue', permission: 'loans.approve' },
        { label: 'Disbursements', icon: 'banknote', route: '/loans', permission: 'loans.disburse' },
        { label: 'Payments', icon: 'credit-card', route: '/payments', permission: 'payments.view' },
      ],
    },
    {
      label: 'Configuration',
      items: [
        { label: 'Loan Products', icon: 'folder-kanban', route: '/loan-products', permission: 'products.view' },
        { label: 'Fee Types', icon: 'landmark', route: '/fee-types', permission: 'products.view' },
        { label: 'Penalty Rules', icon: 'gavel', route: '/penalty-rules', permission: 'products.view' },
        { label: 'Approval Workflows', icon: 'git-branch-plus', route: '/approval-workflows', permission: 'products.view' },
        { label: 'Record Types', icon: 'database', route: '/record-types', permission: 'record_types.view' },
        { label: 'Gov. Records', icon: 'building-2', route: '/government-records', permission: 'records.view' },
      ],
    },
    {
      label: 'Accounting',
      items: [
        { label: 'Chart of Accounts', icon: 'landmark', route: '/accounting', permission: 'accounting.view' },
        { label: 'Reports', icon: 'bar-chart-3', route: '/reports', permission: 'reports.portfolio' },
        { label: 'Reconciliation', icon: 'arrow-left-right', route: '/reconciliation', permission: 'reports.reconciliation' },
      ],
    },
    {
      label: 'System',
      items: [
        { label: 'Users', icon: 'users', route: '/users', permission: 'users.view' },
        { label: 'Roles', icon: 'shield', route: '/roles', permission: 'roles.view' },
        { label: 'Locations', icon: 'map-pin', route: '/locations', permission: 'locations.view' },
        { label: 'Settings', icon: 'settings', route: '/settings', permission: 'settings.view' },
        { label: 'Notifications', icon: 'bell', route: '/notifications', permission: 'notifications.manage' },
        { label: 'Messages', icon: 'message-square', route: '/messaging', permission: 'messaging.view' },
        { label: 'Audit Logs', icon: 'scroll-text', route: '/audit-logs', permission: 'audit.view' },
      ],
    },
  ];

  // Bottom nav items for mobile
  mobileNav: NavItem[] = [
    { label: 'Home', icon: 'layout-dashboard', route: '/dashboard' },
    { label: 'Loans', icon: 'file-text', route: '/loans', permission: 'loans.view' },
    { label: 'Payments', icon: 'credit-card', route: '/payments', permission: 'payments.view' },
    { label: 'Reports', icon: 'bar-chart-3', route: '/reports', permission: 'reports.portfolio' },
    { label: 'Menu', icon: 'menu', route: '' },
  ];

  constructor(
    public auth: AuthService,
    public theme: ThemeService,
    private router: Router,
  ) {}

  get filteredGroups(): NavGroup[] {
    return this.navGroups.map(g => ({
      ...g,
      items: g.items.filter(i => !i.permission || this.auth.hasPermission(i.permission)),
    })).filter(g => g.items.length > 0);
  }

  get filteredMobileNav(): NavItem[] {
    return this.mobileNav.filter(i => !i.permission || this.auth.hasPermission(i.permission));
  }

  onMobileNavClick(item: NavItem): void {
    if (item.route === '') {
      this.mobileMenuOpen.set(true);
    } else {
      this.router.navigate([item.route]);
    }
  }

  logout(): void {
    this.auth.logout();
  }
}
