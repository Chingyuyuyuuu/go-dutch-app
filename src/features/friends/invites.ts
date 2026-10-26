import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';

/**
 * Where the web app lives, for invite links. Web: the current site. Phones: the
 * EXPO_PUBLIC_WEB_URL setting (the EAS Hosting address); without it, invites
 * are shared as a code to type in.
 */
export function webBaseUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_WEB_URL;
  if (configured) return configured.replace(/\/+$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return null;
}

export function inviteLink(code: string): string | null {
  const base = webBaseUrl();
  return base ? `${base}/invite/${code}` : null;
}

/** Opens the share sheet; on a desktop browser without one, copies to the clipboard. Returns 'copied' then. */
export async function shareText(message: string, copyValue: string): Promise<'shared' | 'copied'> {
  const canShare = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && 'share' in navigator);
  if (canShare) {
    try {
      await Share.share({ message });
      return 'shared';
    } catch {
      // Fall back to copying.
    }
  }
  await Clipboard.setStringAsync(copyValue);
  return 'copied';
}

// An invite opened while signed out is remembered and accepted right after sign-in.
const PENDING_KEY = 'go-dutch/pending-invite';

export async function rememberInvite(code: string) {
  await AsyncStorage.setItem(PENDING_KEY, code);
}

export async function takePendingInvite(): Promise<string | null> {
  const code = await AsyncStorage.getItem(PENDING_KEY);
  if (code) await AsyncStorage.removeItem(PENDING_KEY);
  return code;
}
