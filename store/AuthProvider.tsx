/**
 * Auth context: owns the Supabase session and the sign-in/up/out actions.
 * Sits above HabitProvider so the store can scope its cache + sync to userId.
 *
 * Google OAuth in Expo Go uses the web-browser flow: open Supabase's provider
 * URL, then turn the redirect back into a session (PKCE `code` or implicit
 * fragment tokens — we handle whichever the project is configured for).
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

type Result = { error: string | null };

type AuthValue = {
  session: Session | null;
  userId: string | null;
  sessionReady: boolean;
  signUpWithEmail: (email: string, password: string) => Promise<Result & { needsConfirm?: boolean }>;
  signInWithEmail: (email: string, password: string) => Promise<Result>;
  verifyEmailOtp: (email: string, token: string) => Promise<Result>;
  resendSignup: (email: string) => Promise<Result>;
  signInWithGoogle: () => Promise<Result>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthValue | null>(null);

async function sessionFromRedirectUrl(url: string): Promise<Result> {
  // PKCE flow: ?code=...
  const qIndex = url.indexOf('?');
  const query = qIndex >= 0 ? url.slice(qIndex + 1).split('#')[0] : '';
  const code = new URLSearchParams(query).get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return { error: error?.message ?? null };
  }
  // Implicit flow: #access_token=...&refresh_token=...
  const hIndex = url.indexOf('#');
  const frag = hIndex >= 0 ? url.slice(hIndex + 1) : '';
  const params = new URLSearchParams(frag);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    return { error: error?.message ?? null };
  }
  return { error: 'Sign-in did not return a session.' };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signUpWithEmail = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return { error: error.message };
    // With "Confirm email" enabled (default), no session until the user confirms.
    return { error: null, needsConfirm: !data.session };
  };

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error: error?.message ?? null };
  };

  // Confirm signup with the 6-digit code from the email (no redirect, mobile-safe).
  // On success the auth listener swaps to the app automatically.
  const verifyEmailOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'signup' });
    return { error: error?.message ?? null };
  };

  const resendSignup = async (email: string) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    return { error: error?.message ?? null };
  };

  const signInWithGoogle = async () => {
    const redirectTo = Linking.createURL('auth-callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) return { error: error?.message ?? 'Could not start Google sign-in.' };
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return { error: null }; // user cancelled / dismissed
    return sessionFromRedirectUrl(result.url);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = useMemo<AuthValue>(
    () => ({
      session,
      userId: session?.user?.id ?? null,
      sessionReady,
      signUpWithEmail,
      signInWithEmail,
      verifyEmailOtp,
      resendSignup,
      signInWithGoogle,
      signOut,
    }),
    [session, sessionReady]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
