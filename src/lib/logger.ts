// Single logging seam for the app. Today it just writes to the console,
// but every call site is already shaped like Sentry's API so swapping in
// `import * as Sentry from '@sentry/react-native'` later is a one-file
// change instead of a grep across the codebase.
//
// To wire Sentry:
//   1. npm install @sentry/react-native
//   2. Replace the body of captureException / captureMessage with the
//      Sentry equivalents (Sentry.captureException, Sentry.captureMessage)
//   3. Initialize Sentry in App.tsx with Sentry.init({ dsn: ... })

type Extras = Record<string, unknown>;

export function captureException(error: unknown, extras?: Extras): void {
  console.error('[error]', error, extras);
}

export function captureMessage(message: string, extras?: Extras): void {
  console.warn('[message]', message, extras);
}
