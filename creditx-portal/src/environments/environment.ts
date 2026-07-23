import { resolveApiUrl } from './resolve-api-url';

export const environment = {
  production: true,
  // Auto-derived from the hostname on *.creditx.cloud (one build → all clients).
  // The fallback is used only off-platform (localhost / preview URLs).
  apiUrl: resolveApiUrl('http://localhost:8080/api'),
  sentryDsn: 'https://3c8d3442acec6b609e3a9ee03e090159@o4511786578411521.ingest.us.sentry.io/4511786591977472',
};
