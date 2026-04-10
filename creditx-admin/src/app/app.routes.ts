import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'auth',
    canActivate: [guestGuard],
    children: [
      { path: 'login', loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent) },
      { path: '', redirectTo: 'login', pathMatch: 'full' },
    ],
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/layout/layout.component').then(m => m.LayoutComponent),
    children: [
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'users', loadComponent: () => import('./features/users/users.component').then(m => m.UsersComponent) },
      { path: 'roles', loadComponent: () => import('./features/roles/roles.component').then(m => m.RolesComponent) },
      { path: 'locations', loadComponent: () => import('./features/locations/locations.component').then(m => m.LocationsComponent) },
      { path: 'settings', loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent) },
      { path: 'audit-logs', loadComponent: () => import('./features/audit-logs/audit-logs.component').then(m => m.AuditLogsComponent) },
      { path: 'record-types', loadComponent: () => import('./features/record-types/record-types.component').then(m => m.RecordTypesComponent) },
      { path: 'government-records', loadComponent: () => import('./features/government-records/government-records.component').then(m => m.GovernmentRecordsComponent) },
      { path: 'customers', loadComponent: () => import('./features/customers/customers.component').then(m => m.CustomersComponent) },
      { path: 'customers/:id', loadComponent: () => import('./features/customers/customer-detail.component').then(m => m.CustomerDetailComponent) },
      { path: 'loan-products', loadComponent: () => import('./features/loan-products/loan-products.component').then(m => m.LoanProductsComponent) },
      { path: 'fee-types', loadComponent: () => import('./features/fee-types/fee-types.component').then(m => m.FeeTypesComponent) },
      { path: 'penalty-rules', loadComponent: () => import('./features/penalty-rules/penalty-rules.component').then(m => m.PenaltyRulesComponent) },
      { path: 'approval-workflows', loadComponent: () => import('./features/approval-workflows/approval-workflows.component').then(m => m.ApprovalWorkflowsComponent) },
      { path: 'loans', loadComponent: () => import('./features/loans/loans.component').then(m => m.LoansComponent) },
      { path: 'loans/:id', loadComponent: () => import('./features/loans/loan-detail.component').then(m => m.LoanDetailComponent) },
      { path: 'approval-queue', loadComponent: () => import('./features/approval-queue/approval-queue.component').then(m => m.ApprovalQueueComponent) },
      { path: 'payments', loadComponent: () => import('./features/payments/payments.component').then(m => m.PaymentsComponent) },
      { path: 'accounting', loadComponent: () => import('./features/accounting/accounting.component').then(m => m.AccountingComponent) },
      { path: 'reports', loadComponent: () => import('./features/reports/reports.component').then(m => m.ReportsComponent) },
      { path: 'reconciliation', loadComponent: () => import('./features/reconciliation/reconciliation.component').then(m => m.ReconciliationComponent) },
      { path: 'notifications', loadComponent: () => import('./features/notifications/notifications.component').then(m => m.NotificationsComponent) },
      { path: 'messaging', loadComponent: () => import('./features/messaging/messaging.component').then(m => m.MessagingComponent) },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
