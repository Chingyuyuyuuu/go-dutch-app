import {
  DEFAULT_PROFILE,
  PERSONAL_ENTRY_FIELDS,
  type Entry,
  type Ledger,
  type NewEntry,
  type Recurring,
} from '@/lib/domain';

import { LocalRepo } from '../local/LocalRepo';
import { LocalStore } from '../local/LocalStore';
import { memoryKv } from '../local/memoryKv';
import { enqueueOp, type Op, type QueuedOp } from '../local/ops';
import {
  mergePull,
  SyncEngine,
  type AcceptInviteResult,
  type PulledEntry,
  type PullResult,
  type PushResult,
  type RemoteApi,
} from '../sync/SyncEngine';

const UID = 'me';
let seq = 0;
const newId = () => `id-${++seq}`;

const ledger = (id: string, overrides: Partial<Ledger> = {}): Ledger => ({
  id,
  name: id,
  currency: 'AUD',
  kind: 'personal',
  status: 'active',
  ownerUid: UID,
  members: [],
  memberUids: [UID],
  createdAt: 1,
  ...overrides,
});

const entry = (id: string, overrides: Partial<Entry> = {}): Entry => ({
  ...PERSONAL_ENTRY_FIELDS,
  id,
  ledgerId: 'living',
  type: 'expense',
  isSplit: false,
  amountMinor: 100,
  categoryCode: 'coffee',
  date: '2026-10-25',
  note: '',
  createdBy: UID,
  lastEditedBy: UID,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const recurring = (id: string, ledgerId = 'living'): Recurring => ({
  id,
  ownerUid: UID,
  kind: 'regular',
  name: id,
  amountMinor: 2299,
  ledgerId,
  categoryCode: 'subs',
  frequency: 'monthly',
  startDate: '2026-10-25',
  remindDayBefore: false,
  instalments: null,
  payerMemberId: null,
  source: null,
  paidCount: 0,
  createdAt: 1,
});

const coffee: NewEntry = {
  type: 'expense',
  amountMinor: 580,
  categoryCode: 'coffee',
  date: '2026-10-25',
  note: 'Flat white',
};

/** A pretend server that can go offline and refuse writes. */
class FakeRemote implements RemoteApi {
  online = true;
  rejectNext = false;
  pushed: Op[] = [];
  server: PullResult = {
    profile: null,
    ledgers: [],
    prefs: {},
    entries: [],
    friends: [],
    placeholders: [],
    invites: [],
    recurring: [],
    banks: [],
    cursor: '2026-10-25T00:00:00Z',
  };
  recurringRuns = 0;
  pulls: { cursor: string | null; known: string[] }[] = [];
  listeners = new Set<() => void>();

  async push(op: Op): Promise<PushResult> {
    if (!this.online) return { status: 'retry' };
    if (this.rejectNext) {
      this.rejectNext = false;
      return { status: 'rejected', error: new Error('not allowed') };
    }
    this.pushed.push(op);
    return { status: 'ok' };
  }

  async pull(cursor: string | null, known: string[]): Promise<PullResult> {
    if (!this.online) throw new Error('offline');
    this.pulls.push({ cursor, known });
    return this.server;
  }

  async acceptInvite(code: string): Promise<AcceptInviteResult> {
    if (!this.online) return 'offline';
    return code === 'good' ? 'ok' : 'invalid';
  }

  async runRecurring() {
    if (!this.online) throw new Error('offline');
    this.recurringRuns += 1;
  }

  subscribe(onChange: () => void) {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }
}

async function setup() {
  const kv = memoryKv();
  const store = LocalStore.create(kv, 'test');
  const remote = new FakeRemote();
  const errors: unknown[] = [];
  const engine = new SyncEngine(store, remote, { newId, onError: (e) => errors.push(e) });
  const repo = new LocalRepo('cloud', UID, store, newId, engine);
  return { kv, store, remote, engine, repo, errors };
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('enqueueOp', () => {
  const q = (op: Op, opId: string): QueuedOp => ({ ...op, opId });

  it('folds edits into an entry that has not been sent yet', () => {
    const outbox = [q({ kind: 'insertEntry', entry: entry('e1') }, 'a')];
    const next = enqueueOp(
      outbox,
      { kind: 'updateEntry', ledgerId: 'living', entryId: 'e1', patch: { amountMinor: 999 } },
      'b',
    );
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ kind: 'insertEntry', entry: { amountMinor: 999 } });
  });

  it('drops an entry that was created and deleted while offline', () => {
    const outbox = [q({ kind: 'insertEntry', entry: entry('e1') }, 'a')];
    expect(enqueueOp(outbox, { kind: 'deleteEntry', ledgerId: 'living', entryId: 'e1' }, 'b')).toEqual([]);
  });

  it('replaces earlier updates of a server entry with the delete', () => {
    const outbox = [q({ kind: 'updateEntry', ledgerId: 'living', entryId: 'e1', patch: { note: 'x' } }, 'a')];
    const next = enqueueOp(outbox, { kind: 'deleteEntry', ledgerId: 'living', entryId: 'e1' }, 'b');
    expect(next.map((o) => o.kind)).toEqual(['deleteEntry']);
  });

  it('folds recurring and bank changes into unsent inserts, and drops unsent deletes', () => {
    let outbox = [q({ kind: 'insertRecurring', recurring: recurring('r1') }, 'a')];
    outbox = enqueueOp(
      outbox,
      { kind: 'updateRecurring', recurringId: 'r1', patch: { amountMinor: 2499 } },
      'b',
    );
    expect(outbox).toEqual([
      q({ kind: 'insertRecurring', recurring: { ...recurring('r1'), amountMinor: 2499 } }, 'a'),
    ]);
    expect(enqueueOp(outbox, { kind: 'deleteRecurring', recurringId: 'r1' }, 'c')).toEqual([]);

    const bank = {
      id: 'b1',
      name: 'CommBank',
      currency: 'AUD',
      linkedLedgerIds: [],
      checks: [],
      createdAt: 1,
    };
    let banks = enqueueOp([], { kind: 'updateBank', bankId: 'b1', patch: { name: 'CBA' } }, 'd');
    banks = enqueueOp(banks, { kind: 'updateBank', bankId: 'b1', patch: { linkedLedgerIds: ['x'] } }, 'e');
    expect(banks).toEqual([
      q({ kind: 'updateBank', bankId: 'b1', patch: { name: 'CBA', linkedLedgerIds: ['x'] } }, 'd'),
    ]);
    const inserted = enqueueOp([], { kind: 'insertBank', bank }, 'f');
    expect(enqueueOp(inserted, { kind: 'deleteBank', bankId: 'b1' }, 'g')).toEqual([]);
  });

  it('keeps one profile change and one pref change per ledger', () => {
    let outbox: QueuedOp[] = [];
    outbox = enqueueOp(outbox, { kind: 'profile', patch: { locale: 'zh-TW' } }, 'a');
    outbox = enqueueOp(outbox, { kind: 'profile', patch: { starredCurrencies: ['JPY'] } }, 'b');
    outbox = enqueueOp(outbox, { kind: 'ledgerPref', ledgerId: 'l', pref: { starred: true, order: 1 } }, 'c');
    outbox = enqueueOp(
      outbox,
      { kind: 'ledgerPref', ledgerId: 'l', pref: { starred: false, order: 2 } },
      'd',
    );
    expect(outbox).toEqual([
      { kind: 'profile', patch: { locale: 'zh-TW', starredCurrencies: ['JPY'] }, opId: 'a' },
      { kind: 'ledgerPref', ledgerId: 'l', pref: { starred: false, order: 2 }, opId: 'c' },
    ]);
  });
});

describe('offline-first sync', () => {
  it('shows a new entry immediately and uploads it in order', async () => {
    const { repo, store, remote, engine } = await setup();
    const ledgerId = repo.createLedger({ name: 'Living', currency: 'AUD', kind: 'personal' });
    repo.addEntry(ledgerId, coffee);
    expect(store.state.entries[ledgerId]).toHaveLength(1);
    await engine.flush();
    expect(remote.pushed.map((o) => o.kind)).toEqual(['insertLedger', 'ledgerPref', 'insertEntry']);
    expect(store.outbox).toHaveLength(0);
  });

  it('keeps changes made offline and sends them when back online', async () => {
    const { repo, store, remote, engine } = await setup();
    remote.online = false;
    const ledgerId = repo.createLedger({ name: 'Living', currency: 'AUD', kind: 'personal' });
    const id = repo.addEntry(ledgerId, coffee);
    repo.updateEntry(ledgerId, id, { amountMinor: 650 });
    await engine.flush();
    expect(remote.pushed).toHaveLength(0);
    expect(store.outbox.map((o) => o.kind)).toEqual(['insertLedger', 'ledgerPref', 'insertEntry']);

    remote.online = true;
    await engine.syncNow();
    expect(store.outbox).toHaveLength(0);
    expect(remote.pushed[2]).toMatchObject({ kind: 'insertEntry', entry: { amountMinor: 650 } });
  });

  it('retries by itself after a failed upload', async () => {
    const { repo, remote, engine } = await setup();
    remote.online = false;
    repo.updateProfile({ locale: 'zh-TW' });
    await engine.flush();
    remote.online = true;
    await jest.advanceTimersByTimeAsync(1000);
    expect(remote.pushed).toEqual([
      { kind: 'profile', patch: { locale: 'zh-TW' }, opId: expect.any(String) },
    ]);
  });

  it('drops a refused change, reports it, and takes the server copy back', async () => {
    const { repo, store, remote, engine, errors } = await setup();
    remote.server = { ...remote.server, ledgers: [ledger('living')], prefs: {} };
    await engine.pull();
    remote.rejectNext = true;
    repo.addEntry('living', coffee);
    await engine.flush();
    await engine.pull();
    expect(errors).toHaveLength(1);
    expect(store.outbox).toHaveLength(0);
    expect(store.state.entries.living).toEqual([]);
  });

  it('uploads a new recurring payment and asks the server to record what is due', async () => {
    const { repo, remote, engine } = await setup();
    const ledgerId = repo.createLedger({ name: 'Living', currency: 'AUD', kind: 'personal' });
    const { id: _id, ownerUid: _o, paidCount: _p, createdAt: _c, ...input } = recurring('netflix', ledgerId);
    repo.addRecurring(input);
    await engine.syncNow();
    expect(remote.pushed.map((o) => o.kind)).toEqual(['insertLedger', 'ledgerPref', 'insertRecurring']);
    expect(remote.recurringRuns).toBeGreaterThan(0);
    // Offline: the run fails quietly and the pull still happens later.
    remote.online = false;
    await expect(engine.syncNow()).resolves.toBeUndefined();
  });

  it('records due charges on the device in the demo, once each', () => {
    const store = LocalStore.create(memoryKv(), 'demo');
    const repo = new LocalRepo('demo', UID, store, newId);
    const ledgerId = repo.createLedger({ name: 'Living', currency: 'AUD', kind: 'personal' });
    // Started two months ago with nothing recorded yet.
    store.update(
      {
        ...store.state,
        recurring: [{ ...recurring('gym', ledgerId), frequency: 'monthly', startDate: '2026-08-27' }],
      },
      { meta: true },
    );
    jest.setSystemTime(new Date(2026, 9, 27, 12));
    repo.catchUpRecurring();
    repo.catchUpRecurring();
    const recorded = store.state.entries[ledgerId].map((e) => [e.date, e.recurringSeq, e.note]);
    expect(recorded.sort()).toEqual([
      ['2026-08-27', 0, 'gym'],
      ['2026-09-27', 1, 'gym'],
      ['2026-10-27', 2, 'gym'],
    ]);
    expect(store.state.recurring[0].paidCount).toBe(3);
  });

  it('uploads a home photo before saving it on the profile, and keeps the old one if offline', async () => {
    const store = LocalStore.create(memoryKv(), 'photo');
    const uploads: string[] = [];
    const removed: string[] = [];
    let online = true;
    const media = {
      upload: async (uri: string) => {
        if (!online) throw new Error('offline');
        uploads.push(uri);
        return `${UID}/home-${uploads.length}.jpg`;
      },
      url: async (path: string) => `https://signed/${path}`,
      remove: async (path: string) => {
        removed.push(path);
      },
    };
    const repo = new LocalRepo('cloud', UID, store, newId, undefined, media);
    expect(await repo.setHomePhoto({ uri: 'file:///a.jpg', mimeType: 'image/jpeg' })).toBe('ok');
    expect(store.state.profile.homePhoto).toBe(`${UID}/home-1.jpg`);
    expect(await repo.homePhotoUrl(`${UID}/home-1.jpg`)).toBe(`https://signed/${UID}/home-1.jpg`);
    online = false;
    expect(await repo.setHomePhoto({ uri: 'file:///b.jpg', mimeType: 'image/jpeg' })).toBe('offline');
    expect(store.state.profile.homePhoto).toBe(`${UID}/home-1.jpg`);
    online = true;
    expect(await repo.setHomePhoto(null)).toBe('ok');
    expect(store.state.profile.homePhoto).toBeNull();
    expect(removed).toEqual([`${UID}/home-1.jpg`]);
  });

  it('keeps the demo photo on the device', async () => {
    const store = LocalStore.create(memoryKv(), 'demo-photo');
    const repo = new LocalRepo('demo', UID, store, newId);
    await repo.setHomePhoto({ uri: 'data:image/jpeg;base64,xyz', mimeType: 'image/jpeg' });
    expect(await repo.homePhotoUrl(store.state.profile.homePhoto ?? '')).toBe('data:image/jpeg;base64,xyz');
  });

  it('becomes ready after the first download, even when it fails', async () => {
    const { remote, engine } = await setup();
    const states: boolean[] = [];
    engine.subscribeReady((r) => states.push(r));
    remote.online = false;
    await engine.pull();
    expect(states).toEqual([false, true]);
  });

  it('saves the local copy and outbox on the device', async () => {
    const { repo, store, kv, remote } = await setup();
    remote.online = false;
    const ledgerId = repo.createLedger({ name: 'Living', currency: 'AUD', kind: 'personal' });
    repo.addEntry(ledgerId, coffee);
    await store.flush();
    const reopened = await LocalStore.open(kv, 'test');
    expect(reopened?.state.ledgers.map((l) => l.name)).toEqual(['Living']);
    expect(reopened?.state.entries[ledgerId]).toHaveLength(1);
    expect(reopened?.outbox).toHaveLength(3);
  });
});

describe('mergePull', () => {
  const local = {
    profile: { ...DEFAULT_PROFILE, locale: 'zh-TW' as const, starredCurrencies: ['AUD'] },
    ledgers: [ledger('living'), ledger('new-here')],
    prefs: { living: { starred: true, order: 0 }, 'new-here': { starred: false, order: 9 } },
    entries: { living: [entry('e1'), entry('e2'), entry('mine')], 'new-here': [] },
    friends: [],
    placeholders: [],
    invites: [],
    recurring: [],
    banks: [],
    seen: { living: 5 },
  };
  const pulled = (entries: PulledEntry[]): PullResult => ({
    profile: { ...DEFAULT_PROFILE, locale: 'en-AU', starredCurrencies: ['JPY'] },
    ledgers: [ledger('living', { name: 'Renamed' }), ledger('other-device')],
    prefs: { living: { starred: false, order: 3 } },
    entries,
    friends: [],
    placeholders: [],
    invites: [],
    recurring: [],
    banks: [],
    cursor: 'c',
  });

  it('applies server changes and deletions', () => {
    const next = mergePull(
      local,
      pulled([
        { ...entry('e1', { amountMinor: 777 }), deleted: false },
        { ...entry('e2'), deleted: true },
        { ...entry('x', { ledgerId: 'other-device' }), deleted: false },
      ]),
      new Set(),
    );
    expect(next.ledgers.map((l) => l.name)).toEqual(['Renamed', 'other-device']);
    expect(next.entries.living.map((e) => [e.id, e.amountMinor])).toEqual([
      ['mine', 100],
      ['e1', 777],
    ]);
    expect(next.entries['other-device'].map((e) => e.id)).toEqual(['x']);
    expect(next.profile.locale).toBe('en-AU');
  });

  it('never overwrites rows with unsent local changes', () => {
    const next = mergePull(
      local,
      pulled([{ ...entry('mine', { amountMinor: 1 }), deleted: true }]),
      new Set(['entry:mine', 'ledger:new-here', 'pref:living', 'profile']),
    );
    expect(next.entries.living.find((e) => e.id === 'mine')?.amountMinor).toBe(100);
    expect(next.ledgers.map((l) => l.id)).toContain('new-here');
    expect(next.prefs.living).toEqual({ starred: true, order: 0 });
    expect(next.profile.locale).toBe('zh-TW');
  });

  it('keeps a recurring payment deleted here deleted until the server hears about it', () => {
    const r = recurring('netflix');
    const withRows = { ...local, recurring: [recurring('kept')], banks: [] };
    const server = { ...pulled([]), recurring: [r, recurring('kept'), recurring('gone-ledger', 'nope')] };
    const next = mergePull(withRows, server, new Set(['recurring:netflix']));
    // Deleted locally (pending), and one whose ledger is not on this device: both left out.
    expect(next.recurring.map((x) => x.id)).toEqual(['kept']);
    expect(mergePull(withRows, server, new Set()).recurring.map((x) => x.id)).toEqual(['netflix', 'kept']);
  });

  it('keeps unchanged entry lists as the same object', () => {
    const next = mergePull(local, pulled([]), new Set());
    expect(next.entries.living).toBe(local.entries.living);
  });
});

describe('full pulls', () => {
  it('replace the local entries with the server list, keeping unsent ones', () => {
    const local = {
      profile: { ...DEFAULT_PROFILE, starredCurrencies: [] },
      ledgers: [ledger('living')],
      prefs: {},
      entries: { living: [entry('gone'), entry('unsent'), entry('kept')] },
      friends: [],
      placeholders: [],
      invites: [],
      recurring: [],
      banks: [],
      seen: {},
    };
    const next = mergePull(
      local,
      {
        profile: null,
        ledgers: [ledger('living')],
        prefs: {},
        entries: [{ ...entry('kept'), deleted: false }],
        friends: [],
        placeholders: [],
        invites: [],
        recurring: [],
        banks: [],
        cursor: 'c',
      },
      new Set(['entry:unsent']),
      true,
    );
    expect(next.entries.living.map((e) => e.id).sort()).toEqual(['kept', 'unsent']);
  });
});
