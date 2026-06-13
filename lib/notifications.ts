/**
 * Local scheduled reminders — the retention hook.
 * Expo Go (SDK 54): LOCAL scheduled notifications work; remote/push do not
 * (needs a dev build). Everything here is local-only.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Habit } from './types';

const CHANNEL_ID = 'habit-reminders';

// Present reminders even while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Habit reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
    lightColor: '#F5B53D',
  });
}

/** Ask for permission; returns true if granted. */
export async function requestPermission(): Promise<boolean> {
  await ensureAndroidChannel();
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  return status === 'granted';
}

function reminderBody(habit: Habit, label?: string): { title: string; body: string } {
  if (label === 'evening') {
    return { title: `Don't forget ${habit.emoji} ${habit.name}`, body: 'A few seconds now keeps the streak alive.' };
  }
  return { title: `Ready for ${habit.emoji} ${habit.name}?`, body: 'Tap to log it and keep your streak going.' };
}

/**
 * Cancel a habit's old reminders and schedule fresh DAILY ones.
 * Returns the new notification ids to store on the habit.
 */
export async function rescheduleHabit(habit: Habit): Promise<string[]> {
  await cancelIds(habit.notifIds);
  if (habit.reminders.length === 0) return [];

  await ensureAndroidChannel();
  const ids: string[] = [];
  for (const r of habit.reminders) {
    const { title, body } = reminderBody(habit, r.label);
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { habitId: habit.id } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: r.hour,
        minute: r.minute,
        channelId: CHANNEL_ID,
      },
    });
    ids.push(id);
  }
  return ids;
}

export async function cancelIds(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {}))
  );
}
