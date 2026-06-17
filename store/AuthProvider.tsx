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
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

// Persists the "recovery code verified but password update failed" state so the
// forced set-password gate survives a process restart (the recovery session also
// persists, so without this the gate would be lost and the session left dangling).
const RECOVERY_KEY = '@auth/recoveryNeedsPassword';

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
  // Password recovery (logged out) + change (logged in). Both reuse the 6-digit
  // OTP convention — recovery needs the "Reset Password" email template to send
  // {{ .Token }} (a code), not the default {{ .ConfirmationURL }} link.
  // Server-side existence check used to BLOCK recovery for unregistered emails.
  checkEmailExists: (
    email: string,
    captchaToken: string
  ) => Promise<{ exists: boolean; error: string | null }>;
  sendPasswordReset: (email: string) => Promise<Result>;
  verifyPasswordResetOtp: (
    email: string,
    token: string,
    newPassword: string
  ) => Promise<Result & { updateFailed?: boolean }>;
  retryPasswordUpdate: (newPassword: string) => Promise<Result>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<Result>;
  hasPasswordIdentity: () => boolean;
  // True when a recovery code was accepted but the password update failed: the
  // user now holds a live recovery session with an unchanged password. The
  // navigator gates a forced "set new password" screen on this until it clears.
  recoveryNeedsPassword: boolean;
  clearRecoveryNeedsPassword: () => void;
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
  const [recoveryNeedsPassword, setRecoveryNeedsPassword] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      // Restore the forced set-password gate BEFORE lifting the splash, so Tabs
      // never flashes ahead of a pending recovery gate on a cold restart.
      if (data.session) {
        const v = await AsyncStorage.getItem(RECOVERY_KEY);
        if (v === '1') setRecoveryNeedsPassword(true);
      } else {
        // No session => no recovery context; drop any stale flag so it can't
        // resurrect the gate on a future sign-in.
        AsyncStorage.removeItem(RECOVERY_KEY).catch(() => {});
      }
      setSession(data.session);
      setSessionReady(true);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // A sign-out (here or from another tab/device) ends any recovery context.
      if (!s) clearRecoveryNeedsPassword();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const raiseRecoveryGate = () => {
    setRecoveryNeedsPassword(true);
    // If this write fails the in-memory gate still holds for this run; only
    // restart-durability is lost, so log rather than silently swallow.
    AsyncStorage.setItem(RECOVERY_KEY, '1').catch((e) =>
      console.warn('[auth] failed to persist recovery gate', e)
    );
  };
  const clearRecoveryNeedsPassword = () => {
    setRecoveryNeedsPassword(false);
    AsyncStorage.removeItem(RECOVERY_KEY).catch(() => {});
  };

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
    clearRecoveryNeedsPassword();
    await supabase.auth.signOut();
  };

  // Check whether an email maps to an account, via the CAPTCHA-gated `check-email`
  // Edge Function. The underlying account_exists RPC is now service-role-only (no anon
  // enumeration oracle); the function verifies a Cloudflare Turnstile token before it
  // runs. The recover screen calls this to block unregistered emails. A non-null `error`
  // (captcha_failed, offline, etc.) means the check itself failed — the caller must NOT
  // treat that as "no account"; only `exists === false` with no error means that.
  const checkEmailExists = async (email: string, captchaToken: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('check-email', {
        body: { email: email.trim().toLowerCase(), captchaToken },
      });
      if (error) return { exists: false, error: error.message };
      if (data?.error) return { exists: false, error: data.error };
      // Only an EXPLICIT boolean is a verdict. A missing/malformed `exists` must surface
      // as a check failure — never silently resolve to "no account" (CLAUDE.md contract).
      if (data?.exists === true) return { exists: true, error: null };
      if (data?.exists === false) return { exists: false, error: null };
      return { exists: false, error: 'invalid_response' };
    } catch (e) {
      // A thrown transport error (offline, DNS) must surface as a check failure,
      // not a missing account — keep the error path distinct from `exists:false`.
      return { exists: false, error: e instanceof Error ? e.message : 'Network error' };
    }
  };

  // Send the recovery email (delivers a 6-digit code via the {{ .Token }} template).
  // Errors (incl. rate-limit 429s) are surfaced verbatim. Existence is already
  // confirmed by checkEmailExists before this runs, so the screen now shows
  // definite copy (the email-not-found case is blocked one step earlier).
  const sendPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    return { error: error?.message ?? null };
  };

  // Redeem the recovery code, then set the new password in the SAME call. verifyOtp
  // creates a live session on success, which makes RootNavigator unmount the Auth
  // screen — so the password must be updated here, before we resolve, or the user
  // lands in the app with their password unchanged. `updateFailed` flags the rare
  // case where the code was accepted but the password update failed (network blip):
  // the caller then holds a recovery session and can retry without code/old password.
  const verifyPasswordResetOtp = async (email: string, token: string, newPassword: string) => {
    const { error: vErr } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'recovery',
    });
    if (vErr) return { error: vErr.message };
    const { error: uErr } = await supabase.auth.updateUser({ password: newPassword });
    if (uErr) {
      // verifyOtp already created the session (and unmounted the Auth screen);
      // raise the recovery gate so the user can finish setting a password.
      raiseRecoveryGate();
      return { error: uErr.message, updateFailed: true };
    }
    return { error: null };
  };

  // Retry just the password update on an already-established recovery session.
  const retryPasswordUpdate = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    clearRecoveryNeedsPassword();
    return { error: null };
  };

  // Change the password of the signed-in user. We re-authenticate with the
  // current password first, then update — this enforces the current-password
  // check ourselves rather than relying on updateUser's `current_password`, which
  // GoTrue only validates when REQUIRE_CURRENT_PASSWORD is enabled server-side.
  // Re-signing in the *same* user just refreshes the existing session (harmless).
  const changePassword = async (currentPassword: string, newPassword: string) => {
    const email = session?.user?.email;
    if (!email) return { error: 'No active session.' };
    const { error: reErr } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (reErr) {
      // Only a bad password means "incorrect"; pass transient/other errors through.
      const wrong = reErr.code === 'invalid_credentials';
      return { error: wrong ? 'Current password is incorrect.' : reErr.message };
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  };

  // Does this account sign in with an email/password identity? (Google-only users
  // have no password to change.) `providers` is an array; older sessions may only
  // carry the singular `provider`.
  const hasPasswordIdentity = () => {
    const meta = session?.user?.app_metadata;
    const providers = meta?.providers as string[] | undefined;
    if (providers?.length) return providers.includes('email');
    return meta?.provider === 'email';
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
      checkEmailExists,
      sendPasswordReset,
      verifyPasswordResetOtp,
      retryPasswordUpdate,
      changePassword,
      hasPasswordIdentity,
      recoveryNeedsPassword,
      clearRecoveryNeedsPassword,
    }),
    [session, sessionReady, recoveryNeedsPassword]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
