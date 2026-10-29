import { PERSONAL_ENTRY_FIELDS, type Entry, type Ledger } from '../domain';
import {
  entryTypeFor,
  groupByDay,
  lastPersonalLedgerId,
  moveItem,
  orderLedgers,
  routePersonalEntry,
  summarise,
} from '../ledgers';

const ledger = (id: string, overrides: Partial<Ledger> = {}): Ledger => ({
  id,
  name: id,
  currency: 'AUD',
  kind: 'personal',
  status: 'active',
  ownerUid: 'me',
  members: [],
  memberUids: ['me'],
  createdAt: 0,
  ...overrides,
});

const entry = (id: string, overrides: Partial<Entry> = {}): Entry => ({
  ...PERSONAL_ENTRY_FIELDS,
  id,
  ledgerId: 'living',
  type: 'expense',
  isSplit: false,
  amountMinor: 100,
  categoryCode: 'dining',
  date: '2026-10-25',
  note: '',
  createdBy: 'me',
  lastEditedBy: 'me',
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('orderLedgers', () => {
  it('puts starred first, then manual order, ended last', () => {
    const ledgers = [
      ledger('a', { createdAt: 1 }),
      ledger('b', { createdAt: 2 }),
      ledger('c', { createdAt: 3, status: 'ended' }),
      ledger('d', { createdAt: 4 }),
    ];
    const prefs = {
      a: { starred: false, order: 2 },
      b: { starred: false, order: 1 },
      c: { starred: true, order: 0 },
      d: { starred: true, order: 3 },
    };
    expect(orderLedgers(ledgers, prefs).map((l) => l.id)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('puts ledgers without a position last, oldest first', () => {
    const ledgers = [
      ledger('new', { createdAt: 9 }),
      ledger('old', { createdAt: 1 }),
      ledger('placed', { createdAt: 5 }),
    ];
    expect(orderLedgers(ledgers, { placed: { starred: false, order: 0 } }).map((l) => l.id)).toEqual([
      'placed',
      'old',
      'new',
    ]);
  });
});

describe('moveItem', () => {
  it('moves an item to a new index', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b', 'c'], 1, 9)).toEqual(['a', 'c', 'b']);
  });
});

describe('routePersonalEntry', () => {
  const ledgers = [
    ledger('living'),
    ledger('travel'),
    ledger('yen', { currency: 'JPY' }),
    ledger('flat', { kind: 'shared' }),
    ledger('old', { status: 'ended' }),
  ];

  it('asks to create a ledger when there is no personal ledger', () => {
    expect(routePersonalEntry({ ledgers: [ledger('flat', { kind: 'shared' })] })).toEqual({ kind: 'none' });
  });

  it('uses the only personal ledger automatically, whatever the currency', () => {
    expect(
      routePersonalEntry({
        ledgers: [ledger('yen', { currency: 'JPY' }), ledger('old', { status: 'ended' })],
      }),
    ).toEqual({ kind: 'auto', ledgerId: 'yen' });
  });

  it('lets the user choose between all personal ledgers with last used first', () => {
    expect(routePersonalEntry({ ledgers, lastLedgerId: 'yen' })).toEqual({
      kind: 'choose',
      ledgerIds: ['yen', 'living', 'travel'],
      defaultId: 'yen',
    });
  });

  it('ignores a last used ledger that is gone', () => {
    expect(routePersonalEntry({ ledgers, lastLedgerId: 'old' })).toMatchObject({ defaultId: 'living' });
  });

  it('skips the question when started from a personal tab', () => {
    expect(routePersonalEntry({ ledgers, fixedLedgerId: 'yen' })).toEqual({ kind: 'auto', ledgerId: 'yen' });
  });

  it('never uses a shared tab as the fixed ledger', () => {
    expect(routePersonalEntry({ ledgers, fixedLedgerId: 'flat' }).kind).toBe('choose');
  });

  it('limits the choice to one settlement currency when asked', () => {
    expect(routePersonalEntry({ ledgers, currency: 'JPY' })).toEqual({ kind: 'auto', ledgerId: 'yen' });
    expect(routePersonalEntry({ ledgers, currency: 'NZD' })).toEqual({ kind: 'none' });
    expect(routePersonalEntry({ ledgers, currency: 'AUD', fixedLedgerId: 'yen' })).toMatchObject({
      kind: 'choose',
      ledgerIds: ['living', 'travel'],
    });
  });
});

describe('lastPersonalLedgerId', () => {
  const ledgers = [ledger('living'), ledger('yen', { currency: 'JPY' }), ledger('old', { status: 'ended' })];

  it('uses lastLedgerId when it still exists', () => {
    expect(lastPersonalLedgerId({ lastLedgerId: 'yen', lastUsedLedger: { AUD: 'living' } }, ledgers)).toBe(
      'yen',
    );
  });

  it('falls back to the old per-currency map', () => {
    expect(
      lastPersonalLedgerId({ lastLedgerId: null, lastUsedLedger: { NZD: 'gone', AUD: 'living' } }, ledgers),
    ).toBe('living');
    expect(lastPersonalLedgerId({ lastLedgerId: 'old', lastUsedLedger: {} }, ledgers)).toBeNull();
  });
});

describe('summarise and groupByDay', () => {
  const entries = [
    entry('1', { amountMinor: 580, date: '2026-10-25', createdAt: 1 }),
    entry('2', { amountMinor: 5250, date: '2026-10-25', createdAt: 2 }),
    entry('3', { type: 'income', categoryCode: 'salary', amountMinor: 420000, date: '2026-10-24' }),
    entry('4', { amountMinor: 420, date: '2026-10-24' }),
  ];

  it('totals spent, income and balance', () => {
    expect(summarise(entries)).toEqual({ spent: 6250, income: 420000, balance: 413750 });
  });

  it('groups newest day first with the day spent total', () => {
    const groups = groupByDay(entries);
    expect(groups.map((g) => [g.date, g.spent])).toEqual([
      ['2026-10-25', 5830],
      ['2026-10-24', 420],
    ]);
    expect(groups[0].entries.map((e) => e.id)).toEqual(['2', '1']);
  });

  it('derives the entry type from the category', () => {
    expect(entryTypeFor('salary')).toBe('income');
    expect(entryTypeFor('rent')).toBe('expense');
  });
});
