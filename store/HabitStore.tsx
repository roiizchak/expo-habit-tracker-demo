/**
 * Single source of truth: habits, challenges, settings. Owns the local cache
 * (instant, offline), challenge reconciliation (hydrate / foreground / midnight),
 * all mutations, and the Supabase sync.
 *
 * Sync model (offline-first, local-authoritative):
 *   - Every mutation writes local state immediately (snappy UI) and enqueues a
 *     self-contained SyncOp in `pending` (persisted, survives app kill).
 *   - A debounced flush pushes `pending` to Supabase; confirmed ops are dropped.
 *   - On login + foreground we pull a remote delta and merge it, letting any
 *     still-pending local op win (last-write-wins, local takes precedence).
 *   - All state is scoped to the signed-in userId; sign-out clears it.
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
import type { Challenge, Habit, HabitType, Reminder, Settings, SyncOp } from '../lib/types';
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
import { useAuth } from './AuthProvider';
import { flushDirty, pullDelta, type PullResult } from '../lib/sync';

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

// SyncOp key builders — one key per entity so re-enqueues replace (latest wins).
const kHabit = (id: string) => `h:${id}`;
const kChallenge = (id: string) => `c:${id}`;
const kLog = (habitId: string, date: string) => `l:${habitId}:${date}`;
const K_SETTINGS = 's';
const K_PROFILE = 'p';

export function HabitProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();

  const [ready, setReady] = useState(false);
  const [today, setToday] = useState(todayKey());
  const [habits, setHabits] = useState<Habit[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [settings, setSettingsState] = useState<Settings>(defaultSettings);
  const [onboarded, setOnboarded] = useState(false);
  const [pending, setPending] = useState<SyncOp[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // Refs mirror latest state for synchronous reads inside event handlers / async
  // sync callbacks (so reward results compute in the same tick, and merges read
  // the freshest state regardless of React batching).
  const habitsRef = useRef(habits);
  const challengesRef = useRef(challenges);
  const settingsRef = useRef(settings);
  const onboardedRef = useRef(onboarded);
  const pendingRef = useRef(pending);
  const lastSyncedRef = useRef(lastSyncedAt);
  const userIdRef = useRef(userId);
  useEffect(() => void (habitsRef.current = habits), [habits]);
  useEffect(() => void (challengesRef.current = challenges), [challenges]);
  useEffect(() => void (settingsRef.current = settings), [settings]);
  useEffect(() => void (onboardedRef.current = onboarded), [onboarded]);
  useEffect(() => void (pendingRef.current = pending), [pending]);
  useEffect(() => void (lastSyncedRef.current = lastSyncedAt), [lastSyncedAt]);
  useEffect(() => void (userIdRef.current = userId), [userId]);

  // ---- dirty queue helpers ----
  const enqueue = useCallback((op: SyncOp) => {
    const next = pendingRef.current.filter((o) => o.key !== op.key);
    next.push(op);
    pendingRef.current = next;
    setPending(next);
  }, []);
  const enqueueHabit = useCallback((h: Habit) => enqueue({ key: kHabit(h.id), entity: 'habit', action: 'upsert', habit: h }), [enqueue]);
  const enqueueChallenge = useCallback((c: Challenge) => enqueue({ key: kChallenge(c.id), entity: 'challenge', action: 'upsert', challenge: c }), [enqueue]);
  const enqueueLog = useCallback(
    (habitId: string, date: string, count: number) =>
      enqueue(
        count > 0
          ? { key: kLog(habitId, date), entity: 'log', action: 'upsert', habitId, date, count }
          : { key: kLog(habitId, date), entity: 'log', action: 'delete', habitId, date }
      ),
    [enqueue]
  );
  const enqueueSettings = useCallback((s: Settings) => enqueue({ key: K_SETTINGS, entity: 'settings', action: 'upsert', settings: s }), [enqueue]);
  const enqueueProfile = useCallback((ob: boolean) => enqueue({ key: K_PROFILE, entity: 'profile', action: 'upsert', onboarded: ob }), [enqueue]);

  const enqueueFullState = useCallback(
    (hs: Habit[], cs: Challenge[], st: Settings, ob: boolean) => {
      hs.forEach((h) => {
        enqueueHabit(h);
        Object.entries(h.log).forEach(([date, count]) => enqueueLog(h.id, date, count));
      });
      cs.forEach((c) => enqueueChallenge(c));
      enqueueSettings(st);
      enqueueProfile(ob);
    },
    [enqueueHabit, enqueueLog, enqueueChallenge, enqueueSettings, enqueueProfile]
  );

  // ---- push: flush the dirty queue (offline-safe; confirmed ops dropped) ----
  const flushNow = useCallback(async (uid: string) => {
    const ops = pendingRef.current;
    if (!ops.length) return;
    const doneOps = await flushDirty(uid, ops);
    if (userIdRef.current !== uid || !doneOps.length) return;
    // Drop confirmed ops by object identity, NOT by key: a newer same-key op
    // enqueued while the flush was in flight is a different object and survives.
    const done = new Set(doneOps);
    const remaining = pendingRef.current.filter((o) => !done.has(o));
    pendingRef.current = remaining;
    setPending(remaining);
  }, []);

  // ---- commit a merged snapshot to refs + state in one shot ----
  const commit = useCallback((hs: Habit[], cs: Challenge[], st: Settings, ob: boolean) => {
    const reconciled = reconcileAll(cs, hs);
    habitsRef.current = hs;
    challengesRef.current = reconciled;
    settingsRef.current = st;
    onboardedRef.current = ob;
    setHabits(hs);
    setChallenges(reconciled);
    setSettingsState(st);
    setOnboarded(ob);
  }, []);

  // ---- merge a remote delta into local state (pending local ops win) ----
  const mergeRemote = useCallback((r: PullResult) => {
    const pend = pendingRef.current;
    const hasPending = (key: string) => pend.some((o) => o.key === key);

    const byId = new Map<string, Habit>(habitsRef.current.map((h) => [h.id, h]));
    for (const meta of r.habitUpserts) {
      if (hasPending(kHabit(meta.id))) continue; // local change wins
      const existing = byId.get(meta.id);
      byId.set(meta.id, existing ? { ...existing, ...meta } : { ...meta, log: {}, notifIds: [] });
    }
    for (const delId of r.habitDeletes) {
      if (hasPending(kHabit(delId))) continue;
      byId.delete(delId);
    }
    const applyLog = (habitId: string, date: string, count: number | null) => {
      const h = byId.get(habitId);
      if (!h) return;
      const log = { ...h.log };
      if (count && count > 0) log[date] = count;
      else delete log[date];
      byId.set(habitId, { ...h, log });
    };
    for (const lu of r.logUpserts) if (!hasPending(kLog(lu.habitId, lu.date))) applyLog(lu.habitId, lu.date, lu.count);
    for (const ld of r.logDeletes) if (!hasPending(kLog(ld.habitId, ld.date))) applyLog(ld.habitId, ld.date, null);

    const cById = new Map<string, Challenge>(challengesRef.current.map((c) => [c.id, c]));
    for (const c of r.challengeUpserts) if (!hasPending(kChallenge(c.id))) cById.set(c.id, c);
    for (const cid of r.challengeDeletes) if (!hasPending(kChallenge(cid))) cById.delete(cid);

    const habits = [...byId.values()];
    const challenges = [...cById.values()].filter((c) => byId.has(c.habitId));
    const settings = r.settings && !hasPending(K_SETTINGS) ? r.settings : settingsRef.current;
    const onboarded = r.onboarded != null && !hasPending(K_PROFILE) ? r.onboarded : onboardedRef.current;
    commit(habits, challenges, settings, onboarded);
  }, [commit]);

  // ---- build local state directly from a full remote pull (returning user) ----
  const baseFromRemote = useCallback((r: PullResult) => {
    const byId = new Map<string, Habit>();
    r.habitUpserts.forEach((m) => byId.set(m.id, { ...m, log: {}, notifIds: [] }));
    r.logUpserts.forEach((l) => {
      const h = byId.get(l.habitId);
      if (h && l.count > 0) h.log[l.date] = l.count;
    });
    const habits = [...byId.values()];
    const challenges = r.challengeUpserts.filter((c) => byId.has(c.habitId));
    commit(habits, challenges, r.settings ?? defaultSettings, r.onboarded ?? false);
  }, [commit]);

  // ---- Hydrate (per user) ----
  useEffect(() => {
    const uid = userId;
    if (!uid) {
      // Signed out: drop all in-memory state (next user re-hydrates fresh).
      setReady(false);
      commit([], [], defaultSettings, false);
      pendingRef.current = [];
      setPending([]);
      lastSyncedRef.current = null;
      setLastSyncedAt(null);
      return;
    }

    let mounted = true;
    (async () => {
      setReady(false);
      const loaded = await loadState(uid);
      if (!mounted || userIdRef.current !== uid) return;

      if (loaded) {
        // Have a local cache -> render instantly, then reconcile with a delta pull.
        commit(loaded.habits, loaded.challenges, loaded.settings, loaded.onboarded);
        pendingRef.current = loaded.pending;
        setPending(loaded.pending);
        lastSyncedRef.current = loaded.lastSyncedAt;
        setLastSyncedAt(loaded.lastSyncedAt);
        setReady(true);

        const r = await pullDelta(uid, loaded.lastSyncedAt);
        if (!mounted || userIdRef.current !== uid) return;
        if (r) {
          mergeRemote(r);
          if (r.maxUpdatedAt) {
            lastSyncedRef.current = r.maxUpdatedAt;
            setLastSyncedAt(r.maxUpdatedAt);
          }
          if (r.remoteEmpty) {
            enqueueFullState(habitsRef.current, challengesRef.current, settingsRef.current, onboardedRef.current);
          }
        }
        flushNow(uid);
        return;
      }

      // No local cache: could be a returning user on a new device, or brand new.
      const r = await pullDelta(uid, null);
      if (!mounted || userIdRef.current !== uid) return;
      if (r && !r.remoteEmpty) {
        // Returning user on a fresh device: rebuild from the cloud.
        baseFromRemote(r);
        lastSyncedRef.current = r.maxUpdatedAt;
        setLastSyncedAt(r.maxUpdatedAt);
        setReady(true);
        flushNow(uid);
      } else if (r && r.remoteEmpty) {
        // Genuinely brand-new account: seed demo habits, run onboarding, push it up.
        const seed = makeSeed();
        commit(seed, [], defaultSettings, false);
        setReady(true);
        enqueueFullState(seed, [], defaultSettings, false);
        flushNow(uid);
      } else {
        // Offline with no cache (r === null): we can't tell new from returning.
        // Render empty WITHOUT seeding/pushing; a later foreground pull resolves it.
        commit([], [], defaultSettings, false);
        setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId, commit, mergeRemote, baseFromRemote, enqueueFullState, flushNow]);

  // ---- Persist (debounced) + push ----
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!ready || !userId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveState(userId, { schemaVersion: SCHEMA_VERSION, habits, challenges, settings, onboarded, pending, lastSyncedAt });
      flushNow(userId);
    }, 300);
  }, [ready, userId, habits, challenges, settings, onboarded, pending, lastSyncedAt, flushNow]);

  // ---- Date rollover + foreground reconciliation + sync ----
  const reconcileNow = useCallback(() => {
    setToday(todayKey());
    const prev = challengesRef.current;
    const reconciled = reconcileAll(prev, habitsRef.current);
    reconciled.forEach((c, i) => {
      if (prev[i] && prev[i].status !== c.status) enqueueChallenge(c);
    });
    challengesRef.current = reconciled;
    setChallenges(reconciled);
  }, [enqueueChallenge]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      reconcileNow();
      const uid = userIdRef.current;
      if (!uid) return;
      (async () => {
        const r = await pullDelta(uid, lastSyncedRef.current);
        if (userIdRef.current !== uid) return;
        if (r) {
          mergeRemote(r);
          if (r.maxUpdatedAt) {
            lastSyncedRef.current = r.maxUpdatedAt;
            setLastSyncedAt(r.maxUpdatedAt);
          }
        }
        flushNow(uid);
      })();
    });
    return () => sub.remove();
  }, [reconcileNow, mergeRemote, flushNow]);

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
  const addHabit = useCallback<StoreValue['addHabit']>(
    (input) => {
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
      enqueueHabit(habit);
      if (input.startChallenge) {
        const challenge: Challenge = {
          id: newId(),
          habitId: habit.id,
          lengthDays: input.startChallenge.lengthDays,
          startDate: todayKey(),
          status: 'active',
        };
        setChallenges((prev) => [...prev, challenge]);
        enqueueChallenge(challenge);
      }
      // Schedule reminders out-of-band, then store the ids (local-only, not synced).
      if (habit.reminders.length) {
        rescheduleHabit(habit).then((ids) =>
          setHabits((prev) => prev.map((h) => (h.id === habit.id ? { ...h, notifIds: ids } : h)))
        );
      }
      return habit;
    },
    [enqueueHabit, enqueueChallenge]
  );

  const updateHabit = useCallback<StoreValue['updateHabit']>(
    (id, patch) => {
      setHabits((prev) =>
        prev.map((h) => {
          if (h.id !== id) return h;
          const type = patch.type ?? h.type;
          let target = patch.target ?? h.target;
          target = type === 'binary' ? 1 : Math.max(2, Math.round(target));
          const next: Habit = { ...h, ...patch, type, target };
          // Re-clamp existing log entries to the (possibly new) target, syncing changes.
          if (target !== h.target) {
            next.log = Object.fromEntries(
              Object.entries(h.log).map(([k, v]) => [k, clampCount(type, target, v)])
            );
            for (const [k, v] of Object.entries(next.log)) if (v !== h.log[k]) enqueueLog(id, k, v);
          }
          enqueueHabit(next);
          // Reschedule reminders if they changed (notifIds are local-only).
          if (patch.reminders) {
            rescheduleHabit(next).then((ids) =>
              setHabits((cur) => cur.map((x) => (x.id === id ? { ...x, notifIds: ids } : x)))
            );
          }
          return next;
        })
      );
    },
    [enqueueHabit, enqueueLog]
  );

  const deleteHabit = useCallback<StoreValue['deleteHabit']>(
    (id) => {
      const childChallengeIds = new Set(
        challengesRef.current.filter((c) => c.habitId === id).map((c) => c.id)
      );
      // Drop pending child ops so we never push a log/challenge for a deleted habit
      // (which would FK-fail if the habit was created+deleted before any sync).
      const purged = pendingRef.current.filter(
        (o) =>
          !(o.entity === 'log' && o.habitId === id) &&
          !(o.entity === 'challenge' && childChallengeIds.has(o.action === 'upsert' ? o.challenge.id : o.id))
      );
      pendingRef.current = purged;
      setPending(purged);

      setHabits((prev) => {
        const target = prev.find((h) => h.id === id);
        if (target?.notifIds.length) cancelIds(target.notifIds);
        return prev.filter((h) => h.id !== id);
      });
      setChallenges((prev) => prev.filter((c) => c.habitId !== id));
      // Tombstone the habit (flush also tombstones its children server-side).
      enqueue({ key: kHabit(id), entity: 'habit', action: 'delete', id });
    },
    [enqueue]
  );

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
        if (reconciled[i].habitId === id && reconciled[i].status !== prevCh[i]?.status) {
          enqueueChallenge(reconciled[i]);
          if (reconciled[i].status === 'completed') result.challengeCompleted = reconciled[i];
        }
      }

      habitsRef.current = nextHabits;
      challengesRef.current = reconciled;
      setHabits(nextHabits);
      setChallenges(reconciled);
      enqueueLog(id, key, value);
      return result;
    },
    [today, enqueueChallenge, enqueueLog]
  );

  const logToday = useCallback<StoreValue['logToday']>(
    (id) => applyCount(id, today, (cur, h) => (h.type === 'binary' ? (cur >= 1 ? 0 : 1) : cur + 1)),
    [applyCount, today]
  );

  const setCount = useCallback<StoreValue['setCount']>(
    (id, key, value) => applyCount(id, key, () => value),
    [applyCount]
  );

  const startChallenge = useCallback<StoreValue['startChallenge']>(
    (habitId, lengthDays, startDate) => {
      const challenge: Challenge = {
        id: newId(),
        habitId,
        lengthDays,
        startDate: startDate ?? todayKey(),
        status: 'active',
      };
      setChallenges((prev) => [...prev, challenge]);
      enqueueChallenge(challenge);
      return challenge;
    },
    [enqueueChallenge]
  );

  const setSettings = useCallback<StoreValue['setSettings']>(
    (patch) => {
      setSettingsState((prev) => {
        const next = { ...prev, ...patch };
        enqueueSettings(next);
        return next;
      });
    },
    [enqueueSettings]
  );

  const completeOnboarding = useCallback(() => {
    setOnboarded(true);
    enqueueProfile(true);
  }, [enqueueProfile]);

  const resetAll = useCallback(async () => {
    const uid = userIdRef.current;
    await Promise.all(habitsRef.current.map((h) => cancelIds(h.notifIds)));
    // Tombstone everything currently in the cloud for this user...
    habitsRef.current.forEach((h) => enqueue({ key: kHabit(h.id), entity: 'habit', action: 'delete', id: h.id }));
    if (uid) await clearState(uid);
    // ...then reseed locally and push the fresh state.
    const seed = makeSeed();
    commit(seed, [], defaultSettings, false);
    lastSyncedRef.current = null;
    setLastSyncedAt(null);
    enqueueFullState(seed, [], defaultSettings, false);
    if (uid) flushNow(uid);
  }, [enqueue, enqueueFullState, commit, flushNow]);

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
