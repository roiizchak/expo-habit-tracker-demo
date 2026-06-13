/**
 * Owns the reward feedback: haptic + chime + confetti/toast overlay.
 * `useAudioPlayer` is a HOOK, so the player must live in this provider (not a
 * bare reward() module fn). Screens call useReward() to get a stable callback.
 *
 * Reward priority (no stacking): challenge-complete > day-complete > habit-complete.
 * The challenge tier is handled by navigating to ChallengeReward (the caller);
 * this provider plays the audio/haptic/visual for the lower two tiers + a hook
 * (`celebrate`) the ChallengeReward screen calls for the big moment.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useStore, type LogResult } from './HabitStore';
import { ConfettiBurst } from '../components/ConfettiBurst';
import { colors, radius, space, type as typo, z } from '../theme/tokens';

const chime = require('../assets/sounds/chime.wav');

export type RewardTier = 'none' | 'habit' | 'day' | 'challenge';

type FeedbackValue = {
  /** Play the right feedback for a log result. Returns the tier acted on. */
  reward: (result: LogResult) => RewardTier;
  /** Big celebration for the ChallengeReward screen. */
  celebrate: () => void;
  /** Light tap feedback for ordinary toggles/decrements. */
  tap: () => void;
};

const Ctx = createContext<FeedbackValue | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useStore();
  const player = useAudioPlayer(chime);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [confettiKey, setConfettiKey] = useState(0);
  const [confettiIntensity, setConfettiIntensity] = useState<'burst' | 'cannon'>('burst');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  const playChime = useCallback(() => {
    if (!settingsRef.current.sound) return;
    try {
      player.seekTo(0);
      player.play();
    } catch {
      // ignore playback hiccups
    }
  }, [player]);

  const haptic = useCallback((kind: Haptics.NotificationFeedbackType) => {
    if (!settingsRef.current.haptics) return;
    Haptics.notificationAsync(kind).catch(() => {});
  }, []);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const fireConfetti = useCallback((intensity: 'burst' | 'cannon') => {
    setConfettiIntensity(intensity);
    setConfettiKey((k) => k + 1);
  }, []);

  const reward = useCallback<FeedbackValue['reward']>(
    (result) => {
      // Highest tier wins. Challenge feedback is owned entirely by the
      // ChallengeReward screen's celebrate() — fire nothing here to avoid
      // a double haptic/chime on the same tap.
      if (result.challengeCompleted) {
        return 'challenge';
      }
      if (result.dayComplete) {
        haptic(Haptics.NotificationFeedbackType.Success);
        playChime();
        fireConfetti('burst');
        showToast('Day complete! 🎉');
        return 'day';
      }
      if (result.nowDone) {
        haptic(Haptics.NotificationFeedbackType.Success);
        playChime();
        return 'habit';
      }
      return 'none';
    },
    [haptic, playChime, fireConfetti, showToast]
  );

  const celebrate = useCallback<FeedbackValue['celebrate']>(() => {
    haptic(Haptics.NotificationFeedbackType.Success);
    playChime();
    fireConfetti('cannon');
  }, [haptic, playChime, fireConfetti]);

  const tap = useCallback<FeedbackValue['tap']>(() => {
    if (!settingsRef.current.haptics) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  return (
    <Ctx.Provider value={{ reward, celebrate, tap }}>
      {children}
      {confettiKey > 0 && (
        <ConfettiBurst key={confettiKey} intensity={confettiIntensity} />
      )}
      {toast && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(220)}
          pointerEvents="none"
          style={styles.toast}
        >
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

export function useReward(): FeedbackValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useReward must be used within FeedbackProvider');
  return v;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 64,
    alignSelf: 'center',
    backgroundColor: colors.amber,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    zIndex: z.toast,
  },
  toastText: { ...typo.bodyStrong, color: colors.amberInk },
});
