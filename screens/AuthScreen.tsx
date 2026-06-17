/**
 * Sign-in / sign-up gate. Email + password (works fully in Expo Go) plus a
 * Continue-with-Google web-browser flow. Shown by RootNavigator whenever there
 * is no Supabase session. Also hosts the forgot-password flow (email -> 6-digit
 * recovery code + new password), which reuses the same OTP convention as signup.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Screen, Button } from '../components/ui';
import { Turnstile } from '../components/Turnstile';
import { colors, font, radius, space, type as typo } from '../theme/tokens';
import { useAuth } from '../store/AuthProvider';

// Public Turnstile site key (safe to ship; the secret lives in the Edge Function).
const TURNSTILE_SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;

export function AuthScreen() {
  const {
    signInWithEmail,
    signUpWithEmail,
    verifyEmailOtp,
    resendSignup,
    signInWithGoogle,
    checkEmailExists,
    sendPasswordReset,
    verifyPasswordResetOtp,
  } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'recover'>('signin');
  // 'auth' = email/password form, 'verify' = enter the 6-digit code from email.
  const [stage, setStage] = useState<'auth' | 'verify'>('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Turnstile token gating the forgot-password existence check. Single-use: cleared
  // after each attempt; `captchaKey` remounts the widget to fetch a fresh token.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const refreshCaptcha = () => {
    setCaptchaToken(null);
    setCaptchaKey((k) => k + 1);
  };
  const passwordRef = useRef<TextInput>(null);
  const newPasswordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  // A successful recovery verifyOtp creates a session, which makes RootNavigator
  // unmount this screen mid-async — guard every post-await state setter. If the
  // update then fails, AuthProvider raises a recovery gate (forced set-password
  // screen), so there's no retry UI to render here.
  const mountedRef = useRef(true);
  // Synchronous in-flight guard — closes the double-tap window before React
  // commits `busy`. Also ensures a thrown error never leaves `busy` stuck on.
  const inFlight = useRef(false);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const withBusy = async (fn: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      inFlight.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  const resetTransient = () => {
    setError(null);
    setNotice(null);
    setPassword('');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    refreshCaptcha();
  };

  const submit = async () => {
    if (busy) return;
    setError(null);
    setNotice(null);

    if (mode === 'recover') {
      if (!email.trim()) {
        setError('Enter your email.');
        return;
      }
      if (!TURNSTILE_SITE_KEY) {
        setError('Verification is unavailable. Please try again later.');
        return;
      }
      if (!captchaToken) {
        setError('Please complete the verification below.');
        return;
      }
      await withBusy(async () => {
        // Block recovery for unregistered emails, gated by the Turnstile token. A failed
        // check (captcha, offline, etc.) is NOT "no account" — show a retryable error and
        // stay on this step. The token is single-use, so refresh it after every attempt.
        const chk = await checkEmailExists(email, captchaToken);
        refreshCaptcha();
        if (chk.error) {
          if (mountedRef.current) setError("Couldn't verify that email. Try again.");
          return;
        }
        if (!chk.exists) {
          if (mountedRef.current) setError('No account found for that email.');
          return;
        }
        const res = await sendPasswordReset(email);
        if (res.error) {
          if (mountedRef.current) setError(res.error);
          return;
        }
        if (mountedRef.current) {
          setStage('verify');
          // Existence is confirmed above, so the copy can be definite here.
          setNotice('We emailed you a 6-digit code. Enter it with your new password.');
        }
      });
      return;
    }

    if (!email.trim()) {
      setError('Enter your email.');
      return;
    }
    // New accounts must meet the server password policy (>=8). Sign-in stays
    // length-agnostic so legacy/shorter passwords can still authenticate.
    if (mode === 'signup' && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (mode === 'signin' && !password) {
      setError('Enter your password.');
      return;
    }
    await withBusy(async () => {
      const res =
        mode === 'signin'
          ? await signInWithEmail(email, password)
          : await signUpWithEmail(email, password);
      if (res.error) {
        if (mountedRef.current) setError(res.error);
      } else if (mode === 'signup' && 'needsConfirm' in res && res.needsConfirm) {
        // Email confirmation is on -> collect the 6-digit code in-app.
        if (mountedRef.current) {
          setStage('verify');
          setNotice('We emailed you a 6-digit code. Enter it below to confirm.');
        }
      }
      // On success the auth listener swaps the navigator to the app automatically.
    });
  };

  const verify = async () => {
    if (busy) return;
    setError(null);
    setNotice(null);

    if (mode === 'recover') {
      if (code.trim().length < 6) {
        setError('Enter the 6-digit code from your email.');
        return;
      }
      if (newPassword.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      await withBusy(async () => {
        const res = await verifyPasswordResetOtp(email, code, newPassword);
        // Success -> auth listener logs you in with the new password.
        // updateFailed -> AuthProvider raised the recovery gate; the navigator
        // swaps to the forced set-password screen, so nothing to do here either.
        if (res.error && !res.updateFailed && mountedRef.current) setError(res.error);
      });
      return;
    }

    // signup confirmation
    if (code.trim().length < 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    await withBusy(async () => {
      const res = await verifyEmailOtp(email, code);
      if (res.error && mountedRef.current) setError(res.error);
      // On success the auth listener logs you in automatically.
    });
  };

  const resend = async () => {
    if (busy) return;
    setError(null);
    await withBusy(async () => {
      const res = mode === 'recover' ? await sendPasswordReset(email) : await resendSignup(email);
      if (mountedRef.current) {
        setNotice(res.error ? null : 'New code sent.');
        if (res.error) setError(res.error);
      }
    });
  };

  const google = async () => {
    if (busy) return;
    setError(null);
    setNotice(null);
    await withBusy(async () => {
      const res = await signInWithGoogle();
      if (res.error && mountedRef.current) setError(res.error);
    });
  };

  if (stage === 'verify') {
    const recovering = mode === 'recover';
    return (
      <Screen>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
          <View style={styles.body}>
            <Text style={styles.brand}>{recovering ? 'Reset password' : 'Confirm email'}</Text>
            <Text style={styles.subtitle}>Sent to {email}</Text>

            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="6-digit code"
                placeholderTextColor={colors.inkMuted}
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={setCode}
                editable={!busy}
                returnKeyType={recovering ? 'next' : 'go'}
                submitBehavior={recovering ? 'submit' : undefined}
                onSubmitEditing={recovering ? () => newPasswordRef.current?.focus() : verify}
              />
              {recovering && (
                <>
                  <TextInput
                    ref={newPasswordRef}
                    style={styles.input}
                    placeholder="New password"
                    placeholderTextColor={colors.inkMuted}
                    secureTextEntry
                    value={newPassword}
                    onChangeText={setNewPassword}
                    editable={!busy}
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                  />
                  <TextInput
                    ref={confirmPasswordRef}
                    style={styles.input}
                    placeholder="Confirm new password"
                    placeholderTextColor={colors.inkMuted}
                    secureTextEntry
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    editable={!busy}
                    returnKeyType="go"
                    onSubmitEditing={verify}
                  />
                </>
              )}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}

            <Button
              label={busy ? '' : recovering ? 'Reset password' : 'Confirm'}
              onPress={verify}
              disabled={busy}
            />
            {busy ? <ActivityIndicator color={colors.amber} style={styles.spinner} /> : null}

            <Button label="Resend code" onPress={resend} variant="secondary" disabled={busy} />
            <Button
              label="Back"
              onPress={() => {
                resetTransient();
                setStage('auth');
              }}
              variant="ghost"
              disabled={busy}
            />
          </View>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  const recovering = mode === 'recover';
  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <View style={styles.body}>
          <Text style={styles.brand}>Habit Tracker</Text>
          <Text style={styles.subtitle}>
            {recovering
              ? 'Reset your password.'
              : mode === 'signin'
              ? 'Welcome back.'
              : 'Create your account.'}
          </Text>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.inkMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              editable={!busy}
              returnKeyType={recovering ? 'go' : 'next'}
              submitBehavior={recovering ? undefined : 'submit'}
              onSubmitEditing={recovering ? submit : () => passwordRef.current?.focus()}
            />
            {!recovering && (
              <TextInput
                ref={passwordRef}
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={colors.inkMuted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                editable={!busy}
                returnKeyType={mode === 'signin' ? 'go' : 'done'}
                onSubmitEditing={submit}
              />
            )}
          </View>

          {recovering && TURNSTILE_SITE_KEY ? (
            <Turnstile
              key={captchaKey}
              siteKey={TURNSTILE_SITE_KEY}
              onToken={setCaptchaToken}
              onError={() => setCaptchaToken(null)}
            />
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <Button
            label={busy ? '' : recovering ? 'Send reset code' : mode === 'signin' ? 'Sign in' : 'Sign up'}
            onPress={submit}
            disabled={busy}
          />
          {busy ? <ActivityIndicator color={colors.amber} style={styles.spinner} /> : null}

          {!recovering && (
            <Button label="Continue with Google" onPress={google} variant="secondary" disabled={busy} />
          )}

          {mode === 'signin' && (
            <Button
              label="Forgot password?"
              onPress={() => {
                resetTransient();
                setMode('recover');
              }}
              variant="ghost"
              disabled={busy}
            />
          )}

          <Button
            label={
              recovering
                ? 'Back to sign in'
                : mode === 'signin'
                ? 'New here? Create an account'
                : 'Have an account? Sign in'
            }
            onPress={() => {
              resetTransient();
              setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
            }}
            variant="ghost"
            disabled={busy}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.md },
  brand: { ...typo.display, color: colors.ink },
  subtitle: { ...typo.body, color: colors.inkSecondary, marginBottom: space.lg },
  form: { gap: space.sm },
  input: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: space.lg,
    color: colors.ink,
    fontFamily: font.regular,
    fontSize: 16,
  },
  error: { ...typo.label, color: colors.danger },
  notice: { ...typo.label, color: colors.amber },
  spinner: { marginTop: -space.xl },
});
