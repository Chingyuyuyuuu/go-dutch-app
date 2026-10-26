import { createClient } from '@supabase/supabase-js';

import { PERSONAL_ENTRY_FIELDS, type Entry, type Ledger } from '@/lib/domain';

import { SupabaseRemote } from '../supabase/SupabaseRemote';

const UID = '00000000-0000-0000-0000-00000000000a';
const LEDGER = '10000000-0000-0000-0000-000000000001';
const TRIP = '10000000-0000-0000-0000-000000000002';

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
const ok = () => new Response(null, { status: 201 });

const entry: Entry = {
  ...PERSONAL_ENTRY_FIELDS,
  id: '20000000-0000-0000-0000-000000000001',
  ledgerId: LEDGER,
  type: 'expense',
  amountMinor: 4250,
  categoryCode: 'coffee',
  date: '2026-10-25',
  note: 'Flat white',
  createdBy: UID,
  lastEditedBy: UID,
  createdAt: Date.parse('2026-10-25T01:02:03.000Z'),
  updatedAt: 0,
};

describe('SupabaseRemote recurring and banks', () => {
  it('inserts a recurring payment without the counts the server keeps', async () => {
    const { remote, calls } = setup(ok);
    const result = await remote.push({
      kind: 'insertRecurring',
      recurring: {
        id: 'r1',
        ownerUid: UID,
        kind: 'instalment',
        name: 'Running shoes',
        amountMinor: 8900,
        ledgerId: LEDGER,
        categoryCode: 'shopping',
        frequency: 'fortnightly',
        startDate: '2026-10-25',
        remindDayBefore: true,
        instalments: 4,
        payerMemberId: null,
        source: null,
        paidCount: 3,
        createdAt: Date.parse('2026-10-25T00:00:00Z'),
      },
    });
    expect(result).toEqual({ status: 'ok' });
    expect(calls[0].url.pathname).toBe('/rest/v1/recurring');
    expect(calls[0].body).toEqual({
      id: 'r1',
      kind: 'instalment',
      created_at: '2026-10-25T00:00:00.000Z',
      name: 'Running shoes',
      amount_minor: 8900,
      ledger_id: LEDGER,
      category_code: 'shopping',
      frequency: 'fortnightly',
      start_date: '2026-10-25',
      remind_day_before: true,
      instalments: 4,
      payer_member_id: null,
      source: null,
    });
  });

  it('saves appearance settings on the profile', async () => {
    const { remote, calls } = setup(ok);
    await remote.push({
      kind: 'profile',
      patch: { bgTheme: 'sky', accentTheme: 'plum', bubbleOpacity: 'clear', homePhoto: null },
    });
    expect(calls[0].body).toEqual({
      id: UID,
      bg_theme: 'sky',
      accent_theme: 'plum',
      bubble_opacity: 'clear',
      home_photo_path: null,
    });
  });

  it('soft-deletes, and saves balance checks on the account', async () => {
    const { remote, calls } = setup(ok);
    await remote.push({ kind: 'deleteRecurring', recurringId: 'r1' });
    await remote.push({
      kind: 'updateBank',
      bankId: 'b1',
      patch: { checks: [{ date: '2026-10-25', balanceMinor: 184018, gapMinor: 8000, at: 1 }] },
    });
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].body).toEqual({ deleted_at: expect.any(String) });
    expect(calls[1].url.pathname).toBe('/rest/v1/bank_accounts');
    expect(calls[1].body).toEqual({
      checks: [{ date: '2026-10-25', balanceMinor: 184018, gapMinor: 8000, at: 1 }],
    });
  });

  it('asks the server to record due charges, passing the time zone', async () => {
    const calls: Call[] = [];
    const { remote } = setup((call) => {
      calls.push(call);
      return json(1);
    });
    await remote.runRecurring();
    expect(calls[0].url.pathname).toBe('/rest/v1/rpc/run_my_recurring');
    expect(calls[0].body).toEqual({ p_time_zone: null });
  });
});

describe('SupabaseRemote.push', () => {
  it('inserts an entry with snake_case columns and lets the server set who created it', async () => {
    const { remote, calls } = setup(ok);
    expect(await remote.push({ kind: 'insertEntry', entry })).toEqual({ status: 'ok' });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url.pathname).toBe('/rest/v1/entries');
    expect(calls[0].body).toEqual({
      id: entry.id,
      ledger_id: LEDGER,
      created_at: '2026-10-25T01:02:03.000Z',
      type: 'expense',
      amount_minor: 4250,
      category_code: 'coffee',
      date: '2026-10-25',
      note: 'Flat white',
      is_split: false,
      payer_member_id: null,
      shares: null,
      recorded_on_behalf: false,
      source_entry_id: null,
      source_ledger_id: null,
    });
  });

  it('sends who paid and the shares of a split', async () => {
    const { remote, calls } = setup(ok);
    const split: Entry = {
      ...entry,
      ledgerId: TRIP,
      isSplit: true,
      payerMemberId: 'm-amy',
      shares: { 'm-me': 2125, 'm-amy': 2125 },
    };
    await remote.push({ kind: 'insertEntry', entry: split });
    expect(calls[0].body).toMatchObject({
      is_split: true,
      payer_member_id: 'm-amy',
      shares: { 'm-me': 2125, 'm-amy': 2125 },
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

  it('upserts prefs (with how my share is handled) and the profile on their keys', async () => {
    const { remote, calls } = setup(ok);
    await remote.push({
      kind: 'ledgerPref',
      ledgerId: TRIP,
      pref: { starred: true, order: 2, shareHandling: 'each' },
    });
    await remote.push({ kind: 'profile', patch: { locale: 'zh-TW', displayName: 'Winnie' } });
    expect(calls[0].url.searchParams.get('on_conflict')).toBe('user_id,ledger_id');
    expect(calls[0].headers.get('prefer')).toContain('resolution=merge-duplicates');
    expect(calls[0].body).toEqual({
      user_id: UID,
      ledger_id: TRIP,
      starred: true,
      sort_order: 2,
      share_handling: 'each',
    });
    expect(calls[1].url.searchParams.get('on_conflict')).toBe('id');
    expect(calls[1].body).toEqual({ id: UID, locale: 'zh-TW', display_name: 'Winnie' });
  });

  it('creates shared ledgers, adds members and leaves through server functions', async () => {
    const { remote, calls } = setup(() => json('ok'));
    const ledger: Ledger = {
      id: TRIP,
      name: 'Japan Trip',
      currency: 'JPY',
      kind: 'shared',
      status: 'active',
      ownerUid: UID,
      members: [
        { id: 'm-me', uid: UID, placeholderId: null, name: 'Me', leftAt: null },
        { id: 'm-dad', uid: null, placeholderId: 'ph-dad', name: 'Dad', leftAt: null },
      ],
      memberUids: [UID],
      createdAt: Date.parse('2026-10-20T00:00:00Z'),
    };
    await remote.push({ kind: 'createSharedLedger', ledger });
    await remote.push({ kind: 'addMembers', ledgerId: TRIP, members: [ledger.members[1]] });
    await remote.push({ kind: 'leaveLedger', ledgerId: TRIP });
    expect(calls.map((c) => [c.method, c.url.pathname])).toEqual([
      ['POST', '/rest/v1/rpc/create_shared_ledger'],
      ['POST', '/rest/v1/rpc/add_ledger_members'],
      ['POST', '/rest/v1/rpc/leave_ledger'],
    ]);
    expect(calls[0].body).toEqual({
      p_ledger: { id: TRIP, name: 'Japan Trip', currency: 'JPY', createdAt: '2026-10-20T00:00:00.000Z' },
      p_members: [
        { id: 'm-me', uid: UID, placeholderId: null, name: 'Me' },
        { id: 'm-dad', uid: null, placeholderId: 'ph-dad', name: 'Dad' },
      ],
    });
    expect(calls[2].body).toEqual({ p_ledger_id: TRIP });
  });

  it('stars friends, adds placeholder friends and invites', async () => {
    const { remote, calls } = setup(ok);
    await remote.push({ kind: 'friendStar', uid: 'friend-1', starred: true });
    await remote.push({
      kind: 'addPlaceholder',
      placeholder: { id: 'ph-dad', name: 'Dad', mergedUid: null, createdAt: 0 },
    });
    await remote.push({
      kind: 'createInvite',
      invite: { code: 'abc123def456', placeholderId: 'ph-dad', createdAt: 0 },
    });
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].url.searchParams.get('friend_id')).toBe('eq.friend-1');
    expect(calls[0].url.searchParams.get('user_id')).toBe(`eq.${UID}`);
    expect(calls[0].body).toEqual({ starred: true });
    expect(calls[1].body).toEqual({ id: 'ph-dad', name: 'Dad', created_at: '1970-01-01T00:00:00.000Z' });
    expect(calls[2].body).toEqual({
      code: 'abc123def456',
      placeholder_id: 'ph-dad',
      created_at: '1970-01-01T00:00:00.000Z',
    });
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
    expect((await remote.push({ kind: 'insertEntry', entry })).status).toBe('rejected');
  });
});

describe('SupabaseRemote.acceptInvite', () => {
  it('maps the server answer', async () => {
    for (const answer of ['ok', 'self', 'used', 'invalid', 'signed-out']) {
      const { remote, calls } = setup(() => json(answer));
      const result = await remote.acceptInvite('ABC123def456');
      expect(calls[0].url.pathname).toBe('/rest/v1/rpc/accept_invite');
      expect(calls[0].body).toEqual({ p_code: 'ABC123def456' });
      expect(result).toBe(answer === 'signed-out' ? 'invalid' : answer);
    }
  });

  it('says offline when the server cannot be reached', async () => {
    const { remote } = setup(() => {
      throw new TypeError('Network request failed');
    });
    expect(await remote.acceptInvite('abc')).toBe('offline');
  });
});

describe('SupabaseRemote.pull', () => {
  const entryRow = (
    id: string,
    ledgerId: string,
    updatedAt: string,
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    ledger_id: ledgerId,
    type: 'expense',
    is_split: false,
    amount_minor: 4250,
    category_code: 'coffee',
    date: '2026-10-25',
    note: 'Flat white',
    payer_member_id: null,
    shares: null,
    recorded_on_behalf: false,
    source_entry_id: null,
    source_ledger_id: null,
    created_by: UID,
    last_edited_by: UID,
    created_at: '2026-10-25T01:02:03+00:00',
    updated_at: updatedAt,
    deleted_at: null,
    ...extra,
  });
  const rows = {
    profiles: {
      display_name: 'Winnie',
      locale: 'zh-TW',
      starred_currencies: ['AUD', 'JPY'],
      last_used_ledger: { AUD: LEDGER },
      bg_theme: 'mint',
      accent_theme: 'not-a-theme',
      bubble_opacity: 'semi',
      home_photo_path: `${UID}/home-1.jpg`,
    },
    ledgers: [
      {
        id: LEDGER,
        name: 'Living',
        currency: 'AUD',
        kind: 'personal',
        status: 'active',
        owner_id: UID,
        created_at: '2026-10-01T00:00:00+00:00',
        ledger_members: [
          { id: 'm-1', user_id: UID, placeholder_id: null, display_name: 'Winnie', left_at: null },
        ],
      },
      {
        id: TRIP,
        name: 'Japan Trip',
        currency: 'JPY',
        kind: 'shared',
        status: 'active',
        owner_id: 'someone',
        created_at: '2026-10-02T00:00:00+00:00',
        ledger_members: [
          { id: 'm-me', user_id: UID, placeholder_id: null, display_name: 'Winnie', left_at: null },
          {
            id: 'm-ben',
            user_id: 'ben',
            placeholder_id: null,
            display_name: 'Ben',
            left_at: '2026-10-20T00:00:00+00:00',
          },
        ],
      },
    ],
    ledger_prefs: [{ ledger_id: TRIP, starred: true, sort_order: 0, share_handling: 'each' }],
    friendships: [{ friend_id: 'ben', friend_name: 'Ben', starred: true }],
    placeholder_friends: [
      { id: 'ph-dad', name: 'Dad', merged_user_id: null, created_at: '2026-10-03T00:00:00+00:00' },
    ],
    invites: [{ code: 'abc123def456', placeholder_id: null, created_at: '2026-10-03T00:00:00+00:00' }],
    recurring: [
      {
        id: 'r-netflix',
        owner_id: UID,
        kind: 'regular',
        name: 'Netflix',
        amount_minor: 2299,
        ledger_id: LEDGER,
        category_code: 'subs',
        frequency: 'monthly',
        start_date: '2026-10-25',
        remind_day_before: false,
        instalments: null,
        payer_member_id: null,
        source: null,
        paid_count: 1,
        next_date: '2026-11-25',
        created_at: '2026-10-25T00:00:00+00:00',
      },
      // From a newer app version: skipped, not a crash.
      { id: 'r-odd', kind: 'quarterly-thing', category_code: 'subs', frequency: 'monthly' },
    ],
    bank_accounts: [
      {
        id: 'b-cba',
        name: 'CommBank',
        currency: 'AUD',
        linked_ledger_ids: [LEDGER],
        checks: [{ date: '2026-10-18', balanceMinor: 234018, gapMinor: 0, at: 5 }],
        created_at: '2026-10-01T00:00:00+00:00',
      },
    ],
  };
  const respond = (call: Call) => {
    const table = call.url.pathname.replace('/rest/v1/', '');
    if (table === 'entries') {
      // The trip is new to this device, so its entries come in a second query.
      if (call.url.searchParams.get('ledger_id')) {
        return json([
          entryRow('e-trip', TRIP, '2026-10-02T00:00:00+00:00', {
            is_split: true,
            payer_member_id: 'm-ben',
            shares: { 'm-me': 2125, 'm-ben': 2125 },
          }),
        ]);
      }
      return json([
        entryRow('e-1', LEDGER, '2026-10-26T09:00:00.123456+00:00'),
        entryRow('e-2', LEDGER, '2026-10-26T08:00:00+00:00', { deleted_at: '2026-10-26T08:00:00+00:00' }),
      ]);
    }
    return json(rows[table as keyof typeof rows]);
  };

  it('reads every table and maps rows to the app model', async () => {
    const { remote, calls } = setup(respond);
    const result = await remote.pull('2026-10-26T00:00:00Z', [LEDGER]);

    expect(result.profile).toEqual({
      displayName: 'Winnie',
      locale: 'zh-TW',
      starredCurrencies: ['AUD', 'JPY'],
      lastUsedLedger: { AUD: LEDGER },
      bankReminder: 'weekly',
      bgTheme: 'mint',
      accentTheme: 'marigold',
      bubbleOpacity: 'semi',
      homePhoto: `${UID}/home-1.jpg`,
    });
    expect(result.recurring).toEqual([
      {
        id: 'r-netflix',
        ownerUid: UID,
        kind: 'regular',
        name: 'Netflix',
        amountMinor: 2299,
        ledgerId: LEDGER,
        categoryCode: 'subs',
        frequency: 'monthly',
        startDate: '2026-10-25',
        remindDayBefore: false,
        instalments: null,
        payerMemberId: null,
        source: null,
        paidCount: 1,
        createdAt: Date.parse('2026-10-25T00:00:00Z'),
      },
    ]);
    expect(result.banks).toEqual([
      {
        id: 'b-cba',
        name: 'CommBank',
        currency: 'AUD',
        linkedLedgerIds: [LEDGER],
        checks: [{ date: '2026-10-18', balanceMinor: 234018, gapMinor: 0, at: 5 }],
        createdAt: Date.parse('2026-10-01T00:00:00Z'),
      },
    ]);
    const trip = result.ledgers.find((l) => l.id === TRIP);
    expect(trip?.members).toEqual([
      { id: 'm-me', uid: UID, placeholderId: null, name: 'Winnie', leftAt: null },
      {
        id: 'm-ben',
        uid: 'ben',
        placeholderId: null,
        name: 'Ben',
        leftAt: Date.parse('2026-10-20T00:00:00Z'),
      },
    ]);
    // Members who left keep their debts but no longer see the ledger.
    expect(trip?.memberUids).toEqual([UID]);
    expect(result.prefs).toEqual({ [TRIP]: { starred: true, order: 0, shareHandling: 'each' } });
    expect(result.friends).toEqual([{ uid: 'ben', name: 'Ben', starred: true }]);
    expect(result.placeholders).toEqual([
      { id: 'ph-dad', name: 'Dad', mergedUid: null, createdAt: Date.parse('2026-10-03T00:00:00Z') },
    ]);
    expect(result.invites).toEqual([
      { code: 'abc123def456', placeholderId: null, createdAt: Date.parse('2026-10-03T00:00:00Z') },
    ]);
    expect(result.entries.map((e) => [e.id, e.deleted])).toEqual([
      ['e-1', false],
      ['e-2', true],
      ['e-trip', false],
    ]);
    expect(result.entries[2]).toMatchObject({
      isSplit: true,
      payerMemberId: 'm-ben',
      shares: { 'm-me': 2125, 'm-ben': 2125 },
    });
    expect(result.cursor).toBe('2026-10-26T09:00:00.123456+00:00');

    const ledgerCall = calls.find((c) => c.url.pathname.endsWith('/ledgers'));
    expect(ledgerCall?.url.searchParams.get('select')).toContain(
      'ledger_members(id,user_id,placeholder_id,display_name,left_at)',
    );
    const entryCalls = calls.filter((c) => c.url.pathname.endsWith('/entries'));
    // Changes since the cursor (two-minute overlap) in known ledgers…
    expect(entryCalls[0].url.searchParams.get('updated_at')).toBe('gte.2026-10-25T23:58:00.000Z');
    expect(entryCalls[0].url.searchParams.get('order')).toBe('updated_at.asc,id.asc');
    // …and every live entry of the ledger that is new here.
    expect(entryCalls[1].url.searchParams.get('ledger_id')).toBe(`in.(${TRIP})`);
    expect(entryCalls[1].url.searchParams.get('deleted_at')).toBe('is.null');
  });

  it('downloads only live entries the first time, in one go', async () => {
    const { remote, calls } = setup(respond);
    await remote.pull(null, []);
    const entryCalls = calls.filter((c) => c.url.pathname.endsWith('/entries'));
    expect(entryCalls).toHaveLength(1);
    expect(entryCalls[0].url.searchParams.get('deleted_at')).toBe('is.null');
    expect(entryCalls[0].url.searchParams.get('updated_at')).toBeNull();
  });

  it('still syncs with a server that does not have the Phase 4 tables yet', async () => {
    const { remote } = setup((call) =>
      /recurring|bank_accounts/.test(call.url.pathname)
        ? json({ code: 'PGRST205', message: "Could not find the table 'public.recurring'" }, 404)
        : respond(call),
    );
    const result = await remote.pull(null, []);
    expect(result.recurring).toEqual([]);
    expect(result.banks).toEqual([]);
    expect(result.ledgers).toHaveLength(2);
  });

  it('fails the pull when a query fails, so the local copy is kept', async () => {
    const { remote } = setup(() => json({ message: 'JWT expired', code: 'PGRST301' }, 401));
    await expect(remote.pull(null, [])).rejects.toBeTruthy();
  });
});
