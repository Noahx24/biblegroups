import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

// supabase-js v2 defaults to PKCE for native apps, returning `?code=...` on
// the redirect URL. Older configurations use the implicit flow which returns
// `#access_token=...&refresh_token=...`. Handle both so the OAuth flow keeps
// working if the project's auth.flowType is ever changed.
async function completeOAuthRedirect(returnedUrl: string): Promise<void> {
  const url = new URL(returnedUrl);
  const fragment = url.hash.startsWith('#') ? url.hash.slice(1) : '';
  const query = url.search.startsWith('?') ? url.search.slice(1) : '';
  const params = new URLSearchParams(fragment || query);

  const code = params.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }

  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw error;
    return;
  }

  const errorDescription = params.get('error_description') || params.get('error');
  if (errorDescription) throw new Error(errorDescription);
}

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  isLeader: boolean;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLeader, setIsLeader] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setIsLeader(false);
      setIsAdmin(false);
      return;
    }
    // .maybeSingle returns { data: null } instead of erroring with PGRST116
    // if the row doesn't exist yet (race with the handle_new_user trigger).
    supabase
      .from('profiles')
      .select('is_leader, is_admin')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn('profile load failed', error);
        setIsLeader(Boolean(data?.is_leader));
      });
  }, [session?.user?.id]);

  const signInWithGoogle = async () => {
    const redirectTo = AuthSession.makeRedirectUri({ scheme: 'biblegroups' });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data?.url) return;
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) return;
    await completeOAuthRedirect(result.url);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, loading, isLeader, isAdmin, signInWithGoogle, signOut }}
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
