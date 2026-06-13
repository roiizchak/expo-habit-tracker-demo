/**
 * Challenge lifecycle. Status is DERIVED, not trusted blindly — reconcile on
 * hydrate, on app foreground, and on local-date rollover so an "active"
 * challenge can never go permanently stale.
 */
import type { Challenge, Habit } from './types';
import { challengeWindow, challengeProgress, isDoneOn, todayKey, keyToDate } from './date';

/**
 * Recompute one challenge's status against the habit's log.
 * - completed: every window day is done (backfilled in-window days count).
 * - failed: a window day strictly before today is empty (can't be saved).
 * - active: still within the window with no missed past day.
 */
export function reconcileChallenge(challenge: Challenge, habit: Habit | undefined): Challenge {
  if (!habit) return { ...challenge, status: 'failed' }; // orphaned (habit deleted)
  if (challenge.status === 'completed') return challenge;

  const window = challengeWindow(challenge);
  const allDone = window.every((k) => isDoneOn(habit, k));
  if (allDone) return { ...challenge, status: 'completed' };

  const today = keyToDate(todayKey()).getTime();
  const missedPastDay = window.some(
    (k) => keyToDate(k).getTime() < today && !isDoneOn(habit, k)
  );
  return { ...challenge, status: missedPastDay ? 'failed' : 'active' };
}

export function reconcileAll(challenges: Challenge[], habits: Habit[]): Challenge[] {
  const byId = new Map(habits.map((h) => [h.id, h]));
  return challenges.map((c) => reconcileChallenge(c, byId.get(c.habitId)));
}

export function activeChallengeFor(challenges: Challenge[], habitId: string): Challenge | undefined {
  return challenges.find((c) => c.habitId === habitId && c.status === 'active');
}

export function firstActiveChallenge(challenges: Challenge[]): Challenge | undefined {
  return challenges.find((c) => c.status === 'active');
}

export { challengeWindow, challengeProgress };
