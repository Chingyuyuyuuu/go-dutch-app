import { addCheck } from '@/lib/banks';
import { DEFAULT_CATEGORY_SET } from '@/lib/categories';
import { todayLocal, type LocalDate } from '@/lib/date';
import {
  entryCurrency,
  memberForUid,
  PERSONAL_ENTRY_FIELDS,
  settledShares,
  type BalanceCheck,
  type BankAccount,
  type Entry,
  type Ledger,
  type LedgerMember,
  type LedgerPref,
  type NewEntry,
  type NewRecurring,
  type PlaceholderFriend,
  type Recurring,
  type UserProfile,
} from '@/lib/domain';
import { settlementFor } from '@/lib/fx';
import { personalLedgersFor } from '@/lib/ledgers';
import { chargesBefore, dueCharges, recurringSplitShares } from '@/lib/recurring';

import type { DataRepo, FriendsState, NewLedger, NewMember, Unsubscribe } from '../repo';
import type { MediaStore } from '../supabase/photos';
import type { SyncEngine } from '../sync/SyncEngine';
import type { LocalState, LocalStore } from './LocalStore';
import type { BankPatch, LedgerPatch, Op, RecurringPatch } from './ops';

/**
 * Screens read and write the device's local copy. In cloud mode every write is
 * also queued for Supabase through the SyncEngine; in demo mode it stays local,
 * and the repo also does what the server would (personal copies of my shares).
 */
export class LocalRepo implements DataRepo {
  constructor(
    readonly kind: 'demo' | 'cloud',
    readonly uid: string,
    private store: LocalStore,
    private newId: () => string,
    private sync?: SyncEngine,
    /** Cloud: where home photos are uploaded. Demo keeps the photo on the device. */
    private media?: MediaStore,
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

  private get state(): LocalState {
    return this.store.state;
  }

  private ledger(id: string): Ledger | undefined {
    return this.state.ledgers.find((l) => l.id === id);
  }

  // ---- reads

  subscribeReady(cb: (ready: boolean) => void): Unsubscribe {
    if (!this.sync) {
      cb(true);
      return () => {};
    }
    return this.sync.subscribeReady(cb);
  }

  subscribeProfile(cb: (profile: UserProfile) => void) {
    return this.select(() => this.state.profile, cb);
  }

  subscribeLedgers(cb: (ledgers: Ledger[]) => void) {
    return this.select(() => this.state.ledgers, cb);
  }

  subscribeLedgerPrefs(cb: (prefs: Record<string, LedgerPref>) => void) {
    return this.select(() => this.state.prefs, cb);
  }

  subscribeEntries(ledgerId: string, since: LocalDate, cb: (entries: Entry[]) => void) {
    let source: Entry[] | undefined;
    let filtered: Entry[] = [];
    return this.select(() => {
      const all = this.state.entries[ledgerId] ?? [];
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

  subscribeFriends(cb: (state: FriendsState) => void) {
    let last: FriendsState | undefined;
    return this.select(() => {
      const { friends, placeholders, invites } = this.state;
      if (
        !last ||
        last.friends !== friends ||
        last.placeholders !== placeholders ||
        last.invites !== invites
      ) {
        last = { friends, placeholders, invites };
      }
      return last;
    }, cb);
  }

  subscribeSeen(cb: (seen: Record<string, number>) => void) {
    return this.select(() => this.state.seen, cb);
  }

  subscribeRecurring(cb: (recurring: Recurring[]) => void) {
    return this.select(() => this.state.recurring, cb);
  }

  subscribeBanks(cb: (banks: BankAccount[]) => void) {
    return this.select(() => this.state.banks, cb);
  }

  // ---- profile and ledgers

  updateProfile(patch: Partial<UserProfile>) {
    this.store.update({ ...this.state, profile: { ...this.state.profile, ...patch } }, { meta: true });
    this.queue({ kind: 'profile', patch });
  }

  createLedger(input: NewLedger): string {
    const id = this.newId();
    const shared = input.kind === 'shared';
    const me: LedgerMember = {
      id: this.newId(),
      uid: this.uid,
      placeholderId: null,
      name: this.state.profile.displayName,
      leftAt: null,
    };
    const members = shared ? [me, ...(input.members ?? []).map((m) => this.toMember(m))] : [me];
    const ledger: Ledger = {
      id,
      name: input.name,
      currency: input.currency,
      entryCurrency: input.entryCurrency ?? null,
      categorySet: input.categorySet ?? DEFAULT_CATEGORY_SET,
      rates: input.rates ?? {},
      kind: input.kind,
      status: 'active',
      ownerUid: this.uid,
      members,
      memberUids: activeUids(members),
      createdAt: Date.now(),
    };
    // New ledgers go after the ones the user already arranged.
    const pref: LedgerPref = {
      starred: false,
      order: Date.now(),
      ...(shared && { shareHandling: input.shareHandling ?? 'ask' }),
    };
    this.store.update(
      {
        ...this.state,
        ledgers: [...this.state.ledgers, ledger],
        prefs: { ...this.state.prefs, [id]: pref },
        entries: { ...this.state.entries, [id]: [] },
      },
      { meta: true, ledgers: [id] },
    );
    this.queue(shared ? { kind: 'createSharedLedger', ledger } : { kind: 'insertLedger', ledger });
    this.queue({ kind: 'ledgerPref', ledgerId: id, pref });
    return id;
  }

  updateLedger(ledgerId: string, patch: LedgerPatch) {
    this.setLedger(ledgerId, (l) => ({ ...l, ...patch }));
    this.queue({ kind: 'updateLedger', ledgerId, patch });
  }

  addLedgerMembers(ledgerId: string, newMembers: NewMember[]) {
    const members = newMembers.map((m) => this.toMember(m));
    this.setLedger(ledgerId, (l) => {
      const all = [...l.members, ...members];
      return { ...l, members: all, memberUids: activeUids(all) };
    });
    this.queue({ kind: 'addMembers', ledgerId, members });
  }

  removeLedger(ledgerId: string) {
    const entries = { ...this.state.entries };
    delete entries[ledgerId];
    const prefs = { ...this.state.prefs };
    delete prefs[ledgerId];
    this.store.update(
      {
        ...this.state,
        ledgers: this.state.ledgers.filter((l) => l.id !== ledgerId),
        entries,
        prefs,
        // The server deletes them with the ledger.
        recurring: this.state.recurring.filter((r) => r.ledgerId !== ledgerId),
      },
      { meta: true, ledgers: [ledgerId] },
    );
    this.queue({ kind: 'leaveLedger', ledgerId });
  }

  setLedgerPrefs(updates: Record<string, Partial<LedgerPref>>) {
    const prefs = { ...this.state.prefs };
    for (const [id, patch] of Object.entries(updates)) {
      const previous: LedgerPref = prefs[id] ?? { starred: false, order: Date.now() };
      prefs[id] = { ...previous, ...patch };
    }
    this.store.update({ ...this.state, prefs }, { meta: true });
    for (const id of Object.keys(updates)) this.queue({ kind: 'ledgerPref', ledgerId: id, pref: prefs[id] });
  }

  markSeen(ledgerId: string) {
    this.store.update(
      { ...this.state, seen: { ...this.state.seen, [ledgerId]: Date.now() } },
      { meta: true },
    );
  }

  // ---- entries

  addEntry(ledgerId: string, input: NewEntry): string {
    const id = this.newId();
    const now = Date.now();
    const entry = this.settled(ledgerId, {
      ...PERSONAL_ENTRY_FIELDS,
      ...input,
      id,
      ledgerId,
      createdBy: this.uid,
      lastEditedBy: this.uid,
      createdAt: now,
      updatedAt: now,
    });
    this.setEntries(ledgerId, (list) => [entry, ...list]);
    this.queue({ kind: 'insertEntry', entry: entry.fxSource === 'same' ? withoutFx(entry) : entry });
    this.demoSyncMyCopy(entry);
    return id;
  }

  updateEntry(ledgerId: string, entryId: string, patch: Partial<NewEntry>) {
    let previous: Entry | undefined;
    let updated: Entry | undefined;
    this.setEntries(ledgerId, (list) =>
      list.map((e) => {
        if (e.id !== entryId) return e;
        previous = e;
        updated = this.settled(ledgerId, { ...e, ...patch, lastEditedBy: this.uid, updatedAt: Date.now() });
        return updated;
      }),
    );
    // Conversion fields travel only while the entry is (or was) in another currency.
    const foreign = [previous?.fxSource, updated?.fxSource].some((s) => s !== undefined && s !== 'same');
    const remotePatch: Partial<NewEntry> =
      foreign && updated
        ? { ...patch, currency: updated.currency, fxRate: updated.fxRate, fxSource: updated.fxSource }
        : withoutFx(patch);
    this.queue({ kind: 'updateEntry', ledgerId, entryId, patch: remotePatch });
    if (updated) this.demoSyncMyCopy(updated);
  }

  deleteEntry(ledgerId: string, entryId: string) {
    const entry = this.state.entries[ledgerId]?.find((e) => e.id === entryId);
    this.setEntries(ledgerId, (list) => list.filter((e) => e.id !== entryId));
    this.queue({ kind: 'deleteEntry', ledgerId, entryId });
    if (entry) this.demoSyncMyCopy(entry, true);
  }

  // ---- friends and invites

  setFriendStarred(uid: string, starred: boolean) {
    this.store.update(
      { ...this.state, friends: this.state.friends.map((f) => (f.uid === uid ? { ...f, starred } : f)) },
      { meta: true },
    );
    this.queue({ kind: 'friendStar', uid, starred });
  }

  addPlaceholder(name: string): string {
    const placeholder: PlaceholderFriend = { id: this.newId(), name, mergedUid: null, createdAt: Date.now() };
    this.store.update(
      { ...this.state, placeholders: [...this.state.placeholders, placeholder] },
      { meta: true },
    );
    this.queue({ kind: 'addPlaceholder', placeholder });
    return placeholder.id;
  }

  createInvite(placeholderId: string | null): string {
    const existing = this.state.invites.find((i) => i.placeholderId === placeholderId);
    if (existing) return existing.code;
    // 10 hex characters from the random end of a UUID: short enough to type in.
    const code = this.newId().replace(/-/g, '').slice(-10).toLowerCase();
    const invite = { code, placeholderId, createdAt: Date.now() };
    this.store.update({ ...this.state, invites: [...this.state.invites, invite] }, { meta: true });
    this.queue({ kind: 'createInvite', invite });
    return invite.code;
  }

  async acceptInvite(code: string) {
    if (!this.sync) return 'demo' as const;
    return this.sync.acceptInvite(code);
  }

  // ---- recurring payments

  addRecurring(input: NewRecurring): string {
    const recurring: Recurring = {
      ...input,
      id: this.newId(),
      ownerUid: this.uid,
      // Charges before today count as paid (the server works this out too).
      paidCount: chargesBefore(input, todayLocal()),
      createdAt: Date.now(),
    };
    this.setRecurring((list) => [...list, recurring]);
    this.queue({ kind: 'insertRecurring', recurring });
    this.catchUpRecurring();
    return recurring.id;
  }

  updateRecurring(recurringId: string, patch: RecurringPatch) {
    this.setRecurring((list) =>
      list.map((r) => {
        if (r.id !== recurringId) return r;
        const next = { ...r, ...patch };
        const rescheduled =
          next.startDate !== r.startDate ||
          next.frequency !== r.frequency ||
          next.instalments !== r.instalments;
        return rescheduled ? { ...next, paidCount: chargesBefore(next, todayLocal()) } : next;
      }),
    );
    this.queue({ kind: 'updateRecurring', recurringId, patch });
    this.catchUpRecurring();
  }

  deleteRecurring(recurringId: string) {
    this.setRecurring((list) => list.filter((r) => r.id !== recurringId));
    this.queue({ kind: 'deleteRecurring', recurringId });
  }

  catchUpRecurring() {
    if (this.kind === 'cloud') {
      void this.sync?.syncNow();
      return;
    }
    // Demo: do what the server's record_due_recurring() does.
    const today = todayLocal();
    for (const r of this.state.recurring) {
      const due = dueCharges(r, today);
      if (due.length === 0) continue;
      const ledger = this.ledger(r.ledgerId);
      for (const charge of due) {
        if (!ledger || ledger.status !== 'active' || charge.amountMinor <= 0) continue;
        const payer = ledger.members.find((m) => m.id === r.payerMemberId && m.leftAt === null);
        if (r.kind === 'split' && !payer) continue;
        this.addEntry(ledger.id, {
          type: 'expense',
          amountMinor: charge.amountMinor,
          categoryCode: r.categoryCode,
          date: charge.date,
          note: r.name,
          recurringId: r.id,
          recurringSeq: charge.seq,
          ...(r.kind === 'split' && {
            isSplit: true,
            payerMemberId: r.payerMemberId,
            shares: recurringSplitShares(ledger, charge.amountMinor),
          }),
        });
      }
      const paidCount = due[due.length - 1].seq + 1;
      this.setRecurring((list) => list.map((x) => (x.id === r.id ? { ...x, paidCount } : x)));
    }
  }

  // ---- home photo

  async setHomePhoto(photo: { uri: string; mimeType: string } | null): Promise<'ok' | 'offline'> {
    const previous = this.state.profile.homePhoto;
    let value: string | null = photo?.uri ?? null;
    if (this.media && photo) {
      try {
        value = await this.media.upload(photo.uri, photo.mimeType);
      } catch (error) {
        console.warn('[photo] upload failed', error);
        return 'offline';
      }
    }
    this.updateProfile({ homePhoto: value });
    if (this.media && previous) void this.media.remove(previous).catch(() => {});
    return 'ok';
  }

  private photoUrls = new Map<string, Promise<string | null>>();

  homePhotoUrl(photo: string): Promise<string | null> {
    if (!this.media) return Promise.resolve(photo);
    const media = this.media;
    let url = this.photoUrls.get(photo);
    if (!url) {
      url = media.url(photo).catch(() => {
        this.photoUrls.delete(photo);
        return null;
      });
      this.photoUrls.set(photo, url);
    }
    return url;
  }

  // ---- bank accounts

  addBank(input: Omit<BankAccount, 'id' | 'createdAt' | 'checks'>): string {
    const bank: BankAccount = { ...input, id: this.newId(), checks: [], createdAt: Date.now() };
    this.setBanks((list) => [...list, bank]);
    this.queue({ kind: 'insertBank', bank });
    return bank.id;
  }

  updateBank(bankId: string, patch: BankPatch) {
    this.setBanks((list) => list.map((b) => (b.id === bankId ? { ...b, ...patch } : b)));
    this.queue({ kind: 'updateBank', bankId, patch });
  }

  deleteBank(bankId: string) {
    this.setBanks((list) => list.filter((b) => b.id !== bankId));
    this.queue({ kind: 'deleteBank', bankId });
  }

  recordBalance(bankId: string, check: Omit<BalanceCheck, 'at'>) {
    const bank = this.state.banks.find((b) => b.id === bankId);
    if (bank) this.updateBank(bankId, { checks: addCheck(bank.checks, { ...check, at: Date.now() }) });
  }

  // ---- helpers

  private setRecurring(change: (list: Recurring[]) => Recurring[]) {
    this.store.update({ ...this.state, recurring: change(this.state.recurring) }, { meta: true });
  }

  private setBanks(change: (list: BankAccount[]) => BankAccount[]) {
    this.store.update({ ...this.state, banks: change(this.state.banks) }, { meta: true });
  }

  private toMember(m: NewMember): LedgerMember {
    return { id: this.newId(), uid: m.uid, placeholderId: m.placeholderId, name: m.name, leftAt: null };
  }

  private setLedger(ledgerId: string, change: (ledger: Ledger) => Ledger) {
    this.store.update(
      { ...this.state, ledgers: this.state.ledgers.map((l) => (l.id === ledgerId ? change(l) : l)) },
      { meta: true },
    );
  }

  /** The entry with its conversion fields filled in for its ledger (the server recalculates them too). */
  private settled(ledgerId: string, entry: Entry): Entry {
    const ledger = this.ledger(ledgerId);
    return ledger ? { ...entry, ...settlementFor(entry, ledger.currency) } : entry;
  }

  private setEntries(ledgerId: string, change: (list: Entry[]) => Entry[]) {
    this.store.update(
      {
        ...this.state,
        entries: { ...this.state.entries, [ledgerId]: change(this.state.entries[ledgerId] ?? []) },
      },
      { ledgers: [ledgerId] },
    );
  }

  /**
   * Demo mode only (the server trigger does this for real accounts): keep my
   * personal copy of a shared entry in step when I chose "add every entry".
   */
  private demoSyncMyCopy(shared: Entry, deleted = false) {
    if (this.kind !== 'demo' || !shared.isSplit || shared.type === 'repayment') return;
    const ledger = this.ledger(shared.ledgerId);
    if (!ledger || ledger.kind !== 'shared') return;
    const me = memberForUid(ledger, this.uid);
    const share = me ? (shared.shares?.[me.id] ?? 0) : 0;
    const wanted = this.state.prefs[ledger.id]?.shareHandling === 'each' && !deleted && share > 0;

    const existing = Object.values(this.state.entries)
      .flat()
      .find((e) => e.sourceEntryId === shared.id);
    if (!wanted) {
      if (existing) this.setEntries(existing.ledgerId, (list) => list.filter((e) => e.id !== existing.id));
      return;
    }
    // Same order as the server's personal_ledger_for.
    const candidates = personalLedgersFor(ledger.currency, this.state.ledgers).map((l) => l.id);
    const target =
      existing?.ledgerId ??
      [
        this.state.prefs[ledger.id]?.shareTargetLedgerId,
        this.state.profile.lastLedgerId,
        this.state.profile.lastUsedLedger[ledger.currency],
      ].find((id) => id && candidates.includes(id)) ??
      candidates[0];
    if (!target || !candidates.includes(target)) return;
    const copy = this.settled(target, {
      ...PERSONAL_ENTRY_FIELDS,
      id: existing?.id ?? this.newId(),
      ledgerId: target,
      type: shared.type,
      amountMinor: share,
      currency: entryCurrency(shared, ledger),
      fxRate: shared.fxRate ?? '1',
      fxSource: 'split',
      amountSettleMinor: settledShares(shared)?.[me?.id ?? ''] ?? share,
      categoryCode: shared.categoryCode,
      date: shared.date,
      note: shared.note,
      sourceEntryId: shared.id,
      sourceLedgerId: ledger.id,
      createdBy: shared.createdBy,
      lastEditedBy: this.uid,
      createdAt: shared.createdAt,
      updatedAt: Date.now(),
    });
    this.setEntries(target, (list) => [copy, ...list.filter((e) => e.id !== copy.id)]);
  }
}

/**
 * Without the conversion fields. Entries paid in the settlement currency don't send them, so a
 * server without the Phase 6 migration keeps syncing; the server fills in "same currency" itself.
 */
function withoutFx<T extends Partial<NewEntry>>(entry: T): T {
  return { ...entry, currency: undefined, fxRate: undefined, fxSource: undefined };
}

function activeUids(members: LedgerMember[]): string[] {
  return members.filter((m) => m.uid && m.leftAt === null).map((m) => m.uid as string);
}
