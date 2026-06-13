import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useStore } from '../store/HabitStore';
import { useReward } from '../store/FeedbackProvider';
import {
  bestStreakOf,
  completionRate,
  countOn,
  dateKey,
  isDoneOn,
  keyToDate,
  streakOf,
} from '../lib/date';
import { Heatmap } from '../components/Heatmap';
import { colors, radius, space, tintOf, type as typo } from '../theme/tokens';
import type { RootScreenProps } from '../navigation/types';

function StatCard({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function HabitDetailScreen({ navigation, route }: RootScreenProps<'HabitDetail'>) {
  const { habits, today, setCount } = useStore();
  const { reward } = useReward();
  const habit = habits.find((h) => h.id === route.params.habitId);

  if (!habit) {
    return (
      <View style={styles.screen}>
        <Text style={styles.missing}>This habit was deleted.</Text>
      </View>
    );
  }

  // Weekday-aligned calendar: 5 weeks (Sun..Sat columns) ending this week.
  const WEEKS = 5;
  const now = new Date();
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const lastSunday = new Date(now);
  lastSunday.setDate(now.getDate() - now.getDay());
  const firstSunday = new Date(lastSunday);
  firstSunday.setDate(lastSunday.getDate() - (WEEKS - 1) * 7);
  const cells: Date[] = Array.from({ length: WEEKS * 7 }, (_, i) => {
    const d = new Date(firstSunday);
    d.setDate(firstSunday.getDate() + i);
    return d;
  });

  const onCellPress = (d: Date) => {
    const key = dateKey(d);
    const cur = countOn(habit, key);
    const next = habit.type === 'binary' ? (cur >= 1 ? 0 : 1) : cur >= habit.target ? 0 : cur + 1;
    const res = setCount(habit.id, key, next);
    reward(res);
    if (res.challengeCompleted) {
      navigation.navigate('ChallengeReward', { challengeId: res.challengeCompleted.id });
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={[styles.emojiWrap, { backgroundColor: tintOf(habit.color, 0.18) }]}>
          <Text style={styles.emoji}>{habit.emoji}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.title}>{habit.name}</Text>
          <Text style={styles.sub}>
            {habit.type === 'binary' ? 'Once a day' : `${habit.target}× a day`}
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('AddEditHabit', { habitId: habit.id })}
          style={styles.editBtn}
        >
          <Text style={styles.editText}>Edit</Text>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <StatCard value={`${streakOf(habit)}`} label="Current streak" color={colors.amber} />
        <StatCard value={`${bestStreakOf(habit)}`} label="Best streak" />
        <StatCard value={`${Math.round(completionRate(habit, 30) * 100)}%`} label="Last 30 days" />
      </View>

      <Text style={styles.section}>Consistency</Text>
      <View style={styles.panel}>
        <Heatmap habit={habit} />
      </View>

      <Text style={styles.section}>Log days</Text>
      <Text style={styles.hint}>Tap a day to mark it done — backfill anything you missed.</Text>
      <View style={styles.weekHeader}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Text key={i} style={styles.weekHeaderLabel}>
            {d}
          </Text>
        ))}
      </View>
      <View style={styles.calendar}>
        {cells.map((d) => {
          const key = dateKey(d);
          const future = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() > todayMs;
          const done = isDoneOn(habit, key);
          const partial = !done && countOn(habit, key) > 0;
          const isToday = key === today;
          if (future) {
            return (
              <View key={key} style={styles.calCellWrap}>
                <View style={[styles.calCell, styles.calFuture]}>
                  <Text style={styles.calNumFuture}>{d.getDate()}</Text>
                </View>
              </View>
            );
          }
          return (
            <Pressable key={key} onPress={() => onCellPress(d)} style={styles.calCellWrap}>
              <View
                style={[
                  styles.calCell,
                  done && { backgroundColor: habit.color, borderColor: habit.color },
                  partial && { borderColor: habit.color },
                  isToday && !done && styles.calToday,
                ]}
              >
                <Text style={[styles.calNum, done && { color: colors.amberInk }]}>{d.getDate()}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl, gap: space.lg },
  flex: { flex: 1 },
  missing: { ...typo.body, color: colors.inkMuted, padding: space.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  emojiWrap: { width: 56, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 28 },
  title: { ...typo.h1, color: colors.ink },
  sub: { ...typo.label, color: colors.inkMuted, marginTop: 2 },
  editBtn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  editText: { ...typo.label, color: colors.ink },
  statsRow: { flexDirection: 'row', gap: space.md },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: 4,
  },
  statValue: { ...typo.h1, color: colors.ink },
  statLabel: { ...typo.caption, color: colors.inkMuted },
  section: { ...typo.h2, color: colors.ink, marginTop: space.md },
  panel: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg },
  hint: { ...typo.caption, color: colors.inkMuted, marginTop: -space.sm },
  weekHeader: { flexDirection: 'row', marginTop: -space.sm },
  weekHeaderLabel: { ...typo.caption, color: colors.inkMuted, width: `${100 / 7}%`, textAlign: 'center' },
  calendar: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.sm },
  calCellWrap: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  calFuture: { borderColor: 'transparent', backgroundColor: 'transparent' },
  calNumFuture: { ...typo.caption, color: colors.inkMuted, opacity: 0.35 },
  calCell: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calToday: { borderColor: colors.inkSecondary },
  calNum: { ...typo.caption, color: colors.inkSecondary },
});
