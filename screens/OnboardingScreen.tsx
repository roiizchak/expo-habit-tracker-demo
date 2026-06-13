import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useStore } from '../store/HabitStore';
import type { HabitType, Reminder } from '../lib/types';
import { requestPermission } from '../lib/notifications';
import { Button, Segmented, Stepper } from '../components/ui';
import { colors, habitColors, radius, space, tintOf, type as typo } from '../theme/tokens';

const EMOJIS = ['💪', '📚', '🧘', '💧', '🏃', '🥗', '😴', '🎯', '🧠', '✍️'];

export function OnboardingScreen() {
  const { addHabit, completeOnboarding } = useStore();
  const [step, setStep] = useState(0);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [color, setColor] = useState<string>(habitColors[0]);
  const [type, setType] = useState<HabitType>('binary');
  const [target, setTarget] = useState(3);

  const [challengeOn, setChallengeOn] = useState(true);
  const [reminderHour, setReminderHour] = useState<number | null>(9);

  const finish = async () => {
    // Ask for permission if a reminder was chosen; only keep it if granted.
    const granted = reminderHour != null ? await requestPermission() : true;
    const reminders: Reminder[] =
      reminderHour != null && granted
        ? [{ hour: reminderHour, minute: 0, label: reminderHour < 12 ? 'morning' : 'evening' }]
        : [];
    addHabit({
      name: name.trim() || 'My first habit',
      emoji,
      color,
      type,
      target,
      reminders,
      startChallenge: challengeOn ? { lengthDays: 3 } : null,
    });
    completeOnboarding();
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {step === 0 && (
          <Animated.View entering={FadeIn} style={styles.center}>
            <Text style={styles.bigEmoji}>🔥</Text>
            <Text style={styles.h1}>Build habits that stick</Text>
            <Text style={styles.lede}>
              Track daily, feel the win, and ride a streak. Start with one habit and a 3-day challenge.
            </Text>
          </Animated.View>
        )}

        {step === 1 && (
          <Animated.View entering={FadeIn} style={{ gap: space.sm }}>
            <Text style={styles.h2}>Pick your first habit</Text>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Meditate"
              placeholderTextColor={colors.inkMuted}
              style={styles.input}
              autoFocus
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
                <Pressable key={c} onPress={() => setColor(c)} style={{ padding: 2 }}>
                  <View style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorActive]} />
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>How often?</Text>
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
          </Animated.View>
        )}

        {step === 2 && (
          <Animated.View entering={FadeIn} style={{ gap: space.lg }}>
            <Text style={styles.h2}>Start strong</Text>
            <Pressable
              onPress={() => setChallengeOn((v) => !v)}
              style={[styles.bigOption, challengeOn && { borderColor: color, backgroundColor: tintOf(color, 0.12) }]}
            >
              <Text style={styles.optEmoji}>🏆</Text>
              <View style={styles.flex}>
                <Text style={styles.optTitle}>3-day challenge</Text>
                <Text style={styles.optHint}>Do {emoji} {name.trim() || 'your habit'} 3 days in a row for a reward.</Text>
              </View>
              <View style={[styles.checkbox, challengeOn && { backgroundColor: color, borderColor: color }]}>
                {challengeOn && <Text style={styles.checkMark}>✓</Text>}
              </View>
            </Pressable>

            <Text style={styles.label}>Daily reminder</Text>
            <View style={styles.reminderRow}>
              {[
                { h: 8, t: '8:00 AM' },
                { h: 13, t: '1:00 PM' },
                { h: 21, t: '9:00 PM' },
                { h: null, t: 'No reminder' },
              ].map((opt) => {
                const active = reminderHour === opt.h;
                return (
                  <Pressable
                    key={opt.t}
                    onPress={() => setReminderHour(opt.h)}
                    style={[styles.reminderChip, active && { backgroundColor: colors.amber, borderColor: colors.amber }]}
                  >
                    <Text style={[styles.reminderText, active && { color: colors.amberInk }]}>{opt.t}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.permHint}>We'll send a gentle local nudge. No account, no spam.</Text>
          </Animated.View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.pageDot, i === step && styles.pageDotActive]} />
          ))}
        </View>
        {step < 2 ? (
          <Button
            label={step === 0 ? 'Get started' : 'Continue'}
            onPress={() => setStep((s) => s + 1)}
            disabled={step === 1 && !name.trim()}
          />
        ) : (
          <Button label="Start tracking" onPress={finish} />
        )}
        {step > 0 && (
          <Button label="Back" variant="ghost" onPress={() => setStep((s) => s - 1)} style={{ marginTop: space.xs }} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.xl, paddingBottom: space.xl, flexGrow: 1, justifyContent: 'center' },
  center: { alignItems: 'center', gap: space.lg },
  flex: { flex: 1 },
  bigEmoji: { fontSize: 72 },
  h1: { ...typo.display, color: colors.ink, textAlign: 'center' },
  h2: { ...typo.h1, color: colors.ink, marginBottom: space.sm },
  lede: { ...typo.body, color: colors.inkSecondary, textAlign: 'center', paddingHorizontal: space.md },
  label: { ...typo.label, color: colors.inkMuted, marginTop: space.md },
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
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: 'transparent' },
  colorActive: { borderColor: colors.ink },
  targetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.md },
  targetHint: { ...typo.body, color: colors.inkSecondary },
  bigOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    padding: space.lg,
  },
  optEmoji: { fontSize: 30 },
  optTitle: { ...typo.bodyStrong, color: colors.ink },
  optHint: { ...typo.caption, color: colors.inkMuted, marginTop: 2 },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.inkMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: colors.amberInk, fontFamily: typo.bodyStrong.fontFamily, fontSize: 15 },
  reminderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  reminderChip: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.hairline,
  },
  reminderText: { ...typo.label, color: colors.inkSecondary },
  permHint: { ...typo.caption, color: colors.inkMuted },
  footer: { padding: space.xl, gap: space.sm },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: space.sm },
  pageDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt },
  pageDotActive: { backgroundColor: colors.amber, width: 22 },
});
