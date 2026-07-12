import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    // Public loan calculator — no auth guard so prospective customers can
    // estimate repayments before registering or signing in.
    path: 'calculator',
    loadComponent: () => import('./features/calculator/loan-calculator.component').then(m => m.LoanCalculatorComponent),
  },
  {
    path: 'auth',
    canActivate: [guestGuard],
    children: [
      {
        path: 'login',
        loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent),
      },
      {
        path: 'register',
        loadComponent: () => import('./features/auth/register.component').then(m => m.RegisterComponent),
      },
      {
        path: 'verify-email',
        loadComponent: () => import('./features/auth/verify-email.component').then(m => m.VerifyEmailComponent),
      },
      { path: '', redirectTo: 'login', pathMatch: 'full' },
    ],
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/portal-shell.component').then(m => m.PortalShellComponent),
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'loans',
        loadComponent: () => import('./features/loans/my-loans.component').then(m => m.MyLoansComponent),
      },
      {
        path: 'loans/apply',
        loadComponent: () => import('./features/loans/apply-loan.component').then(m => m.ApplyLoanComponent),
      },
      {
        path: 'loans/:id',
        loadComponent: () => import('./features/loans/loan-detail.component').then(m => m.LoanDetailComponent),
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent),
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '' },
];
