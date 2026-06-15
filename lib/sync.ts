/**
 * Offline-first sync between the local cache (AsyncStorage, source of truth for
 * the UI) and Supabase (durable per-user store).
 *
 *   flushDirty(userId, ops)  -> push queued local writes; returns the keys that
 *                               were confirmed so the store can drop them.
 *   pullDelta(userId, since) -> fetch remote rows changed since `since` and return
 *                               them as granular merge instructions (the store
 *                               applies them, letting still-pending local writes win).
 *
 * Nothing here ever throws to the caller: network failures resolve to a no-op so
 * the app stays usable offline. notifIds are local-only and never synced.
 */
import { supabase } from './supabase';
import type { Challenge, Habit, Settings, SyncOp } from './types';

// ---- row <-> domain mappers --------------------------------------------------

/** Habit metadata as stored remotely (the per-day counts live in daily_logs). */
type HabitMeta = Omit<Habit, 'log' | 'notifIds'>;

const habitToRow = (h: Habit, userId: string) => ({
  id: h.id,
  user_id: userId,
  name: h.name,
  emoji: h.emoji,
  color: h.color,
  type: h.type,
  target: h.target,
  created_at_key: h.createdAt,
  reminders: h.reminders,
  deleted_at: null,
});

const rowToHabitMeta = (r: any): HabitMeta => ({
  id: r.id,
  name: r.name,
  emoji: r.emoji,
  color: r.color,
  type: r.type === 'volume' ? 'volume' : 'binary',
  target: r.target,
  createdAt: r.created_at_key,
  reminders: Array.isArray(r.reminders) ? r.reminders : [],
});

const challengeToRow = (c: Challenge, userId: string) => ({
  id: c.id,
  user_id: userId,
  habit_id: c.habitId,
  length_days: c.lengthDays,
  start_date: c.startDate,
  status: c.status,
  deleted_at: null,
});

const rowToChallenge = (r: any): Challenge => ({
  id: r.id,
  habitId: r.habit_id,
  lengthDays: r.length_days,
  startDate: r.start_date,
  status: r.status,
});

const settingsToRow = (s: Settings, userId: string) => ({
  user_id: userId,
  sound: s.sound,
  haptics: s.haptics,
  default_reminder: s.defaultReminder,
});

const rowToSettings = (r: any): Settings => ({
  sound: !!r.sound,
  haptics: !!r.haptics,
  defaultReminder: r.default_reminder ?? { hour: 9, minute: 0 },
});

// ---- push: flush the dirty queue --------------------------------------------

/**
 * Push queued ops. Returns the exact op objects that were confirmed — the caller
 * removes them by identity (NOT by key), so a newer same-key op enqueued while
 * this flush was in flight is preserved rather than silently dropped.
 */
export async function flushDirty(userId: string, ops: SyncOp[]): Promise<SyncOp[]> {
  if (!ops.length) return [];
  const done = new Set<SyncOp>();
  const now = () => new Date().toISOString();

  // Bucket ops so we can batch and respect FK order (parents before children).
  const habitUpserts: { op: SyncOp; row: any }[] = [];
  const habitDeletes: { op: SyncOp; id: string }[] = [];
  const challengeUpserts: { op: SyncOp; row: any }[] = [];
  const challengeDeletes: { op: SyncOp; id: string }[] = [];
  const logUpserts: { op: SyncOp; row: any }[] = [];
  const logDeletes: { op: SyncOp; row: any }[] = [];
  const settingsUpserts: { op: SyncOp; row: any }[] = [];
  const profileUpserts: { op: SyncOp; onboarded: boolean }[] = [];

  for (const op of ops) {
    if (op.entity === 'habit' && op.action === 'upsert') habitUpserts.push({ op, row: habitToRow(op.habit, userId) });
    else if (op.entity === 'habit') habitDeletes.push({ op, id: op.id });
    else if (op.entity === 'challenge' && op.action === 'upsert') challengeUpserts.push({ op, row: challengeToRow(op.challenge, userId) });
    else if (op.entity === 'challenge') challengeDeletes.push({ op, id: op.id });
    else if (op.entity === 'log' && op.action === 'upsert')
      logUpserts.push({ op, row: { user_id: userId, habit_id: op.habitId, date: op.date, count: op.count, deleted_at: null } });
    else if (op.entity === 'log')
      logDeletes.push({ op, row: { user_id: userId, habit_id: op.habitId, date: op.date, count: 0, deleted_at: now() } });
    else if (op.entity === 'settings') settingsUpserts.push({ op, row: settingsToRow(op.settings, userId) });
    else if (op.entity === 'profile') profileUpserts.push({ op, onboarded: op.onboarded });
  }

  const mark = (items: { op: SyncOp }[]) => items.forEach(({ op }) => done.add(op));

  // Parents first (habits) so child FKs resolve, then children, then deletes.
  if (habitUpserts.length) {
    const { error } = await supabase.from('habits').upsert(habitUpserts.map((x) => x.row));
    if (!error) mark(habitUpserts);
  }
  if (settingsUpserts.length) {
    const { error } = await supabase.from('settings').upsert(settingsUpserts.map((x) => x.row));
    if (!error) mark(settingsUpserts);
  }
  for (const { op, onboarded } of profileUpserts) {
    const { error } = await supabase.from('profiles').upsert({ id: userId, onboarded });
    if (!error) done.add(op);
  }
  if (challengeUpserts.length) {
    const { error } = await supabase.from('challenges').upsert(challengeUpserts.map((x) => x.row));
    if (!error) mark(challengeUpserts);
  }
  if (logUpserts.length) {
    const { error } = await supabase.from('daily_logs').upsert(logUpserts.map((x) => x.row));
    if (!error) mark(logUpserts);
  }
  if (logDeletes.length) {
    const { error } = await supabase.from('daily_logs').upsert(logDeletes.map((x) => x.row));
    if (!error) mark(logDeletes);
  }
  // Soft-delete a habit AND tombstone its children (FK cascade only fires on hard delete).
  for (const { op, id } of habitDeletes) {
    const ts = now();
    const e1 = (await supabase.from('daily_logs').update({ deleted_at: ts }).eq('user_id', userId).eq('habit_id', id)).error;
    const e2 = (await supabase.from('challenges').update({ deleted_at: ts }).eq('user_id', userId).eq('habit_id', id)).error;
    const e3 = (await supabase.from('habits').update({ deleted_at: ts }).eq('user_id', userId).eq('id', id)).error;
    if (!e1 && !e2 && !e3) done.add(op);
  }
  for (const { op, id } of challengeDeletes) {
    const { error } = await supabase.from('challenges').update({ deleted_at: now() }).eq('user_id', userId).eq('id', id);
    if (!error) done.add(op);
  }

  return [...done];
}

// ---- pull: fetch a remote delta ---------------------------------------------

export type PullResult = {
  habitUpserts: HabitMeta[];
  habitDeletes: string[];
  logUpserts: { habitId: string; date: string; count: number }[];
  logDeletes: { habitId: string; date: string }[];
  challengeUpserts: Challenge[];
  challengeDeletes: string[];
  settings: Settings | null;
  onboarded: boolean | null;
  maxUpdatedAt: string | null;
  /** True when the user has zero rows server-side (brand-new account). */
  remoteEmpty: boolean;
};

/**
 * Fetch rows changed since `since` (null = full pull). Returns granular merge
 * instructions; deleted_at rows become deletes. Returns null on any failure.
 */
export async function pullDelta(userId: string, since: string | null): Promise<PullResult | null> {
  try {
    const sel = <T>(table: string) => {
      let q = supabase.from(table).select('*').eq('user_id', userId);
      if (since) q = q.gt('updated_at', since);
      return q;
    };
    const profileQ = supabase.from('profiles').select('*').eq('id', userId);

    const [habitsR, logsR, challR, setR, profR] = await Promise.all([
      sel('habits'),
      sel('daily_logs'),
      sel('challenges'),
      sel('settings'),
      since ? supabase.from('profiles').select('*').eq('id', userId).gt('updated_at', since) : profileQ,
    ]);

    if (habitsR.error || logsR.error || challR.error || setR.error || profR.error) return null;

    const habits = (habitsR.data ?? []) as any[];
    const logs = (logsR.data ?? []) as any[];
    const challenges = (challR.data ?? []) as any[];
    const settingsRows = (setR.data ?? []) as any[];
    const profileRows = (profR.data ?? []) as any[];

    let maxUpdatedAt = since;
    const bump = (rows: any[]) => {
      for (const r of rows) if (r.updated_at && (!maxUpdatedAt || r.updated_at > maxUpdatedAt)) maxUpdatedAt = r.updated_at;
    };
    bump(habits); bump(logs); bump(challenges); bump(settingsRows); bump(profileRows);

    const settingsRow = settingsRows[0];
    const profileRow = profileRows[0];

    // remoteEmpty is only meaningful on a full pull (since === null).
    const remoteEmpty =
      since === null && habits.length === 0 && logs.length === 0 && challenges.length === 0 && !settingsRow && !profileRow;

    return {
      habitUpserts: habits.filter((r) => !r.deleted_at).map(rowToHabitMeta),
      habitDeletes: habits.filter((r) => r.deleted_at).map((r) => r.id as string),
      logUpserts: logs.filter((r) => !r.deleted_at).map((r) => ({ habitId: r.habit_id, date: r.date, count: r.count })),
      logDeletes: logs.filter((r) => r.deleted_at).map((r) => ({ habitId: r.habit_id, date: r.date })),
      challengeUpserts: challenges.filter((r) => !r.deleted_at).map(rowToChallenge),
      challengeDeletes: challenges.filter((r) => r.deleted_at).map((r) => r.id as string),
      settings: settingsRow ? rowToSettings(settingsRow) : null,
      onboarded: profileRow ? !!profileRow.onboarded : null,
      maxUpdatedAt,
      remoteEmpty,
    };
  } catch {
    return null;
  }
}
