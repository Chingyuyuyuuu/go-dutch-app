import type { Messages } from '@/i18n/en-AU';
import type { CategoryCode } from '@/lib/categories';
import { addDays, type LocalDate } from '@/lib/date';
import { DEFAULT_PROFILE, type Entry, type Ledger } from '@/lib/domain';
import { entryTypeFor } from '@/lib/ledgers';

import type { LocalState } from '../local/LocalStore';

export const DEMO_UID = 'demo-user';

/** Sample data from the design handoff, dated relative to today. Names use the current UI language. */
export function seedDemo(today: LocalDate, names: Messages['demo'], now = Date.now()): LocalState {
  const ledger = (id: string, name: string, currency: string, createdAt: number): Ledger => ({
    id,
    name,
    currency,
    kind: 'personal',
    status: 'active',
    ownerUid: DEMO_UID,
    memberUids: [DEMO_UID],
    createdAt,
  });
  const ledgers = [
    ledger('living', names.living, 'AUD', now - 3),
    ledger('travel', names.travel, 'AUD', now - 2),
    ledger('yen', names.yenWallet, 'JPY', now - 1),
  ];

  let seq = 0;
  const entry = (
    ledgerId: string,
    daysAgo: number,
    categoryCode: CategoryCode,
    amountMinor: number,
    note: string,
  ): Entry => {
    seq += 1;
    return {
      id: `demo-${seq}`,
      ledgerId,
      type: entryTypeFor(categoryCode),
      isSplit: false,
      amountMinor,
      categoryCode,
      date: addDays(today, -daysAgo),
      note,
      createdBy: DEMO_UID,
      lastEditedBy: DEMO_UID,
      createdAt: now - seq * 1000,
      updatedAt: now - seq * 1000,
    };
  };

  return {
    profile: {
      ...DEFAULT_PROFILE,
      starredCurrencies: ['AUD', 'JPY', 'TWD'],
      lastUsedLedger: { AUD: 'living', JPY: 'yen' },
    },
    ledgers,
    prefs: {
      living: { starred: true, order: 0 },
      travel: { starred: false, order: 1 },
      yen: { starred: false, order: 2 },
    },
    entries: {
      living: [
        entry('living', 0, 'subs', 2299, names.netflix),
        entry('living', 0, 'coffee', 580, names.flatWhite),
        entry('living', 0, 'groceries', 5250, names.woolies),
        entry('living', 1, 'opal', 420, names.opalTopUp),
        entry('living', 1, 'salary', 420000, names.pay),
        entry('living', 2, 'shopping', 8900, names.shoes),
        entry('living', 2, 'dining', 3600, names.thai),
        entry('living', 3, 'rent', 105000, names.rent),
      ],
      travel: [entry('travel', 5, 'travel', 41200, names.flights)],
      yen: [entry('yen', 6, 'groceries', 1200, names.konbini)],
    },
  };
}
