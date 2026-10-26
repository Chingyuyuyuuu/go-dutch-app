import type { Provider, User } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { getSupabase } from '../supabase/client';
import { AuthError, toAuthError, type AuthService, type AuthUser } from './types';

function toUser(user: User): AuthUser {
  return { uid: user.id, email: user.email ?? null, provider: user.app_metadata.provider ?? 'email' };
}

async function call<T extends { error: unknown }>(action: () => Promise<T>): Promise<T> {
  let result: T;
  try {
    result = await action();
  } catch (e) {
    throw toAuthError(e);
  }
  if (result.error) throw toAuthError(result.error);
  return result;
}

/**
 * Google / Apple: web redirects to the provider and back (the providers and
 * redirect URLs are set up in the Supabase dashboard). Native sign-in with
 * Apple / Google needs extra setup and comes later.
 */
async function oauth(provider: Provider) {
  if (Platform.OS !== 'web') throw new AuthError('unavailable');
  await call(() =>
    getSupabase().auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } }),
  );
}

export const supabaseAuth: AuthService = {
  onChange: (cb) => {
    const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
      cb(session ? toUser(session.user) : null);
    });
    return () => data.subscription.unsubscribe();
  },
  signInWithEmail: async (email, password) => {
    await call(() => getSupabase().auth.signInWithPassword({ email, password }));
  },
  signUpWithEmail: async (email, password) => {
    const { data } = await call(() => getSupabase().auth.signUp({ email, password }));
    return { needsConfirmation: !data.session };
  },
  signInWithGoogle: () => oauth('google'),
  signInWithApple: () => oauth('apple'),
  signOut: async () => {
    const { error } = await getSupabase().auth.signOut();
    // Offline: at least forget the session on this device.
    if (error) await getSupabase().auth.signOut({ scope: 'local' });
  },
};
