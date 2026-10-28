// Phase 6 database tests: exchange rates, converted amounts, category sets. Run: npm run test:db
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { before, beforeEach, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { as as asUser, createDb, TABLES } from './helpers.mjs';

const ME = '00000000-0000-0000-0000-0000000000f1';
const AMY = '00000000-0000-0000-0000-0000000000f2';
const TRIP = '10000000-0000-0000-0000-0000000000f1'; // shared, settles in TWD
const TAIWAN = '10000000-0000-0000-0000-0000000000f2'; // my personal TWD ledger
const TAIWAN_2 = '10000000-0000-0000-0000-0000000000f3'; // another personal TWD ledger, created later
const LIVING = '10000000-0000-0000-0000-0000000000f4'; // my personal AUD ledger
// Member keys in character order: a < b < c, so ties in shares_settle go a, b, c.
const M = {
  me: '40000000-0000-0000-0000-00000000000a',
  amy: '40000000-0000-0000-0000-00000000000b',
  dad: '40000000-0000-0000-0000-00000000000c',
};

let db;
const as = (uid, sql, params) => asUser(db, uid, sql, params);
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];

before(async () => {
  db = await createDb();
});

beforeEach(async () => {
  await db.exec(`
    truncate ${TABLES} cascade;
    insert into auth.users (id, email) values ('${ME}', 'me@example.com'), ('${AMY}', 'amy@example.com');
  `);
  await as(
    ME,
    `insert into public.ledgers (id, name, currency, kind, created_at) values
       ($1, 'Taiwan', 'TWD', 'personal', now() - interval '2 days'),
       ($2, 'Taiwan 2', 'TWD', 'personal', now() - interval '1 day'),
       ($3, 'Living', 'AUD', 'personal', now())`,
    [TAIWAN, TAIWAN_2, LIVING],
  );
  await db.query(
    `insert into public.ledgers (id, name, currency, kind, owner_id, rates) values
       ($1, 'Osaka', 'TWD', 'shared', $2, '{"JPY": "0.2102"}')`,
    [TRIP, ME],
  );
  await db.query(
    `insert into public.ledger_members (id, ledger_id, user_id, placeholder_id, display_name) values
       ($1, $4, '${ME}', null, 'Me'), ($2, $4, '${AMY}', null, 'Amy'), ($3, $4, null, gen_random_uuid(), 'Dad')`,
    [M.me, M.amy, M.dad, TRIP],
  );
});

const addSplit = (uid, fields) =>
  as(
    uid,
    `insert into public.entries (id, ledger_id, type, is_split, amount_minor, category_code, date, payer_member_id,
       shares, currency, fx_rate, fx_source, amount_settle_minor)
     values ($1, $2, 'expense', true, $3, 'drugstore', current_date, $4, $5::jsonb, $6, $7, $8, $9)
     returning amount_settle_minor, shares_settle, fx_source, fx_rate::text`,
    [
      fields.id ?? '20000000-0000-0000-0000-0000000000f1',
      TRIP,
      fields.amount,
      fields.payer ?? M.me,
      JSON.stringify(fields.shares),
      fields.currency ?? null,
      fields.rate ?? 1,
      fields.source ?? 'same',
      fields.settle ?? null,
    ],
  );

describe('helpers match src/lib/fx.ts', () => {
  it('converts in ISO minor units, half away from zero', async () => {
    assert.deepEqual(
      await one(`select public.convert_minor(10000, 'JPY', 'TWD', 0.2102) as a,
                        public.convert_minor(3333, 'JPY', 'TWD', 0.2102) as b,
                        public.convert_minor(2100, 'TWD', 'JPY', 4.757) as c,
                        public.convert_minor(1250, 'AUD', 'TWD', 21.03) as d,
                        public.convert_minor(999999999, 'JPY', 'TWD', 0.2102) as e`),
      { a: 210200, b: 70060, c: 100, d: 26288, e: 21019999979 },
    );
  });

  it('allocates with the largest remainder, ties by member key', async () => {
    assert.deepEqual(
      (await one(`select public.allocate_settle(210200, '{"a": 3334, "b": 3333, "c": 3333}') as s`)).s,
      { a: 70081, b: 70060, c: 70059 },
    );
    assert.deepEqual((await one(`select public.allocate_settle(200, '{"c": 1, "b": 1, "a": 1}') as s`)).s, {
      a: 67,
      b: 67,
      c: 66,
    });
    assert.deepEqual((await one(`select public.allocate_settle(500, '{"a": 0, "b": 0}') as s`)).s, {
      a: 0,
      b: 0,
    });
    assert.deepEqual((await one(`select public.allocate_settle(500, '{}') as s`)).s, {});
  });
});

describe('ledgers', () => {
  it('new ledgers use the Japan trip categories and can store rates', async () => {
    const created = await one(
      `select category_set, rates, entry_currency from public.ledgers where id = $1`,
      [TAIWAN],
    );
    assert.deepEqual(created, { category_set: 'japan_travel', rates: {}, entry_currency: null });
    await as(
      ME,
      `update public.ledgers set rates = '{"JPY": "0.2102", "KRW": "0.02375"}', entry_currency = 'JPY',
                    category_set = 'au_life' where id = $1`,
      [TAIWAN],
    );
    assert.deepEqual(
      await one(`select category_set, rates, entry_currency from public.ledgers where id = $1`, [TAIWAN]),
      {
        category_set: 'au_life',
        rates: { JPY: '0.2102', KRW: '0.02375' },
        entry_currency: 'JPY',
      },
    );
  });

  it('rejects rates that are not positive decimal strings', async () => {
    for (const bad of [
      '{"JPY": 0.21}',
      '{"JPY": "0"}',
      '{"JPY": "-1"}',
      '{"JPY": "abc"}',
      '{"jpy": "1"}',
      '[]',
      '{"JPY": "0.12345678901"}',
    ]) {
      await assert.rejects(
        as(ME, `update public.ledgers set rates = $2::jsonb where id = $1`, [TAIWAN, bad]),
        {
          code: '23514',
        },
      );
    }
  });

  it('creates shared ledgers with the Phase 6 settings', async () => {
    const id = '10000000-0000-0000-0000-0000000000f9';
    await as(ME, `select public.create_shared_ledger($1::jsonb, $2::jsonb)`, [
      JSON.stringify({ id, name: 'Kyoto', currency: 'TWD', entryCurrency: 'JPY', rates: { JPY: '0.21' } }),
      JSON.stringify([{ id: '40000000-0000-0000-0000-0000000000f9', uid: ME, name: 'Me' }]),
    ]);
    assert.deepEqual(
      await one(`select category_set, rates, entry_currency from public.ledgers where id = $1`, [id]),
      {
        category_set: 'japan_travel',
        rates: { JPY: '0.21' },
        entry_currency: 'JPY',
      },
    );
  });
});

describe('entries', () => {
  it('fills in "paid in the settlement currency" when an older app leaves the new fields out', async () => {
    const [row] = (
      await as(
        ME,
        `insert into public.entries (ledger_id, type, amount_minor, category_code, date)
         values ($1, 'expense', 58000, 'dining', current_date)
         returning currency, fx_rate::text, fx_source, amount_settle_minor, shares_settle`,
        [TAIWAN],
      )
    ).rows;
    assert.deepEqual(row, {
      currency: 'TWD',
      fx_rate: '1.0000000000',
      fx_source: 'same',
      amount_settle_minor: 58000,
      shares_settle: null,
    });
  });

  it('converts with the stored rate and ignores a converted amount sent by the device', async () => {
    const [row] = (
      await as(
        ME,
        `insert into public.entries (ledger_id, type, amount_minor, category_code, date, currency, fx_rate, fx_source,
           amount_settle_minor)
         values ($1, 'expense', 10000, 'drugstore', current_date, 'JPY', 0.2102, 'ledger', 1)
         returning amount_settle_minor`,
        [TAIWAN],
      )
    ).rows;
    assert.equal(row.amount_settle_minor, 210200);
  });

  it('splits the converted amount between the members', async () => {
    const {
      rows: [row],
    } = await addSplit(ME, {
      amount: 10000,
      currency: 'JPY',
      rate: 0.2102,
      source: 'ledger',
      shares: { [M.me]: 3334, [M.amy]: 3333, [M.dad]: 3333 },
    });
    assert.equal(row.amount_settle_minor, 210200);
    assert.deepEqual(row.shares_settle, { [M.me]: 70081, [M.amy]: 70060, [M.dad]: 70059 });
  });

  it('recalculates when an older app changes only the amount', async () => {
    await addSplit(ME, {
      amount: 10000,
      currency: 'JPY',
      rate: 0.2102,
      source: 'ledger',
      shares: { [M.me]: 5000, [M.amy]: 5000 },
    });
    await as(
      AMY,
      `update public.entries set amount_minor = 6000, shares = $1::jsonb where id = '20000000-0000-0000-0000-0000000000f1'`,
      [JSON.stringify({ [M.me]: 3000, [M.amy]: 3000 })],
    );
    assert.deepEqual(
      await one(
        `select currency, amount_settle_minor, shares_settle from public.entries where ledger_id = $1`,
        [TRIP],
      ),
      { currency: 'JPY', amount_settle_minor: 126120, shares_settle: { [M.me]: 63060, [M.amy]: 63060 } },
    );
  });

  it('needs a rate for another currency, and repayments stay in the settlement currency', async () => {
    await assert.rejects(
      addSplit(ME, { amount: 1000, currency: 'JPY', shares: { [M.me]: 500, [M.amy]: 500 } }),
      {
        message: /needs a rate/,
      },
    );
    await assert.rejects(
      as(
        ME,
        `insert into public.entries (ledger_id, type, is_split, amount_minor, category_code, date, payer_member_id,
           shares, currency, fx_rate, fx_source)
         values ($1, 'repayment', true, 1000, 'other', current_date, $2, $3::jsonb, 'JPY', 0.21, 'ledger')`,
        [TRIP, M.me, JSON.stringify({ [M.amy]: 1000 })],
      ),
      { message: /settlement currency/ },
    );
  });

  it('only personal copies made by the server may use the split source', async () => {
    await assert.rejects(
      addSplit(ME, {
        amount: 1000,
        currency: 'JPY',
        rate: 0.21,
        source: 'split',
        settle: 99999,
        shares: { [M.me]: 500, [M.amy]: 500 },
      }),
      { message: /split source/ },
    );
    await assert.rejects(
      as(
        ME,
        `insert into public.entries (ledger_id, type, amount_minor, category_code, date, currency, fx_rate, fx_source,
           amount_settle_minor)
         values ($1, 'expense', 1000, 'dining', current_date, 'JPY', 0.21, 'split', 99999)`,
        [TAIWAN],
      ),
      { message: /split source/ },
    );
  });
});

describe('personal copies', () => {
  beforeEach(async () => {
    await as(ME, `insert into public.ledger_prefs (ledger_id, share_handling) values ($1, 'each')`, [TRIP]);
  });

  const copies = () =>
    rows(
      `select ledger_id, currency, amount_minor, fx_rate::text, fx_source, amount_settle_minor
       from public.entries where source_entry_id is not null and deleted_at is null`,
    );

  it('keep the currency and rate, and take my shares_settle as the converted amount', async () => {
    await addSplit(AMY, {
      amount: 10000,
      payer: M.amy,
      currency: 'JPY',
      rate: 0.2102,
      source: 'ledger',
      shares: { [M.me]: 3333, [M.amy]: 3334, [M.dad]: 3333 },
    });
    // shares_settle: me 3333 -> 70060 (tie with dad, my key is lower), amy 3334 -> 70081, dad -> 70059
    assert.deepEqual(await copies(), [
      {
        ledger_id: TAIWAN,
        currency: 'JPY',
        amount_minor: 3333,
        fx_rate: '0.2102000000',
        fx_source: 'split',
        amount_settle_minor: 70060,
      },
    ]);
  });

  it('go to the personal ledger I picked, else the last one I used, never one in another currency', async () => {
    await as(ME, `update public.profiles set last_ledger_id = $2 where id = $1`, [ME, TAIWAN_2]);
    await addSplit(ME, { amount: 20000, shares: { [M.me]: 10000, [M.amy]: 10000 } });
    assert.equal((await copies())[0].ledger_id, TAIWAN_2);

    await as(ME, `update public.ledger_prefs set share_target_ledger_id = $2 where ledger_id = $1`, [
      TRIP,
      TAIWAN,
    ]);
    await addSplit(ME, {
      id: '20000000-0000-0000-0000-0000000000f2',
      amount: 30000,
      shares: { [M.me]: 15000, [M.amy]: 15000 },
    });
    const byAmount = Object.fromEntries((await copies()).map((c) => [c.amount_minor, c]));
    assert.equal(byAmount[15000].ledger_id, TAIWAN);
    assert.equal(byAmount[15000].fx_source, 'split'); // still a copy; rate 1 as the currencies match
    assert.equal(byAmount[15000].amount_settle_minor, 15000);

    // An AUD ledger is never used for a TWD shared ledger, even when picked.
    await as(ME, `update public.ledger_prefs set share_target_ledger_id = $2 where ledger_id = $1`, [
      TRIP,
      LIVING,
    ]);
    await as(ME, `update public.profiles set last_ledger_id = null where id = $1`, [ME]);
    await addSplit(ME, {
      id: '20000000-0000-0000-0000-0000000000f3',
      amount: 40000,
      shares: { [M.me]: 20000, [M.amy]: 20000 },
    });
    const third = (await copies()).find((c) => c.amount_minor === 20000);
    assert.equal(third.ledger_id, TAIWAN); // the oldest TWD ledger
  });
});

describe('upgrading an existing database', () => {
  it('fills existing entries and keeps old ledgers on the Australian categories', async () => {
    const dir = new URL('../migrations/', import.meta.url);
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const phase6 = files.indexOf('20261030000000_fx_categories.sql');
    assert.ok(phase6 > 0);
    const old = new PGlite();
    await old.exec(readFileSync(new URL('./supabase-stubs.sql', import.meta.url), 'utf8'));
    for (const f of files.slice(0, phase6)) await old.exec(readFileSync(new URL(f, dir), 'utf8'));

    await old.exec(`insert into auth.users (id, email) values ('${ME}', 'me@example.com')`);
    await old.query(
      `insert into public.ledgers (id, name, currency, kind, owner_id) values ($1, 'Living', 'AUD', 'personal', $2)`,
      [LIVING, ME],
    );
    await old.query(
      `insert into public.entries (ledger_id, type, amount_minor, category_code, date, created_by)
       values ($1, 'expense', 1250, 'coffee', current_date, $2)`,
      [LIVING, ME],
    );
    const before = (await old.query(`select updated_at from public.entries`)).rows[0].updated_at;

    for (const f of files.slice(phase6)) await old.exec(readFileSync(new URL(f, dir), 'utf8'));

    assert.deepEqual((await old.query(`select category_set from public.ledgers`)).rows, [
      { category_set: 'au_life' },
    ]);
    const [entry] = (
      await old.query(
        `select currency, fx_source, amount_settle_minor, shares_settle, updated_at from public.entries`,
      )
    ).rows;
    assert.deepEqual(
      { ...entry, updated_at: entry.updated_at.getTime() },
      {
        currency: 'AUD',
        fx_source: 'same',
        amount_settle_minor: 1250,
        shares_settle: null,
        updated_at: before.getTime(),
      },
    );
    await old.close();
  });
});
