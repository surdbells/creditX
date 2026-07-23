export const environment = {
  production: true,
  // Empty in production — the app resolves the tenant API at first run and
  // stores it. No single baked API URL, so one binary serves every client.
  apiUrl: '',
  // Template used to build a tenant's API base from an org code (e.g. "acme"
  // -> https://acme-api.creditx.cloud/api). Flat scheme (free *.creditx.cloud
  // cert). For the nested scheme use 'https://{slug}.api.creditx.cloud/api'.
  apiUrlTemplate: 'https://{slug}-api.creditx.cloud/api',
  // Force org selection before login in production.
  requireTenantSelection: true,
  // This build's version — compared against the tenant's mobile.min_agent_version.
  appVersion: '1.0.0',
  // Sentry DSN (public, embedded in the bundle). Empty disables Sentry.
  sentryDsn: 'https://3c8d3442acec6b609e3a9ee03e090159@o4511786578411521.ingest.us.sentry.io/4511786591977472',
};
