/**
 * Last-7-days bar chart of completion ratio. Works for one habit or an
 * aggregate (pass a precomputed ratios array).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, space, type as typo } from '../theme/tokens';

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type Props = {
  /** Oldest -> newest, length 7, each 0..1. */
  ratios: number[];
  /** dates oldest -> newest (for weekday labels). */
  dates: Date[];
  color?: string;
  height?: number;
};

export function WeeklyBars({ ratios, dates, color = colors.amber, height = 120 }: Props) {
  return (
    <View style={[styles.wrap, { height }]}>
      {ratios.map((r, i) => {
        const isToday = i === ratios.length - 1;
        return (
          <View key={i} style={styles.colWrap}>
            <View style={styles.track}>
              <View
                style={[
                  styles.bar,
                  {
                    height: `${Math.max(4, r * 100)}%`,
                    backgroundColor: r > 0 ? color : colors.surfaceAlt,
                  },
                ]}
              />
            </View>
            <Text style={[styles.label, isToday && { color: colors.ink }]}>
              {WEEKDAY[dates[i].getDay()]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  colWrap: { flex: 1, alignItems: 'center', gap: space.sm, height: '100%' },
  track: {
    flex: 1,
    width: '70%',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  bar: { width: '100%', borderRadius: radius.sm },
  label: { ...typo.caption, color: colors.inkMuted },
});
