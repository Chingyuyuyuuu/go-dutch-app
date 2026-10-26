// Phase 3 database tests: friends, invites, placeholder merging, shared ledgers,
// split validation, personal copies, leaving and history. Run: npm run test:db
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';

import { as as asUser, createDb, TABLES } from './helpers.mjs';

const ME = '00000000-0000-0000-0000-0000000000a1';
const AMY = '00000000-0000-0000-0000-0000000000a2';
const BEN = '00000000-0000-0000-0000-0000000000a3';
const STRANGER = '00000000-0000-0000-0000-0000000000a4';
const DAD_PH = '30000000-0000-0000-0000-000000000001';
const TRIP = '10000000-0000-0000-0000-0000000000f1';
const ME_LIVING_JPY = '10000000-0000-0000-0000-0000000000f2';
const AMY_YEN = '10000000-0000-0000-0000-0000000000f3';
const M = {
  me: '40000000-0000-0000-0000-000000000001',
  amy: '40000000-0000-0000-0000-000000000002',
  ben: '40000000-0000-0000-0000-000000000003',
  dad: '40000000-0000-0000-0000-000000000004',
};
const RAMEN = '20000000-0000-0000-0000-0000000000e1';

let db;
const as = (uid, sql, params) => asUser(db, uid, sql, params);
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

async function befriend(a, b) {
  const code = `inv${a.slice(-4)}${b.slice(-4)}`.replace(/[^a-z0-9]/g, '');
  await as(a, `insert into public.invites (code) values ($1)`, [code]);
  return (await as(b, `select public.accept_invite($1) as r`, [code])).rows[0].r;
}

const members = (list) => JSON.stringify(list);
const createTrip = (extra = []) =>
  as(ME, `select public.create_shared_ledger($1::jsonb, $2::jsonb) as r`, [
    JSON.stringify({ id: TRIP, name: 'Japan Trip', currency: 'JPY', createdAt: '2026-10-20T00:00:00Z' }),
    members([{ id: M.me, uid: ME, name: 'Me' }, { id: M.amy, uid: AMY, name: 'Amy' }, ...extra]),
  ]);

const splitSql = `insert into public.entries
  (id, ledger_id, type, is_split, amount_minor, category_code, date, note, payer_member_id, shares)
  values ($1, $2, 'expense', true, $3, 'dining', '2026-10-25', 'Ramen dinner', $4, $5::jsonb)`;

before(async () => {
  db = await createDb();
});

beforeEach(async () => {
  await db.exec(`
    truncate ${TABLES} cascade;
    insert into auth.users (id, email) values
      ('${ME}', 'me@example.com'), ('${AMY}', 'amy@example.com'),
      ('${BEN}', 'ben@example.com'), ('${STRANGER}', 'x@example.com');
  `);
});

describe('friends and invites', () => {
  it('names new accounts from their email', async () => {
    assert.equal(
      (await one(`select display_name from public.profiles where id = '${AMY}'`)).display_name,
      'amy',
    );
  });

  it('accepting an invite makes both people friends', async () => {
    assert.equal(await befriend(ME, AMY), 'ok');
    const mine = (await as(ME, 'select friend_id, friend_name from public.friendships')).rows;
    const hers = (await as(AMY, 'select friend_id, friend_name from public.friendships')).rows;
    assert.deepEqual(mine, [{ friend_id: AMY, friend_name: 'amy' }]);
    assert.deepEqual(hers, [{ friend_id: ME, friend_name: 'me' }]);
  });

  it('rejects unknown codes and your own invite', async () => {
    assert.equal((await as(AMY, `select public.accept_invite('nosuchcode') as r`)).rows[0].r, 'invalid');
    await as(ME, `insert into public.invites (code) values ('mycode123')`);
    assert.equal((await as(ME, `select public.accept_invite('mycode123') as r`)).rows[0].r, 'self');
  });

  it('lets you star friends but not rename them or invent friendships', async () => {
    await befriend(ME, AMY);
    await as(ME, `update public.friendships set starred = true where friend_id = '${AMY}'`);
    assert.equal((await one(`select starred from public.friendships where user_id = '${ME}'`)).starred, true);
    await assert.rejects(
      as(ME, `update public.friendships set friend_name = 'x' where friend_id = '${AMY}'`),
    );
    await assert.rejects(
      as(ME, `insert into public.friendships (user_id, friend_id) values ('${ME}', '${BEN}')`),
    );
  });

  it('keeps placeholder friends private', async () => {
    await as(ME, `insert into public.placeholder_friends (id, name) values ('${DAD_PH}', 'Dad')`);
    assert.equal((await as(AMY, 'select * from public.placeholder_friends')).rows.length, 0);
    await assert.rejects(
      as(AMY, `insert into public.invites (code, placeholder_id) values ('stealdad1', '${DAD_PH}')`),
    );
  });
});

describe('shared ledgers', () => {
  beforeEach(async () => {
    await befriend(ME, AMY);
  });

  it('creates the ledger with the member keys chosen on the device', async () => {
    assert.equal((await createTrip()).rows[0].r, 'ok');
    const rows = (
      await as(AMY, `select id, user_id, display_name from public.ledger_members order by display_name`)
    ).rows;
    assert.deepEqual(rows, [
      { id: M.amy, user_id: AMY, display_name: 'Amy' },
      { id: M.me, user_id: ME, display_name: 'Me' },
    ]);
    assert.equal((await createTrip()).rows[0].r, 'exists');
  });

  it('only lets you add friends or your own placeholders', async () => {
    await assert.rejects(createTrip([{ id: M.ben, uid: BEN, name: 'Ben' }]));
    await assert.rejects(createTrip([{ id: M.dad, placeholderId: DAD_PH, name: 'Dad' }]));
  });

  it('cannot be created by a direct insert', async () => {
    await assert.rejects(
      as(ME, `insert into public.ledgers (name, currency, kind) values ('X', 'JPY', 'shared')`),
    );
  });

  it('is visible to its members only', async () => {
    await createTrip();
    assert.equal((await as(AMY, 'select id from public.ledgers')).rows.length, 1);
    assert.equal((await as(STRANGER, 'select id from public.ledgers')).rows.length, 0);
  });

  it('accepts splits whose shares add up, from members', async () => {
    await createTrip();
    await as(AMY, splitSql, [RAMEN, TRIP, 4800, M.amy, JSON.stringify({ [M.me]: 2400, [M.amy]: 2400 })]);
    assert.equal((await as(ME, 'select count(*)::int as n from public.entries')).rows[0].n, 1);
  });

  it('rejects shares that do not add up, strangers in shares, or fractions', async () => {
    await createTrip();
    const bad = [
      JSON.stringify({ [M.me]: 2000, [M.amy]: 2400 }),
      JSON.stringify({ [M.me]: 2400, [M.ben]: 2400 }),
      JSON.stringify({ [M.me]: 2399.5, [M.amy]: 2400.5 }),
    ];
    for (const shares of bad) {
      await assert.rejects(as(AMY, splitSql, [RAMEN, TRIP, 4800, M.amy, shares]));
    }
  });

  it('records a repayment from one member to another', async () => {
    await createTrip();
    const sql = `insert into public.entries (ledger_id, type, is_split, amount_minor, category_code, date, payer_member_id, shares, recorded_on_behalf)
      values ($1, 'repayment', false, 2400, 'other', '2026-10-26', $2, $3::jsonb, $4)`;
    await as(ME, sql, [TRIP, M.amy, JSON.stringify({ [M.me]: 2400 }), true]);
    await assert.rejects(as(ME, sql, [TRIP, M.me, JSON.stringify({ [M.me]: 2400 }), false]));
  });

  it('keeps an edit history of shared entries', async () => {
    await createTrip();
    await as(AMY, splitSql, [RAMEN, TRIP, 4800, M.amy, JSON.stringify({ [M.me]: 2400, [M.amy]: 2400 })]);
    await as(ME, `update public.entries set note = 'Ramen + gyoza' where id = '${RAMEN}'`);
    const rows = (
      await as(AMY, 'select edited_by, previous ->> $1 as note from public.entry_history', ['note'])
    ).rows;
    assert.deepEqual(rows, [{ edited_by: ME, note: 'Ramen dinner' }]);
  });

  it('makes an ended ledger read-only', async () => {
    await createTrip();
    await as(ME, `update public.ledgers set status = 'ended' where id = '${TRIP}'`);
    await assert.rejects(
      as(AMY, splitSql, [RAMEN, TRIP, 4800, M.amy, JSON.stringify({ [M.me]: 2400, [M.amy]: 2400 })]),
    );
    await as(AMY, `update public.ledgers set status = 'active' where id = '${TRIP}'`);
    await as(AMY, splitSql, [RAMEN, TRIP, 4800, M.amy, JSON.stringify({ [M.me]: 2400, [M.amy]: 2400 })]);
  });
});

describe('placeholder friends joining', () => {
  it('merges the placeholder into the new account in every ledger', async () => {
    await befriend(ME, AMY);
    await as(ME, `insert into public.placeholder_friends (id, name) values ('${DAD_PH}', 'Dad')`);
    await createTrip([{ id: M.dad, placeholderId: DAD_PH, name: 'Dad' }]);
    await as(ME, `insert into public.invites (code, placeholder_id) values ('dadinvite1', '${DAD_PH}')`);

    assert.equal((await as(BEN, `select public.accept_invite('dadinvite1') as r`)).rows[0].r, 'ok');
    const member = await one(`select user_id from public.ledger_members where id = '${M.dad}'`);
    assert.equal(member.user_id, BEN);
    assert.equal((await as(BEN, 'select id from public.ledgers')).rows.length, 1);
    assert.equal((await one(`select merged_user_id from public.placeholder_friends`)).merged_user_id, BEN);
    // A placeholder invite works once.
    assert.equal((await as(STRANGER, `select public.accept_invite('dadinvite1') as r`)).rows[0].r, 'used');
  });
});

describe('personal copies ("add every entry to my personal ledger")', () => {
  beforeEach(async () => {
    await befriend(ME, AMY);
    await createTrip();
    await as(
      ME,
      `insert into public.ledgers (id, name, currency, kind) values ('${ME_LIVING_JPY}', 'Yen Wallet', 'JPY', 'personal')`,
    );
    await as(
      AMY,
      `insert into public.ledgers (id, name, currency, kind) values ('${AMY_YEN}', 'Amy Yen', 'JPY', 'personal')`,
    );
    await as(ME, `insert into public.ledger_prefs (ledger_id, share_handling) values ('${TRIP}', 'each')`);
  });

  const myCopies = () =>
    as(
      ME,
      `select amount_minor, note, deleted_at is not null as deleted from public.entries where ledger_id = '${ME_LIVING_JPY}'`,
    );

  it('adds my share to my personal ledger, not to members who chose otherwise', async () => {
    await as(AMY, splitSql, [RAMEN, TRIP, 4800, M.amy, JSON.stringify({ [M.me]: 1600, [M.amy]: 3200 })]);
    assert.deepEqual((await myCopies()).rows, [{ amount_minor: 1600, note: 'Ramen dinner', deleted: false }]);
    assert.equal(
      (await as(AMY, `select count(*)::int as n from public.entries where ledger_id = '${AMY_YEN}'`)).rows[0]
        .n,
      0,
    );
  });

  it('follows edits and deletions of the shared entry', async () => {
    await as(AMY, splitSql, [RAMEN, TRIP, 4800, M.amy, JSON.stringify({ [M.me]: 1600, [M.amy]: 3200 })]);
    await as(
      AMY,
      `update public.entries set amount_minor = 6000, shares = $1::jsonb, note = 'Ramen + beer' where id = '${RAMEN}'`,
      [JSON.stringify({ [M.me]: 3000, [M.amy]: 3000 })],
    );
    assert.deepEqual((await myCopies()).rows, [{ amount_minor: 3000, note: 'Ramen + beer', deleted: false }]);
    await as(AMY, `update public.entries set deleted_at = now() where id = '${RAMEN}'`);
    assert.equal((await myCopies()).rows[0].deleted, true);
  });

  it('removes the copy when I am taken out of the split', async () => {
    await as(AMY, splitSql, [RAMEN, TRIP, 4800, M.amy, JSON.stringify({ [M.me]: 1600, [M.amy]: 3200 })]);
    await as(AMY, `update public.entries set shares = $1::jsonb where id = '${RAMEN}'`, [
      JSON.stringify({ [M.amy]: 4800 }),
    ]);
    assert.equal((await myCopies()).rows[0].deleted, true);
  });
});

describe('leaving and deleting', () => {
  beforeEach(async () => {
    await befriend(ME, AMY);
    await createTrip();
    await as(AMY, splitSql, [RAMEN, TRIP, 4800, M.amy, JSON.stringify({ [M.me]: 2400, [M.amy]: 2400 })]);
  });

  it('leaving hides the ledger from me; my debt stays for the others', async () => {
    assert.equal((await as(ME, `select public.leave_ledger('${TRIP}') as r`)).rows[0].r, 'left');
    assert.equal((await as(ME, 'select id from public.ledgers')).rows.length, 0);
    assert.equal((await as(AMY, 'select id from public.entries')).rows.length, 1);
    const me = (
      await as(AMY, `select left_at is not null as left from public.ledger_members where id = '${M.me}'`)
    ).rows[0];
    assert.equal(me.left, true);
  });

  it('the last member to leave deletes the ledger', async () => {
    await as(ME, `select public.leave_ledger('${TRIP}')`);
    assert.equal((await as(AMY, `select public.leave_ledger('${TRIP}') as r`)).rows[0].r, 'deleted');
    assert.equal((await one('select count(*)::int as n from public.ledgers')).n, 0);
  });

  it('deletes a personal ledger for its owner only', async () => {
    await as(
      ME,
      `insert into public.ledgers (id, name, currency, kind) values ('${ME_LIVING_JPY}', 'Yen Wallet', 'JPY', 'personal')`,
    );
    await assert.rejects(as(AMY, `select public.leave_ledger('${ME_LIVING_JPY}')`));
    assert.equal((await as(ME, `select public.leave_ledger('${ME_LIVING_JPY}') as r`)).rows[0].r, 'deleted');
  });
});
