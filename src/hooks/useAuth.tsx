import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  isLeader: boolean;
  isAdmin: boolean;
  // True while the user is inside the password-recovery flow (just clicked
  // a reset link). RootNavigator renders PasswordResetScreen in this state
  // so the user MUST set a new password before doing anything else.
  recoveryMode: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  exitRecovery: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Parses a deep link of the form `classmeeting://reset#access_token=...&
// refresh_token=...&type=recovery`. Returns null if the URL is not a recovery
// callback so we don't treat normal app launches as resets.
function parseRecoveryUrl(url: string | null): {
  access_token: string;
  refresh_token: string;
} | null {
  if (!url) return null;
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;
  const fragment = url.slice(hashIndex + 1);
  const params = new URLSearchParams(fragment);
  if (params.get('type') !== 'recovery') return null;
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLeader, setIsLeader] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.warn('getSession failed', error);
        if (mounted) setSession(data?.session ?? null);
      } catch (e) {
        console.warn('getSession threw', e);
        if (mounted) setSession(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;
      setSession(s);
      setLoading(false);
      // supabase-js fires PASSWORD_RECOVERY when the recovery URL is processed
      // by detectSessionInUrl. We have that disabled, so we mirror the same
      // signal here in case any future code path triggers it.
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
    });

    // Deep-link handler: catch the recovery callback both at cold-start and
    // at runtime, exchange the tokens for a session, and flip recoveryMode on.
    const handleUrl = async (url: string | null) => {
      const tokens = parseRecoveryUrl(url);
      if (!tokens) return;
      const { error } = await supabase.auth.setSession(tokens);
      if (error) {
        console.warn('setSession failed during recovery', error);
        return;
      }
      if (mounted) setRecoveryMode(true);
    };

    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const linkingSub = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      linkingSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setIsLeader(false);
      setIsAdmin(false);
      return;
    }
    supabase
      .from('profiles')
      .select('is_leader, is_admin')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn('profile load failed', error);
        setIsLeader(Boolean(data?.is_leader));
        setIsAdmin(Boolean(data?.is_admin));
      });
  }, [session?.user?.id]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: displayName?.trim()
        ? { data: { full_name: displayName.trim() } }
        : undefined,
    });
    if (error) throw error;
    // supabase-js returns 200 with an empty identities array when the email
    // is already registered (anti-enumeration). Surface that to the caller
    // rather than telling the user to check an email that will never arrive.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      throw new Error('An account with that email already exists. Try signing in instead.');
    }
  };

  const requestPasswordReset = async (email: string) => {
    // createURL produces the right scheme for both Expo Go (exp://...) and
    // standalone builds (classmeeting://reset). Supabase will append the
    // tokens to this URL on click and the OS will route it to our app.
    const redirectTo = Linking.createURL('reset');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    setRecoveryMode(false);
  };

  const exitRecovery = async () => {
    setRecoveryMode(false);
    await supabase.auth.signOut();
  };

  const signOut = async () => {
    setRecoveryMode(false);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        isLeader,
        isAdmin,
        recoveryMode,
        signIn,
        signUp,
        requestPasswordReset,
        updatePassword,
        exitRecovery,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
