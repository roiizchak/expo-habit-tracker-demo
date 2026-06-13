/**
 * Single source of truth: habits, challenges, settings. Owns persistence,
 * challenge reconciliation (hydrate / foreground / midnight rollover), and all
 * mutations. UI never writes state directly or schedules notifications itself.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import type { Challenge, Habit, HabitType, Reminder, Settings } from '../lib/types';
import {
  loadState,
  saveState,
  clearState,
  makeSeed,
  defaultSettings,
  SCHEMA_VERSION,
  newId,
} from '../lib/storage';
import { todayKey, isDoneOn, keyToDate } from '../lib/date';
import { reconcileAll, challengeWindow } from '../lib/challenge';
import { rescheduleHabit, cancelIds } from '../lib/notifications';
import { habitColors } from '../theme/tokens';

export type LogResult = {
  nowDone: boolean;
  dayComplete: boolean;
  challengeCompleted: Challenge | null;
};

type NewHabitInput = {
  name: string;
  emoji: string;
  color?: string;
  type: HabitType;
  target: number;
  reminders?: Reminder[];
  startChallenge?: { lengthDays: number } | null;
};

type StoreValue = {
  ready: boolean;
  today: string;
  habits: Habit[];
  challenges: Challenge[];
  settings: Settings;
  onboarded: boolean;
  addHabit: (input: NewHabitInput) => Habit;
  updateHabit: (id: string, patch: Partial<Omit<Habit, 'id' | 'log' | 'notifIds'>>) => void;
  deleteHabit: (id: string) => void;
  logToday: (id: string) => LogResult;
  setCount: (id: string, dateKey: string, value: number) => LogResult;
  startChallenge: (habitId: string, lengthDays: number, startDate?: string) => Challenge;
  setSettings: (patch: Partial<Settings>) => void;
  completeOnboarding: () => void;
  resetAll: () => Promise<void>;
};

const Ctx = createContext<StoreValue | null>(null);

function clampCount(type: HabitType, target: number, value: number): number {
  const max = type === 'binary' ? 1 : target;
  return Math.max(0, Math.min(max, Math.round(value)));
}

/** All habits with a today-entry done. (Empty list => not "complete".) */
function isDayComplete(habits: Habit[], today: string): boolean {
  return habits.length > 0 && habits.every((h) => isDoneOn(h, today));
}

export function HabitProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState(todayKey());
  const [habits, setHabits] = useState<Habit[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [settings, setSettingsState] = useState<Settings>(defaultSettings);
  const [onboarded, setOnboarded] = useState(false);

  // Refs mirror latest state for synchronous reads inside event handlers
  // (so reward results can be computed and returned in the same tick).
  const habitsRef = useRef(habits);
  const challengesRef = useRef(challenges);
  useEffect(() => {
    habitsRef.current = habits;
  }, [habits]);
  useEffect(() => {
    challengesRef.current = challenges;
  }, [challenges]);

  // ---- Hydrate ----
  useEffect(() => {
    let mounted = true;
    (async () => {
      const loaded = await loadState();
      if (!mounted) return;
      if (loaded) {
        const reconciled = reconcileAll(loaded.challenges, loaded.habits);
        setHabits(loaded.habits);
        setChallenges(reconciled);
        setSettingsState(loaded.settings);
        setOnboarded(loaded.onboarded);
      } else {
        setHabits(makeSeed());
      }
      setReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // ---- Persist (debounced) ----
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveState({ schemaVersion: SCHEMA_VERSION, habits, challenges, settings, onboarded });
    }, 300);
  }, [ready, habits, challenges, settings, onboarded]);

  // ---- Date rollover + foreground reconciliation ----
  const reconcileNow = useCallback(() => {
    setToday(todayKey());
    const reconciled = reconcileAll(challengesRef.current, habitsRef.current);
    challengesRef.current = reconciled;
    setChallenges(reconciled);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') reconcileNow();
    });
    return () => sub.remove();
  }, [reconcileNow]);

  // Timer to next local midnight, then every 24h.
  useEffect(() => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 5, 0);
    const ms = midnight.getTime() - now.getTime();
    const t = setTimeout(reconcileNow, ms);
    return () => clearTimeout(t);
  }, [today, reconcileNow]);

  // ---- Actions ----
  const addHabit = useCallback<StoreValue['addHabit']>((input) => {
    const habit: Habit = {
      id: newId(),
      name: input.name.trim() || 'Habit',
      emoji: input.emoji || '🎯',
      color: input.color ?? habitColors[Math.floor(Math.random() * habitColors.length)],
      type: input.type,
      target: input.type === 'binary' ? 1 : Math.max(2, Math.round(input.target)),
      createdAt: todayKey(),
      log: {},
      reminders: input.reminders ?? [],
      notifIds: [],
    };
    setHabits((prev) => [...prev, habit]);
    if (input.startChallenge) {
      setChallenges((prev) => [
        ...prev,
        {
          id: newId(),
          habitId: habit.id,
          lengthDays: input.startChallenge!.lengthDays,
          startDate: todayKey(),
          status: 'active',
        },
      ]);
    }
    // Schedule reminders out-of-band, then store the ids.
    if (habit.reminders.length) {
      rescheduleHabit(habit).then((ids) =>
        setHabits((prev) => prev.map((h) => (h.id === habit.id ? { ...h, notifIds: ids } : h)))
      );
    }
    return habit;
  }, []);

  const updateHabit = useCallback<StoreValue['updateHabit']>((id, patch) => {
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== id) return h;
        const type = patch.type ?? h.type;
        let target = patch.target ?? h.target;
        target = type === 'binary' ? 1 : Math.max(2, Math.round(target));
        const next: Habit = { ...h, ...patch, type, target };
        // Re-clamp existing log entries to the (possibly new) target.
        if (target !== h.target) {
          next.log = Object.fromEntries(
            Object.entries(h.log).map(([k, v]) => [k, clampCount(type, target, v)])
          );
        }
        // Reschedule reminders if they changed.
        if (patch.reminders) {
          rescheduleHabit(next).then((ids) =>
            setHabits((cur) => cur.map((x) => (x.id === id ? { ...x, notifIds: ids } : x)))
          );
        }
        return next;
      })
    );
  }, []);

  const deleteHabit = useCallback<StoreValue['deleteHabit']>((id) => {
    setHabits((prev) => {
      const target = prev.find((h) => h.id === id);
      if (target?.notifIds.length) cancelIds(target.notifIds);
      return prev.filter((h) => h.id !== id);
    });
    // Cascade: fail/remove linked challenges.
    setChallenges((prev) => prev.filter((c) => c.habitId !== id));
  }, []);

  /**
   * Shared mutation that ALSO computes the reward result synchronously (reads
   * latest state from refs), so the caller gets the reward tier in the same tick.
   */
  const applyCount = useCallback(
    (id: string, key: string, compute: (cur: number, h: Habit) => number): LogResult => {
      const result: LogResult = { nowDone: false, dayComplete: false, challengeCompleted: null };
      const prevHabits = habitsRef.current;
      const habit = prevHabits.find((h) => h.id === id);
      if (!habit) return result;

      const before = habit.log[key] ?? 0;
      const value = clampCount(habit.type, habit.target, compute(before, habit));
      const wasDone = before >= habit.target;
      const nowDone = value >= habit.target;

      const log = { ...habit.log };
      if (value <= 0) delete log[key];
      else log[key] = value;
      const nextHabits = prevHabits.map((h) => (h.id === id ? { ...habit, log } : h));

      result.nowDone = nowDone && !wasDone;
      if (key === today && result.nowDone) {
        result.dayComplete = isDayComplete(nextHabits, today);
      }

      const prevCh = challengesRef.current;
      const reconciled = reconcileAll(prevCh, nextHabits);
      for (let i = 0; i < reconciled.length; i++) {
        if (
          reconciled[i].habitId === id &&
          reconciled[i].status === 'completed' &&
          prevCh[i]?.status !== 'completed'
        ) {
          result.challengeCompleted = reconciled[i];
        }
      }

      habitsRef.current = nextHabits;
      challengesRef.current = reconciled;
      setHabits(nextHabits);
      setChallenges(reconciled);
      return result;
    },
    [today]
  );

  const logToday = useCallback<StoreValue['logToday']>(
    (id) => applyCount(id, today, (cur, h) => (h.type === 'binary' ? (cur >= 1 ? 0 : 1) : cur + 1)),
    [applyCount, today]
  );

  const setCount = useCallback<StoreValue['setCount']>(
    (id, key, value) => applyCount(id, key, () => value),
    [applyCount]
  );

  const startChallenge = useCallback<StoreValue['startChallenge']>((habitId, lengthDays, startDate) => {
    const challenge: Challenge = {
      id: newId(),
      habitId,
      lengthDays,
      startDate: startDate ?? todayKey(),
      status: 'active',
    };
    setChallenges((prev) => [...prev, challenge]);
    return challenge;
  }, []);

  const setSettings = useCallback<StoreValue['setSettings']>((patch) => {
    setSettingsState((prev) => ({ ...prev, ...patch }));
  }, []);

  const completeOnboarding = useCallback(() => setOnboarded(true), []);

  const resetAll = useCallback(async () => {
    await Promise.all(habits.map((h) => cancelIds(h.notifIds)));
    await clearState();
    setHabits(makeSeed());
    setChallenges([]);
    setSettingsState(defaultSettings);
    setOnboarded(false);
  }, [habits]);

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      today,
      habits,
      challenges,
      settings,
      onboarded,
      addHabit,
      updateHabit,
      deleteHabit,
      logToday,
      setCount,
      startChallenge,
      setSettings,
      completeOnboarding,
      resetAll,
    }),
    [
      ready,
      today,
      habits,
      challenges,
      settings,
      onboarded,
      addHabit,
      updateHabit,
      deleteHabit,
      logToday,
      setCount,
      startChallenge,
      setSettings,
      completeOnboarding,
      resetAll,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within HabitProvider');
  return v;
}

export { challengeWindow, keyToDate };
