export const environment = {
  production: true,
  // Empty in production — the app resolves the tenant API at first run and
  // stores it. No single baked API URL, so one binary serves every client.
  apiUrl: '',
  // Template used to build a tenant's API base from an org code (e.g. "acme"
  // -> https://acme.api.creditx.app/api).
  apiUrlTemplate: 'https://{slug}.api.creditx.app/api',
  // Force org selection before login in production.
  requireTenantSelection: true,
  // This build's version — compared against the tenant's mobile.min_agent_version.
  appVersion: '1.0.0',
};
