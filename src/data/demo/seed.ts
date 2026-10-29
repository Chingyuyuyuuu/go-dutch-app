import type { Messages } from '@/i18n/en-AU';
import type { CategoryCode } from '@/lib/categories';
import { addDays, addMonths, daysBetween, startOfMonth, type LocalDate } from '@/lib/date';
import {
  DEFAULT_PROFILE,
  PERSONAL_ENTRY_FIELDS,
  type BankAccount,
  type Entry,
  type Ledger,
  type LedgerMember,
  type Recurring,
} from '@/lib/domain';
import { entryTypeFor } from '@/lib/ledgers';

import type { LocalState } from '../local/LocalStore';

export const DEMO_UID = 'demo-user';
const AMY = 'demo-amy';
const BEN = 'demo-ben';
const CHLOE = 'demo-chloe';

/** Sample data from the design handoff, dated relative to today. Names use the current UI language. */
export function seedDemo(today: LocalDate, names: Messages['demo'], now = Date.now()): LocalState {
  const member = (id: string, uid: string | null, name: string): LedgerMember => ({
    id,
    uid,
    placeholderId: null,
    name,
    leftAt: null,
  });
  const ledger = (
    id: string,
    name: string,
    currency: string,
    createdAt: number,
    members?: LedgerMember[],
  ): Ledger => {
    const list = members ?? [member(`${id}-me`, DEMO_UID, names.me)];
    return {
      id,
      name,
      currency,
      kind: members ? 'shared' : 'personal',
      status: 'active',
      ownerUid: DEMO_UID,
      members: list,
      memberUids: list.filter((m) => m.uid).map((m) => m.uid as string),
      createdAt,
    };
  };
  const japanMembers = [
    member('japan-me', DEMO_UID, names.me),
    member('japan-amy', AMY, 'Amy'),
    member('japan-ben', BEN, 'Ben'),
  ];
  const flatMembers = [
    member('flat-me', DEMO_UID, names.me),
    member('flat-amy', AMY, 'Amy'),
    member('flat-chloe', CHLOE, 'Chloe'),
  ];
  const ledgers = [
    ledger('living', names.living, 'AUD', now - 5),
    ledger('japan', names.japan, 'JPY', now - 4, japanMembers),
    ledger('travel', names.travel, 'AUD', now - 3),
    {
      ...ledger('flat', names.flat, 'AUD', now - 2, flatMembers),
      // After "last seen" below, so the "Amy changed the rate" notice (Phase 6) shows once.
      rates: { NZD: '0.91' },
      rateChanges: { NZD: { byUid: AMY, rate: '0.91', at: now + 1 } },
    },
    ledger('yen', names.yenWallet, 'JPY', now - 1),
  ];

  let seq = 0;
  const entry = (
    ledgerId: string,
    daysAgo: number,
    categoryCode: CategoryCode,
    amountMinor: number,
    note: string,
    split?: { payer: string; shares: Record<string, number>; by?: string; editedBy?: string },
  ): Entry => {
    seq += 1;
    const createdAt = now - seq * 60_000;
    return {
      ...PERSONAL_ENTRY_FIELDS,
      id: `demo-${seq}`,
      ledgerId,
      type: entryTypeFor(categoryCode),
      amountMinor,
      categoryCode,
      date: addDays(today, -daysAgo),
      note,
      ...(split && { isSplit: true, payerMemberId: split.payer, shares: split.shares }),
      createdBy: split?.by ?? DEMO_UID,
      lastEditedBy: split?.editedBy ?? split?.by ?? DEMO_UID,
      createdAt,
      updatedAt: createdAt,
    };
  };
  const recurring = (
    id: string,
    name: string,
    amountMinor: number,
    categoryCode: CategoryCode,
    frequency: Recurring['frequency'],
    startInDays: number,
    extra: Partial<Recurring> = {},
  ): Recurring => ({
    id: `demo-${id}`,
    ownerUid: DEMO_UID,
    kind: 'regular',
    name,
    amountMinor,
    ledgerId: 'living',
    categoryCode,
    frequency,
    startDate: addDays(today, startInDays),
    remindDayBefore: false,
    instalments: null,
    payerMemberId: null,
    source: null,
    paidCount: 0,
    createdAt: now - 100,
    ...extra,
  });
  /** Last month and the month before, for the monthly check (amounts from the design). */
  const history = (): Entry[] => {
    const lastMonth = addMonths(startOfMonth(today), -1);
    const monthBefore = addMonths(lastMonth, -1);
    const rows: [CategoryCode, number, number][] = [
      ['rent', 252000, 252000],
      ['groceries', 41230, 38890],
      ['dining', 28600, 34150],
      ['shopping', 18900, 6200],
      ['opal', 8400, 9600],
      ['subs', 6436, 6436],
      ['coffee', 5800, 5100],
    ];
    const daysAgo = (date: LocalDate) => daysBetween(date, today);
    return rows.flatMap(([code, last, before], i) => [
      entry('living', daysAgo(addDays(lastMonth, 2 + i * 3)), code, last, ''),
      entry('living', daysAgo(addDays(monthBefore, 3 + i * 3)), code, before, ''),
    ]);
  };
  const bank = (
    id: string,
    name: string,
    currency: string,
    linkedLedgerIds: string[],
    updatedInDays: number,
    balanceMinor: number,
  ): BankAccount => ({
    id: `demo-${id}`,
    name,
    currency,
    linkedLedgerIds,
    checks: [
      {
        date: addDays(today, updatedInDays),
        balanceMinor,
        gapMinor: 0,
        at: now + updatedInDays * 86_400_000,
      },
    ],
    createdAt: now - 100,
  });
  /** Equal thirds (the sample amounts divide evenly). */
  const thirds = (prefix: string, a: string, b: string, total: number) => ({
    [`${prefix}-me`]: total / 3,
    [`${prefix}-${a}`]: total / 3,
    [`${prefix}-${b}`]: total / 3,
  });

  return {
    profile: {
      ...DEFAULT_PROFILE,
      displayName: names.me,
      starredCurrencies: ['AUD', 'JPY', 'TWD'],
      lastUsedLedger: { AUD: 'living', JPY: 'yen' },
    },
    ledgers,
    prefs: {
      living: { starred: true, order: 0 },
      japan: { starred: true, order: 1, shareHandling: 'ask' },
      travel: { starred: false, order: 2 },
      flat: { starred: false, order: 3, shareHandling: 'ask' },
      yen: { starred: false, order: 4 },
    },
    entries: {
      japan: [
        entry('japan', 0, 'dining', 4800, names.ramen, {
          payer: 'japan-amy',
          shares: thirds('japan', 'amy', 'ben', 4800),
          by: AMY,
        }),
        entry('japan', 1, 'transport', 6000, names.suica, {
          payer: 'japan-me',
          shares: thirds('japan', 'amy', 'ben', 6000),
          editedBy: BEN,
        }),
        entry('japan', 1, 'refund', 9000, names.hotelRefund, {
          payer: 'japan-ben',
          shares: thirds('japan', 'amy', 'ben', 9000),
          by: BEN,
        }),
        entry('japan', 2, 'housing', 36000, names.kyoto, {
          payer: 'japan-amy',
          shares: thirds('japan', 'amy', 'ben', 36000),
          by: AMY,
        }),
      ],
      living: [
        // Recorded today by the Netflix recurring payment.
        { ...entry('living', 0, 'subs', 2299, names.netflix), recurringId: 'demo-netflix', recurringSeq: 0 },
        entry('living', 0, 'coffee', 580, names.flatWhite),
        entry('living', 0, 'groceries', 5250, names.woolies),
        entry('living', 1, 'opal', 420, names.opalTopUp),
        entry('living', 1, 'salary', 420000, names.pay),
        entry('living', 2, 'shopping', 8900, names.shoes),
        entry('living', 2, 'dining', 3600, names.thai),
        entry('living', 3, 'rent', 105000, names.rent),
        ...history(),
      ],
      travel: [entry('travel', 5, 'travel', 41200, names.flights)],
      flat: [
        entry('flat', 3, 'bills', 12600, names.electricity, {
          payer: 'flat-me',
          shares: thirds('flat', 'amy', 'chloe', 12600),
        }),
        entry('flat', 6, 'rent', 63000, names.rent, {
          payer: 'flat-me',
          shares: thirds('flat', 'amy', 'chloe', 63000),
        }),
      ],
      yen: [entry('yen', 6, 'groceries', 1200, names.konbini)],
    },
    friends: [
      { uid: AMY, name: 'Amy', starred: true },
      { uid: BEN, name: 'Ben', starred: false },
      { uid: CHLOE, name: 'Chloe', starred: false },
    ],
    placeholders: [{ id: 'demo-dad', name: names.dad, mergedUid: null, createdAt: now - 10 }],
    invites: [],
    recurring: [
      recurring('netflix', names.netflix, 2299, 'subs', 'monthly', 0, { paidCount: 1 }),
      recurring('icloud', names.icloud, 449, 'subs', 'monthly', 14, { source: 'apple' }),
      recurring('music', names.music, 1299, 'subs', 'monthly', 18, { source: 'apple' }),
      recurring('spotify', names.spotify, 1399, 'subs', 'monthly', 9),
      recurring('phone', names.phone, 3500, 'bills', 'monthly', 20),
      recurring('gym', names.gym, 1890, 'health', 'fortnightly', 5),
      // Bought 16 days ago: payments 1 and 2 are done, the next is in 12 days.
      recurring('shoes', names.shoes, 8900, 'shopping', 'fortnightly', -16, {
        kind: 'instalment',
        instalments: 4,
        paidCount: 2,
        remindDayBefore: true,
      }),
      recurring('rent', names.rent, 63000, 'rent', 'weekly', 1, {
        kind: 'split',
        ledgerId: 'flat',
        payerMemberId: 'flat-me',
      }),
      recurring('internet', names.internet, 7500, 'bills', 'monthly', 7, {
        kind: 'split',
        ledgerId: 'flat',
        payerMemberId: 'flat-me',
      }),
    ],
    banks: [
      bank('cba', names.commbank, 'AUD', ['living'], -7, 234018),
      bank('taishin', names.taishin, 'TWD', [], -3, 4820000),
    ],
    // Amy's ramen (the newest entry) is after "last seen", so it shows as new.
    seen: { japan: now - 90_000, flat: now, living: now, travel: now, yen: now },
  };
}
