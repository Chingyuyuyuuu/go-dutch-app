// Shared setup for the database tests: a PGlite (real Postgres) instance with
// Supabase stand-ins and every migration applied.
import { readdirSync, readFileSync } from 'node:fs';

import { PGlite } from '@electric-sql/pglite';

const migrationsDir = new URL('../migrations/', import.meta.url);

export async function createDb() {
  const db = new PGlite();
  await db.exec(readFileSync(new URL('./supabase-stubs.sql', import.meta.url), 'utf8'));
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) await db.exec(readFileSync(new URL(f, migrationsDir), 'utf8'));
  return db;
}

/** Runs `sql` as a signed-in user (role authenticated, JWT sub = uid). */
export async function as(db, uid, sql, params = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

export const TABLES =
  'public.ledger_join_requests, public.ledger_share_links, public.fx_rates, public.bank_accounts, public.recurring, public.entry_history, public.invites, public.placeholder_friends, public.friendships, public.entries, public.ledger_prefs, public.ledger_members, public.ledgers, public.profiles, auth.users';
