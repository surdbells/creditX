import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastContainerComponent } from '../../shared/components/toast/toast.component';
import { ChatBubbleComponent } from '../../shared/components/chat-bubble/chat-bubble.component';

interface NavItem { label: string; icon: string; route: string; permission?: string; }
interface NavGroup { label: string; items: NavItem[]; }

@Component({
  selector: 'app-layout', standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule, ToastContainerComponent, ChatBubbleComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent {
  collapsed = signal(false);
  mobileMenuOpen = signal(false);
  showProfile = signal(false);
  profileSaving = signal(false);
  profileForm: any = {};
  openSection = signal<string>('Loan Operations');

  navGroups: NavGroup[] = [
    { label: 'Overview', items: [
      { label: 'Dashboard', icon: 'layout-dashboard', route: '/dashboard' },
    ]},
    { label: 'Loan Operations', items: [
      { label: 'Customers', icon: 'users', route: '/customers', permission: 'customers.view' },
      { label: 'Loans', icon: 'file-text', route: '/loans', permission: 'loans.view' },
      { label: 'Approval Queue', icon: 'user-check', route: '/approval-queue', permission: 'loans.approve' },
      { label: 'Payments', icon: 'credit-card', route: '/payments', permission: 'payments.view' },
    ]},
    { label: 'Configuration', items: [
      { label: 'Loan Products', icon: 'folder-kanban', route: '/loan-products', permission: 'products.view' },
      { label: 'Fee Types', icon: 'landmark', route: '/fee-types', permission: 'products.view' },
      { label: 'Penalty Rules', icon: 'gavel', route: '/penalty-rules', permission: 'products.view' },
      { label: 'Approval Workflows', icon: 'check-circle', route: '/approval-workflows', permission: 'products.view' },
      { label: 'Record Types', icon: 'database', route: '/record-types', permission: 'record_types.view' },
      { label: 'Gov. Records', icon: 'building-2', route: '/government-records', permission: 'records.view' },
    ]},
    { label: 'Accounting', items: [
      { label: 'Chart of Accounts', icon: 'landmark', route: '/accounting', permission: 'accounting.view' },
      { label: 'Reports', icon: 'bar-chart-3', route: '/reports', permission: 'reports.portfolio' },
      { label: 'Reconciliation', icon: 'arrow-left-right', route: '/reconciliation', permission: 'reports.reconciliation' },
    ]},
    { label: 'System', items: [
      { label: 'Users', icon: 'users', route: '/users', permission: 'users.view' },
      { label: 'Departments', icon: 'building-2', route: '/departments', permission: 'users.view' },
      { label: 'Teams', icon: 'users', route: '/teams', permission: 'users.view' },
      { label: 'Roles', icon: 'shield', route: '/roles', permission: 'roles.view' },
      { label: 'Locations', icon: 'map-pin', route: '/locations', permission: 'locations.view' },
      { label: 'Settings', icon: 'settings', route: '/settings', permission: 'settings.view' },
      { label: 'Notifications', icon: 'bell', route: '/notifications', permission: 'notifications.manage' },
      { label: 'Messages', icon: 'message-square', route: '/messaging', permission: 'messaging.view' },
      { label: 'Audit Logs', icon: 'scroll-text', route: '/audit-logs', permission: 'audit.view' },
    ]},
  ];

  mobileNav: NavItem[] = [
    { label: 'Home', icon: 'layout-dashboard', route: '/dashboard' },
    { label: 'Loans', icon: 'file-text', route: '/loans', permission: 'loans.view' },
    { label: 'Payments', icon: 'credit-card', route: '/payments', permission: 'payments.view' },
    { label: 'Reports', icon: 'bar-chart-3', route: '/reports', permission: 'reports.portfolio' },
    { label: 'Menu', icon: 'menu', route: '' },
  ];

  constructor(public auth: AuthService, public theme: ThemeService, private router: Router, private api: ApiService, private toast: ToastService) {}

  get filteredGroups(): NavGroup[] {
    return this.navGroups.map(g => ({ ...g, items: g.items.filter(i => !i.permission || this.auth.hasPermission(i.permission)) })).filter(g => g.items.length > 0);
  }

  get filteredMobileNav(): NavItem[] {
    return this.mobileNav.filter(i => !i.permission || this.auth.hasPermission(i.permission));
  }

  toggleSection(label: string): void {
    this.openSection.set(this.openSection() === label ? '' : label);
  }

  isSectionOpen(label: string): boolean {
    return this.openSection() === label || label === 'Overview';
  }

  onMobileNavClick(item: NavItem): void {
    if (item.route === '') this.mobileMenuOpen.set(true);
    else this.router.navigate([item.route]);
  }

  logout(): void { this.auth.logout(); }

  openProfile(): void {
    const u = this.auth.user();
    this.profileForm = { first_name: u?.first_name || '', last_name: u?.last_name || '', phone: u?.phone || '', password: '', password_confirmation: '' };
    this.showProfile.set(true);
  }

  saveProfile(): void {
    this.profileSaving.set(true);
    const userId = this.auth.user()?.id;
    if (!userId) { this.profileSaving.set(false); return; }
    const payload: any = { first_name: this.profileForm.first_name, last_name: this.profileForm.last_name, phone: this.profileForm.phone };
    if (this.profileForm.password && this.profileForm.password.length >= 6) {
      if (this.profileForm.password !== this.profileForm.password_confirmation) {
        this.toast.error('Passwords do not match');
        this.profileSaving.set(false);
        return;
      }
      payload.password = this.profileForm.password;
    }
    this.api.put('/users/' + userId, payload).subscribe({
      next: () => {
        this.profileSaving.set(false);
        this.showProfile.set(false);
        this.toast.success('Profile updated');
        // Update stored user
        const u = this.auth.user();
        if (u) {
          const updated = { ...u, first_name: payload.first_name, last_name: payload.last_name, full_name: payload.first_name + ' ' + payload.last_name, phone: payload.phone };
          localStorage.setItem('creditx_user', JSON.stringify(updated));
        }
      },
      error: (e: any) => { this.profileSaving.set(false); this.toast.error(e.error?.message || 'Update failed'); },
    });
  }
}
