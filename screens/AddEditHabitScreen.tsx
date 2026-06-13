import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useStore } from '../store/HabitStore';
import type { HabitType, Reminder } from '../lib/types';
import { Button, Segmented, Stepper } from '../components/ui';
import { requestPermission } from '../lib/notifications';
import { colors, habitColors, radius, space, tintOf, type as typo } from '../theme/tokens';
import type { RootScreenProps } from '../navigation/types';

const EMOJIS = ['💪', '📚', '🧘', '💧', '🏃', '🥗', '😴', '🎯', '🧠', '✍️', '🎸', '🦷', '☀️', '💊', '🚭', '💰'];

const REMINDER_PRESETS: { hour: number; label: string; tag: string }[] = [
  { hour: 8, label: 'morning', tag: '8:00 AM' },
  { hour: 12, label: 'morning', tag: '12:00 PM' },
  { hour: 18, label: 'evening', tag: '6:00 PM' },
  { hour: 21, label: 'evening', tag: '9:00 PM' },
];

export function AddEditHabitScreen({ navigation, route }: RootScreenProps<'AddEditHabit'>) {
  const { habits, addHabit, updateHabit, deleteHabit } = useStore();
  const editing = route.params?.habitId ? habits.find((h) => h.id === route.params!.habitId) : undefined;

  const [name, setName] = useState(editing?.name ?? '');
  const [emoji, setEmoji] = useState(editing?.emoji ?? EMOJIS[0]);
  const [color, setColor] = useState(editing?.color ?? habitColors[0]);
  const [type, setType] = useState<HabitType>(editing?.type ?? 'binary');
  const [target, setTarget] = useState(editing?.target && editing.target >= 2 ? editing.target : 3);
  const [reminderHours, setReminderHours] = useState<number[]>(
    editing?.reminders.map((r) => r.hour) ?? []
  );

  const toggleReminder = (hour: number) => {
    setReminderHours((prev) =>
      prev.includes(hour) ? prev.filter((h) => h !== hour) : [...prev, hour].slice(-2)
    );
  };

  const onSave = async () => {
    if (!name.trim()) return;
    // Only keep reminders if the OS actually granted permission, so Settings
    // never shows reminders that can't fire.
    const granted = reminderHours.length > 0 ? await requestPermission() : true;
    const reminders: Reminder[] = granted
      ? reminderHours
          .map((hour) => {
            const preset = REMINDER_PRESETS.find((p) => p.hour === hour)!;
            return { hour, minute: 0, label: preset.label };
          })
          .sort((a, b) => a.hour - b.hour)
      : [];
    if (!granted && reminderHours.length > 0) {
      Alert.alert('Notifications off', 'Reminders need notification permission. Habit saved without reminders — enable them in your phone settings, then re-add.');
    }

    if (editing) {
      updateHabit(editing.id, { name: name.trim(), emoji, color, type, target, reminders });
    } else {
      addHabit({ name: name.trim(), emoji, color, type, target, reminders });
    }
    navigation.goBack();
  };

  const onDelete = () => {
    if (!editing) return;
    deleteHabit(editing.id);
    navigation.popToTop();
  };

  return (
    <View style={styles.screen}>
      <View style={styles.handle} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{editing ? 'Edit habit' : 'New habit'}</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Meditate"
          placeholderTextColor={colors.inkMuted}
          style={styles.input}
          autoFocus={!editing}
          returnKeyType="done"
        />

        <Text style={styles.label}>Icon</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiRow}>
          {EMOJIS.map((e) => (
            <Pressable
              key={e}
              onPress={() => setEmoji(e)}
              style={[styles.emojiCell, emoji === e && { backgroundColor: tintOf(color, 0.2), borderColor: color }]}
            >
              <Text style={styles.emoji}>{e}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.label}>Color</Text>
        <View style={styles.colorRow}>
          {habitColors.map((c) => (
            <Pressable key={c} onPress={() => setColor(c)} style={styles.colorCell}>
              <View style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorActive]} />
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Type</Text>
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: 'binary', label: 'Once a day' },
            { value: 'volume', label: 'Several times' },
          ]}
        />
        {type === 'volume' && (
          <View style={styles.targetRow}>
            <Text style={styles.targetHint}>Target per day</Text>
            <Stepper value={target} min={2} max={20} onChange={setTarget} />
          </View>
        )}

        <Text style={styles.label}>Reminders (up to 2)</Text>
        <View style={styles.reminderRow}>
          {REMINDER_PRESETS.map((p) => {
            const active = reminderHours.includes(p.hour);
            return (
              <Pressable
                key={p.hour}
                onPress={() => toggleReminder(p.hour)}
                style={[styles.reminderChip, active && { backgroundColor: colors.amber, borderColor: colors.amber }]}
              >
                <Text style={[styles.reminderText, active && { color: colors.amberInk }]}>{p.tag}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ height: space.xl }} />
        <Button label={editing ? 'Save changes' : 'Create habit'} onPress={onSave} disabled={!name.trim()} />
        {editing && <Button label="Delete habit" variant="danger" onPress={onDelete} style={{ marginTop: space.sm }} />}
        <Button label="Cancel" variant="ghost" onPress={() => navigation.goBack()} style={{ marginTop: space.xs }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgElevated },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.hairline,
    alignSelf: 'center',
    marginTop: space.md,
  },
  content: { padding: space.xl, paddingBottom: space.xxxl, gap: space.sm },
  title: { ...typo.h1, color: colors.ink, marginBottom: space.md },
  label: { ...typo.label, color: colors.inkMuted, marginTop: space.lg },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    color: colors.ink,
    ...typo.body,
  },
  emojiRow: { gap: space.sm, paddingVertical: space.xs },
  emojiCell: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 26 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingVertical: space.xs },
  colorCell: { padding: 2 },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: 'transparent' },
  colorActive: { borderColor: colors.ink },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
  },
  targetHint: { ...typo.body, color: colors.inkSecondary },
  reminderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingVertical: space.xs },
  reminderChip: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.hairline,
  },
  reminderText: { ...typo.label, color: colors.inkSecondary },
});
