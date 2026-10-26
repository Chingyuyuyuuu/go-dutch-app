import type { Entry, Ledger, NewEntry } from '@/lib/domain';

import { LocalRepo } from '../local/LocalRepo';
import { LocalStore } from '../local/LocalStore';
import { memoryKv } from '../local/memoryKv';
import { enqueueOp, type Op, type QueuedOp } from '../local/ops';
import {
  mergePull,
  SyncEngine,
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
  memberUids: [UID],
  createdAt: 1,
  ...overrides,
});

const entry = (id: string, overrides: Partial<Entry> = {}): Entry => ({
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
  server: PullResult = { profile: null, ledgers: [], prefs: {}, entries: [], cursor: '2026-10-25T00:00:00Z' };
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

  async pull(): Promise<PullResult> {
    if (!this.online) throw new Error('offline');
    return this.server;
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
    profile: { locale: 'zh-TW' as const, starredCurrencies: ['AUD'], lastUsedLedger: {} },
    ledgers: [ledger('living'), ledger('new-here')],
    prefs: { living: { starred: true, order: 0 }, 'new-here': { starred: false, order: 9 } },
    entries: { living: [entry('e1'), entry('e2'), entry('mine')], 'new-here': [] },
  };
  const pulled = (entries: PulledEntry[]): PullResult => ({
    profile: { locale: 'en-AU', starredCurrencies: ['JPY'], lastUsedLedger: {} },
    ledgers: [ledger('living', { name: 'Renamed' }), ledger('other-device')],
    prefs: { living: { starred: false, order: 3 } },
    entries,
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

  it('keeps unchanged entry lists as the same object', () => {
    const next = mergePull(local, pulled([]), new Set());
    expect(next.entries.living).toBe(local.entries.living);
  });
});

describe('full pulls', () => {
  it('replace the local entries with the server list, keeping unsent ones', () => {
    const local = {
      profile: { locale: 'system' as const, starredCurrencies: [], lastUsedLedger: {} },
      ledgers: [ledger('living')],
      prefs: {},
      entries: { living: [entry('gone'), entry('unsent'), entry('kept')] },
    };
    const next = mergePull(
      local,
      {
        profile: null,
        ledgers: [ledger('living')],
        prefs: {},
        entries: [{ ...entry('kept'), deleted: false }],
        cursor: 'c',
      },
      new Set(['entry:unsent']),
      true,
    );
    expect(next.entries.living.map((e) => e.id).sort()).toEqual(['kept', 'unsent']);
  });
});
