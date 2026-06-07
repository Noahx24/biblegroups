// Translates raw Supabase / network auth errors into short, user-friendly
// messages. Auth backends return terse or technical strings ("Invalid login
// credentials", "Database error querying schema") that shouldn't be shown to
// users verbatim. Anything we don't recognise falls back to a generic message
// so we never leak internals into the UI.

export type AuthMode = 'signIn' | 'signUp' | 'reset';

export function friendlyAuthError(error: unknown, mode: AuthMode): string {
  const raw = (error instanceof Error ? error.message : String(error)).toLowerCase();

  // Bad credentials on sign-in.
  if (raw.includes('invalid login credentials')) {
    return 'Incorrect email or password. Please try again.';
  }

  // Unconfirmed email.
  if (raw.includes('email not confirmed')) {
    return 'Please confirm your email first — check your inbox for the link.';
  }

  // Account already exists (signUp). Our own thrown message already reads well,
  // so pass it through; also catch Supabase's native phrasing.
  if (raw.includes('already exists') || raw.includes('already registered') || raw.includes('user already')) {
    return 'An account with that email already exists. Try signing in instead.';
  }

  // Weak / short password.
  if (raw.includes('password should be') || raw.includes('weak password')) {
    return 'That password is too weak. Use at least 6 characters.';
  }

  // Rate limiting.
  if (raw.includes('rate limit') || raw.includes('for security purposes') || raw.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }

  // Network / connectivity.
  if (raw.includes('network request failed') || raw.includes('failed to fetch') || raw.includes('timeout')) {
    return "Can't reach the server. Check your connection and try again.";
  }

  // Server-side database errors (e.g. broken signup trigger). Never surface raw.
  if (raw.includes('database error') || raw.includes('querying schema') || raw.includes('unexpected_failure')) {
    return "We couldn't complete that right now — something went wrong on our end. Please try again in a moment.";
  }

  // Generic fallback, phrased per action.
  switch (mode) {
    case 'signIn':
      return "We couldn't sign you in. Please try again.";
    case 'signUp':
      return "We couldn't create your account. Please try again.";
    case 'reset':
      return "We couldn't send the reset link. Please try again.";
  }
}

export function authErrorTitle(mode: AuthMode): string {
  switch (mode) {
    case 'signIn':
      return 'Sign-in failed';
    case 'signUp':
      return "Couldn't create account";
    case 'reset':
      return "Couldn't send reset link";
  }
}
