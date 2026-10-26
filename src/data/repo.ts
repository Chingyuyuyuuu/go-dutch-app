import type { LocalDate } from '@/lib/date';
import type {
  BalanceCheck,
  BankAccount,
  Entry,
  Friend,
  Invite,
  Ledger,
  LedgerPref,
  LedgerStatus,
  NewEntry,
  NewRecurring,
  PlaceholderFriend,
  Recurring,
  ShareHandling,
  UserProfile,
} from '@/lib/domain';

import type { BankPatch, RecurringPatch } from './local/ops';
import type { AcceptInviteResult } from './sync/SyncEngine';

export type Unsubscribe = () => void;

/** A member to add to a shared ledger: a friend's account or a placeholder friend. */
export type NewMember = { uid: string | null; placeholderId: string | null; name: string };

export type NewLedger = Pick<Ledger, 'name' | 'currency' | 'kind'> & {
  /** Shared ledgers: the other members (the creator is added automatically). */
  members?: NewMember[];
  shareHandling?: ShareHandling;
};

export type FriendsState = { friends: Friend[]; placeholders: PlaceholderFriend[]; invites: Invite[] };

/**
 * Everything the screens need from storage. Implemented by LocalRepo:
 * - demo: sample data on this device only
 * - cloud: the same local copy, kept in sync with Supabase (works offline)
 *
 * Writes apply to the local copy immediately and return the new id; syncing
 * happens in the background, so screens never wait for the network.
 */
export interface DataRepo {
  readonly kind: 'demo' | 'cloud';
  readonly uid: string;

  /** False only on a device's very first sign-in, until the first download finishes or fails. */
  subscribeReady(cb: (ready: boolean) => void): Unsubscribe;
  subscribeProfile(cb: (profile: UserProfile) => void): Unsubscribe;
  subscribeLedgers(cb: (ledgers: Ledger[]) => void): Unsubscribe;
  subscribeLedgerPrefs(cb: (prefs: Record<string, LedgerPref>) => void): Unsubscribe;
  /** Entries dated `since` or later, for one ledger. */
  subscribeEntries(ledgerId: string, since: LocalDate, cb: (entries: Entry[]) => void): Unsubscribe;
  /** Number of changes made on this device that have not reached the server yet. */
  subscribePending(cb: (count: number) => void): Unsubscribe;
  subscribeFriends(cb: (state: FriendsState) => void): Unsubscribe;
  /** When each ledger was last opened on this device. */
  subscribeSeen(cb: (seen: Record<string, number>) => void): Unsubscribe;
  subscribeRecurring(cb: (recurring: Recurring[]) => void): Unsubscribe;
  subscribeBanks(cb: (banks: BankAccount[]) => void): Unsubscribe;

  updateProfile(patch: Partial<UserProfile>): void;
  createLedger(input: NewLedger): string;
  updateLedger(ledgerId: string, patch: { name?: string; status?: LedgerStatus }): void;
  addLedgerMembers(ledgerId: string, members: NewMember[]): void;
  /** Personal: deletes it. Shared: leaves it (deleted for everyone once the last member leaves). */
  removeLedger(ledgerId: string): void;
  setLedgerPrefs(updates: Record<string, Partial<LedgerPref>>): void;
  addEntry(ledgerId: string, entry: NewEntry): string;
  updateEntry(ledgerId: string, entryId: string, patch: Partial<NewEntry>): void;
  deleteEntry(ledgerId: string, entryId: string): void;
  markSeen(ledgerId: string): void;

  setFriendStarred(uid: string, starred: boolean): void;
  addPlaceholder(name: string): string;
  /** A general invite (reused) or a placeholder friend's personal invite. Returns the code. */
  createInvite(placeholderId: string | null): string;
  /** Needs the network. Demo mode cannot join anyone. */
  acceptInvite(code: string): Promise<AcceptInviteResult | 'demo'>;

  addRecurring(input: NewRecurring): string;
  updateRecurring(recurringId: string, patch: RecurringPatch): void;
  deleteRecurring(recurringId: string): void;
  /**
   * Records charges that are due. Cloud: the server does it (on sync and hourly), so
   * this just syncs. Demo: done on the device.
   */
  catchUpRecurring(): void;

  addBank(input: Omit<BankAccount, 'id' | 'createdAt' | 'checks'>): string;
  updateBank(bankId: string, patch: BankPatch): void;
  deleteBank(bankId: string): void;
  /**
   * Sets the home photo, or removes it with null. Accounts upload it first, so
   * this needs the network ('offline' when it can't reach the server).
   */
  setHomePhoto(photo: { uri: string; mimeType: string } | null): Promise<'ok' | 'offline'>;
  /** Something an <Image> can show for profile.homePhoto. */
  homePhotoUrl(photo: string): Promise<string | null>;

  /** Saves a balance check (time-stamped now). */
  recordBalance(bankId: string, check: Omit<BalanceCheck, 'at'>): void;
}
