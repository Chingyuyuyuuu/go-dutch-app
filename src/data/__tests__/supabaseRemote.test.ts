import { createClient } from '@supabase/supabase-js';

import type { Entry } from '@/lib/domain';

import { SupabaseRemote } from '../supabase/SupabaseRemote';

const UID = '00000000-0000-0000-0000-00000000000a';

type Call = { method: string; url: URL; body: unknown; headers: Headers };

/**
 * supabase-js with a fake fetch: checks the real PostgREST requests that
 * SupabaseRemote builds, and how it reads responses and errors.
 */
function setup(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchFake = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const call: Call = {
      method: init?.method ?? 'GET',
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: new Headers(init?.headers),
    };
    calls.push(call);
    return respond(call);
  };
  const sb = createClient('https://demo.supabase.co', 'sb_publishable_test', {
    global: { fetch: fetchFake as typeof fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { remote: new SupabaseRemote(sb, UID), calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const entry: Entry = {
  id: '20000000-0000-0000-0000-000000000001',
  ledgerId: '10000000-0000-0000-0000-000000000001',
  type: 'expense',
  isSplit: false,
  amountMinor: 4250,
  categoryCode: 'coffee',
  date: '2026-10-25',
  note: 'Flat white',
  createdBy: UID,
  lastEditedBy: UID,
  createdAt: Date.parse('2026-10-25T01:02:03.000Z'),
  updatedAt: 0,
};

describe('SupabaseRemote.push', () => {
  it('inserts an entry with snake_case columns and lets the server set who created it', async () => {
    const { remote, calls } = setup(() => new Response(null, { status: 201 }));
    expect(await remote.push({ kind: 'insertEntry', entry })).toEqual({ status: 'ok' });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url.pathname).toBe('/rest/v1/entries');
    expect(calls[0].body).toEqual({
      id: entry.id,
      ledger_id: entry.ledgerId,
      created_at: '2026-10-25T01:02:03.000Z',
      is_split: false,
      type: 'expense',
      amount_minor: 4250,
      category_code: 'coffee',
      date: '2026-10-25',
      note: 'Flat white',
    });
  });

  it('updates and soft-deletes by id', async () => {
    const { remote, calls } = setup(() => new Response(null, { status: 204 }));
    await remote.push({
      kind: 'updateEntry',
      ledgerId: 'l',
      entryId: entry.id,
      patch: { amountMinor: 600, note: 'x' },
    });
    await remote.push({ kind: 'deleteEntry', ledgerId: 'l', entryId: entry.id });
    expect(calls.map((c) => [c.method, c.url.searchParams.get('id')])).toEqual([
      ['PATCH', `eq.${entry.id}`],
      ['PATCH', `eq.${entry.id}`],
    ]);
    expect(calls[0].body).toEqual({ amount_minor: 600, note: 'x' });
    expect(Object.keys(calls[1].body as object)).toEqual(['deleted_at']);
  });

  it('upserts prefs and the profile on their keys', async () => {
    const { remote, calls } = setup(() => new Response(null, { status: 201 }));
    await remote.push({ kind: 'ledgerPref', ledgerId: entry.ledgerId, pref: { starred: true, order: 2 } });
    await remote.push({
      kind: 'profile',
      patch: { locale: 'zh-TW', lastUsedLedger: { AUD: entry.ledgerId } },
    });
    expect(calls[0].url.searchParams.get('on_conflict')).toBe('user_id,ledger_id');
    expect(calls[0].headers.get('prefer')).toContain('resolution=merge-duplicates');
    expect(calls[0].body).toEqual({ user_id: UID, ledger_id: entry.ledgerId, starred: true, sort_order: 2 });
    expect(calls[1].url.searchParams.get('on_conflict')).toBe('id');
    expect(calls[1].body).toEqual({ id: UID, locale: 'zh-TW', last_used_ledger: { AUD: entry.ledgerId } });
  });

  it('retries when offline or the server is down', async () => {
    const offline = setup(() => {
      throw new TypeError('Network request failed');
    });
    expect(await offline.remote.push({ kind: 'insertEntry', entry })).toEqual({ status: 'retry' });
    const down = setup(() => json({ message: 'unavailable' }, 503));
    expect(await down.remote.push({ kind: 'insertEntry', entry })).toEqual({ status: 'retry' });
  });

  it('treats a duplicate insert as done (the first attempt got through)', async () => {
    const { remote } = setup(() => json({ code: '23505', message: 'duplicate key' }, 409));
    expect(await remote.push({ kind: 'insertEntry', entry })).toEqual({ status: 'ok' });
  });

  it('reports changes the server refuses', async () => {
    const { remote } = setup(() =>
      json({ code: '42501', message: 'new row violates row-level security policy' }, 403),
    );
    const result = await remote.push({ kind: 'insertEntry', entry });
    expect(result.status).toBe('rejected');
  });
});

describe('SupabaseRemote.pull', () => {
  const rows = {
    profiles: {
      locale: 'zh-TW',
      starred_currencies: ['AUD', 'JPY'],
      last_used_ledger: { AUD: entry.ledgerId },
    },
    ledgers: [
      {
        id: entry.ledgerId,
        name: 'Living',
        currency: 'AUD',
        kind: 'personal',
        status: 'active',
        owner_id: UID,
        created_at: '2026-10-01T00:00:00+00:00',
        ledger_members: [{ user_id: UID }],
      },
    ],
    ledger_prefs: [{ ledger_id: entry.ledgerId, starred: true, sort_order: 0 }],
    entries: [
      {
        id: entry.id,
        ledger_id: entry.ledgerId,
        type: 'expense',
        is_split: false,
        amount_minor: 4250,
        category_code: 'coffee',
        date: '2026-10-25',
        note: 'Flat white',
        created_by: UID,
        last_edited_by: UID,
        created_at: '2026-10-25T01:02:03+00:00',
        updated_at: '2026-10-26T09:00:00.123456+00:00',
        deleted_at: null,
      },
      {
        id: '20000000-0000-0000-0000-000000000002',
        ledger_id: entry.ledgerId,
        type: 'expense',
        is_split: false,
        amount_minor: 100,
        category_code: 'dining',
        date: '2026-10-24',
        note: '',
        created_by: UID,
        last_edited_by: UID,
        created_at: '2026-10-24T01:00:00+00:00',
        updated_at: '2026-10-26T08:00:00+00:00',
        deleted_at: '2026-10-26T08:00:00+00:00',
      },
    ],
  };
  const respond = (call: Call) => {
    const table = call.url.pathname.replace('/rest/v1/', '') as keyof typeof rows;
    // maybeSingle() asks for one object.
    return json(rows[table]);
  };

  it('reads every table and maps rows to the app model', async () => {
    const { remote, calls } = setup(respond);
    const result = await remote.pull('2026-10-26T00:00:00Z');

    expect(result.profile).toEqual({
      locale: 'zh-TW',
      starredCurrencies: ['AUD', 'JPY'],
      lastUsedLedger: { AUD: entry.ledgerId },
    });
    expect(result.ledgers).toEqual([
      {
        id: entry.ledgerId,
        name: 'Living',
        currency: 'AUD',
        kind: 'personal',
        status: 'active',
        ownerUid: UID,
        memberUids: [UID],
        createdAt: Date.parse('2026-10-01T00:00:00Z'),
      },
    ]);
    expect(result.prefs).toEqual({ [entry.ledgerId]: { starred: true, order: 0 } });
    expect(result.entries.map((e) => [e.id, e.amountMinor, e.deleted])).toEqual([
      [entry.id, 4250, false],
      ['20000000-0000-0000-0000-000000000002', 100, true],
    ]);
    expect(result.entries[0].createdAt).toBe(entry.createdAt);
    expect(result.cursor).toBe('2026-10-26T09:00:00.123456+00:00');

    const ledgerCall = calls.find((c) => c.url.pathname.endsWith('/ledgers'));
    expect(ledgerCall?.url.searchParams.get('select')).toContain('ledger_members(user_id)');
    const entriesCall = calls.find((c) => c.url.pathname.endsWith('/entries'));
    // Two-minute overlap before the cursor.
    expect(entriesCall?.url.searchParams.get('updated_at')).toBe('gte.2026-10-25T23:58:00.000Z');
    expect(entriesCall?.url.searchParams.get('order')).toBe('updated_at.asc,id.asc');
  });

  it('downloads only live entries the first time', async () => {
    const { remote, calls } = setup(respond);
    await remote.pull(null);
    const entriesCall = calls.find((c) => c.url.pathname.endsWith('/entries'));
    expect(entriesCall?.url.searchParams.get('deleted_at')).toBe('is.null');
    expect(entriesCall?.url.searchParams.get('updated_at')).toBeNull();
  });

  it('fails the pull when a query fails, so the local copy is kept', async () => {
    const { remote } = setup(() => json({ message: 'JWT expired', code: 'PGRST301' }, 401));
    await expect(remote.pull(null)).rejects.toBeTruthy();
  });
});
