import type { LocalDate } from '@/lib/date';
import type { Entry, Ledger, LedgerPref, NewEntry, UserProfile } from '@/lib/domain';

import type { DataRepo, NewLedger, Unsubscribe } from '../repo';
import type { SyncEngine } from '../sync/SyncEngine';
import type { LocalStore } from './LocalStore';
import type { Op } from './ops';

/**
 * Screens read and write the device's local copy. In cloud mode every write is
 * also queued for Supabase through the SyncEngine; in demo mode it stays local.
 */
export class LocalRepo implements DataRepo {
  constructor(
    readonly kind: 'demo' | 'cloud',
    readonly uid: string,
    private store: LocalStore,
    private newId: () => string,
    private sync?: SyncEngine,
  ) {}

  private select<T>(pick: () => T, cb: (value: T) => void): Unsubscribe {
    let last: T | undefined;
    const run = () => {
      const value = pick();
      if (value !== last) {
        last = value;
        cb(value);
      }
    };
    run();
    return this.store.subscribe(run);
  }

  private queue(op: Op) {
    this.sync?.enqueue(op);
  }

  subscribeReady(cb: (ready: boolean) => void): Unsubscribe {
    if (!this.sync) {
      cb(true);
      return () => {};
    }
    return this.sync.subscribeReady(cb);
  }

  subscribeProfile(cb: (profile: UserProfile) => void) {
    return this.select(() => this.store.state.profile, cb);
  }

  subscribeLedgers(cb: (ledgers: Ledger[]) => void) {
    return this.select(() => this.store.state.ledgers, cb);
  }

  subscribeLedgerPrefs(cb: (prefs: Record<string, LedgerPref>) => void) {
    return this.select(() => this.store.state.prefs, cb);
  }

  subscribeEntries(ledgerId: string, since: LocalDate, cb: (entries: Entry[]) => void) {
    let source: Entry[] | undefined;
    let filtered: Entry[] = [];
    return this.select(() => {
      const all = this.store.state.entries[ledgerId] ?? [];
      if (all !== source) {
        source = all;
        filtered = all.filter((e) => e.date >= since);
      }
      return filtered;
    }, cb);
  }

  subscribePending(cb: (count: number) => void) {
    return this.select(() => this.store.outbox.length, cb);
  }

  updateProfile(patch: Partial<UserProfile>) {
    const { state } = this.store;
    this.store.update({ ...state, profile: { ...state.profile, ...patch } }, { meta: true });
    this.queue({ kind: 'profile', patch });
  }

  createLedger(input: NewLedger): string {
    const id = this.newId();
    const ledger: Ledger = {
      ...input,
      id,
      status: 'active',
      ownerUid: this.uid,
      memberUids: [this.uid],
      createdAt: Date.now(),
    };
    // New ledgers go after the ones the user already arranged.
    const pref: LedgerPref = { starred: false, order: Date.now() };
    const { state } = this.store;
    this.store.update(
      {
        ...state,
        ledgers: [...state.ledgers, ledger],
        prefs: { ...state.prefs, [id]: pref },
        entries: { ...state.entries, [id]: [] },
      },
      { meta: true, ledgers: [id] },
    );
    this.queue({ kind: 'insertLedger', ledger });
    this.queue({ kind: 'ledgerPref', ledgerId: id, pref });
    return id;
  }

  setLedgerPrefs(updates: Record<string, Partial<LedgerPref>>) {
    const { state } = this.store;
    const prefs = { ...state.prefs };
    for (const [id, patch] of Object.entries(updates)) {
      const previous: LedgerPref = prefs[id] ?? { starred: false, order: Date.now() };
      prefs[id] = { ...previous, ...patch };
    }
    this.store.update({ ...state, prefs }, { meta: true });
    for (const id of Object.keys(updates)) this.queue({ kind: 'ledgerPref', ledgerId: id, pref: prefs[id] });
  }

  addEntry(ledgerId: string, input: NewEntry): string {
    const id = this.newId();
    const now = Date.now();
    const entry: Entry = {
      ...input,
      id,
      ledgerId,
      isSplit: false,
      createdBy: this.uid,
      lastEditedBy: this.uid,
      createdAt: now,
      updatedAt: now,
    };
    this.setEntries(ledgerId, (list) => [entry, ...list]);
    this.queue({ kind: 'insertEntry', entry });
    return id;
  }

  updateEntry(ledgerId: string, entryId: string, patch: Partial<NewEntry>) {
    this.setEntries(ledgerId, (list) =>
      list.map((e) =>
        e.id === entryId ? { ...e, ...patch, lastEditedBy: this.uid, updatedAt: Date.now() } : e,
      ),
    );
    this.queue({ kind: 'updateEntry', ledgerId, entryId, patch });
  }

  deleteEntry(ledgerId: string, entryId: string) {
    this.setEntries(ledgerId, (list) => list.filter((e) => e.id !== entryId));
    this.queue({ kind: 'deleteEntry', ledgerId, entryId });
  }

  private setEntries(ledgerId: string, change: (list: Entry[]) => Entry[]) {
    const { state } = this.store;
    this.store.update(
      { ...state, entries: { ...state.entries, [ledgerId]: change(state.entries[ledgerId] ?? []) } },
      { ledgers: [ledgerId] },
    );
  }
}
