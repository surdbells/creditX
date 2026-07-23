import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';
import { resolveTenantSlug } from './environments/resolve-api-url';
import { App } from './app/app';

// Initialise Sentry before bootstrap. No-op when sentryDsn is empty. One shared
// DSN; environment = the tenant slug derived from the hostname, so one build
// reports per-tenant. Tagged app=portal.
if (environment.sentryDsn) {
  Sentry.init({
    dsn: environment.sentryDsn,
    environment: resolveTenantSlug('production'),
    initialScope: { tags: { app: 'portal' } },
    tracesSampleRate: 0,
  });
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
