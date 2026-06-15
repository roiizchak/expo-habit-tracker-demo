/** Shared data model. */

export type HabitType = 'binary' | 'volume';

export type Reminder = { hour: number; minute: number; label?: string };

export type Habit = {
  id: string;
  name: string;
  emoji: string;
  color: string; // accent from the curated ramp
  type: HabitType;
  target: number; // 1 for binary, >=2 for volume
  createdAt: string; // YYYY-MM-DD
  log: Record<string, number>; // dateKey -> count done that day
  reminders: Reminder[];
  notifIds: string[]; // scheduled local-notification ids (to cancel/reschedule)
};

export type ChallengeStatus = 'active' | 'completed' | 'failed';

export type Challenge = {
  id: string;
  habitId: string;
  lengthDays: number; // 3, then 7, ...
  startDate: string; // dateKey (inclusive)
  status: ChallengeStatus;
};

export type Settings = {
  sound: boolean;
  haptics: boolean;
  defaultReminder: Reminder;
};

/**
 * One pending write to push to Supabase. Self-contained (carries its own payload)
 * so a delete can be flushed even after the entity is gone from local state, and
 * the queue survives an app kill. Deduped by `key` on enqueue — the latest op for
 * an entity wins. See lib/sync.ts for how each op maps to a DB row.
 *   key formats: habit `h:<id>`, challenge `c:<id>`, log `l:<habitId>:<date>`,
 *   settings `s`, profile `p`.
 */
export type SyncOp =
  | { key: string; entity: 'habit'; action: 'upsert'; habit: Habit }
  | { key: string; entity: 'habit'; action: 'delete'; id: string }
  | { key: string; entity: 'challenge'; action: 'upsert'; challenge: Challenge }
  | { key: string; entity: 'challenge'; action: 'delete'; id: string }
  | { key: string; entity: 'log'; action: 'upsert'; habitId: string; date: string; count: number }
  | { key: string; entity: 'log'; action: 'delete'; habitId: string; date: string }
  | { key: string; entity: 'settings'; action: 'upsert'; settings: Settings }
  | { key: string; entity: 'profile'; action: 'upsert'; onboarded: boolean };

export type Persisted = {
  schemaVersion: number;
  habits: Habit[];
  challenges: Challenge[];
  settings: Settings;
  onboarded: boolean;
  /** Offline-first sync queue: local writes not yet confirmed on the server. */
  pending: SyncOp[];
  /** ISO timestamp of the newest remote row merged in, for delta pulls. */
  lastSyncedAt: string | null;
};
