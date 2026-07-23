/**
 * Per-tenant API base derived from the current hostname, so ONE build of the
 * admin app serves every client. The tenant slug is the first DNS label of the
 * host (a trailing `-admin` / `-portal` is stripped).
 *
 * Examples (flat scheme, default — all covered by the free *.creditx.cloud cert):
 *   acme-admin.creditx.cloud → https://acme-api.creditx.cloud/api
 *   acme.creditx.cloud       → https://acme-api.creditx.cloud/api
 *
 * Non-tenant hosts (localhost, *.pages.dev, *.github.io, the bare apex) fall
 * back to `fallback` — used only for local dev / previews.
 */

// ── Choose the scheme that matches your DNS + Cloudflare certs ──
// Flat (single-label hosts, covered by the FREE *.creditx.cloud Universal cert):
const TENANT_API_TEMPLATE = 'https://{slug}-api.creditx.cloud/api';
// Nested (needs an ACM wildcard cert for *.api.creditx.cloud). To use it,
// comment the line above and uncomment this one:
// const TENANT_API_TEMPLATE = 'https://{slug}.api.creditx.cloud/api';

const ROOT = 'creditx.cloud';
const RESERVED = ['api', 'admin', 'portal', 'www', 'app', 'status', 'docs'];

export function resolveApiUrl(fallback: string): string {
  try {
    const host = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
    // Only derive for a real tenant host *under* creditx.cloud (not the apex).
    if (host && host !== ROOT && host.endsWith('.' + ROOT)) {
      const slug = host.split('.')[0].replace(/-(admin|portal)$/, '');
      if (slug && RESERVED.indexOf(slug) === -1) {
        return TENANT_API_TEMPLATE.replace('{slug}', slug);
      }
    }
  } catch {
    // fall through to fallback
  }
  return fallback;
}

/**
 * Tenant slug from the hostname (fti, karicash, …), used to tag Sentry events
 * per deployment from a single shared build. Falls back off-platform.
 */
export function resolveTenantSlug(fallback: string): string {
  try {
    const host = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
    if (host && host !== ROOT && host.endsWith('.' + ROOT)) {
      const slug = host.split('.')[0].replace(/-(admin|portal)$/, '');
      if (slug && RESERVED.indexOf(slug) === -1) return slug;
    }
  } catch {
    // fall through
  }
  return fallback;
}
