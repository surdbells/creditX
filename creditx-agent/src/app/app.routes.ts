import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/auth.page').then(m => m.AuthPage),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/dashboard/dashboard.page').then(m => m.DashboardPage),
  },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'dashboard' },
];
