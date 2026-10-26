import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import type { SyncTrigger } from './SyncEngine';

/** Sync when the device comes back online. */
export const onReconnect: SyncTrigger = (fire) => {
  let offline = false;
  return NetInfo.addEventListener((state) => {
    const connected = state.isConnected !== false;
    if (connected && offline) fire();
    offline = !connected;
  });
};

/** Sync when the app comes back to the foreground (or the browser tab becomes visible). */
export const onForeground: SyncTrigger = (fire) => {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') fire();
  });
  return () => sub.remove();
};
