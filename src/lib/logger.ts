// Single logging seam for the app.
//
// When EXPO_PUBLIC_SENTRY_DSN is set, captureException and captureMessage
// forward to Sentry; otherwise they fall through to console so the dev
// loop still surfaces problems. Call initLogger() once at app startup
// (App.tsx) — calling it without a DSN is a no-op.

import * as Sentry from '@sentry/react-native';
import { isRunningInExpoGo } from 'expo';

type Extras = Record<string, unknown>;

let initialized = false;

// Navigation instrumentation. Created at module load so App.tsx can register
// the NavigationContainer ref with it (see registerNavigation below). Holding a
// reference here keeps the "single logging seam" contract — App.tsx never
// imports @sentry/react-native directly. Harmless when Sentry is not initialized.
const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

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
    // Structured logging via Sentry.logger.*, correlated to traces.
    enableLogs: true,
    // Session Replay: always record sessions that hit an error; sample a slice
    // of the rest. Text and images are masked so we don't capture PII.
    // Native build only — a no-op in Expo Go.
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: __DEV__ ? 1.0 : 0.1,
    // Slow/frozen frame tracking; unsupported (and noisy) in Expo Go.
    enableNativeFramesTracking: !isRunningInExpoGo(),
    integrations: [
      navigationIntegration,
      Sentry.mobileReplayIntegration({ maskAllText: true, maskAllImages: true }),
    ],
  });
  initialized = true;
}

// Register the navigation container with Sentry's navigation instrumentation so
// screen transitions become spans / breadcrumbs. Safe to call when Sentry is
// not initialized — it simply does nothing useful. Pass App.tsx's navigationRef.
export function registerNavigation(
  ref: Parameters<typeof navigationIntegration.registerNavigationContainer>[0],
): void {
  navigationIntegration.registerNavigationContainer(ref);
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
