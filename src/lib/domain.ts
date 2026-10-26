import type { CategoryCode } from './categories';
import type { LocalDate } from './date';
import type { MinorUnits } from './money';

export type LedgerKind = 'personal' | 'shared';
export type LedgerStatus = 'active' | 'ended';

export type Ledger = {
  id: string;
  name: string;
  /** ISO 4217 code. Fixed when the ledger is created. */
  currency: string;
  kind: LedgerKind;
  status: LedgerStatus;
  ownerUid: string;
  memberUids: string[];
  createdAt: number;
};

/** Personal entries are expense / income; repayment is for settling shared ledgers (Phase 3). */
export type EntryType = 'expense' | 'income' | 'repayment';

export type Entry = {
  id: string;
  ledgerId: string;
  type: EntryType;
  isSplit: boolean;
  amountMinor: MinorUnits;
  categoryCode: CategoryCode;
  date: LocalDate;
  note: string;
  createdBy: string;
  lastEditedBy: string;
  createdAt: number;
  updatedAt: number;
};

export type NewEntry = Pick<Entry, 'type' | 'amountMinor' | 'categoryCode' | 'date' | 'note'>;

/** Per-user, per-ledger tab settings. Each member of a shared ledger has their own. */
export type LedgerPref = {
  starred: boolean;
  /** Manual position chosen by dragging. Lower comes first. */
  order: number;
};

export type LocalePref = 'system' | 'zh-TW' | 'en-AU';

export type UserProfile = {
  locale: LocalePref;
  starredCurrencies: string[];
  /** Last personal ledger used per currency, so routing can put it first. */
  lastUsedLedger: Record<string, string>;
};

export const DEFAULT_PROFILE: UserProfile = {
  locale: 'system',
  starredCurrencies: ['AUD', 'TWD'],
  lastUsedLedger: {},
};
