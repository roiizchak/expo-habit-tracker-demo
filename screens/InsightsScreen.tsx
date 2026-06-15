import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/HabitStore';
import { useAuth } from '../store/AuthProvider';
import { isDoneOn, streakOf, completionRate, dateKey } from '../lib/date';
import { fetchReflection, getCachedCoach, type ReflectionPeriod } from '../lib/coach';
import { WeeklyBars } from '../components/WeeklyBars';
import { Heatmap } from '../components/Heatmap';
import { CoachCard } from '../components/CoachCard';
import { Button, Segmented } from '../components/ui';
import { colors, radius, space, tintOf, type as typo } from '../theme/tokens';

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function InsightsScreen() {
  const { habits, ready, onboarded } = useStore();
  const { userId, session } = useAuth();
  const [tab, setTab] = useState<'charts' | 'log'>('charts');
  const insets = useSafeAreaInsets();

  // Reflection summaries: manual ("Generate"), per the product decision. The Edge
  // Function caches per ISO-week / month, so re-tapping the same period is free.
  const [reflPeriod, setReflPeriod] = useState<ReflectionPeriod>('week');
  const [refl, setRefl] = useState<{ week: string | null; month: string | null }>({
    week: null,
    month: null,
  });
  const [reflLoading, setReflLoading] = useState(false);
  const canCoach = ready && onboarded && !!session && !!userId && habits.length > 0;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    getCachedCoach(userId).then((c) => {
      if (active) {
        setRefl({ week: c['reflection-week'] ?? null, month: c['reflection-month'] ?? null });
      }
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const generateReflection = useCallback(async () => {
    if (!userId) return;
    setReflLoading(true);
    const text = await fetchReflection(userId, reflPeriod);
    if (text) setRefl((r) => ({ ...r, [reflPeriod]: text }));
    setReflLoading(false);
  }, [userId, reflPeriod]);

  const last7Dates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d;
    });
  }, []);

  const weeklyRatios = useMemo(
    () =>
      last7Dates.map((d) => {
        const key = dateKey(d);
        if (habits.length === 0) return 0;
        return habits.filter((h) => isDoneOn(h, key)).length / habits.length;
      }),
    [habits, last7Dates]
  );

  const bestStreak = useMemo(
    () => habits.reduce((m, h) => Math.max(m, streakOf(h)), 0),
    [habits]
  );

  const logSections = useMemo(() => {
    const sections: { date: Date; key: string; items: typeof habits }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dateKey(d);
      const items = habits.filter((h) => isDoneOn(h, key));
      if (items.length) sections.push({ date: d, key, items });
    }
    return sections;
  }, [habits]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Insights</Text>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'charts', label: 'Charts' },
          { value: 'log', label: 'Log' },
        ]}
      />

      {tab === 'charts' ? (
        <>
          <View style={styles.statsRow}>
            <StatCard value={`${habits.length}`} label="Habits" />
            <StatCard value={`${bestStreak}`} label="Best streak" />
            <StatCard value={`${Math.round((weeklyRatios.at(-1) ?? 0) * 100)}%`} label="Today" />
          </View>

          {canCoach && (
            <CoachCard
              title="AI reflection"
              emoji="🧠"
              text={refl[reflPeriod]}
              loading={reflLoading}
              placeholder="Generate an AI recap of your recent consistency."
              textTestID="coach-reflection"
              footer={
                <>
                  <Segmented<ReflectionPeriod>
                    value={reflPeriod}
                    onChange={setReflPeriod}
                    options={[
                      { value: 'week', label: 'Week' },
                      { value: 'month', label: 'Month' },
                    ]}
                  />
                  <Button
                    label={reflLoading ? 'Generating…' : 'Generate'}
                    onPress={generateReflection}
                    disabled={reflLoading}
                    testID="coach-generate"
                  />
                </>
              }
            />
          )}

          <Text style={styles.section}>This week</Text>
          <View style={styles.panel}>
            <WeeklyBars ratios={weeklyRatios} dates={last7Dates} />
          </View>

          <Text style={styles.section}>Per habit</Text>
          <View style={{ gap: space.md }}>
            {habits.map((h) => (
              <View key={h.id} style={styles.habitPanel}>
                <View style={styles.habitHead}>
                  <View style={[styles.dot, { backgroundColor: h.color }]} />
                  <Text style={styles.habitName} numberOfLines={1}>
                    {h.emoji} {h.name}
                  </Text>
                  <Text style={styles.habitPct}>{Math.round(completionRate(h, 30) * 100)}%</Text>
                </View>
                <Heatmap habit={h} weeks={13} />
              </View>
            ))}
          </View>
        </>
      ) : (
        <View style={{ gap: space.lg }}>
          {logSections.length === 0 && (
            <Text style={styles.emptyLog}>Nothing logged yet. Complete a habit to start your history.</Text>
          )}
          {logSections.map((s) => (
            <View key={s.key} style={styles.logDay}>
              <Text style={styles.logDate}>
                {s.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
              <View style={styles.logItems}>
                {s.items.map((h) => (
                  <View key={h.id} style={[styles.logChip, { backgroundColor: tintOf(h.color, 0.16) }]}>
                    <Text style={styles.logChipText}>
                      {h.emoji} {h.name}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.xl, paddingBottom: space.xxxl, gap: space.lg },
  title: { ...typo.display, color: colors.ink },
  statsRow: { flexDirection: 'row', gap: space.md },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: 4 },
  statValue: { ...typo.h1, color: colors.ink },
  statLabel: { ...typo.caption, color: colors.inkMuted },
  section: { ...typo.h2, color: colors.ink, marginTop: space.sm },
  panel: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg },
  habitPanel: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  habitHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  habitName: { ...typo.bodyStrong, color: colors.ink, flex: 1 },
  habitPct: { ...typo.label, color: colors.inkSecondary },
  emptyLog: { ...typo.body, color: colors.inkMuted, textAlign: 'center', paddingVertical: space.xxl },
  logDay: { gap: space.sm },
  logDate: { ...typo.label, color: colors.inkMuted },
  logItems: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  logChip: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill },
  logChipText: { ...typo.label, color: colors.ink },
});
