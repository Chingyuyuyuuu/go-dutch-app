// Phase 6 database tests: rate change notices, share links, the share page and joining from it.
// Run: npm run test:db
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';

import { as as asUser, createDb, TABLES } from './helpers.mjs';

const ME = '00000000-0000-0000-0000-0000000000d1'; // creates the trip
const AMY = '00000000-0000-0000-0000-0000000000d2';
const DAD = '00000000-0000-0000-0000-0000000000d3'; // signs up later, is the placeholder "Dad"
const NEW = '00000000-0000-0000-0000-0000000000d4'; // a stranger who got the link
const TRIP = '10000000-0000-0000-0000-0000000000d1';
const LIVING = '10000000-0000-0000-0000-0000000000d2';
const DAD_PH = '30000000-0000-0000-0000-0000000000d1';
const M = {
  me: '40000000-0000-0000-0000-0000000000d1',
  amy: '40000000-0000-0000-0000-0000000000d2',
  dad: '40000000-0000-0000-0000-0000000000d3',
};

let db;
const as = (uid, sql, params) => asUser(db, uid, sql, params);
const val = async (uid, sql, params) => Object.values((await as(uid, sql, params)).rows[0])[0];
const asAnon = async (sql, params = []) => {
  await db.exec('set role anon');
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
};
const sharePage = async (token) =>
  (await asAnon(`select public.get_shared_ledger($1) as v`, [token])).rows[0].v;

before(async () => {
  db = await createDb();
});

beforeEach(async () => {
  await db.exec(`
    truncate ${TABLES} cascade;
    insert into auth.users (id, email) values
      ('${ME}', 'me@example.com'), ('${AMY}', 'amy@example.com'),
      ('${DAD}', 'dad@example.com'), ('${NEW}', 'kai@example.com');
  `);
  // Amy is my friend; Dad is my placeholder friend.
  await as(ME, `insert into public.invites (code) values ('invmeamy1')`);
  await as(AMY, `select public.accept_invite('invmeamy1')`);
  await as(ME, `insert into public.placeholder_friends (id, name) values ($1, 'Dad')`, [DAD_PH]);
  await as(ME, `select public.create_shared_ledger($1::jsonb, $2::jsonb)`, [
    JSON.stringify({ id: TRIP, name: 'Osaka', currency: 'TWD', rates: { JPY: '0.2102' } }),
    JSON.stringify([
      { id: M.me, uid: ME, name: 'Me' },
      { id: M.amy, uid: AMY, name: 'Amy' },
      { id: M.dad, uid: null, placeholderId: DAD_PH, name: 'Dad' },
    ]),
  ]);
  await as(
    ME,
    `insert into public.ledgers (id, name, currency, kind) values ($1, 'Living', 'TWD', 'personal')`,
    [LIVING],
  );
  await as(
    AMY,
    `insert into public.entries (id, ledger_id, type, is_split, amount_minor, category_code, date, note,
       payer_member_id, shares, currency, fx_rate, fx_source)
     values (gen_random_uuid(), $1, 'expense', true, 10000, 'drugstore', '2026-10-27', 'Matsukiyo', $2, $3::jsonb,
       'JPY', 0.2102, 'ledger')`,
    [TRIP, M.amy, JSON.stringify({ [M.me]: 3334, [M.amy]: 3333, [M.dad]: 3333 })],
  );
});

describe('rate change notices', () => {
  it('records who changed which rate, ignoring what the app sends', async () => {
    await as(
      AMY,
      `update public.ledgers set rates = '{"JPY": "0.211", "KRW": "0.0235"}', rate_changes = '{"x": 1}' where id = $1`,
      [TRIP],
    );
    const changes = await val(ME, `select rate_changes from public.ledgers where id = $1`, [TRIP]);
    assert.deepEqual(Object.keys(changes).sort(), ['JPY', 'KRW']);
    assert.equal(changes.JPY.by, AMY);
    assert.equal(changes.JPY.rate, '0.211');
    assert.ok(Date.parse(changes.JPY.at) > 0);
  });

  it('keeps notices through other edits and forgets removed currencies', async () => {
    await as(AMY, `update public.ledgers set rates = '{"JPY": "0.211"}' where id = $1`, [TRIP]);
    await as(ME, `update public.ledgers set name = 'Osaka 2026' where id = $1`, [TRIP]);
    assert.equal(
      (await val(ME, `select rate_changes from public.ledgers where id = $1`, [TRIP])).JPY.by,
      AMY,
    );
    await as(ME, `update public.ledgers set rates = '{}' where id = $1`, [TRIP]);
    assert.deepEqual(await val(ME, `select rate_changes from public.ledgers where id = $1`, [TRIP]), {});
  });
});

describe('share links', () => {
  it('gives members one live link, the same each time, and a new one when regenerated', async () => {
    const token = await val(AMY, `select public.create_share_link($1)`, [TRIP]);
    assert.match(token, /^[a-f0-9]{32}$/);
    assert.equal(await val(ME, `select public.create_share_link($1)`, [TRIP]), token);
    const fresh = await val(ME, `select public.create_share_link($1, true)`, [TRIP]);
    assert.notEqual(fresh, token);
    assert.equal(await sharePage(token), null);
    assert.ok(await sharePage(fresh));
  });

  it('turns a link off at once; making one again gives a new token', async () => {
    const token = await val(ME, `select public.create_share_link($1)`, [TRIP]);
    await as(ME, `select public.revoke_share_link($1)`, [TRIP]);
    assert.equal(await sharePage(token), null);
    assert.notEqual(await val(ME, `select public.create_share_link($1)`, [TRIP]), token);
  });

  it('is only for members of shared ledgers', async () => {
    await assert.rejects(as(NEW, `select public.create_share_link($1)`, [TRIP]));
    await assert.rejects(as(NEW, `select public.revoke_share_link($1)`, [TRIP]));
    await assert.rejects(as(ME, `select public.create_share_link($1)`, [LIVING]));
    await assert.rejects(asAnon(`select public.create_share_link($1)`, [TRIP]));
  });

  it('lets members read the link row, nobody else', async () => {
    await as(ME, `select public.create_share_link($1)`, [TRIP]);
    assert.equal((await as(AMY, `select * from public.ledger_share_links`)).rows.length, 1);
    assert.equal((await as(NEW, `select * from public.ledger_share_links`)).rows.length, 0);
    await assert.rejects(asAnon(`select * from public.ledger_share_links`));
  });
});

describe('the share page (get_shared_ledger)', () => {
  it('shows the ledger, members and entries without account details, signed out', async () => {
    const page = await sharePage(await val(ME, `select public.create_share_link($1)`, [TRIP]));
    assert.equal(page.ledger.name, 'Osaka');
    assert.equal(page.ledger.currency, 'TWD');
    assert.equal(page.ledger.ownerMemberId, M.me);
    assert.deepEqual(
      page.members.map((m) => [m.name, m.hasAccount]),
      [
        ['Me', true],
        ['Amy', true],
        ['Dad', false],
      ],
    );
    assert.equal(page.entries.length, 1);
    assert.equal(page.entries[0].currency, 'JPY');
    assert.equal(page.entries[0].amountSettleMinor, 210200);
    const text = JSON.stringify(page);
    for (const secret of [ME, AMY, '@example.com', LIVING, DAD_PH]) assert.ok(!text.includes(secret), secret);
  });

  it('gives nothing for an unknown token, and anon still cannot read tables', async () => {
    assert.equal(await sharePage('nope'), null);
    await assert.rejects(asAnon(`select * from public.entries`));
    await assert.rejects(asAnon(`select * from public.ledger_members`));
  });
});

describe('joining from the share page', () => {
  let token;
  beforeEach(async () => {
    token = await val(ME, `select public.create_share_link($1)`, [TRIP]);
  });
  const pendingOf = async (uid) =>
    (
      await as(ME, `select * from public.ledger_join_requests where user_id = $1 and status = 'pending'`, [
        uid,
      ])
    ).rows[0];

  it('claims a member without an account once the creator approves, in this ledger only', async () => {
    assert.equal(await val(DAD, `select public.request_join($1, $2)`, [token, M.dad]), 'sent');
    assert.equal(await val(DAD, `select public.request_join($1, $2)`, [token, M.dad]), 'pending');
    assert.equal(await val(NEW, `select public.request_join($1, $2)`, [token, M.dad]), 'taken');
    assert.equal((await sharePage(token)).members.find((m) => m.id === M.dad).claimPending, true);
    // Members see the request; Dad cannot see the ledger yet.
    assert.equal((await as(AMY, `select * from public.ledger_join_requests`)).rows.length, 1);
    assert.equal((await as(DAD, `select * from public.entries`)).rows.length, 0);

    const req = await pendingOf(DAD);
    await assert.rejects(as(AMY, `select public.answer_join_request($1, true)`, [req.id]));
    assert.equal(await val(ME, `select public.answer_join_request($1, true)`, [req.id]), 'approved');
    assert.equal(await val(ME, `select public.answer_join_request($1, true)`, [req.id]), 'answered');

    const dad = (await db.query(`select * from public.ledger_members where id = $1`, [M.dad])).rows[0];
    assert.equal(dad.user_id, DAD);
    assert.equal(dad.claimed_via_share, true);
    assert.ok(dad.share_joined_at);
    assert.equal((await as(DAD, `select * from public.entries`)).rows.length, 1);
    // My placeholder friend is not merged elsewhere, and Dad and I are now friends.
    const placeholder = await db.query(
      `select merged_user_id from public.placeholder_friends where id = $1`,
      [DAD_PH],
    );
    assert.equal(placeholder.rows[0].merged_user_id, null);
    assert.equal((await as(DAD, `select friend_id from public.friendships`)).rows[0].friend_id, ME);
  });

  it('adds someone not on the list as a new member, or turns them down', async () => {
    assert.equal(await val(NEW, `select public.request_join($1, null)`, [token]), 'sent');
    const req = await pendingOf(NEW);
    assert.equal(req.requester_name, 'kai');
    assert.equal(await val(ME, `select public.answer_join_request($1, false)`, [req.id]), 'rejected');
    assert.equal((await as(NEW, `select * from public.ledgers`)).rows.length, 0);

    assert.equal(await val(NEW, `select public.request_join($1, null)`, [token]), 'sent');
    assert.equal(
      await val(ME, `select public.answer_join_request($1, true)`, [(await pendingOf(NEW)).id]),
      'approved',
    );
    const kai = (await db.query(`select * from public.ledger_members where user_id = $1`, [NEW])).rows[0];
    assert.equal(kai.display_name, 'kai');
    assert.equal(kai.claimed_via_share, true);
    assert.equal(await val(NEW, `select public.request_join($1, null)`, [token]), 'member');
  });

  it('refuses members with an account, bad tokens, signed-out callers and direct writes', async () => {
    assert.equal(await val(NEW, `select public.request_join($1, $2)`, [token, M.amy]), 'taken');
    assert.equal(await val(NEW, `select public.request_join('nope', null)`), 'invalid');
    assert.equal(await val(AMY, `select public.request_join($1, null)`, [token]), 'member');
    await assert.rejects(asAnon(`select public.request_join($1, null)`, [token]));
    await assert.rejects(
      as(NEW, `insert into public.ledger_join_requests (ledger_id, user_id) values ($1, $2)`, [TRIP, NEW]),
    );
  });

  it('lets any member answer once the creator has left', async () => {
    await as(NEW, `select public.request_join($1, null)`, [token]);
    const req = await pendingOf(NEW);
    await as(ME, `select public.leave_ledger($1)`, [TRIP]);
    assert.equal(await val(AMY, `select public.answer_join_request($1, true)`, [req.id]), 'approved');
  });
});
