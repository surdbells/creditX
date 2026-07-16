import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { IonContent, IonSpinner, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { businessOutline, arrowForwardOutline, warningOutline } from 'ionicons/icons';
import { TenantConfigService } from '../../core/services/tenant-config.service';
import { firstValueFrom } from 'rxjs';

/**
 * Tenant selection — the first screen a fresh install shows (production).
 *
 * The agent enters their organisation code; the app builds
 * `https://{code}-api.creditx.cloud/api`, validates it by fetching the tenant's
 * public settings (unauthenticated), checks the app isn't below the tenant's
 * minimum supported version, then stores the tenant and continues to login.
 */
@Component({
  selector: 'app-tenant',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonSpinner, IonIcon],
  template: `
    <ion-content class="ion-padding">
      <div class="wrap">
        <div class="brand">
          <ion-icon name="business-outline"></ion-icon>
          <h1>Choose your organization</h1>
          <p>Enter the organization code your administrator gave you.</p>
        </div>

        <label class="lbl">Organization code</label>
        <input class="inp" type="text" inputmode="text" autocapitalize="none" autocomplete="off"
               placeholder="e.g. acme" [(ngModel)]="code" (keyup.enter)="connect()" [disabled]="loading()" />

        @if (error()) {
          <div class="err"><ion-icon name="warning-outline"></ion-icon><span>{{ error() }}</span></div>
        }

        <button class="btn" (click)="connect()" [disabled]="loading() || !code.trim()">
          @if (loading()) { <ion-spinner name="crescent"></ion-spinner> }
          @else { <span>Continue</span><ion-icon name="arrow-forward-outline"></ion-icon> }
        </button>

        <p class="hint">You’ll sign in on the next screen.</p>
      </div>
    </ion-content>
  `,
  styles: [`
    .wrap { max-width: 420px; margin: 0 auto; padding-top: 12vh; display: flex; flex-direction: column; }
    .brand { text-align: center; margin-bottom: 28px; }
    .brand ion-icon { font-size: 44px; color: var(--ion-color-primary); }
    .brand h1 { font-size: 22px; font-weight: 700; margin: 12px 0 6px; }
    .brand p { color: var(--ion-color-medium); font-size: 14px; margin: 0; }
    .lbl { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--ion-color-medium); margin-bottom: 6px; }
    .inp { width: 100%; padding: 14px 16px; font-size: 16px; border: 1px solid var(--ion-color-step-200, #ccc); border-radius: 12px; background: var(--ion-background-color); color: var(--ion-text-color); }
    .btn { margin-top: 18px; width: 100%; padding: 15px; font-size: 16px; font-weight: 600; border: none; border-radius: 12px;
      background: var(--ion-color-primary); color: #fff; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .btn:disabled { opacity: .6; }
    .err { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding: 10px 12px; border-radius: 10px;
      background: rgba(235,68,90,.12); color: var(--ion-color-danger); font-size: 14px; }
    .hint { text-align: center; color: var(--ion-color-medium); font-size: 13px; margin-top: 16px; }
  `],
})
export class TenantPage {
  code = '';
  loading = signal(false);
  error = signal<string | null>(null);

  constructor(private http: HttpClient, private router: Router, private tenant: TenantConfigService) {
    addIcons({ businessOutline, arrowForwardOutline, warningOutline });
    // Prefill if switching org.
    this.code = this.tenant.tenantSlug() || '';
  }

  async connect(): Promise<void> {
    this.error.set(null);
    const slug = this.tenant.normaliseCode(this.code);
    if (!slug) { this.error.set('Enter a valid organization code (letters, numbers, dashes).'); return; }

    const apiUrl = this.tenant.buildApiUrl(slug);
    this.loading.set(true);
    try {
      const res: any = await firstValueFrom(this.http.get(`${apiUrl}/settings/public`, {
        headers: new HttpHeaders({ 'X-Skip-Error-Toast': '1' }),
      }));
      const data = res?.data || {};
      const min = data['mobile.min_agent_version'];
      // Make sure the real build version is resolved before comparing —
      // otherwise this would fall back to the environment constant and gate
      // on the wrong version.
      await this.tenant.ensureAppInfo();
      if (this.tenant.isOutdated(this.tenant.appVersion(), min)) {
        this.error.set(`This app is out of date for ${data['general.company_name'] || 'this organization'}. Please update to continue.`);
        this.loading.set(false);
        return;
      }
      const name = data['general.company_name'] || slug;
      this.tenant.setTenant(slug, apiUrl, name);
      this.loading.set(false);
      this.router.navigate(['/auth'], { replaceUrl: true });
    } catch (e: any) {
      this.loading.set(false);
      const status = e?.status;
      if (status === 0) this.error.set('Could not reach that organization. Check the code and your connection.');
      else if (status === 404) this.error.set('Organization not found. Check the code with your administrator.');
      else this.error.set('Could not connect to that organization. Please try again.');
    }
  }
}
