import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PushService {
  private registered = false;

  constructor(private router: Router, private http: HttpClient) {}

  async init(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    if (this.registered) return;

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;

    await PushNotifications.register();

    // Token received — send to backend
    PushNotifications.addListener('registration', (token: Token) => {
      console.log('[Push] Token:', token.value);
      this.registerToken(token.value);
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[Push] Registration error:', err);
    });

    // Notification received while app is open
    PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      console.log('[Push] Received:', notification);
      // Could show in-app toast here
    });

    // User tapped notification
    PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      console.log('[Push] Action:', action);
      const data = action.notification.data;
      if (data?.route) this.router.navigate([data.route]);
      else if (data?.loan_id) this.router.navigate(['/loan-detail', data.loan_id]);
      else this.router.navigate(['/notifications']);
    });

    this.registered = true;
  }

  private registerToken(token: string): void {
    const accessToken = localStorage.getItem('cxa_access_token');
    if (!accessToken) return;
    this.http.post(`${environment.apiUrl}/devices/register`, {
      token, platform: Capacitor.getPlatform(),
    }, { headers: { Authorization: `Bearer ${accessToken}` } }).subscribe({
      next: () => console.log('[Push] Token registered'),
      error: (e) => console.error('[Push] Token registration failed:', e),
    });
  }
}
