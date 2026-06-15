/**
 * AI coaching client — thin wrapper over the `ai-coach` Edge Function plus a
 * local AsyncStorage cache so the last nudge / reflection shows instantly and
 * survives offline / cold start.
 *
 * The cache is period-aware: each slot stores the `period_key` it belongs to, and
 * stale content (a prior day's nudge, last week's reflection) is dropped on read.
 * The Edge Function still owns freshness/cost (server-side period_key, caching,
 * rate-limit); this is a read-through display cache only — never wired into the
 * offline `pending` sync queue.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { todayKey } from './date';

export type ReflectionPeriod = 'week' | 'month';
type Slot = 'nudge' | 'reflection-week' | 'reflection-month';

type Entry = { text: string; periodKey: string };
type StoredCache = Partial<Record<Slot, Entry>>;
export type CoachCache = Partial<Record<Slot, string>>;

const cacheKey = (userId: string) => `@coach/v1/${userId}`;
const tz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** ISO week key 'YYYY-Www' for a local 'YYYY-MM-DD' (mirrors the Edge Function). */
function isoWeekKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
    );
  return `${date.getUTCFullYear()}-W${`${week}`.padStart(2, '0')}`;
}

/** Current period_key for a slot — must match what the Edge Function computes. */
function periodKeyFor(slot: Slot): string {
  const t = todayKey();
  if (slot === 'nudge') return t;
  if (slot === 'reflection-week') return isoWeekKey(t);
  return t.slice(0, 7); // month
}

async function readStored(userId: string): Promise<StoredCache> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    return raw ? (JSON.parse(raw) as StoredCache) : {};
  } catch {
    return {};
  }
}

async function writeCache(userId: string, slot: Slot, text: string): Promise<void> {
  try {
    const current = await readStored(userId);
    current[slot] = { text, periodKey: periodKeyFor(slot) };
    await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(current));
  } catch {
    // best-effort cache
  }
}

/** Cached coach content for the CURRENT period only (stale entries are dropped). */
export async function getCachedCoach(userId: string): Promise<CoachCache> {
  const stored = await readStored(userId);
  const out: CoachCache = {};
  (Object.keys(stored) as Slot[]).forEach((slot) => {
    const entry = stored[slot];
    if (entry && entry.periodKey === periodKeyFor(slot)) out[slot] = entry.text;
  });
  return out;
}

type CoachBody = { kind: 'nudge' } | { kind: 'reflection'; period: ReflectionPeriod };

async function callCoach(body: CoachBody): Promise<{ text: string | null }> {
  const { data, error } = await supabase.functions.invoke('ai-coach', {
    body: { ...body, timezone: tz() },
  });
  // Non-2xx (rate limit, auth, etc.) surfaces as `error` — treat as no result so
  // the caller falls back to cached content. Never throws.
  if (error) return { text: null };
  return { text: data?.text ?? null };
}

/** Fetch (or cache-hit) today's coaching nudge. Returns null on failure/pending. */
export async function fetchNudge(userId: string): Promise<string | null> {
  const { text } = await callCoach({ kind: 'nudge' });
  if (text) await writeCache(userId, 'nudge', text);
  return text;
}

/** Fetch (or cache-hit) the weekly/monthly reflection. Null on failure/pending. */
export async function fetchReflection(
  userId: string,
  period: ReflectionPeriod,
): Promise<string | null> {
  const { text } = await callCoach({ kind: 'reflection', period });
  if (text) await writeCache(userId, period === 'week' ? 'reflection-week' : 'reflection-month', text);
  return text;
}
