import * as Notifications from 'expo-notifications';

import type { NotificationStatus } from './permission';

export type { NotificationStatus } from './permission';

/** Phones schedule local notifications (the web version has none). */
export const notificationsSupported = true;

export async function getNotificationStatus(): Promise<NotificationStatus> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'unsupported';
  }
}

/** Asks once (the first time it matters, e.g. after saving a recurring payment). True when allowed. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const status = await getNotificationStatus();
  if (status === 'granted') return true;
  if (status !== 'undetermined') return false;
  try {
    const result = await Notifications.requestPermissionsAsync();
    return result.status === 'granted';
  } catch {
    return false;
  }
}
