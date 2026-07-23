import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/capacitor';
import { init as sentryAngularInit } from '@sentry/angular';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';

/**
 * Initialise Sentry, then bootstrap.
 *
 * @sentry/capacitor adds NATIVE crash/ANR reporting on device on top of the
 * JS-layer errors @sentry/angular catches — the Angular init is passed as the
 * sibling so both report to the same DSN. No-op when sentryDsn is empty.
 *
 * `release` is wired to the REAL native build (versionName + versionCode) via
 * App.getInfo(), formatted `com.dosthq.creditxagent@1.7+3`, so crashes group by
 * app version in Sentry. We await it before init so the release is set on the
 * very first event. On web (dev/PWA) there's no native package, so release is
 * left unset. environment is the selected tenant slug (one binary → all tenants).
 */
async function boot(): Promise<void> {
  if (environment.sentryDsn) {
    let release: string | undefined;
    try {
      if (Capacitor.isNativePlatform()) {
        const info = await App.getInfo();
        release = `${info.id}@${info.version}+${info.build}`;
      }
    } catch {
      // App plugin unavailable — proceed without an explicit release.
    }

    Sentry.init(
      {
        dsn: environment.sentryDsn,
        environment: localStorage.getItem('cxa_tenant_slug') || 'unselected',
        release,
        initialScope: { tags: { app: 'agent' } },
        tracesSampleRate: 0,
      },
      sentryAngularInit,
    );
  }

  await bootstrapApplication(AppComponent, appConfig);
}

boot().catch(err => console.error(err));
