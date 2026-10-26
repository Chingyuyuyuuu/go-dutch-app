import {
  DEFAULT_PROFILE,
  type BankAccount,
  type Entry,
  type Friend,
  type Invite,
  type Ledger,
  type LedgerPref,
  type PlaceholderFriend,
  type Recurring,
  type UserProfile,
} from '@/lib/domain';

import type { KeyValueStore } from './kv';
import type { QueuedOp } from './ops';

export type LocalState = {
  profile: UserProfile;
  ledgers: Ledger[];
  prefs: Record<string, LedgerPref>;
  /** Live (not deleted) entries per ledger. */
  entries: Record<string, Entry[]>;
  friends: Friend[];
  placeholders: PlaceholderFriend[];
  invites: Invite[];
  /** My recurring payments, plus recurring splits of shared ledgers I'm in (for their tags). */
  recurring: Recurring[];
  banks: BankAccount[];
  /** This device only: when each ledger was last opened, for "new" markers. Never synced. */
  seen: Record<string, number>;
};

export type SyncMeta = {
  /** Server time of the newest entry change pulled so far (ISO). Null before the first pull. */
  cursor: string | null;
};

export const EMPTY_STATE: LocalState = {
  profile: DEFAULT_PROFILE,
  ledgers: [],
  prefs: {},
  entries: {},
  friends: [],
  placeholders: [],
  invites: [],
  recurring: [],
  banks: [],
  seen: {},
};

type Meta = Omit<LocalState, 'entries'> & { ledgerIds: string[]; sync: SyncMeta };

const PERSIST_DELAY_MS = 120;

function logPersistError(error: unknown) {
  console.warn('[local] could not save to device storage', error);
}

/**
 * This device's copy of one user's data. Screens read from here, so the app
 * works the same online and offline. Saved under `<namespace>/…` keys:
 * `meta` (everything except entries, plus the sync cursor), `entries/<ledgerId>` and `outbox`.
 */
export class LocalStore {
  private listeners = new Set<() => void>();
  private dirtyMeta = false;
  private dirtyOutbox = false;
  private dirtyLedgers = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private persisting: Promise<void> = Promise.resolve();

  private constructor(
    private kv: KeyValueStore,
    private ns: string,
    private _state: LocalState,
    private _outbox: QueuedOp[],
    private _sync: SyncMeta,
  ) {}

  static async open(kv: KeyValueStore, ns: string): Promise<LocalStore | null> {
    const rawMeta = await kv.getItem(`${ns}/meta`);
    if (!rawMeta) return null;
    const meta = JSON.parse(rawMeta) as Meta;
    const entries: Record<string, Entry[]> = {};
    for (const id of meta.ledgerIds) {
      const raw = await kv.getItem(`${ns}/entries/${id}`);
      entries[id] = raw ? (JSON.parse(raw) as Entry[]) : [];
    }
    const rawOutbox = await kv.getItem(`${ns}/outbox`);
    return new LocalStore(
      kv,
      ns,
      {
        ...EMPTY_STATE,
        ...meta,
        profile: { ...DEFAULT_PROFILE, ...meta.profile },
        entries,
      },
      rawOutbox ? (JSON.parse(rawOutbox) as QueuedOp[]) : [],
      meta.sync ?? { cursor: null },
    );
  }

  /** A new store; writes everything right away. */
  static create(kv: KeyValueStore, ns: string, initial: LocalState = EMPTY_STATE): LocalStore {
    const store = new LocalStore(kv, ns, initial, [], { cursor: null });
    store.dirtyMeta = true;
    store.dirtyOutbox = true;
    Object.keys(initial.entries).forEach((id) => store.dirtyLedgers.add(id));
    store.schedulePersist();
    return store;
  }

  static async openOrCreate(kv: KeyValueStore, ns: string, initial?: () => LocalState): Promise<LocalStore> {
    return (await LocalStore.open(kv, ns)) ?? LocalStore.create(kv, ns, initial?.());
  }

  /** Removes every key of a namespace (used to reset the demo). */
  static async clear(kv: KeyValueStore, ns: string): Promise<void> {
    const keys = (await kv.getAllKeys()).filter((k) => k.startsWith(`${ns}/`));
    await Promise.all(keys.map((k) => kv.removeItem(k)));
  }

  get state(): LocalState {
    return this._state;
  }

  get outbox(): readonly QueuedOp[] {
    return this._outbox;
  }

  get sync(): SyncMeta {
    return this._sync;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Replace state. `changed.meta` covers profile / ledgers / prefs; `changed.ledgers` lists entry lists. */
  update(next: LocalState, changed: { meta?: boolean; ledgers?: string[] }) {
    this._state = next;
    if (changed.meta) this.dirtyMeta = true;
    changed.ledgers?.forEach((id) => this.dirtyLedgers.add(id));
    this.emit();
    this.schedulePersist();
  }

  setOutbox(outbox: QueuedOp[]) {
    this._outbox = outbox;
    this.dirtyOutbox = true;
    this.emit();
    this.schedulePersist();
  }

  setSync(sync: SyncMeta) {
    this._sync = sync;
    this.dirtyMeta = true;
    this.schedulePersist();
  }

  /** Writes pending changes now (tests, sign-out). */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.persisting = this.persisting.then(() => this.persist()).catch(logPersistError);
    await this.persisting;
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private schedulePersist() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.persisting = this.persisting.then(() => this.persist()).catch(logPersistError);
    }, PERSIST_DELAY_MS);
  }

  private async persist() {
    const writes: Promise<void>[] = [];
    if (this.dirtyMeta) {
      this.dirtyMeta = false;
      const { entries, ...rest } = this._state;
      const meta: Meta = { ...rest, ledgerIds: Object.keys(entries), sync: this._sync };
      writes.push(this.kv.setItem(`${this.ns}/meta`, JSON.stringify(meta)));
    }
    for (const id of this.dirtyLedgers) {
      writes.push(this.kv.setItem(`${this.ns}/entries/${id}`, JSON.stringify(this._state.entries[id] ?? [])));
    }
    this.dirtyLedgers.clear();
    if (this.dirtyOutbox) {
      this.dirtyOutbox = false;
      writes.push(this.kv.setItem(`${this.ns}/outbox`, JSON.stringify(this._outbox)));
    }
    await Promise.all(writes);
  }
}
