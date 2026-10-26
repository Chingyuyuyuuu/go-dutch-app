/** The web preview has no notifications; phones use permission.native.ts. */
export const notificationsSupported = false;

export type NotificationStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function getNotificationStatus(): Promise<NotificationStatus> {
  return 'unsupported';
}

export async function ensureNotificationPermission(): Promise<boolean> {
  return false;
}
