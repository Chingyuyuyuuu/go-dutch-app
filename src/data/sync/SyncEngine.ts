import type {
  BankAccount,
  Entry,
  Friend,
  Invite,
  Ledger,
  LedgerPref,
  PlaceholderFriend,
  Recurring,
  UserProfile,
} from '@/lib/domain';

import type { LocalStore } from '../local/LocalStore';
import { enqueueOp, opRowKey, type Op } from '../local/ops';

export type PushResult = { status: 'ok' } | { status: 'retry' } | { status: 'rejected'; error: unknown };

export type PulledEntry = Entry & { deleted: boolean };

export type PullResult = {
  profile: UserProfile | null;
  ledgers: Ledger[];
  prefs: Record<string, LedgerPref>;
  /** Entries changed since the cursor (all entries of ledgers new to this device), including deletions. */
  entries: PulledEntry[];
  friends: Friend[];
  placeholders: PlaceholderFriend[];
  invites: Invite[];
  /** All live rows (these tables are small, so they are read whole). */
  recurring: Recurring[];
  banks: BankAccount[];
  cursor: string;
};

export type AcceptInviteResult = 'ok' | 'invalid' | 'self' | 'used' | 'offline';

export type ShareLink = { token: string; live: boolean };
export type RequestJoinResult = 'sent' | 'pending' | 'member' | 'taken' | 'invalid' | 'signed-out';
export type AnswerJoinResult = 'approved' | 'rejected' | 'taken' | 'answered' | 'gone';

/** A mid-market rate from the server's fx_rates table: 1 unit of one currency in another. */
export type MidRate = { mid: string; asOf: string };

/** The server side of sync. SupabaseRemote in the app, a fake in tests. */
export interface RemoteApi {
  push(op: Op): Promise<PushResult>;
  /**
   * Everything that changed since `cursor` (null = everything). Ledgers not in
   * `knownLedgerIds` are new to this device, so all their entries are included.
   */
  pull(cursor: string | null, knownLedgerIds: string[]): Promise<PullResult>;
  /** Needs the network; not queued. */
  acceptInvite(code: string): Promise<AcceptInviteResult>;
  /** Asks the server to record my recurring charges that are due (it also does this hourly). */
  runRecurring(): Promise<void>;
  /** Latest mid-market rate (1 `from` in `to`), or null when the server has none. Needs the network. */
  midRate(from: string, to: string): Promise<MidRate | null>;
  /** The shared ledger's share link, live or turned off; null when it never had one. */
  getShareLink(ledgerId: string): Promise<ShareLink | null>;
  /** Returns the live link's token, making one (or a new one with `regenerate`). */
  createShareLink(ledgerId: string, regenerate: boolean): Promise<string>;
  revokeShareLink(ledgerId: string): Promise<void>;
  /** Asks to join a shared ledger from its share page (spec §6B.3). */
  requestJoin(token: string, memberId: string | null): Promise<RequestJoinResult>;
  answerJoinRequest(requestId: string, approve: boolean): Promise<AnswerJoinResult>;
  /** Calls `onChange` when another device changes data. Returns unsubscribe. */
  subscribe(onChange: () => void): () => void;
}

/** Something that should make the engine sync now (back online, app in foreground). */
export type SyncTrigger = (fire: () => void) => () => void;

const MAX_BACKOFF_MS = 30_000;

/**
 * Keeps a LocalStore in step with the server:
 * - writes go to the outbox and are sent in order; offline they wait and retry
 * - a rejected write (e.g. not allowed) is dropped, reported, and the server copy is pulled back
 * - pulls never overwrite rows that still have unsent changes
 */
export class SyncEngine {
  private flushing: Promise<void> | null = null;
  private pulling: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private stopped = false;
  /** Next pull downloads everything instead of changes since the cursor. */
  private needFullPull = false;
  /** The op being uploaded right now; new changes are not folded into it. */
  private inFlightId: string | null = null;
  private cleanups: (() => void)[] = [];
  private readyListeners = new Set<(ready: boolean) => void>();
  private _ready: boolean;

  constructor(
    private store: LocalStore,
    private remote: RemoteApi,
    private options: {
      newId: () => string;
      onError: (error: unknown) => void;
      triggers?: SyncTrigger[];
    },
  ) {
    // A device that has synced before can show its local copy straight away.
    this._ready = store.sync.cursor !== null;
  }

  get ready() {
    return this._ready;
  }

  subscribeReady(cb: (ready: boolean) => void): () => void {
    this.readyListeners.add(cb);
    cb(this._ready);
    return () => {
      this.readyListeners.delete(cb);
    };
  }

  start() {
    const now = () => void this.syncNow();
    this.cleanups.push(this.remote.subscribe(() => void this.pull()));
    for (const trigger of this.options.triggers ?? []) this.cleanups.push(trigger(now));
    now();
  }

  stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
  }

  enqueue(op: Op) {
    this.store.setOutbox(enqueueOp(this.store.outbox, op, this.options.newId(), this.inFlightId));
    void this.flush();
  }

  /** Joins a friend through their invite code, then downloads what that unlocked. */
  async acceptInvite(code: string): Promise<AcceptInviteResult> {
    let result: AcceptInviteResult;
    try {
      result = await this.remote.acceptInvite(code);
    } catch {
      result = 'offline';
    }
    if (result === 'ok') await this.pull();
    return result;
  }

  /**
   * A call that needs the network and is not queued (share links, join requests).
   * Null when offline or refused; `pullAfter` downloads what it changed.
   */
  async online<T>(call: (remote: RemoteApi) => Promise<T>, pullAfter = false): Promise<T | null> {
    let result: T;
    try {
      result = await call(this.remote);
    } catch {
      return null;
    }
    if (pullAfter) await this.pull();
    return result;
  }

  /** Mid-market rate for a suggested ledger rate; null offline or when the server has none. */
  async midRate(from: string, to: string): Promise<MidRate | null> {
    try {
      return await this.remote.midRate(from, to);
    } catch {
      return null;
    }
  }

  /** Send pending writes, let the server record due recurring charges, then fetch what changed. */
  async syncNow() {
    await this.flush();
    try {
      await this.remote.runRecurring();
    } catch {
      // Offline, or the server is older than this app: the hourly job still records them.
    }
    await this.pull();
  }

  flush(): Promise<void> {
    if (!this.flushing) {
      this.flushing = this.runFlush().finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  pull(): Promise<void> {
    if (!this.pulling) {
      this.pulling = this.runPull().finally(() => {
        this.pulling = null;
      });
    }
    return this.pulling;
  }

  private async runFlush() {
    let rejected = false;
    while (!this.stopped && this.store.outbox.length > 0) {
      const op = this.store.outbox[0];
      let result: PushResult;
      this.inFlightId = op.opId;
      try {
        result = await this.remote.push(op);
      } catch {
        result = { status: 'retry' };
      } finally {
        this.inFlightId = null;
      }
      if (result.status === 'retry') {
        this.scheduleRetry();
        break;
      }
      this.failures = 0;
      // Remove by id: new ops may have been queued (or folded into others) meanwhile.
      this.store.setOutbox(this.store.outbox.filter((q) => q.opId !== op.opId));
      if (result.status === 'rejected') {
        rejected = true;
        this.options.onError(result.error);
      }
    }
    // The local copy now has a change the server refused: take the server's version back.
    if (rejected) {
      this.needFullPull = true;
      await this.pull();
    }
  }

  private async runPull() {
    if (this.stopped) return;
    const full = this.needFullPull || this.store.sync.cursor === null;
    this.needFullPull = false;
    let result: PullResult;
    try {
      const known = full ? [] : Object.keys(this.store.state.entries);
      result = await this.remote.pull(full ? null : this.store.sync.cursor, known);
    } catch {
      if (full) this.needFullPull = true;
      // Offline or server error: keep showing the local copy.
      this.setReady();
      return;
    }
    if (this.stopped) return;
    const prev = this.store.state;
    const next = mergePull(prev, result, this.pendingKeys(), full);
    // Only rewrite the entry lists that actually changed.
    const changed = Object.keys(next.entries).filter((id) => next.entries[id] !== prev.entries[id]);
    this.store.update(next, { meta: true, ledgers: changed });
    this.store.setSync({ cursor: result.cursor });
    this.setReady();
  }

  private pendingKeys(): Set<string> {
    return new Set(this.store.outbox.map(opRowKey));
  }

  private scheduleRetry() {
    if (this.retryTimer || this.stopped) return;
    this.failures += 1;
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (this.failures - 1));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.syncNow();
    }, delay);
  }

  private setReady() {
    if (this._ready) return;
    this._ready = true;
    this.readyListeners.forEach((l) => l(true));
  }
}

/**
 * Combines the local copy with what the server sent. Rows with unsent local
 * changes (`pending`, keyed by opRowKey) keep the local version. A `full` pull
 * holds every live entry, so local entries missing from it are dropped.
 */
export function mergePull(
  local: LocalStore['state'],
  pulled: PullResult,
  pending: Set<string>,
  full = false,
): LocalStore['state'] {
  const localLedgerById = new Map(local.ledgers.map((l) => [l.id, l]));
  const serverIds = new Set(pulled.ledgers.map((l) => l.id));
  const ledgers = [
    // A pending change wins; a pending removal (not in the local copy any more) stays removed.
    ...pulled.ledgers.flatMap((l) =>
      pending.has(`ledger:${l.id}`) ? (localLedgerById.get(l.id) ?? []) : [l],
    ),
    // Created here but not on the server yet.
    ...local.ledgers.filter((l) => !serverIds.has(l.id) && pending.has(`ledger:${l.id}`)),
  ];
  const keep = new Set(ledgers.map((l) => l.id));

  const prefs: Record<string, LedgerPref> = {};
  for (const id of keep) {
    const p = pending.has(`pref:${id}`)
      ? (local.prefs[id] ?? pulled.prefs[id])
      : (pulled.prefs[id] ?? local.prefs[id]);
    if (p) prefs[id] = p;
  }

  // Lists without changes keep their identity, so screens and storage skip them.
  const entries: Record<string, Entry[]> = {};
  for (const id of keep) {
    const list = local.entries[id] ?? [];
    entries[id] = full ? list.filter((e) => pending.has(`entry:${e.id}`)) : list;
  }
  for (const { deleted, ...entry } of pulled.entries) {
    if (pending.has(`entry:${entry.id}`) || !entries[entry.ledgerId]) continue;
    const list = entries[entry.ledgerId].filter((x) => x.id !== entry.id);
    if (!deleted) list.push(entry);
    entries[entry.ledgerId] = list;
  }

  const profile = pending.has('profile') || !pulled.profile ? local.profile : pulled.profile;
  return {
    profile,
    ledgers,
    prefs,
    entries,
    friends: mergeRows(local.friends, pulled.friends, (f) => `friend:${f.uid}`, pending),
    placeholders: mergeRows(local.placeholders, pulled.placeholders, (p) => `placeholder:${p.id}`, pending),
    invites: mergeRows(local.invites, pulled.invites, (i) => `invite:${i.code}`, pending),
    recurring: mergeRows(local.recurring, pulled.recurring, (r) => `recurring:${r.id}`, pending).filter((r) =>
      keep.has(r.ledgerId),
    ),
    banks: mergeRows(local.banks, pulled.banks, (b) => `bank:${b.id}`, pending),
    seen: local.seen,
  };
}

/**
 * Server rows, except rows with unsent local changes, which keep (or add) the local
 * version; a row deleted here but not on the server yet stays deleted.
 */
function mergeRows<T>(local: T[], server: T[], key: (row: T) => string, pending: Set<string>): T[] {
  const localByKey = new Map(local.map((row) => [key(row), row]));
  const serverKeys = new Set(server.map(key));
  return [
    ...server.flatMap((row) => (pending.has(key(row)) ? (localByKey.get(key(row)) ?? []) : [row])),
    ...local.filter((row) => !serverKeys.has(key(row)) && pending.has(key(row))),
  ];
}
