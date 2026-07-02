import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dosthq.creditxagent',
  appName: 'creditx-agent',
  webDir: 'www',
  plugins: {
    // Route HTTP through the native layer on device. This bypasses the
    // WebView's CORS enforcement entirely, so the multi-tenant app can call
    // any tenant's API (https://{slug}.api.creditx.cloud) without each backend
    // having to whitelist the Capacitor origin. It patches window.fetch and
    // XMLHttpRequest natively, so Angular's HttpClient uses it transparently.
    // No-op on web (dev/PWA still use normal fetch + CORS).
    //
    // Caveat: native HTTP does not emit fine-grained upload/download progress
    // events, so document-upload progress bars behave as indeterminate on
    // device (the request still completes normally).
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
