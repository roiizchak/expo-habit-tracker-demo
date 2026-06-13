/**
 * Persistence + schema migration. The normalizer is the single source of truth
 * for turning any legacy/partial blob into a valid `Persisted`, so hydration
 * never loses data or crashes on an old shape (e.g. the original `done: string[]`).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Persisted, Habit, Settings } from './types';
import { habitColors } from '../theme/tokens';
import { todayKey } from './date';

export const STORAGE_KEY = '@habits/v1';
export const SCHEMA_VERSION = 2; // v1 = done:string[] era, v2 = log era

export const defaultSettings: Settings = {
  sound: true,
  haptics: true,
  defaultReminder: { hour: 9, minute: 0 },
};

let idCounter = 0;
const newId = (): string => `${Date.now()}-${idCounter++}`;

export function makeSeed(): Habit[] {
  const base = todayKey();
  const seeds: Array<Pick<Habit, 'name' | 'emoji'>> = [
    { name: 'Drink water', emoji: '💧' },
    { name: 'Read 10 pages', emoji: '📚' },
    { name: 'Workout', emoji: '💪' },
  ];
  return seeds.map((s, i) => ({
    id: newId(),
    name: s.name,
    emoji: s.emoji,
    color: habitColors[i % habitColors.length],
    type: 'binary',
    target: 1,
    createdAt: base,
    log: {},
    reminders: [],
    notifIds: [],
  }));
}

/** Coerce one unknown object into a valid Habit, converting legacy fields. */
function normalizeHabit(raw: any, index: number): Habit {
  const type: Habit['type'] = raw?.type === 'volume' ? 'volume' : 'binary';
  let target = Number(raw?.target);
  if (!Number.isFinite(target)) target = type === 'volume' ? 2 : 1;
  // Enforce type/target invariant.
  if (type === 'binary') target = 1;
  else target = Math.max(2, Math.round(target));

  // Legacy `done: string[]` -> per-day count log.
  let log: Record<string, number> = {};
  if (raw?.log && typeof raw.log === 'object') {
    for (const [k, v] of Object.entries(raw.log)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) log[k] = Math.min(n, target);
    }
  } else if (Array.isArray(raw?.done)) {
    for (const k of raw.done) if (typeof k === 'string') log[k] = 1;
  }

  return {
    id: typeof raw?.id === 'string' ? raw.id : newId(),
    name: typeof raw?.name === 'string' ? raw.name : 'Habit',
    emoji: typeof raw?.emoji === 'string' ? raw.emoji : '🎯',
    color: typeof raw?.color === 'string' ? raw.color : habitColors[index % habitColors.length],
    type,
    target,
    createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : todayKey(),
    log,
    reminders: Array.isArray(raw?.reminders) ? raw.reminders : [],
    notifIds: Array.isArray(raw?.notifIds) ? raw.notifIds : [],
  };
}

export function normalize(raw: any): Persisted {
  const habits: Habit[] = Array.isArray(raw?.habits)
    ? raw.habits.map((h: any, i: number) => normalizeHabit(h, i))
    : makeSeed();

  const habitIds = new Set(habits.map((h) => h.id));
  const challenges = Array.isArray(raw?.challenges)
    ? raw.challenges
        .filter((c: any) => c && typeof c.habitId === 'string' && habitIds.has(c.habitId))
        .map((c: any) => ({
          id: typeof c.id === 'string' ? c.id : newId(),
          habitId: c.habitId,
          lengthDays: Number(c.lengthDays) > 0 ? Number(c.lengthDays) : 3,
          startDate: typeof c.startDate === 'string' ? c.startDate : todayKey(),
          status: ['active', 'completed', 'failed'].includes(c.status) ? c.status : 'active',
        }))
    : [];

  return {
    schemaVersion: SCHEMA_VERSION,
    habits,
    challenges,
    settings: { ...defaultSettings, ...(raw?.settings ?? {}) },
    onboarded: Boolean(raw?.onboarded),
  };
}

export async function loadState(): Promise<Persisted | null> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (json == null) return null;
    return normalize(JSON.parse(json));
  } catch {
    return null; // corrupt blob -> start fresh rather than crash
  }
}

export async function saveState(state: Persisted): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // best-effort; ignore write failures
  }
}

export async function clearState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export { newId };
