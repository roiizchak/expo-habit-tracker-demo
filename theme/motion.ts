/**
 * Motion config — ease-out springs, no bounce. Honors reduced-motion live.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Easing, ReduceMotion, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';

export const springs = {
  /** Quick, settled pop for completion feedback. */
  pop: { damping: 12, stiffness: 220, mass: 0.6 } satisfies WithSpringConfig,
  /** Smooth fill for progress rings / bars. */
  fill: { damping: 18, stiffness: 140, mass: 0.9 } satisfies WithSpringConfig,
  /** Gentle entrance. */
  gentle: { damping: 20, stiffness: 120, mass: 1 } satisfies WithSpringConfig,
};

export const timings = {
  fast: { duration: 180, easing: Easing.out(Easing.quad) } satisfies WithTimingConfig,
  base: { duration: 260, easing: Easing.out(Easing.cubic) } satisfies WithTimingConfig,
  slow: { duration: 420, easing: Easing.out(Easing.exp) } satisfies WithTimingConfig,
};

/**
 * Live reduced-motion flag. Reads the OS setting and subscribes to changes so
 * animations degrade to instant/crossfade without an app restart.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/** Pass to reanimated configs so they collapse to instant when reduced. */
export const reduceMotionFlag = ReduceMotion.System;
