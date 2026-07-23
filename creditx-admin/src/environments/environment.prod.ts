import { resolveApiUrl } from './resolve-api-url';

export const environment = {
  production: true,
  // Auto-derived from the hostname on *.creditx.cloud (one build → all clients).
  // The fallback is used only off-platform (localhost / preview URLs).
  apiUrl: resolveApiUrl('http://localhost:8080/api'),
  // Sentry DSN — public (embedded in the bundle). Empty disables Sentry.
  sentryDsn: '',
};
