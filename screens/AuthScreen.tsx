/**
 * Sign-in / sign-up gate. Email + password (works fully in Expo Go) plus a
 * Continue-with-Google web-browser flow. Shown by RootNavigator whenever there
 * is no Supabase session.
 */
import React, { useState } from 'react';
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
import { colors, font, radius, space, type as typo } from '../theme/tokens';
import { useAuth } from '../store/AuthProvider';

export function AuthScreen() {
  const { signInWithEmail, signUpWithEmail, verifyEmailOtp, resendSignup, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  // 'auth' = email/password form, 'verify' = enter the 6-digit code from email.
  const [stage, setStage] = useState<'auth' | 'verify'>('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setError(null);
    setNotice(null);
    if (!email.trim() || password.length < 6) {
      setError('Enter an email and a password of at least 6 characters.');
      return;
    }
    setBusy(true);
    const res =
      mode === 'signin'
        ? await signInWithEmail(email, password)
        : await signUpWithEmail(email, password);
    setBusy(false);
    if (res.error) {
      setError(res.error);
    } else if (mode === 'signup' && 'needsConfirm' in res && res.needsConfirm) {
      // Email confirmation is on -> collect the 6-digit code in-app.
      setStage('verify');
      setNotice('We emailed you a 6-digit code. Enter it below to confirm.');
    }
    // On success the auth listener swaps the navigator to the app automatically.
  };

  const verify = async () => {
    if (busy) return;
    setError(null);
    setNotice(null);
    if (code.trim().length < 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setBusy(true);
    const res = await verifyEmailOtp(email, code);
    setBusy(false);
    if (res.error) setError(res.error);
    // On success the auth listener logs you in automatically.
  };

  const resend = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    const res = await resendSignup(email);
    setBusy(false);
    setNotice(res.error ? null : 'New code sent.');
    if (res.error) setError(res.error);
  };

  const google = async () => {
    if (busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    const res = await signInWithGoogle();
    setBusy(false);
    if (res.error) setError(res.error);
  };

  if (stage === 'verify') {
    return (
      <Screen>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
          <View style={styles.body}>
            <Text style={styles.brand}>Confirm email</Text>
            <Text style={styles.subtitle}>Sent to {email}</Text>

            <TextInput
              style={styles.input}
              placeholder="6-digit code"
              placeholderTextColor={colors.inkMuted}
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              editable={!busy}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}

            <Button label={busy ? '' : 'Confirm'} onPress={verify} disabled={busy} />
            {busy ? <ActivityIndicator color={colors.amber} style={styles.spinner} /> : null}

            <Button label="Resend code" onPress={resend} variant="secondary" disabled={busy} />
            <Button
              label="Back"
              onPress={() => {
                setError(null);
                setNotice(null);
                setCode('');
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

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <View style={styles.body}>
          <Text style={styles.brand}>Habit Tracker</Text>
          <Text style={styles.subtitle}>
            {mode === 'signin' ? 'Welcome back.' : 'Create your account.'}
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
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.inkMuted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!busy}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <Button
            label={busy ? '' : mode === 'signin' ? 'Sign in' : 'Sign up'}
            onPress={submit}
            disabled={busy}
          />
          {busy ? <ActivityIndicator color={colors.amber} style={styles.spinner} /> : null}

          <Button label="Continue with Google" onPress={google} variant="secondary" disabled={busy} />

          <Button
            label={mode === 'signin' ? "New here? Create an account" : 'Have an account? Sign in'}
            onPress={() => {
              setError(null);
              setNotice(null);
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
