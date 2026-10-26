// Row level security and trigger tests for supabase/migrations, run in PGlite
// (real Postgres compiled to WebAssembly, no Docker needed). Run: npm run test:db
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { before, beforeEach, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

const ALICE = '00000000-0000-0000-0000-00000000000a';
const BOB = '00000000-0000-0000-0000-00000000000b';
const LIVING = '10000000-0000-0000-0000-000000000001';
const OLD = '10000000-0000-0000-0000-000000000002';
const ENTRY = '20000000-0000-0000-0000-000000000001';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migrationsDir = new URL('../migrations/', import.meta.url);
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(new URL(f, migrationsDir), 'utf8'));

let db;

/** Runs `sql` as a signed-in user (role authenticated, JWT sub = uid). */
async function as(uid, sql, params = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

const rejects = (promise) => assert.rejects(promise);

const entrySql = `insert into public.entries (id, ledger_id, type, amount_minor, category_code, date, note)
  values ($1, $2, 'expense', $3, 'coffee', $4, 'Flat white')`;

before(async () => {
  db = new PGlite();
  await db.exec(read('./supabase-stubs.sql'));
  for (const sql of migrations) await db.exec(sql);
});

beforeEach(async () => {
  await db.exec(`
    truncate public.entries, public.ledger_prefs, public.ledger_members, public.ledgers, public.profiles, auth.users cascade;
    insert into auth.users (id, email) values ('${ALICE}', 'alice@example.com'), ('${BOB}', 'bob@example.com');
  `);
  await as(
    ALICE,
    `insert into public.ledgers (id, name, currency, kind) values ('${LIVING}', 'Living', 'AUD', 'personal')`,
  );
  await as(
    ALICE,
    `insert into public.ledgers (id, name, currency, kind) values ('${OLD}', 'Old trip', 'JPY', 'personal')`,
  );
  await as(ALICE, entrySql, [ENTRY, LIVING, 4250, '2026-10-25']);
  await db.exec(`update public.ledgers set status = 'ended' where id = '${OLD}'`);
});

describe('profiles', () => {
  it('creates a profile for every new account', async () => {
    const { rows } = await db.query('select id, locale from public.profiles order by id');
    assert.deepEqual(rows, [
      { id: ALICE, locale: 'system' },
      { id: BOB, locale: 'system' },
    ]);
  });

  it('lets you read and change only your own profile', async () => {
    assert.equal((await as(ALICE, 'select id from public.profiles')).rows.length, 1);
    await as(ALICE, `update public.profiles set locale = 'zh-TW' where id = '${ALICE}'`);
    await as(BOB, `update public.profiles set locale = 'en-AU' where id = '${ALICE}'`);
    const { rows } = await db.query(`select locale from public.profiles where id = '${ALICE}'`);
    assert.equal(rows[0].locale, 'zh-TW');
  });

  it('rejects unknown locales', async () => {
    await rejects(as(ALICE, `update public.profiles set locale = 'fr' where id = '${ALICE}'`));
  });
});

describe('ledgers', () => {
  it('makes the creator a member', async () => {
    const { rows } = await db.query(
      `select user_id from public.ledger_members where ledger_id = '${LIVING}'`,
    );
    assert.deepEqual(rows, [{ user_id: ALICE }]);
  });

  it('shows ledgers to members only', async () => {
    assert.equal((await as(ALICE, 'select id from public.ledgers')).rows.length, 2);
    assert.equal((await as(BOB, 'select id from public.ledgers')).rows.length, 0);
  });

  it('only allows personal ledgers you own', async () => {
    await rejects(
      as(
        BOB,
        `insert into public.ledgers (name, currency, kind, owner_id) values ('X', 'AUD', 'personal', '${ALICE}')`,
      ),
    );
    await rejects(as(BOB, `insert into public.ledgers (name, currency, kind) values ('X', 'AUD', 'shared')`));
    await rejects(
      as(BOB, `insert into public.ledgers (name, currency, kind) values ('X', 'aud', 'personal')`),
    );
    await rejects(
      as(BOB, `insert into public.ledgers (name, currency, kind) values ('', 'AUD', 'personal')`),
    );
  });

  it('never lets the currency change', async () => {
    await as(ALICE, `update public.ledgers set name = 'Daily' where id = '${LIVING}'`);
    await rejects(as(ALICE, `update public.ledgers set currency = 'JPY' where id = '${LIVING}'`));
  });

  it('does not let you add members yourself', async () => {
    await rejects(
      as(ALICE, `insert into public.ledger_members (ledger_id, user_id) values ('${LIVING}', '${BOB}')`),
    );
  });
});

describe('ledger prefs', () => {
  it('stores your own star and order for ledgers you belong to', async () => {
    await as(
      ALICE,
      `insert into public.ledger_prefs (ledger_id, starred, sort_order) values ('${LIVING}', true, 0)`,
    );
    assert.equal((await as(BOB, 'select * from public.ledger_prefs')).rows.length, 0);
    await rejects(as(BOB, `insert into public.ledger_prefs (ledger_id, starred) values ('${LIVING}', true)`));
  });
});

describe('entries', () => {
  it('members add, edit and soft-delete entries', async () => {
    await as(ALICE, entrySql, ['20000000-0000-0000-0000-000000000002', LIVING, 500, '2026-10-24']);
    await as(ALICE, `update public.entries set amount_minor = 600 where id = '${ENTRY}'`);
    await as(ALICE, `update public.entries set deleted_at = now() where id = '${ENTRY}'`);
    const { rows } = await db.query(
      `select amount_minor, deleted_at is not null as deleted from public.entries where id = '${ENTRY}'`,
    );
    assert.deepEqual(rows, [{ amount_minor: 600, deleted: true }]);
  });

  it('hides entries from non-members and ignores their edits', async () => {
    assert.equal((await as(BOB, 'select * from public.entries')).rows.length, 0);
    await rejects(as(BOB, entrySql, ['20000000-0000-0000-0000-000000000003', LIVING, 100, '2026-10-24']));
    await as(BOB, `update public.entries set amount_minor = 1 where id = '${ENTRY}'`);
    const { rows } = await db.query(`select amount_minor from public.entries where id = '${ENTRY}'`);
    assert.equal(rows[0].amount_minor, 4250);
  });

  it('cannot hard-delete entries (soft delete only)', async () => {
    await as(ALICE, `delete from public.entries where id = '${ENTRY}'`);
    assert.equal((await db.query(`select 1 from public.entries where id = '${ENTRY}'`)).rows.length, 1);
  });

  it('requires integer minor units and valid fields', async () => {
    const id = '20000000-0000-0000-0000-000000000004';
    await rejects(as(ALICE, entrySql, [id, LIVING, 0, '2026-10-24']));
    await rejects(as(ALICE, entrySql, [id, LIVING, 42.5, '2026-10-24']));
    await rejects(as(ALICE, entrySql, [id, LIVING, 100, '2999-01-01']));
  });

  it('keeps who created an entry and records who edited it', async () => {
    await as(
      ALICE,
      `update public.entries set created_by = '${BOB}', last_edited_by = '${BOB}' where id = '${ENTRY}'`,
    );
    const { rows } = await db.query(
      `select created_by, last_edited_by from public.entries where id = '${ENTRY}'`,
    );
    assert.deepEqual(rows, [{ created_by: ALICE, last_edited_by: ALICE }]);
  });

  it('bumps updated_at to server time on every change', async () => {
    const before = (await db.query(`select updated_at from public.entries where id = '${ENTRY}'`)).rows[0]
      .updated_at;
    await new Promise((r) => setTimeout(r, 20));
    await as(
      ALICE,
      `update public.entries set note = 'Long black', updated_at = '2000-01-01' where id = '${ENTRY}'`,
    );
    const after = (await db.query(`select updated_at from public.entries where id = '${ENTRY}'`)).rows[0]
      .updated_at;
    assert.ok(after > before);
  });

  it('treats ended ledgers as read-only', async () => {
    await rejects(as(ALICE, entrySql, ['20000000-0000-0000-0000-000000000005', OLD, 100, '2026-10-24']));
  });
});
