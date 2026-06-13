import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useStore } from '../store/HabitStore';
import { useReward } from '../store/FeedbackProvider';
import { dateKey } from '../lib/date';
import { Button } from '../components/ui';
import { colors, space, tintOf, type as typo } from '../theme/tokens';
import type { RootScreenProps } from '../navigation/types';

function tomorrowKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return dateKey(d);
}

export function ChallengeRewardScreen({ navigation, route }: RootScreenProps<'ChallengeReward'>) {
  const { challenges, habits, startChallenge } = useStore();
  const { celebrate } = useReward();
  const challenge = challenges.find((c) => c.id === route.params.challengeId);
  const habit = challenge ? habits.find((h) => h.id === challenge.habitId) : undefined;

  useEffect(() => {
    celebrate();
  }, []);

  const length = challenge?.lengthDays ?? 3;
  const nextLength = length === 3 ? 7 : Math.min(30, length * 2);
  const accent = habit?.color ?? colors.amber;

  const onNext = () => {
    if (habit) startChallenge(habit.id, nextLength, tomorrowKey());
    navigation.goBack();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Animated.View entering={FadeIn.duration(300)} style={[styles.glow, { backgroundColor: tintOf(accent, 0.16) }]} />
      <Animated.Text entering={FadeInDown.delay(120).springify()} style={styles.trophy}>
        🏆
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(220).springify()} style={styles.title}>
        {length}-day streak complete!
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(320).springify()} style={styles.sub}>
        {habit ? `You showed up for ${habit.emoji} ${habit.name} ${length} days straight.` : 'You did it.'}
      </Animated.Text>

      <Animated.View entering={FadeInDown.delay(460).springify()} style={styles.actions}>
        <Button label={`Start a ${nextLength}-day challenge`} onPress={onNext} />
        <Button label="Done" variant="ghost" onPress={() => navigation.goBack()} style={{ marginTop: space.sm }} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  glow: { position: 'absolute', width: 320, height: 320, borderRadius: 160, top: '22%' },
  trophy: { fontSize: 96, marginBottom: space.xl },
  title: { ...typo.h1, color: colors.ink, textAlign: 'center' },
  sub: {
    ...typo.body,
    color: colors.inkSecondary,
    textAlign: 'center',
    marginTop: space.md,
    paddingHorizontal: space.lg,
  },
  actions: { position: 'absolute', bottom: space.xxxl, left: space.xl, right: space.xl },
});
