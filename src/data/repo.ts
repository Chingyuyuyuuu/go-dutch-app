import type { LocalDate } from '@/lib/date';
import type { Entry, Ledger, LedgerPref, NewEntry, UserProfile } from '@/lib/domain';

export type Unsubscribe = () => void;

export type NewLedger = Pick<Ledger, 'name' | 'currency' | 'kind'>;

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

  updateProfile(patch: Partial<UserProfile>): void;
  createLedger(input: NewLedger): string;
  setLedgerPrefs(updates: Record<string, Partial<LedgerPref>>): void;
  addEntry(ledgerId: string, entry: NewEntry): string;
  updateEntry(ledgerId: string, entryId: string, patch: Partial<NewEntry>): void;
  deleteEntry(ledgerId: string, entryId: string): void;
}
