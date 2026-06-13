/**
 * Animated circular progress ring (svg + reanimated). Springs to its target.
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../theme/tokens';
import { springs, useReducedMotion } from '../theme/motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  progress: number; // 0..1
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
};

export function ProgressRing({
  progress,
  size = 64,
  strokeWidth = 6,
  color = colors.amber,
  trackColor = colors.hairline,
  children,
}: Props) {
  const reduced = useReducedMotion();
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const p = useSharedValue(0);

  useEffect(() => {
    const target = Math.max(0, Math.min(1, progress));
    p.value = reduced ? withTiming(target, { duration: 0 }) : withSpring(target, springs.fill);
  }, [progress, reduced]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - p.value),
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
        />
      </Svg>
      {children}
    </View>
  );
}
