import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';
import { resolveTenantSlug } from './environments/resolve-api-url';
import { App } from './app/app';

// Initialise Sentry before bootstrap. No-op when sentryDsn is empty, so it's
// safe on any deployment. One shared DSN; the environment is the tenant slug
// (fti, karicash) derived from the hostname, matching how the API URL is
// resolved — so one build reports per-tenant.
if (environment.sentryDsn) {
  Sentry.init({
    dsn: environment.sentryDsn,
    environment: resolveTenantSlug('production'),
    initialScope: { tags: { app: 'admin' } },
    tracesSampleRate: 0,
  });
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
