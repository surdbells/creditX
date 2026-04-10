import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: 'auth', canActivate: [guestGuard], loadComponent: () => import('./pages/auth/auth.page').then(m => m.AuthPage) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/tabs/tabs.page').then(m => m.TabsPage),
    children: [
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard.page').then(m => m.DashboardPage) },
      { path: 'loans', loadComponent: () => import('./pages/loan-list/loan-list.page').then(m => m.LoanListPage) },
      { path: 'loans/new', loadComponent: () => import('./pages/loan-capture/loan-capture.page').then(m => m.LoanCapturePage) },
      { path: 'loans/:id', loadComponent: () => import('./pages/loan-detail/loan-detail.page').then(m => m.LoanDetailPage) },
      { path: 'lookup', loadComponent: () => import('./pages/lookup/lookup.page').then(m => m.LookupPage) },
      { path: 'calculator', loadComponent: () => import('./pages/calculator/calculator.page').then(m => m.CalculatorPage) },
      { path: 'messages', loadComponent: () => import('./pages/messages/messages.page').then(m => m.MessagesPage) },
      { path: 'messages/:id', loadComponent: () => import('./pages/message-thread/message-thread.page').then(m => m.MessageThreadPage) },
      { path: 'notifications', loadComponent: () => import('./pages/notifications/notifications.page').then(m => m.NotificationsPage) },
      { path: 'profile', loadComponent: () => import('./pages/profile/profile.page').then(m => m.ProfilePage) },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
