import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { authStorage, keepSessionFresh } from './platform';

// From Supabase dashboard → Project Settings → API (see .env.example).
// The publishable key is meant to be public; access is enforced by row level security.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase is not configured');
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        storage: authStorage,
        autoRefreshToken: true,
        persistSession: true,
        // Web returns from Google / Apple sign-in with the session in the URL.
        detectSessionInUrl: Platform.OS === 'web',
      },
    });
    keepSessionFresh(client);
  }
  return client;
}
