import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { TenantConfigService } from '../services/tenant-config.service';

export const authGuard: CanActivateFn = () => {
  // Must pick an organisation before anything else.
  if (inject(TenantConfigService).mustSelectTenant()) {
    inject(Router).navigate(['/tenant']);
    return false;
  }
  const auth = inject(AuthService);
  if (auth.isAuthenticated()) return true;
  inject(Router).navigate(['/auth']);
  return false;
};

export const guestGuard: CanActivateFn = () => {
  // Login requires a resolved tenant.
  if (inject(TenantConfigService).mustSelectTenant()) {
    inject(Router).navigate(['/tenant']);
    return false;
  }
  const auth = inject(AuthService);
  if (!auth.isAuthenticated()) return true;
  inject(Router).navigate(['/dashboard']);
  return false;
};

/** Only reachable when a tenant still needs selecting (else jump to login). */
export const tenantGuard: CanActivateFn = () => {
  const tenant = inject(TenantConfigService);
  if (tenant.mustSelectTenant()) return true;
  inject(Router).navigate(['/auth']);
  return false;
};
