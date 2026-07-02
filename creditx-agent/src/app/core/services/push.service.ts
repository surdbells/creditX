import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { TenantConfigService } from './tenant-config.service';

/**
 * Push notifications (FCM).
 *
 * Push is OPTIONAL — the app must work (and never crash) whether or not
 * Firebase is configured on the build. Historically, granting the
 * notification permission crashed the app because `register()` reaches into
 * FirebaseMessaging, which throws when the build has no `google-services.json`.
 * Everything here is therefore wrapped so any failure degrades to "no push"
 * instead of a crash, and the token registration is best-effort.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private registered = false;
  private starting = false;
  private readonly tenant = inject(TenantConfigService);

  constructor(private router: Router, private http: HttpClient) {}

  async init(): Promise<void> {
    // Web / SSR: nothing to do. Also guard against double-entry.
    if (!Capacitor.isNativePlatform() || this.registered || this.starting) return;
    this.starting = true;

    try {
      // Attach listeners BEFORE requesting/registering so failures surface as
      // events rather than bubbling up. addListener returns a Promise handle.
      await PushNotifications.addListener('registration', (token: Token) => {
        this.registerToken(token.value);
      });
      await PushNotifications.addListener('registrationError', (err) => {
        console.warn('[Push] registration error (push disabled):', err);
      });
      await PushNotifications.addListener('pushNotificationReceived', (_n: PushNotificationSchema) => {
        // In-app receipt — could surface a toast here.
      });
      await PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
        const data = action.notification.data || {};
        if (data.route) this.router.navigate([data.route]);
        else if (data.loan_id) this.router.navigate(['/loan-detail', data.loan_id]);
        else this.router.navigate(['/notifications']);
      });

      // Ask for permission (Android 13+ shows the POST_NOTIFICATIONS prompt).
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') {
        this.starting = false;
        return; // user declined — fine, no push
      }

      // Requires Firebase (google-services.json). If that isn't present the
      // native side throws; we swallow it so the app keeps running.
      await PushNotifications.register();
      this.registered = true;
    } catch (e) {
      // No FCM config or any native failure — push is off, app continues.
      console.warn('[Push] disabled (not configured or failed to init):', e);
      this.registered = false;
    } finally {
      this.starting = false;
    }
  }

  private registerToken(token: string): void {
    try {
      const accessToken = localStorage.getItem('cxa_access_token');
      if (!accessToken) return;
      this.http.post(`${this.tenant.getApiUrl()}/devices/register`, {
        token, platform: Capacitor.getPlatform(),
      }, { headers: { Authorization: `Bearer ${accessToken}` } }).subscribe({
        next: () => {},
        error: (e) => console.warn('[Push] token registration failed:', e),
      });
    } catch (e) {
      console.warn('[Push] token registration error:', e);
    }
  }
}
