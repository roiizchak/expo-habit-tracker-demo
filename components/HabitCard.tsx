/**
 * Home habit card. Tap = log today (toggle binary / increment volume).
 * Long-press = open detail. Pops + glows when it reaches done.
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { Habit } from '../lib/types';
import { countOn, isDoneOn, streakOf } from '../lib/date';
import { ProgressRing } from './ProgressRing';
import { colors, radius, space, tintOf, type as typo, shadow } from '../theme/tokens';
import { springs, useReducedMotion } from '../theme/motion';

type Props = {
  habit: Habit;
  today: string;
  onPress: () => void;
  onLongPress: () => void;
};

export function HabitCard({ habit, today, onPress, onLongPress }: Props) {
  const reduced = useReducedMotion();
  const count = countOn(habit, today);
  const done = isDoneOn(habit, today);
  const streak = streakOf(habit);

  const scale = useSharedValue(1);
  const glow = useSharedValue(done ? 1 : 0);

  useEffect(() => {
    glow.value = reduced ? withTiming(done ? 1 : 0, { duration: 0 }) : withSpring(done ? 1 : 0, springs.gentle);
  }, [done, reduced]);

  const handlePress = () => {
    if (!reduced) scale.value = withSequence(withSpring(1.04, springs.pop), withSpring(1, springs.pop));
    onPress();
  };

  // Precompute outside the worklet — tintOf() is JS-thread only and can't be
  // called inside useAnimatedStyle (it runs on the UI thread).
  const doneTint = tintOf(habit.color, 0.14);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({
    borderColor: glow.value > 0.5 ? habit.color : colors.hairline,
    backgroundColor: glow.value > 0.5 ? doneTint : colors.surface,
  }));

  const ringProgress = habit.target > 0 ? count / habit.target : 0;

  return (
    <Animated.View style={[aStyle, done && shadow.glow(habit.color)]}>
      <Pressable onPress={handlePress} onLongPress={onLongPress} delayLongPress={280}>
        <Animated.View style={[styles.card, glowStyle]}>
          <View style={[styles.emojiWrap, { backgroundColor: tintOf(habit.color, 0.16) }]}>
            <Text style={styles.emoji}>{habit.emoji}</Text>
          </View>

          <View style={styles.flex}>
            <Text style={[styles.name, done && { color: habit.color }]} numberOfLines={1}>
              {habit.name}
            </Text>
            <View style={styles.metaRow}>
              {streak > 0 && <Text style={styles.streak}>🔥 {streak}</Text>}
              {habit.type === 'volume' && (
                <Text style={styles.meta}>
                  {count} / {habit.target}
                </Text>
              )}
              {habit.type === 'binary' && !done && <Text style={styles.meta}>Tap to complete</Text>}
            </View>
          </View>

          {habit.type === 'volume' ? (
            <ProgressRing progress={ringProgress} size={48} strokeWidth={5} color={habit.color}>
              <Text style={[styles.ringCount, done && { color: habit.color }]}>{count}</Text>
            </ProgressRing>
          ) : (
            <View style={[styles.check, done && { backgroundColor: habit.color, borderColor: habit.color }]}>
              {done && <Text style={styles.checkMark}>✓</Text>}
            </View>
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    padding: space.lg,
  },
  emojiWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 24 },
  name: { ...typo.bodyStrong, color: colors.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: 3 },
  streak: { ...typo.label, color: colors.amber },
  meta: { ...typo.label, color: colors.inkMuted },
  ringCount: { ...typo.label, color: colors.inkSecondary, fontSize: 14 },
  check: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: colors.inkMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: colors.amberInk, fontFamily: typo.bodyStrong.fontFamily, fontSize: 16 },
});
