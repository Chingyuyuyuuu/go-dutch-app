// Phase 5 database tests: appearance settings and deleting an account. Run: npm run test:db
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';

import { as as asUser, createDb, TABLES } from './helpers.mjs';

const ME = '00000000-0000-0000-0000-0000000000e1';
const AMY = '00000000-0000-0000-0000-0000000000e2';
const MY_LIVING = '10000000-0000-0000-0000-0000000000e1';
const FLAT = '10000000-0000-0000-0000-0000000000e2';
const SOLO = '10000000-0000-0000-0000-0000000000e3';
const M = {
  me: '40000000-0000-0000-0000-0000000000e1',
  amy: '40000000-0000-0000-0000-0000000000e2',
  meSolo: '40000000-0000-0000-0000-0000000000e3',
};

let db;
const as = (uid, sql, params) => asUser(db, uid, sql, params);
const rows = async (sql, params) => (await db.query(sql, params)).rows;

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
    `insert into public.ledgers (id, name, currency, kind) values ($1, 'Living', 'AUD', 'personal')`,
    [MY_LIVING],
  );
  // Flat: created by me, shared with Amy. Solo: a shared ledger with nobody else on the app.
  await db.query(
    `insert into public.ledgers (id, name, currency, kind, owner_id) values
       ($1, 'Flat', 'AUD', 'shared', $3), ($2, 'Solo', 'AUD', 'shared', $3)`,
    [FLAT, SOLO, ME],
  );
  await db.query(
    `insert into public.ledger_members (id, ledger_id, user_id, display_name) values
       ($1, $4, '${ME}', 'Me'), ($2, $4, '${AMY}', 'Amy'), ($3, $5, '${ME}', 'Me')`,
    [M.me, M.amy, M.meSolo, FLAT, SOLO],
  );
  // I paid 90.00 for dinner, split with Amy.
  await as(
    ME,
    `insert into public.entries (ledger_id, type, is_split, amount_minor, category_code, date, payer_member_id, shares)
     values ($1, 'expense', true, 9000, 'dining', current_date, $2, $3::jsonb)`,
    [FLAT, M.me, JSON.stringify({ [M.me]: 4500, [M.amy]: 4500 })],
  );
  await as(
    ME,
    `insert into public.entries (ledger_id, type, amount_minor, category_code, date) values ($1, 'expense', 580, 'coffee', current_date)`,
    [MY_LIVING],
  );
});

describe('appearance', () => {
  it('saves the themes, transparency and photo path on my profile only', async () => {
    await as(
      ME,
      `update public.profiles set bg_theme = 'mint', accent_theme = 'sea', bubble_opacity = 'semi',
         home_photo_path = $2 where id = $1`,
      [ME, `${ME}/home-1.jpg`],
    );
    assert.deepEqual(
      await rows(
        `select bg_theme, accent_theme, bubble_opacity, home_photo_path from public.profiles where id = $1`,
        [ME],
      ),
      [
        {
          bg_theme: 'mint',
          accent_theme: 'sea',
          bubble_opacity: 'semi',
          home_photo_path: `${ME}/home-1.jpg`,
        },
      ],
    );
    assert.deepEqual(await rows(`select bg_theme from public.profiles where id = $1`, [AMY]), [
      { bg_theme: 'cream' },
    ]);
  });

  it('rejects unknown themes and photo paths outside a user folder', async () => {
    await assert.rejects(
      as(ME, `update public.profiles set bg_theme = 'neon' where id = $1`, [ME]),
      /check constraint/,
    );
    await assert.rejects(
      as(ME, `update public.profiles set home_photo_path = '../etc/passwd' where id = $1`, [ME]),
      /check constraint/,
    );
  });
});

describe('deleting an account', () => {
  it('removes my data but keeps my member in shared ledgers, so balances still add up', async () => {
    assert.equal((await as(ME, `select public.delete_my_account() as r`)).rows[0].r, 'deleted');

    assert.deepEqual(await rows(`select id from auth.users`), [{ id: AMY }]);
    assert.deepEqual(await rows(`select id from public.ledgers where id = $1`, [MY_LIVING]), []);
    // Flat now belongs to Amy; my member stays without an account, marked as left.
    assert.deepEqual(await rows(`select owner_id from public.ledgers where id = $1`, [FLAT]), [
      { owner_id: AMY },
    ]);
    const [member] = await rows(
      `select user_id, display_name, placeholder_id is not null as placeholder, left_at is not null as left
       from public.ledger_members where id = $1`,
      [M.me],
    );
    assert.deepEqual(member, { user_id: null, display_name: 'Me', placeholder: true, left: true });
    // Amy still sees the dinner and who paid it.
    const amySees = (await as(AMY, `select amount_minor::int as a, payer_member_id from public.entries`))
      .rows;
    assert.deepEqual(amySees, [{ a: 9000, payer_member_id: M.me }]);
    // A shared ledger with nobody else on the app is gone.
    assert.deepEqual(await rows(`select id from public.ledgers where id = $1`, [SOLO]), []);
  });

  it('needs a signed-in user, and still guards ledger owners otherwise', async () => {
    await assert.rejects(db.query(`select public.delete_my_account()`), /sign in first/);
    await assert.rejects(
      as(ME, `update public.ledgers set owner_id = $2 where id = $1`, [FLAT, AMY]),
      /cannot change/,
    );
  });
});
