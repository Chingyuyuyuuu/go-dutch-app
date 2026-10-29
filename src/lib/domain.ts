import type { CategoryCode, CategorySet } from './categories';
import type { LocalDate } from './date';
import type { MinorUnits } from './money';

export type LedgerKind = 'personal' | 'shared';
export type LedgerStatus = 'active' | 'ended';

/**
 * A member of a ledger. `id` is a stable member key: entries point at it, so a
 * placeholder friend can later become a real user without rewriting entries.
 */
export type LedgerMember = {
  id: string;
  /** The account, or null while this is still a placeholder friend. */
  uid: string | null;
  placeholderId: string | null;
  /** Name shown to the other members. */
  name: string;
  /** Set when the member left (or deleted the ledger from their tabs). Their debts stay. */
  leftAt: number | null;
  /** When they joined from the share link (claimed this member or joined as a new one). */
  shareJoinedAt?: number | null;
};

/** Who last changed a ledger rate (server-recorded), for "Amy changed the JPY rate to 0.211". */
export type RateChange = { byUid: string | null; rate: string; at: number };

/** A pending request to join a shared ledger from its share page (spec §6B.3). */
export type JoinRequest = {
  id: string;
  uid: string;
  /** The requester's name when they asked. */
  name: string;
  /** The member without an account they say they are; null = a new member. */
  memberId: string | null;
  createdAt: number;
};

export type Ledger = {
  id: string;
  name: string;
  /** Settlement currency (ISO 4217): totals, balances and settling up. Fixed when the ledger is created. */
  currency: string;
  /** Currency a new entry starts in (e.g. JPY for a Japan trip settled in TWD). Missing: the settlement currency. */
  entryCurrency?: string | null;
  /** Which categories the grid shows. Missing: a ledger from before Phase 6 (au_life). */
  categorySet?: CategorySet;
  /** Ledger rates: currency -> rate string ("0.2102" = 1 JPY in the settlement currency). */
  rates?: Record<string, string>;
  /** Shared ledgers: who last changed each rate. */
  rateChanges?: Record<string, RateChange>;
  /** Shared ledgers: join requests from the share page waiting for an answer. */
  joinRequests?: JoinRequest[];
  kind: LedgerKind;
  status: LedgerStatus;
  ownerUid: string;
  members: LedgerMember[];
  /** Accounts that can currently see the ledger (members with a uid who have not left). */
  memberUids: string[];
  createdAt: number;
};

/** expense / income; repayment settles a debt between two members of a shared ledger. */
export type EntryType = 'expense' | 'income' | 'repayment';

/**
 * Where an entry's rate came from. same: paid in the settlement currency · ledger: the
 * ledger rate · manual: typed for this entry or derived from the amount actually paid ·
 * split: a personal copy of a shared entry (converted amount from the shared entry).
 */
export type FxSource = 'same' | 'ledger' | 'manual' | 'split';

export type Entry = {
  id: string;
  ledgerId: string;
  type: EntryType;
  isSplit: boolean;
  /** In the currency it was paid in (`currency`). */
  amountMinor: MinorUnits;
  /**
   * Phase 6 conversion. All missing means paid in the ledger's settlement currency
   * (entries from before Phase 6, or from a server without the Phase 6 migration).
   * Read them with entryCurrency / settledAmount / settledShares.
   */
  currency?: string;
  fxRate?: string;
  fxSource?: FxSource;
  /** amountMinor converted to the settlement currency (ISO minor units, TWD in cents). */
  amountSettleMinor?: MinorUnits;
  /** shares converted to the settlement currency; adds up to amountSettleMinor. */
  sharesSettle?: Record<string, MinorUnits> | null;
  categoryCode: CategoryCode;
  date: LocalDate;
  note: string;
  /** Shared ledgers: member who paid (expense, repayment) or received the money (income). */
  payerMemberId: string | null;
  /** Shared ledgers: member → share, adding up to the amount. A repayment has the one member paid back. */
  shares: Record<string, MinorUnits> | null;
  /** A repayment recorded by the person who was paid, on the payer's behalf. */
  recordedOnBehalf: boolean;
  /** Personal copy of a shared entry ("add every entry to my personal ledger"). */
  sourceEntryId: string | null;
  sourceLedgerId: string | null;
  /** Recorded automatically for a recurring payment: which one, and which charge (0 = first). */
  recurringId: string | null;
  recurringSeq: number | null;
  createdBy: string;
  lastEditedBy: string;
  createdAt: number;
  updatedAt: number;
};

export type NewEntry = Pick<Entry, 'type' | 'amountMinor' | 'categoryCode' | 'date' | 'note'> &
  Partial<
    Pick<
      Entry,
      | 'isSplit'
      | 'payerMemberId'
      | 'shares'
      | 'recordedOnBehalf'
      | 'sourceEntryId'
      | 'sourceLedgerId'
      | 'recurringId'
      | 'recurringSeq'
      | 'currency'
      | 'fxRate'
      | 'fxSource'
    >
  >;

/** How a member's share of a shared ledger reaches their personal ledger. */
export type ShareHandling = 'each' | 'never' | 'ask';

/** Per-user, per-ledger tab settings. Each member of a shared ledger has their own. */
export type LedgerPref = {
  starred: boolean;
  /** Manual position chosen by dragging. Lower comes first. */
  order: number;
  /** Shared ledgers only. */
  shareHandling?: ShareHandling;
  /** Shared ledgers only: the personal ledger my shares are added to (same settlement currency). */
  shareTargetLedgerId?: string | null;
};

export type Friend = { uid: string; name: string; starred: boolean };

/** A friend who is not on the app yet. Merged into their account when they join with its invite. */
export type PlaceholderFriend = { id: string; name: string; mergedUid: string | null; createdAt: number };

/** A general invite (any number of friends) or a placeholder friend's personal invite. */
export type Invite = { code: string; placeholderId: string | null; createdAt: number };

export type LocalePref = 'system' | 'zh-TW' | 'en-AU';

/** How often to be reminded to type in bank balances. */
export type BankReminder = 'weekly' | 'monthly';

/** Settings → Appearance. Hues are in ui/theme/palette. */
export const BG_THEMES = ['cream', 'butter', 'blush', 'mint', 'sky'] as const;
export const ACCENT_THEMES = ['marigold', 'terracotta', 'rose', 'plum', 'sea'] as const;
export const BUBBLE_OPACITIES = ['solid', 'semi', 'clear'] as const;
export type BgTheme = (typeof BG_THEMES)[number];
export type AccentTheme = (typeof ACCENT_THEMES)[number];
/** Entry bubbles and the shared balance card: solid, semi (frosted) or clear (outline only). */
export type BubbleOpacity = (typeof BUBBLE_OPACITIES)[number];

export type UserProfile = {
  /** Name friends see. Defaults to the start of the email address. */
  displayName: string;
  locale: LocalePref;
  starredCurrencies: string[];
  /** Before Phase 6: last personal ledger used per currency. Kept for older apps; no longer read. */
  lastUsedLedger: Record<string, string>;
  /** Last personal ledger used, so routing can put it first. */
  lastLedgerId: string | null;
  bankReminder: BankReminder;
  bgTheme: BgTheme;
  accentTheme: AccentTheme;
  bubbleOpacity: BubbleOpacity;
  /** Home background photo: a storage path (accounts) or a local file / data URI (demo). */
  homePhoto: string | null;
};

export const DEFAULT_PROFILE: UserProfile = {
  displayName: '',
  locale: 'system',
  starredCurrencies: ['TWD', 'JPY'],
  lastUsedLedger: {},
  lastLedgerId: null,
  bankReminder: 'weekly',
  bgTheme: 'cream',
  accentTheme: 'marigold',
  bubbleOpacity: 'solid',
  homePhoto: null,
};

export type Frequency = 'weekly' | 'fortnightly' | 'monthly' | 'yearly';

/**
 * regular: a subscription or direct debit in a personal ledger.
 * instalment: a total paid in `instalments` payments (Afterpay: 4, every 2 weeks).
 * split: added to a shared ledger each time and split equally between its members.
 */
export type RecurringKind = 'regular' | 'instalment' | 'split';

export type Recurring = {
  id: string;
  ownerUid: string;
  kind: RecurringKind;
  name: string;
  /** regular / split: each charge. instalment: the total. */
  amountMinor: MinorUnits;
  ledgerId: string;
  categoryCode: CategoryCode;
  frequency: Frequency;
  /** Date of the first charge. */
  startDate: LocalDate;
  remindDayBefore: boolean;
  /** instalment only. */
  instalments: number | null;
  /** split only: the member who pays each time. */
  payerMemberId: string | null;
  /** Shown as an "Apple ID" tag. */
  source: 'apple' | null;
  /** Charges already done: recorded automatically, or due before the payment was added. */
  paidCount: number;
  createdAt: number;
};

export type NewRecurring = Omit<Recurring, 'id' | 'ownerUid' | 'paidCount' | 'createdAt'>;

/** One "Update balance": the balance typed in and how much was not recorded since the last one. */
export type BalanceCheck = { date: LocalDate; balanceMinor: MinorUnits; gapMinor: MinorUnits; at: number };

/** A bank account without a bank connection: just a name, a currency and the ledgers it pays for. */
export type BankAccount = {
  id: string;
  name: string;
  currency: string;
  linkedLedgerIds: string[];
  /** Oldest first; the last one is the current balance. */
  checks: BalanceCheck[];
  createdAt: number;
};

/** Fields a personal entry leaves empty. */
export const PERSONAL_ENTRY_FIELDS = {
  isSplit: false,
  payerMemberId: null,
  shares: null,
  recordedOnBehalf: false,
  sourceEntryId: null,
  sourceLedgerId: null,
  recurringId: null,
  recurringSeq: null,
} satisfies Partial<Entry>;

/** The currency an entry was paid in. */
export function entryCurrency(entry: Pick<Entry, 'currency'>, ledger: Pick<Ledger, 'currency'>): string {
  return entry.currency ?? ledger.currency;
}

/** An entry's amount in the ledger's settlement currency: what totals and balances add up. */
export function settledAmount(entry: Pick<Entry, 'amountMinor' | 'amountSettleMinor'>): MinorUnits {
  return entry.amountSettleMinor ?? entry.amountMinor;
}

/** An entry's shares in the settlement currency. */
export function settledShares(
  entry: Pick<Entry, 'shares' | 'sharesSettle'>,
): Record<string, MinorUnits> | null {
  return entry.sharesSettle ?? entry.shares;
}

/** The ledger's category set; ledgers from before Phase 6 have none and keep the Australian set. */
export function ledgerCategorySet(ledger: Pick<Ledger, 'categorySet'>): CategorySet {
  return ledger.categorySet ?? 'au_life';
}

/** The members' rate for a currency in this ledger, if set. */
export function ledgerRate(ledger: Pick<Ledger, 'rates'>, currency: string): string | null {
  return ledger.rates?.[currency] ?? null;
}

/** The member who created the ledger (rounds down in shown shares and settle-ups), if still listed. */
export function ownerMemberId(ledger: Pick<Ledger, 'members' | 'ownerUid'>): string | null {
  return ledger.members.find((m) => m.uid === ledger.ownerUid)?.id ?? null;
}

/** The member row for an account, if it is an active member. */
export function memberForUid(ledger: Ledger, uid: string): LedgerMember | undefined {
  return ledger.members.find((m) => m.uid === uid && m.leftAt === null);
}
