/**
 * Local-date helpers. Keys are built manually from getFullYear/Month/Date to
 * stay in LOCAL time — never switch to toISOString (UTC) or days roll at the
 * wrong moment for users outside UTC.
 */
import type { Habit, Challenge } from './types';

export function dateKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export const todayKey = (): string => dateKey(new Date());

/** Parse a YYYY-MM-DD key back into a local Date (midnight). */
export function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** key for `n` days before today (n=0 => today). */
export function daysAgoKey(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dateKey(d);
}

/** Most-recent-first list of the last `n` day keys (index 0 = today). */
export function lastNDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => daysAgoKey(i));
}

export function countOn(habit: Habit, key: string): number {
  return habit.log[key] ?? 0;
}

export function isDoneOn(habit: Habit, key: string): boolean {
  return countOn(habit, key) >= habit.target;
}

/** Consecutive done-days ending today. Today-not-done => 0 (same as original). */
export function streakOf(habit: Habit): number {
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    if (isDoneOn(habit, dateKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

/** Best (longest) historical streak across all logged days. */
export function bestStreakOf(habit: Habit): number {
  const keys = Object.keys(habit.log)
    .filter((k) => isDoneOn(habit, k))
    .sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of keys) {
    const d = keyToDate(k);
    if (prev) {
      const diff = Math.round((d.getTime() - prev.getTime()) / 86400000);
      run = diff === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Completion rate over the last `n` days (0..1). */
export function completionRate(habit: Habit, n: number): number {
  const start = keyToDate(habit.createdAt).getTime();
  const days = lastNDays(n).filter((k) => keyToDate(k).getTime() >= start);
  if (days.length === 0) return 0;
  const done = days.filter((k) => isDoneOn(habit, k)).length;
  return done / days.length;
}

/** The window of day keys a challenge spans (oldest -> newest). */
export function challengeWindow(challenge: Challenge): string[] {
  const start = keyToDate(challenge.startDate);
  return Array.from({ length: challenge.lengthDays }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return dateKey(d);
  });
}

/** Number of window days completed so far (counts backfilled in-window days). */
export function challengeProgress(challenge: Challenge, habit: Habit): number {
  return challengeWindow(challenge).filter((k) => isDoneOn(habit, k)).length;
}
