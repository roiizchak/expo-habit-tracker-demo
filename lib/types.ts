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

export type Persisted = {
  schemaVersion: number;
  habits: Habit[];
  challenges: Challenge[];
  settings: Settings;
  onboarded: boolean;
};
