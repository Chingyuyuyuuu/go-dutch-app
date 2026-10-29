// Phase 6 database tests: market mid rates for the suggested ledger rate. Run: npm run test:db
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';

import { as as asUser, createDb, TABLES } from './helpers.mjs';

const ME = '00000000-0000-0000-0000-0000000000e1';

let db;
const as = (uid, sql, params) => asUser(db, uid, sql, params);

before(async () => {
  db = await createDb();
});

beforeEach(async () => {
  await db.exec(`
    truncate ${TABLES} cascade;
    insert into auth.users (id, email) values ('${ME}', 'me@example.com');
    insert into public.fx_rates (date, base, rates, source) values
      ('2026-10-27', 'USD', '{"TWD": "32.0", "JPY": "150"}', 'test'),
      ('2026-10-28', 'USD', '{"TWD": "32.2", "JPY": "155.5", "AUD": "1.52", "BAD": "abc"}', 'test');
  `);
});

describe('mid_rate', () => {
  it('crosses two currencies through the base with the latest day, like crossRate in the app', async () => {
    const { rows } = await as(ME, `select * from public.mid_rate('JPY', 'TWD')`);
    assert.equal(rows.length, 1);
    // App: crossRate(...) = '0.207073955' (trailing zero dropped by normaliseRate).
    assert.equal(rows[0].mid, '0.2070739550');
    assert.equal(rows[0].as_of.toISOString().slice(0, 10), '2026-10-28');
  });

  it('handles the base currency on either side', async () => {
    assert.equal(
      (await as(ME, `select mid from public.mid_rate('USD', 'TWD')`)).rows[0].mid,
      '32.2000000000',
    );
    assert.equal((await as(ME, `select mid from public.mid_rate('TWD', 'USD')`)).rows[0].mid, '0.0310559006');
  });

  it('returns nothing for a missing or broken rate', async () => {
    assert.equal((await as(ME, `select * from public.mid_rate('XAU', 'TWD')`)).rows.length, 0);
    assert.equal((await as(ME, `select * from public.mid_rate('BAD', 'TWD')`)).rows.length, 0);
  });

  it('lets signed-in users read rates but not write them; anon gets nothing', async () => {
    assert.equal((await as(ME, `select count(*)::int as n from public.fx_rates`)).rows[0].n, 2);
    await assert.rejects(
      as(
        ME,
        `insert into public.fx_rates (date, base, rates, source) values ('2026-10-29', 'USD', '{}', 'me')`,
      ),
    );
    await db.exec('set role anon');
    try {
      await assert.rejects(db.query(`select * from public.fx_rates`));
      await assert.rejects(db.query(`select * from public.mid_rate('JPY', 'TWD')`));
    } finally {
      await db.exec('reset role');
    }
  });
});

describe('new profiles', () => {
  it('star TWD and JPY by default', async () => {
    await as(ME, `insert into public.profiles (id) values ('${ME}') on conflict (id) do nothing`);
    const { rows } = await db.query(`select starred_currencies from public.profiles where id = $1`, [ME]);
    assert.deepEqual(rows[0].starred_currencies, ['TWD', 'JPY']);
  });
});
