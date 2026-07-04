import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ThemeService } from '../../core/services/theme.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastContainerComponent } from '../../shared/components/toast/toast.component';
import { ChatBubbleComponent } from '../../shared/components/chat-bubble/chat-bubble.component';
import { FontScaleControlComponent } from '../../shared/components/font-scale-control/font-scale-control.component';
import { FontScaleService } from '../../core/services/font-scale.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  permission?: string;
  // OR-semantics: shown if the user has ANY of these. Used for the Performance
  // group where operators with only one of the three granular report
  // permissions still need the entry point. If both `permission` and
  // `anyPermission` are set, both must pass.
  anyPermission?: string[];
  // Query params appended when the nav link is followed. Used by the
  // Performance group to deep-link into /reports?tab=agent-performance —
  // ReportsComponent picks up `tab` from the URL on init.
  queryParams?: Record<string, string>;
}
interface NavGroup { label: string; items: NavItem[]; }

@Component({
  selector: 'app-layout', standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule, ToastContainerComponent, ChatBubbleComponent, FontScaleControlComponent],
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
      { label: 'Registration Approvals', icon: 'badge-check', route: '/registration-approvals', permission: 'customers.view' },
      { label: 'Loans', icon: 'file-text', route: '/loans', permission: 'loans.view' },
      { label: 'Approval Queue', icon: 'user-check', route: '/approval-queue', permission: 'loans.approve' },
      { label: 'Disbursement Queue', icon: 'banknote', route: '/disbursement-queue', permission: 'loans.disburse' },
      { label: 'Bulk Disburse', icon: 'upload', route: '/disbursement/bulk', permission: 'loans.disburse' },
      { label: 'Maker-Checker', icon: 'gavel', route: '/maker-checker', permission: 'maker_checker.check' },
      { label: 'Payments', icon: 'credit-card', route: '/payments', permission: 'payments.view' },
    ]},
    { label: 'Deposits', items: [
      { label: 'Deposit Accounts', icon: 'piggy-bank', route: '/deposit-accounts', permission: 'deposits.view' },
      { label: 'Deposit Products', icon: 'folder-kanban', route: '/deposit-products', permission: 'deposits.view' },
      { label: 'Interest Run', icon: 'percent', route: '/deposit-interest', permission: 'deposits.interest' },
    ]},
    // Reports — top-level group with one sidebar entry per report.
    // Replaces:
    //   - The old 'Performance' group (4 entries) which deep-linked into
    //     /reports?tab=...; tabs are gone, each is now its own route.
    //   - The reports nested inside 'Accounting' (CBN Returns, General
    //     Loan Report, the catch-all 'Reports' link) — those moved here.
    //   - The card-grid landing at /reports — replaced by sidebar nav.
    // 'anyPermission' on the group itself means it shows when the user
    // can see at least one entry within. Individual entries still gate
    // by their own permission so users only see what they can access.
    { label: 'Reports', items: [
      { label: 'Loan Portfolio',         icon: 'bar-chart-3',     route: '/reports/portfolio',            permission: 'reports.portfolio' },
      { label: 'Portfolio at Risk',      icon: 'alert-triangle',  route: '/reports/par',                  permission: 'reports.par' },
      { label: 'PAR30 / 60 / 90',        icon: 'shield-alert',    route: '/reports/portfolio-at-risk',    permission: 'reports.par' },
      { label: 'Receivables',            icon: 'clock',           route: '/reports/receivables',          permission: 'reports.portfolio' },
      { label: 'Closed Loans',           icon: 'check-circle',    route: '/reports/closed-loans',         permission: 'reports.portfolio' },
      { label: 'Repayment Performance',  icon: 'trending-up',     route: '/reports/repayment',            permission: 'reports.portfolio' },
      { label: 'Collection Efficiency',  icon: 'target',          route: '/reports/collection',           permission: 'reports.portfolio' },
      { label: 'Agent Performance',      icon: 'user-round',      route: '/reports/agent-performance',    permission: 'reports.performance.agents' },
      { label: 'Branch Performance',     icon: 'building',        route: '/reports/branch-performance',   permission: 'reports.performance.branches' },
      { label: 'Product Performance',    icon: 'package',         route: '/reports/product-performance',  permission: 'reports.performance.products' },
      { label: 'Approver Performance',   icon: 'shield-check',    route: '/reports/approver-performance', permission: 'reports.performance.approvers' },
      { label: 'General Loan Report',    icon: 'file-spreadsheet', route: '/reports/loans',               permission: 'reports.general_loans' },
      { label: 'CBN Returns',            icon: 'file-spreadsheet', route: '/reports/cbn-returns',         permission: 'reports.cbn' },
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
      { label: 'Journal Entries', icon: 'scroll-text', route: '/journal-entries', permission: 'accounting.view' },
      { label: 'GL Reconciliation', icon: 'scale', route: '/gl-reconciliation', permission: 'accounting.view' },
      { label: 'Income Statement', icon: 'trending-up', route: '/reports/income-statement', permission: 'accounting.view' },
      { label: 'Balance Sheet', icon: 'file-text', route: '/reports/balance-sheet', permission: 'accounting.view' },
      { label: 'Cash Flow Statement', icon: 'arrow-left-right', route: '/reports/cash-flow', permission: 'accounting.view' },
      { label: 'Aged Receivables', icon: 'clock', route: '/reports/aged-receivables', permission: 'accounting.view' },
      { label: 'Period Close', icon: 'lock', route: '/period-close', permission: 'accounting.close' },
      { label: 'Budgets', icon: 'dollar-sign', route: '/budgets', permission: 'accounting.view' },
      { label: 'Budget vs Actual', icon: 'bar-chart-3', route: '/reports/budget-vs-actual', permission: 'accounting.view' },
      { label: 'Provisions', icon: 'shield-alert', route: '/provisions', permission: 'accounting.provision' },
      { label: 'Interest Accrual', icon: 'trending-up', route: '/interest-accrual', permission: 'accounting.provision' },
      { label: 'Reconciliation', icon: 'arrow-left-right', route: '/reconciliation', permission: 'reports.reconciliation' },
      { label: 'Bank Reconciliation', icon: 'landmark', route: '/bank-reconciliation', permission: 'reports.reconciliation' },
      { label: 'Fixed Assets', icon: 'package', route: '/fixed-assets', permission: 'accounting.view' },
      { label: 'Accounts Payable', icon: 'banknote', route: '/accounts-payable', permission: 'accounting.view' },
      { label: 'Tax (VAT/WHT)', icon: 'percent', route: '/tax', permission: 'accounting.view' },
    ]},
    { label: 'System', items: [
      { label: 'Users', icon: 'users', route: '/users', permission: 'users.view' },
      { label: 'Departments', icon: 'building-2', route: '/departments', permission: 'users.view' },
      { label: 'Teams', icon: 'users', route: '/teams', permission: 'users.view' },
      { label: 'Roles', icon: 'shield', route: '/roles', permission: 'roles.view' },
      { label: 'Locations', icon: 'map-pin', route: '/locations', permission: 'locations.view' },
      { label: 'Settings', icon: 'settings', route: '/settings', permission: 'settings.view' },
      { label: 'Branding', icon: 'palette', route: '/branding', permission: 'settings.edit' },
      { label: 'Agent Targets', icon: 'target', route: '/agent-targets', permission: 'settings.view' },
      { label: 'Notifications', icon: 'bell', route: '/notifications', permission: 'notifications.manage' },
      { label: 'Agent Broadcast', icon: 'send', route: '/agent-broadcast', permission: 'notifications.manage' },
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

  constructor(public auth: AuthService, public theme: ThemeService, public settings: SettingsService, private router: Router, private api: ApiService, private toast: ToastService, private _fontScale: FontScaleService) {}

  get filteredGroups(): NavGroup[] {
    return this.navGroups.map(g => ({ ...g, items: g.items.filter(i => this.isItemAccessible(i)) })).filter(g => g.items.length > 0);
  }

  /**
   * Visibility rules for a nav item:
   *   - No permission fields set    -> always visible
   *   - permission set              -> user must hold it
   *   - anyPermission set           -> user must hold AT LEAST ONE
   *   - Both set                    -> both gates apply (permission AND any)
   * Super admin short-circuits all gates via auth.hasPermission.
   */
  private isItemAccessible(item: NavItem): boolean {
    if (item.permission && !this.auth.hasPermission(item.permission)) return false;
    if (item.anyPermission && item.anyPermission.length > 0) {
      if (!item.anyPermission.some(p => this.auth.hasPermission(p))) return false;
    }
    return true;
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
