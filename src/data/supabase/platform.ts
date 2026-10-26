// Web: supabase-js keeps the session in localStorage and refreshes it itself.
import type { SupabaseClient } from '@supabase/supabase-js';

export const authStorage = undefined;

export function keepSessionFresh(_client: SupabaseClient) {}
