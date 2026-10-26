// iOS / Android: URL polyfill for supabase-js, session in AsyncStorage, and token
// refresh only while the app is in the foreground (as Supabase recommends).
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

export const authStorage = AsyncStorage;

export function keepSessionFresh(client: SupabaseClient) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void client.auth.startAutoRefresh();
    else void client.auth.stopAutoRefresh();
  });
}
