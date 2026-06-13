/**
 * Lightweight confetti — reanimated only, capped particle count for Expo Go
 * smoothness. Mounts, animates once, self-removes. Honors reduced motion
 * (renders nothing). No external confetti dependency.
 */
import React, { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { habitColors } from '../theme/tokens';
import { z } from '../theme/tokens';
import { useReducedMotion } from '../theme/motion';

type Props = { intensity?: 'burst' | 'cannon' };

// Deterministic pseudo-random (no Math.random in render path needed, but fine here at mount).
function rand(seed: number): number {
  const x = Math.sin(seed * 99.123) * 10000;
  return x - Math.floor(x);
}

function Piece({ index, width, height, distance }: { index: number; width: number; height: number; distance: number }) {
  const progress = useSharedValue(0);
  const startX = width * (0.2 + 0.6 * rand(index));
  const angle = (rand(index + 7) - 0.5) * 1.4;
  const drift = Math.sin(angle) * distance;
  const fall = height * (0.55 + 0.4 * rand(index + 3));
  const rot = (rand(index + 11) - 0.5) * 720;
  const size = 7 + Math.floor(rand(index + 5) * 7);
  const color = habitColors[index % habitColors.length];
  const delay = Math.floor(rand(index + 13) * 120);

  useEffect(() => {
    progress.value = withTiming(1, { duration: 1100 + delay, easing: Easing.out(Easing.quad) });
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: drift * progress.value },
      { translateY: fall * progress.value },
      { rotate: `${rot * progress.value}deg` },
    ],
    opacity: 1 - progress.value * progress.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: startX,
          top: height * 0.18,
          width: size,
          height: size * 1.6,
          borderRadius: 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

export function ConfettiBurst({ intensity = 'burst' }: Props) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  if (reduced) return null;

  const count = intensity === 'cannon' ? 70 : 36;
  const distance = intensity === 'cannon' ? width * 0.5 : width * 0.35;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: z.confetti }]}>
      {Array.from({ length: count }, (_, i) => (
        <Piece key={i} index={i} width={width} height={height} distance={distance} />
      ))}
    </View>
  );
}
