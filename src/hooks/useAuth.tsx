import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { getCurrentPushToken, registerForPushNotificationsAsync, resetPushRegistrationCache } from '@/lib/push';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  churchId: string | null;
  profileLoaded: boolean;
  recoveryMode: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, displayName?: string, churchId?: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  setChurch: (churchId: string) => Promise<void>;
  exitRecovery: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Parses an auth deep link carrying tokens in the URL fragment, e.g.
// `churchflow://reset#access_token=…&refresh_token=…&type=recovery` (password
// reset) or `churchflow://auth-callback#access_token=…&refresh_token=…` (Google
// OAuth). Returns null for normal launches so they aren't treated as auth
// callbacks. `type` distinguishes recovery from a regular sign-in.
function parseAuthCallbackUrl(url: string | null): {
  access_token: string;
  refresh_token: string;
  type: string | null;
} | null {
  if (!url) return null;
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;
  const fragment = url.slice(hashIndex + 1);
  const params = new URLSearchParams(fragment);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token, type: params.get('type') };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [churchId, setChurchId] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        // A stale stored session (e.g. a rotated/expired refresh token —
        // "Invalid Refresh Token: Refresh Token Not Found", common in Expo Go
        // after reloads) can't be recovered. Clear it so we land cleanly on the
        // sign-in screen instead of surfacing a refresh error.
        if (error) {
          console.warn('getSession failed; clearing stale session', error);
          await supabase.auth.signOut().catch(() => {});
          if (mounted) setSession(null);
        } else if (mounted) {
          setSession(data?.session ?? null);
        }
      } catch (e) {
        console.warn('getSession threw', e);
        await supabase.auth.signOut().catch(() => {});
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
      const tokens = parseAuthCallbackUrl(url);
      if (!tokens) return;
      const { error } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      if (error) {
        console.warn('setSession failed during auth callback', error);
        return;
      }
      // Password-reset links route to the reset screen; OAuth (and other)
      // callbacks just establish the session and fall through to the app.
      if (tokens.type === 'recovery' && mounted) setRecoveryMode(true);
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
      setChurchId(null);
      setProfileLoaded(false);
      return;
    }

    let cancelled = false;

    const loadProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_admin, is_super_admin, church_id')
        .eq('id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) console.warn('profile load failed', error);
      const superAdmin = Boolean(data?.is_super_admin);
      setIsSuperAdmin(superAdmin);
      // super admin inherits all admin privileges
      setIsAdmin(Boolean(data?.is_admin) || superAdmin);

      let resolvedChurch = (data?.church_id as string | null) ?? null;
      // Back-fill from the church chosen at signup (passed via auth metadata)
      // if the profiles trigger didn't copy it. Safe because the user can
      // update their own profile under RLS.
      const metaChurch = session?.user?.user_metadata?.church_id as string | undefined;
      if (!resolvedChurch && metaChurch) {
        const { error: upErr } = await supabase
          .from('profiles')
          .update({ church_id: metaChurch })
          .eq('id', userId);
        if (!upErr) resolvedChurch = metaChurch;
        else console.warn('church back-fill failed', upErr);
      }
      if (cancelled) return;
      setChurchId(resolvedChurch);
      setProfileLoaded(true);
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
    // user_metadata is stable for a given user id, so keying on the id is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  // Google sign-in via the system browser. We ask Supabase for the provider URL
  // (skipBrowserRedirect so it doesn't try to navigate a web page), open it, and
  // let Google redirect back to churchflow://auth-callback#access_token=… — the
  // deep-link handler above calls setSession and onAuthStateChange routes in.
  // New Google users have no church yet, so the church-selection gate handles
  // onboarding after sign-in. Assumes the implicit OAuth flow (tokens in the URL
  // fragment); if the client is switched to flowType:'pkce', this needs
  // exchangeCodeForSession on the returned ?code instead.
  const signInWithGoogle = async () => {
    const redirectTo = Linking.createURL('auth-callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('Could not start Google sign-in. Please try again.');
    const canOpen = await Linking.canOpenURL(data.url);
    if (!canOpen) throw new Error('No browser is available to complete sign-in.');
    await Linking.openURL(data.url);
  };

  const signUp = async (email: string, password: string, displayName?: string, churchId?: string) => {
    const metadata: Record<string, string> = {};
    if (displayName?.trim()) metadata.full_name = displayName.trim();
    if (churchId) metadata.church_id = churchId;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: Object.keys(metadata).length ? { data: metadata } : undefined,
    });
    if (error) throw error;
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      throw new Error('An account with that email already exists. Try signing in instead.');
    }
  };

  // Set / change the signed-in user's church (used by the onboarding gate).
  const setChurch = async (newChurchId: string) => {
    const userId = session?.user?.id;
    if (!userId) throw new Error('Not signed in.');
    const { error } = await supabase.from('profiles').update({ church_id: newChurchId }).eq('id', userId);
    if (error) throw error;
    setChurchId(newChurchId);
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
    const tokenToDelete = getCurrentPushToken();
    const userIdToClean = session?.user?.id;
    resetPushRegistrationCache();
    // Remove this device's token so it no longer receives notifications after sign-out.
    if (tokenToDelete && userIdToClean) {
      await supabase
        .from('device_push_tokens')
        .delete()
        .eq('user_id', userIdToClean)
        .eq('expo_push_token', tokenToDelete);
    }
    await supabase.auth.signOut();
  };

  // POPIA right to erasure. Calls a SECURITY DEFINER RPC that deletes the
  // caller's auth.users row (cascading to all their personal data), then
  // clears the now-invalid local session. The onAuthStateChange listener
  // routes back to the sign-in screen once the session is gone.
  const deleteAccount = async () => {
    const { error } = await supabase.rpc('delete_own_account');
    if (error) throw error;
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
        churchId,
        profileLoaded,
        recoveryMode,
        signIn,
        signInWithGoogle,
        signUp,
        requestPasswordReset,
        updatePassword,
        setChurch,
        exitRecovery,
        signOut,
        deleteAccount,
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
