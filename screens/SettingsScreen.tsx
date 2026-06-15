import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/HabitStore';
import { useAuth } from '../store/AuthProvider';
import { colors, radius, space, tintOf, type as typo } from '../theme/tokens';
import type { TabScreenProps } from '../navigation/types';

function Row({
  label,
  hint,
  right,
  onPress,
}: {
  label: string;
  hint?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress} disabled={!onPress}>
      <View style={styles.flex}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      {right}
    </Pressable>
  );
}

export function SettingsScreen({ navigation }: TabScreenProps<'Settings'>) {
  const { settings, setSettings, habits, resetAll } = useStore();
  const { session, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'Your data stays synced and will be here when you sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const confirmReset = () => {
    Alert.alert('Reset everything?', 'Deletes all habits, history, and challenges. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => resetAll() },
    ]);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.section}>Feedback</Text>
      <View style={styles.group}>
        <Row
          label="Sound"
          hint="Chime on completion"
          right={
            <Switch
              value={settings.sound}
              onValueChange={(v) => setSettings({ sound: v })}
              trackColor={{ true: colors.amber, false: colors.surfaceAlt }}
              thumbColor={colors.ink}
            />
          }
        />
        <View style={styles.divider} />
        <Row
          label="Haptics"
          hint="Vibration on completion"
          right={
            <Switch
              value={settings.haptics}
              onValueChange={(v) => setSettings({ haptics: v })}
              trackColor={{ true: colors.amber, false: colors.surfaceAlt }}
              thumbColor={colors.ink}
            />
          }
        />
      </View>

      <Text style={styles.section}>Habits</Text>
      <View style={styles.group}>
        {habits.map((h, i) => (
          <View key={h.id}>
            {i > 0 && <View style={styles.divider} />}
            <Row
              label={`${h.emoji} ${h.name}`}
              hint={h.reminders.length ? `${h.reminders.length} reminder${h.reminders.length > 1 ? 's' : ''}` : 'No reminders'}
              onPress={() => navigation.navigate('HabitDetail', { habitId: h.id })}
              right={<View style={[styles.dot, { backgroundColor: h.color }]} />}
            />
          </View>
        ))}
        <View style={styles.divider} />
        <Row label="Add habit" onPress={() => navigation.navigate('AddEditHabit')} right={<Text style={styles.chev}>＋</Text>} />
      </View>

      <Text style={styles.section}>Account</Text>
      <View style={styles.group}>
        <Row label="Signed in" hint={session?.user?.email ?? 'Synced account'} />
        <View style={styles.divider} />
        <Row label="Sign out" onPress={confirmSignOut} right={<Text style={styles.chev}>↪</Text>} />
      </View>

      <Text style={styles.section}>Danger zone</Text>
      <Pressable onPress={confirmReset} style={[styles.group, styles.resetBtn]}>
        <Text style={styles.resetText}>Reset all data</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl, gap: space.sm },
  flex: { flex: 1 },
  title: { ...typo.display, color: colors.ink, marginBottom: space.sm },
  section: { ...typo.label, color: colors.inkMuted, marginTop: space.lg, marginBottom: space.xs },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  rowLabel: { ...typo.body, color: colors.ink },
  rowHint: { ...typo.caption, color: colors.inkMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.hairline, marginLeft: space.lg },
  chev: { ...typo.h2, color: colors.inkMuted },
  dot: { width: 12, height: 12, borderRadius: 6 },
  resetBtn: { padding: space.lg, alignItems: 'center', backgroundColor: tintOf(colors.danger, 0.12) },
  resetText: { ...typo.bodyStrong, color: colors.danger },
});
