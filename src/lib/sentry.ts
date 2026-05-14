// Sentry SDK init for BetterStack Errors.
//
// BetterStack accepts the Sentry SDK protocol — the only change vs. a regular
// Sentry setup is swapping the DSN. Project ID in the DSN path is ignored by
// BetterStack but required by the SDK; any number works.
//
// Source maps: we emit them at build time (vite.config.ts: build.sourcemap)
// and rely on BetterStack to fetch them on demand via the `sourceMappingURL`
// reference in the JS bundle. No upload step needed.

import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const ENV = (import.meta.env.VITE_ENV as string | undefined) ?? 'development';
const RELEASE = import.meta.env.VITE_APP_VERSION as string | undefined;

let initialized = false;

export function initSentry() {
  if (initialized) return;
  if (!DSN) return; // No-op when unconfigured (dev / preview).

  Sentry.init({
    dsn: DSN,
    environment: ENV,
    release: RELEASE,

    // Pulls in window.onerror / unhandledrejection automatically.
    // We removed our manual handlers in main.tsx — Sentry does it better.
    integrations: [
      Sentry.browserTracingIntegration(),
    ],

    // Performance: 10% sampling in prod, 100% in dev/staging.
    tracesSampleRate: ENV === 'production' ? 0.1 : 1.0,

    // Don't ship local dev noise.
    enabled: ENV !== 'development',

    // Strip query strings and hashes from URLs — booking IDs etc. are PII-ish.
    beforeSend(event) {
      if (event.request?.url) {
        try {
          const url = new URL(event.request.url);
          event.request.url = `${url.origin}${url.pathname}`;
        } catch {
          // leave untouched
        }
      }
      return event;
    },

    // Cap breadcrumbs — booking flows are chatty.
    maxBreadcrumbs: 50,
  });

  initialized = true;
}

/**
 * Attach user context to every Sentry event. Called from UserContext on auth
 * change. Pass `null` on sign-out.
 */
export function setSentryUser(user: { id: string; role?: string | null } | null) {
  if (!initialized) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: user.id, role: user.role ?? undefined });
}

export { Sentry };
