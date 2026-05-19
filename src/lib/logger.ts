// Single logging seam for the app.
//
// When EXPO_PUBLIC_SENTRY_DSN is set, captureException and captureMessage
// forward to Sentry; otherwise they fall through to console so the dev
// loop still surfaces problems. Call initLogger() once at app startup
// (App.tsx) - calling it without a DSN is a no-op.

import * as Sentry from '@sentry/react-native';

type Extras = Record<string, unknown>;

let initialized = false;

export function initLogger(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn || initialized) return;
  Sentry.init({
    dsn,
    release: process.env.EXPO_PUBLIC_APP_RELEASE,
    environment: __DEV__ ? 'development' : 'production',
    // Conservative sampling for now; raise once we trust the budget.
    tracesSampleRate: 0.1,
    // Don't ship PII unless we add a per-event scrubber.
    sendDefaultPii: false,
  });
  initialized = true;
}

export function captureException(error: unknown, extras?: Extras): void {
  if (initialized) {
    Sentry.captureException(error, extras ? { extra: extras } : undefined);
  } else {
    console.error('[error]', error, extras);
  }
}

export function captureMessage(message: string, extras?: Extras): void {
  if (initialized) {
    Sentry.captureMessage(message, extras ? { extra: extras } : undefined);
  } else {
    console.warn('[message]', message, extras);
  }
}
