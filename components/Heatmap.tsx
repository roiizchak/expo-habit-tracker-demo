/**
 * Consistency heatmap (GitHub-style). Columns = weeks, rows = weekdays.
 * Cell intensity scales with that day's progress toward target.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Habit } from '../lib/types';
import { countOn, dateKey } from '../lib/date';
import { colors, space, tintOf, type as typo } from '../theme/tokens';

type Props = { habit: Habit; weeks?: number };

const DAY_LABELS = ['', 'M', '', 'W', '', 'F', ''];

export function Heatmap({ habit, weeks = 13 }: Props) {
  const today = new Date();
  // Align the right-most column to the current week (Sun..Sat).
  const dayOfWeek = today.getDay();
  const lastSunday = new Date(today);
  lastSunday.setDate(today.getDate() - dayOfWeek);

  const columns: { key: string; ratio: number; future: boolean }[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const col: { key: string; ratio: number; future: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(lastSunday);
      cell.setDate(lastSunday.getDate() - w * 7 + d);
      const key = dateKey(cell);
      const future = cell.getTime() > today.getTime();
      const ratio = future ? 0 : Math.min(1, countOn(habit, key) / Math.max(1, habit.target));
      col.push({ key, ratio, future });
    }
    columns.push(col);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.rowLabels}>
        {DAY_LABELS.map((l, i) => (
          <Text key={i} style={styles.dayLabel}>
            {l}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {columns.map((col, ci) => (
          <View key={ci} style={styles.col}>
            {col.map((cell) => (
              <View
                key={cell.key}
                style={[
                  styles.cell,
                  {
                    backgroundColor: cell.future
                      ? 'transparent'
                      : cell.ratio === 0
                      ? colors.surfaceAlt
                      : cell.ratio >= 1
                      ? habit.color
                      : tintOf(habit.color, 0.25 + cell.ratio * 0.45),
                  },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 4 },
  rowLabels: { justifyContent: 'space-between', paddingVertical: 1 },
  dayLabel: { ...typo.caption, color: colors.inkMuted, height: 14, fontSize: 9 },
  grid: { flexDirection: 'row', gap: 3, flex: 1 },
  col: { gap: 3, flex: 1 },
  cell: { flex: 1, aspectRatio: 1, borderRadius: 3, minHeight: 11 },
});
