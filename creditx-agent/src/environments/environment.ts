export const environment = {
  production: false,
  // Fallback API used in dev when no tenant has been selected. In production
  // this is empty and the app forces tenant selection on first run.
  apiUrl: 'https://api.dostsuite.com/api',
  // Template used to build a tenant's API base from an org code entered at
  // first run. `{slug}` is replaced with the code (e.g. "acme"). Flat scheme
  // (free *.creditx.cloud cert). Nested: 'https://{slug}.api.creditx.cloud/api'.
  apiUrlTemplate: 'https://{slug}-api.creditx.cloud/api',
  // In dev we don't force org selection (uses apiUrl above).
  requireTenantSelection: false,
  // This build's version — compared against the tenant's mobile.min_agent_version.
  appVersion: '1.0.0',
};
