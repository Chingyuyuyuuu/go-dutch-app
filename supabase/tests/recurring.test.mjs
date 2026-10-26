// Phase 4 database tests: recurring payments recorded by the server, and bank accounts.
// Dates are relative to the database's "today" (Sydney time by default). Run: npm run test:db
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';

import { as as asUser, createDb, TABLES } from './helpers.mjs';

const ME = '00000000-0000-0000-0000-0000000000b1';
const AMY = '00000000-0000-0000-0000-0000000000b2';
const CHLOE = '00000000-0000-0000-0000-0000000000b3';
const LIVING = '10000000-0000-0000-0000-0000000000c1';
const AMY_LIVING = '10000000-0000-0000-0000-0000000000c2';
const FLAT = '10000000-0000-0000-0000-0000000000c3';
const M = {
  me: '40000000-0000-0000-0000-0000000000d2',
  amy: '40000000-0000-0000-0000-0000000000d1',
  chloe: '40000000-0000-0000-0000-0000000000d3',
};
const NETFLIX = '50000000-0000-0000-0000-000000000001';
const SHOES = '50000000-0000-0000-0000-000000000002';
const RENT = '50000000-0000-0000-0000-000000000003';

let db;
let today; // the owner's local day, as 'YYYY-MM-DD'
const as = (uid, sql, params) => asUser(db, uid, sql, params);
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const day = async (offset) => (await one(`select ($1::date + $2::int)::text as d`, [today, offset])).d;

const insertRecurring = (uid, r) =>
  as(
    uid,
    `insert into public.recurring
      (id, kind, name, amount_minor, ledger_id, category_code, frequency, start_date, instalments, payer_member_id, paid_count)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      r.id,
      r.kind ?? 'regular',
      r.name ?? 'Netflix',
      r.amount ?? 2299,
      r.ledger ?? LIVING,
      r.category ?? 'subs',
      r.frequency ?? 'monthly',
      r.start,
      r.instalments ?? null,
      r.payer ?? null,
      r.paidCount ?? 0,
    ],
  );

const charges = (recurringId) =>
  rows(
    `select date::text, amount_minor::int as amount, recurring_seq as seq, note, created_by, is_split, shares
     from public.entries where recurring_id = $1 and deleted_at is null order by recurring_seq`,
    [recurringId],
  );

before(async () => {
  db = await createDb();
  today = (await one(`select ((now() at time zone 'Australia/Sydney')::date)::text as d`)).d;
});

beforeEach(async () => {
  await db.exec(`
    truncate ${TABLES} cascade;
    insert into auth.users (id, email) values
      ('${ME}', 'me@example.com'), ('${AMY}', 'amy@example.com'), ('${CHLOE}', 'chloe@example.com');
  `);
  await as(
    ME,
    `insert into public.ledgers (id, name, currency, kind) values ($1, 'Living', 'AUD', 'personal')`,
    [LIVING],
  );
  await as(
    AMY,
    `insert into public.ledgers (id, name, currency, kind) values ($1, 'Living', 'AUD', 'personal')`,
    [AMY_LIVING],
  );
  // A shared Flat ledger with three members (member keys out of order on purpose).
  await db.query(
    `insert into public.ledgers (id, name, currency, kind, owner_id) values ($1, 'Flat', 'AUD', 'shared', $2)`,
    [FLAT, ME],
  );
  await db.query(
    `insert into public.ledger_members (id, ledger_id, user_id, display_name) values
       ($1, $4, '${ME}', 'Me'), ($2, $4, '${AMY}', 'Amy'), ($3, $4, '${CHLOE}', 'Chloe')`,
    [M.me, M.amy, M.chloe, FLAT],
  );
});

describe('recurring payments', () => {
  it('works out the next charge; the device cannot set how many are paid', async () => {
    await insertRecurring(ME, { id: NETFLIX, start: await day(3), paidCount: 7 });
    let r = await one(`select paid_count, next_date::text from public.recurring where id = $1`, [NETFLIX]);
    assert.deepEqual(r, { paid_count: 0, next_date: await day(3) });

    await as(ME, `update public.recurring set paid_count = 5, name = 'Netflix Premium' where id = $1`, [
      NETFLIX,
    ]);
    r = await one(`select paid_count, name from public.recurring where id = $1`, [NETFLIX]);
    assert.deepEqual(r, { paid_count: 0, name: 'Netflix Premium' });
  });

  it('counts charges before the day it was added as paid, so they are never recorded', async () => {
    // Afterpay bought 15 days ago: payments 15 days ago and 1 day ago are past → "payment 2 of 4".
    await insertRecurring(ME, {
      id: SHOES,
      kind: 'instalment',
      name: 'Running shoes',
      amount: 8903,
      category: 'shopping',
      frequency: 'fortnightly',
      start: await day(-15),
      instalments: 4,
    });
    const r = await one(`select paid_count, next_date::text from public.recurring where id = $1`, [SHOES]);
    assert.deepEqual(r, { paid_count: 2, next_date: await day(13) });
    assert.equal(
      await one(`select public.record_due_recurring($1, $2::date) as n`, [ME, today]).then((x) => x.n),
      0,
    );
    assert.deepEqual(await charges(SHOES), []);
  });

  it('records each due charge once, tagged with the payment, and moves on', async () => {
    await insertRecurring(ME, { id: NETFLIX, start: today });
    assert.equal((await one(`select public.record_due_recurring($1, $2::date) as n`, [ME, today])).n, 1);
    assert.equal((await one(`select public.record_due_recurring($1, $2::date) as n`, [ME, today])).n, 0);
    assert.deepEqual(await charges(NETFLIX), [
      { date: today, amount: 2299, seq: 0, note: 'Netflix', created_by: ME, is_split: false, shares: null },
    ]);
    const r = await one(`select paid_count, next_date::text from public.recurring where id = $1`, [NETFLIX]);
    assert.equal(r.paid_count, 1);
    assert.equal(
      r.next_date,
      (await one(`select ($1::date + interval '1 month')::date::text as d`, [today])).d,
    );
  });

  it('catches up on missed charges and stops an instalment plan after the last payment', async () => {
    await insertRecurring(ME, {
      id: SHOES,
      kind: 'instalment',
      name: 'Running shoes',
      amount: 8903,
      category: 'shopping',
      frequency: 'fortnightly',
      start: today,
      instalments: 4,
    });
    // As if it had been added 60 days ago and nobody opened the app since.
    await db.exec(`select set_config('gd.recording', 'on', false)`);
    await db.query(`update public.recurring set start_date = $2::date where id = $1`, [
      SHOES,
      await day(-60),
    ]);
    await db.exec(`select set_config('gd.recording', '', false)`);
    await db.query(`select public.record_due_recurring($1, $2::date)`, [ME, today]);
    assert.deepEqual(
      (await charges(SHOES)).map((c) => [c.seq, c.amount]),
      [
        [0, 2228],
        [1, 2225],
        [2, 2225],
        [3, 2225],
      ],
    );
    const r = await one(`select paid_count, next_date from public.recurring where id = $1`, [SHOES]);
    assert.deepEqual(r, { paid_count: 4, next_date: null });
  });

  it('adds a recurring split to the shared ledger, split equally by member key', async () => {
    await insertRecurring(ME, {
      id: RENT,
      kind: 'split',
      name: 'Rent',
      amount: 63001,
      ledger: FLAT,
      category: 'rent',
      frequency: 'weekly',
      start: today,
      payer: M.me,
    });
    await as(AMY, `insert into public.ledger_prefs (ledger_id, share_handling) values ($1, 'each')`, [FLAT]);
    await db.query(`select public.run_all_recurring()`);
    const [charge] = await charges(RENT);
    assert.equal(charge.is_split, true);
    assert.equal(charge.created_by, ME);
    // Sorted member keys: amy (…d1), me (…d2), chloe (…d3); amy gets the extra cent.
    assert.deepEqual(charge.shares, { [M.amy]: 21001, [M.me]: 21000, [M.chloe]: 21000 });
    // Amy adds every entry to her personal ledger: her share is there, created by me.
    const copy = await one(
      `select amount_minor::int as a, created_by from public.entries where ledger_id = $1`,
      [AMY_LIVING],
    );
    assert.deepEqual(copy, { a: 21001, created_by: ME });
  });

  it('only lets a split go in a shared ledger you belong to, with a member paying', async () => {
    await assert.rejects(
      insertRecurring(ME, {
        id: RENT,
        kind: 'split',
        ledger: FLAT,
        start: today,
        payer: '40000000-0000-0000-0000-0000000000ff',
      }),
      /payer is not a member/,
    );
    await assert.rejects(
      insertRecurring(ME, { id: NETFLIX, ledger: FLAT, start: today }),
      /your own personal ledger/,
    );
    await assert.rejects(
      insertRecurring(ME, { id: NETFLIX, ledger: AMY_LIVING, start: today }),
      /your own personal ledger/,
    );
  });

  it('skips charges in ended ledgers and splits whose owner left', async () => {
    await insertRecurring(ME, { id: NETFLIX, start: today });
    await insertRecurring(ME, {
      id: RENT,
      kind: 'split',
      ledger: FLAT,
      start: today,
      payer: M.amy,
      frequency: 'weekly',
    });
    await db.query(`update public.ledgers set status = 'ended' where id = $1`, [LIVING]);
    await db.query(`update public.ledger_members set left_at = now() where id = $1`, [M.me]);
    await db.query(`select public.record_due_recurring($1, $2::date)`, [ME, today]);
    assert.deepEqual(await charges(NETFLIX), []);
    assert.deepEqual(await charges(RENT), []);
    assert.equal(
      (await one(`select paid_count from public.recurring where id = $1`, [NETFLIX])).paid_count,
      1,
    );
  });

  it('run_my_recurring records only my charges and saves my time zone', async () => {
    await insertRecurring(ME, { id: NETFLIX, start: today });
    await insertRecurring(AMY, { id: SHOES, ledger: AMY_LIVING, start: today });
    assert.equal((await as(ME, `select public.run_my_recurring('Australia/Melbourne') as n`)).rows[0].n, 1);
    assert.equal((await charges(NETFLIX)).length, 1);
    assert.equal((await charges(SHOES)).length, 0);
    assert.equal(
      (await one(`select time_zone from public.profiles where id = $1`, [ME])).time_zone,
      'Australia/Melbourne',
    );
    await as(ME, `select public.run_my_recurring('Not/AZone')`);
    assert.equal(
      (await one(`select time_zone from public.profiles where id = $1`, [ME])).time_zone,
      'Australia/Melbourne',
    );
  });

  it("uses each owner's own calendar day", async () => {
    await db.query(`update public.profiles set time_zone = 'Pacific/Kiritimati' where id = $1`, [ME]);
    await db.query(`update public.profiles set time_zone = 'Pacific/Pago_Pago' where id = $1`, [AMY]);
    const r = await one(
      `select public.local_today($1)::text as me, public.local_today($2)::text as amy,
              ((now() at time zone 'Pacific/Kiritimati')::date)::text as kiri`,
      [ME, AMY],
    );
    assert.equal(r.me, r.kiri);
    assert.notEqual(r.me, r.amy); // 25 hours apart
  });

  it('keeps recording to the server: devices cannot add or retag charges', async () => {
    await insertRecurring(ME, { id: NETFLIX, start: today });
    await assert.rejects(
      as(
        ME,
        `insert into public.entries (ledger_id, type, amount_minor, category_code, date, recurring_id, recurring_seq)
         values ($1, 'expense', 100, 'subs', $2, $3, 5)`,
        [LIVING, today, NETFLIX],
      ),
      /only the server records/,
    );
    await db.query(`select public.record_due_recurring($1, $2::date)`, [ME, today]);
    await as(ME, `update public.entries set amount_minor = 2499, recurring_seq = 9 where recurring_id = $1`, [
      NETFLIX,
    ]);
    assert.deepEqual(
      (await charges(NETFLIX)).map((c) => [c.amount, c.seq]),
      [[2499, 0]],
    );
  });

  it('shows my payments to me only, and recurring splits to the ledger members', async () => {
    await insertRecurring(ME, { id: NETFLIX, start: today });
    await insertRecurring(ME, {
      id: RENT,
      kind: 'split',
      ledger: FLAT,
      start: today,
      payer: M.me,
      frequency: 'weekly',
    });
    assert.deepEqual(
      (await as(AMY, `select id from public.recurring`)).rows.map((r) => r.id),
      [RENT],
    );
    const changed = await as(AMY, `update public.recurring set name = 'Hacked' where id = $1`, [RENT]);
    assert.equal(changed.affectedRows, 0);
    await assert.rejects(as(AMY, `delete from public.recurring where id = $1`, [RENT]), /permission denied/);
    await assert.rejects(
      as(ME, `select public.record_due_recurring($1, current_date)`, [ME]),
      /permission denied/,
    );
    await assert.rejects(as(ME, `select public.run_all_recurring()`), /permission denied/);
  });
});

describe('bank accounts', () => {
  it('belong to their owner only', async () => {
    const checks = JSON.stringify([{ date: today, balanceMinor: 234018, gapMinor: 0, at: 1 }]);
    await as(
      ME,
      `insert into public.bank_accounts (id, name, currency, linked_ledger_ids, checks) values
       ('60000000-0000-0000-0000-000000000001', 'CommBank', 'AUD', array[$1::uuid], $2::jsonb)`,
      [LIVING, checks],
    );
    assert.equal((await as(ME, `select name from public.bank_accounts`)).rows.length, 1);
    assert.equal((await as(AMY, `select name from public.bank_accounts`)).rows.length, 0);
    await assert.rejects(
      as(AMY, `insert into public.bank_accounts (name, currency, owner_id) values ('Mine', 'AUD', $1)`, [ME]),
      /row-level security/,
    );
    await assert.rejects(
      as(ME, `insert into public.bank_accounts (name, currency, checks) values ('Bad', 'AUD', '{}'::jsonb)`),
      /check constraint/,
    );
  });

  it('saves the bank reminder interval on the profile', async () => {
    await as(ME, `update public.profiles set bank_reminder = 'monthly' where id = $1`, [ME]);
    assert.equal(
      (await one(`select bank_reminder from public.profiles where id = $1`, [ME])).bank_reminder,
      'monthly',
    );
    await assert.rejects(
      as(ME, `update public.profiles set bank_reminder = 'daily' where id = $1`, [ME]),
      /check constraint/,
    );
  });
});
