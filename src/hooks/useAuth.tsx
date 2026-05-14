import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { registerForPushNotificationsAsync, resetPushRegistrationCache } from '@/lib/push';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  recoveryMode: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  exitRecovery: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Parses a deep link of the form `churchflow://reset#access_token=...&
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
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
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
    });

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
    const userId = session?.user?.id;
    if (!userId) {
      setIsAdmin(false);
      setIsSuperAdmin(false);
      return;
    }

    let cancelled = false;

    const loadProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_admin, is_super_admin')
        .eq('id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) console.warn('profile load failed', error);
      const superAdmin = Boolean(data?.is_super_admin);
      setIsSuperAdmin(superAdmin);
      // super admin inherits all admin privileges
      setIsAdmin(Boolean(data?.is_admin) || superAdmin);
    };

    loadProfile();

    // Register for push notifications on first session for this user.
    // Errors / missing permission / simulator are handled inside the lib.
    registerForPushNotificationsAsync(userId).catch(e =>
      console.warn('push register threw', e),
    );

    const channel = supabase
      .channel(`auth-profile:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        () => loadProfile(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
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
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      throw new Error('An account with that email already exists. Try signing in instead.');
    }
  };

  const requestPasswordReset = async (email: string) => {
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
    const { error } = await supabase.auth.signOut();
    if (!error) setRecoveryMode(false);
  };

  const signOut = async () => {
    setRecoveryMode(false);
    resetPushRegistrationCache();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        isAdmin,
        isSuperAdmin,
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
