import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/capacitor';
import { init as sentryAngularInit } from '@sentry/angular';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';

// Initialise Sentry before bootstrap. @sentry/capacitor adds NATIVE crash
// reporting on device (unhandled native crashes, ANRs) on top of the JS-layer
// errors @sentry/angular catches — the Angular init is passed as the sibling so
// both layers report to the same DSN. No-op when sentryDsn is empty.
//
// The agent is one binary for every tenant, so environment is the selected
// tenant slug (persisted in localStorage), 'unselected' before they pick an org.
if (environment.sentryDsn) {
  Sentry.init(
    {
      dsn: environment.sentryDsn,
      environment: localStorage.getItem('cxa_tenant_slug') || 'unselected',
      initialScope: { tags: { app: 'agent' } },
      tracesSampleRate: 0,
    },
    sentryAngularInit,
  );
}

bootstrapApplication(AppComponent, appConfig)
  .catch(err => console.error(err));
