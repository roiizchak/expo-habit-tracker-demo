/**
 * Change-password modal for a signed-in user. Requires the current password
 * (re-authenticated server-side), then sets the new one. Reachable from Settings;
 * only shown for email/password accounts.
 *
 * Doubles as the forced "set new password" screen after a password-reset code was
 * verified but the update failed (route param `recovery: true`): in that case the
 * user already holds a recovery session, so we skip the current-password field and
 * call retryPasswordUpdate. The navigator gates this on AuthProvider's
 * `recoveryNeedsPassword`, which clears on success.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
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
import { passwordIssue } from '../lib/password';
import type { RootScreenProps } from '../navigation/types';

export function ChangePasswordScreen({ navigation, route }: RootScreenProps<'ChangePassword'>) {
  const recovery = route.params?.recovery ?? false;
  const { changePassword, retryPasswordUpdate, recoveryError } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const mountedRef = useRef(true);
  // Synchronous in-flight guard — closes the double-tap window before React
  // commits `busy`, so a fast double-tap can't issue two updateUser calls.
  const inFlight = useRef(false);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Surface why the original update failed (e.g. "new password must differ from the
  // old one") so the forced gate isn't a silent dead-end.
  useEffect(() => {
    if (recovery && recoveryError) setError(recoveryError);
  }, [recovery, recoveryError]);

  // In recovery mode this is a forced gate (the user MUST set a password); block
  // Android hardware-back, which `gestureEnabled:false` doesn't cover (iOS-only).
  useEffect(() => {
    if (!recovery) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [recovery]);

  const submit = async () => {
    if (busy || inFlight.current) return;
    setError(null);
    if (!recovery && !current) {
      setError('Enter your current password.');
      return;
    }
    const issue = passwordIssue(next);
    if (issue) {
      setError(issue);
      return;
    }
    if (next !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const res = recovery ? await retryPasswordUpdate(next) : await changePassword(current, next);
      if (res.error) {
        if (mountedRef.current) setError(res.error);
        return;
      }
      if (recovery) {
        // Clearing recoveryNeedsPassword swaps the navigator back to the app; no goBack.
        Alert.alert('Password set', 'You can use your new password from now on.');
      } else {
        Alert.alert('Password updated', 'Use your new password next time you sign in.');
        navigation.goBack();
      }
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      inFlight.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <View style={styles.body}>
          <Text style={styles.brand}>{recovery ? 'Set new password' : 'Change password'}</Text>
          {recovery ? (
            <Text style={styles.subtitle}>Your reset code was verified. Choose a new password.</Text>
          ) : null}

          <View style={styles.form}>
            {!recovery && (
              <TextInput
                style={styles.input}
                placeholder="Current password"
                placeholderTextColor={colors.inkMuted}
                secureTextEntry
                value={current}
                onChangeText={setCurrent}
                editable={!busy}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => nextRef.current?.focus()}
              />
            )}
            <TextInput
              ref={nextRef}
              style={styles.input}
              placeholder="New password"
              placeholderTextColor={colors.inkMuted}
              secureTextEntry
              value={next}
              onChangeText={setNext}
              editable={!busy}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => confirmRef.current?.focus()}
            />
            <TextInput
              ref={confirmRef}
              style={styles.input}
              placeholder="Confirm new password"
              placeholderTextColor={colors.inkMuted}
              secureTextEntry
              value={confirm}
              onChangeText={setConfirm}
              editable={!busy}
              returnKeyType="go"
              onSubmitEditing={submit}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button label={busy ? '' : recovery ? 'Set password' : 'Update password'} onPress={submit} disabled={busy} />
          {busy ? <ActivityIndicator color={colors.amber} style={styles.spinner} /> : null}

          {!recovery && (
            <Button label="Cancel" onPress={() => navigation.goBack()} variant="ghost" disabled={busy} />
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.md },
  brand: { ...typo.display, color: colors.ink, marginBottom: space.lg },
  subtitle: { ...typo.body, color: colors.inkSecondary, marginTop: -space.sm, marginBottom: space.sm },
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
  spinner: { marginTop: -space.xl },
});
