import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useStore } from '../store/HabitStore';
import { useReward } from '../store/FeedbackProvider';
import { isDoneOn } from '../lib/date';
import { firstActiveChallenge, challengeProgress } from '../lib/challenge';
import { HabitCard } from '../components/HabitCard';
import { ProgressRing } from '../components/ProgressRing';
import { colors, radius, space, tintOf, type as typo } from '../theme/tokens';
import { useReducedMotion } from '../theme/motion';
import type { TabScreenProps } from '../navigation/types';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function HomeScreen({ navigation }: TabScreenProps<'Home'>) {
  const { habits, challenges, today } = useStore();
  const { logToday } = useStore();
  const { reward } = useReward();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();

  const doneCount = useMemo(() => habits.filter((h) => isDoneOn(h, today)).length, [habits, today]);
  const overall = habits.length ? doneCount / habits.length : 0;

  const challenge = firstActiveChallenge(challenges);
  const challengeHabit = challenge ? habits.find((h) => h.id === challenge.habitId) : undefined;

  const onLog = (habitId: string) => {
    const res = logToday(habitId);
    reward(res);
    if (res.challengeCompleted) {
      navigation.navigate('ChallengeReward', { challengeId: res.challengeCompleted.id });
    }
  };

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg }]}
      data={habits}
      keyExtractor={(h) => h.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.flex}>
              <Text style={styles.greeting}>{greeting()}</Text>
              <Text style={styles.title}>Today's habits</Text>
            </View>
            <ProgressRing progress={overall} size={66} strokeWidth={7}>
              <Text style={styles.ringPct}>{Math.round(overall * 100)}%</Text>
            </ProgressRing>
          </View>
          <Text style={styles.subtitle}>
            {doneCount} of {habits.length} done
          </Text>

          {challenge && challengeHabit && (
            <Pressable
              onPress={() => navigation.navigate('HabitDetail', { habitId: challengeHabit.id })}
              style={[styles.challenge, { borderColor: tintOf(challengeHabit.color, 0.5) }]}
            >
              <Text style={styles.challengeEmoji}>🏆</Text>
              <View style={styles.flex}>
                <Text style={styles.challengeTitle}>
                  {challenge.lengthDays}-day challenge · {challengeHabit.name}
                </Text>
                <Text style={styles.challengeMeta}>
                  {challengeProgress(challenge, challengeHabit)} of {challenge.lengthDays} days · keep it alive
                </Text>
              </View>
              <View style={styles.challengeDots}>
                {Array.from({ length: challenge.lengthDays }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      {
                        backgroundColor:
                          i < challengeProgress(challenge, challengeHabit)
                            ? challengeHabit.color
                            : colors.surfaceAlt,
                      },
                    ]}
                  />
                ))}
              </View>
            </Pressable>
          )}
        </View>
      }
      renderItem={({ item, index }) => {
        const card = (
          <HabitCard
            habit={item}
            today={today}
            onPress={() => onLog(item.id)}
            onLongPress={() => navigation.navigate('HabitDetail', { habitId: item.id })}
          />
        );
        return reduced ? (
          card
        ) : (
          <Animated.View entering={FadeInDown.delay(index * 45).springify().damping(18)}>
            {card}
          </Animated.View>
        );
      }}
      ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🌱</Text>
          <Text style={styles.emptyText}>No habits yet. Add your first one.</Text>
        </View>
      }
      ListFooterComponent={
        <Pressable style={styles.addBtn} onPress={() => navigation.navigate('AddEditHabit')}>
          <Text style={styles.addPlus}>＋</Text>
          <Text style={styles.addText}>New habit</Text>
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.xl, paddingBottom: space.xxxl },
  header: { marginBottom: space.xl, gap: space.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  greeting: { ...typo.label, color: colors.inkMuted },
  title: { ...typo.display, color: colors.ink },
  subtitle: { ...typo.body, color: colors.inkSecondary },
  ringPct: { ...typo.caption, color: colors.ink, fontFamily: typo.bodyStrong.fontFamily },
  challenge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: space.lg,
    marginTop: space.md,
  },
  challengeEmoji: { fontSize: 24 },
  challengeTitle: { ...typo.bodyStrong, color: colors.ink },
  challengeMeta: { ...typo.caption, color: colors.inkMuted, marginTop: 2 },
  challengeDots: { gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  empty: { alignItems: 'center', paddingVertical: space.xxxl, gap: space.md },
  emptyEmoji: { fontSize: 44 },
  emptyText: { ...typo.body, color: colors.inkMuted, textAlign: 'center' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderStyle: 'dashed',
    paddingVertical: space.lg,
    marginTop: space.lg,
  },
  addPlus: { ...typo.h2, color: colors.amber },
  addText: { ...typo.bodyStrong, color: colors.inkSecondary },
});
