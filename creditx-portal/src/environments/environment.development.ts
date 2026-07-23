import { resolveApiUrl } from './resolve-api-url';

export const environment = {
  production: false,
  // Auto-derived from the hostname on *.creditx.cloud; fallback for local dev.
  apiUrl: resolveApiUrl('http://localhost:8080/api'),
  sentryDsn: '',
};
