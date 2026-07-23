import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';

// Initialise Sentry before bootstrap. No-op when sentryDsn is empty. The agent
// is one binary serving every tenant, so the environment is the tenant slug the
// agent selected (persisted in localStorage), defaulting to 'unselected' before
// they pick an org. Tagged app=agent.
if (environment.sentryDsn) {
  Sentry.init({
    dsn: environment.sentryDsn,
    environment: localStorage.getItem('cxa_tenant_slug') || 'unselected',
    initialScope: { tags: { app: 'agent' } },
    tracesSampleRate: 0,
  });
}

bootstrapApplication(AppComponent, appConfig)
  .catch(err => console.error(err));
