import { addCheck, isUpdateDue, MAX_CHECKS, nextUpdateDue, reconcile } from '../banks';
import type { BankAccount, Entry } from '../domain';
import { PERSONAL_ENTRY_FIELDS } from '../domain';
import { compareMonths, lastCompletedMonth } from '../monthly';

let n = 0;
function entry(patch: Partial<Entry>): Entry {
  n += 1;
  return {
    ...PERSONAL_ENTRY_FIELDS,
    id: `e${n}`,
    ledgerId: 'living',
    type: 'expense',
    amountMinor: 1000,
    categoryCode: 'groceries',
    date: '2026-10-20',
    note: '',
    createdBy: 'me',
    lastEditedBy: 'me',
    createdAt: n,
    updatedAt: n,
    ...patch,
  };
}

const bank = (checks: BankAccount['checks']): BankAccount => ({
  id: 'cba',
  name: 'CommBank',
  currency: 'AUD',
  linkedLedgerIds: ['living'],
  checks,
  createdAt: 0,
});

describe('bank reconciliation', () => {
  const previous = { date: '2026-10-18', balanceMinor: 234018, gapMinor: 0, at: 0 };

  it('finds money that left the account without an entry', () => {
    const entries = [
      entry({ amountMinor: 30000, date: '2026-10-19' }),
      entry({ amountMinor: 12000, date: '2026-10-25' }),
      // Before the last check, another ledger, a future date: not counted.
      entry({ amountMinor: 999, date: '2026-10-18' }),
      entry({ amountMinor: 999, ledgerId: 'travel' }),
      entry({ amountMinor: 999, date: '2026-10-26' }),
    ];
    // Balance went down 500.00, 420.00 recorded → 80.00 not recorded.
    expect(
      reconcile({ previous, newBalance: 184018, entries, linkedLedgerIds: ['living'], today: '2026-10-25' }),
    ).toEqual({ drop: 50000, recorded: 42000, gap: 8000, missing: 8000 });
  });

  it('nets recorded income against expenses', () => {
    const entries = [
      entry({ amountMinor: 42000 }),
      entry({ type: 'income', categoryCode: 'salary', amountMinor: 420000 }),
    ];
    // Pay came in: balance went up 3,700.00, recorded net income 3,780.00 → 80.00 missing.
    expect(
      reconcile({ previous, newBalance: 604018, entries, linkedLedgerIds: ['living'], today: '2026-10-25' }),
    ).toEqual({ drop: -370000, recorded: -378000, gap: 8000, missing: 8000 });
  });

  it('says everything is recorded when the gap is zero or less', () => {
    const r = reconcile({
      previous,
      newBalance: 234018 - 1000,
      entries: [entry({ amountMinor: 1500 })],
      linkedLedgerIds: ['living'],
      today: '2026-10-25',
    });
    expect(r.gap).toBe(-500);
    expect(r.missing).toBe(0);
  });

  it('is due a week or a month after the last update', () => {
    expect(isUpdateDue(bank([]), 'weekly', '2026-10-25')).toBe(true);
    expect(nextUpdateDue(bank([previous]), 'weekly')).toBe('2026-10-25');
    expect(isUpdateDue(bank([previous]), 'weekly', '2026-10-24')).toBe(false);
    expect(isUpdateDue(bank([previous]), 'weekly', '2026-10-25')).toBe(true);
    expect(nextUpdateDue(bank([previous]), 'monthly')).toBe('2026-11-18');
  });

  it('keeps a limited history of checks', () => {
    let checks: BankAccount['checks'] = [];
    for (let i = 0; i < MAX_CHECKS + 3; i++) checks = addCheck(checks, { ...previous, at: i });
    expect(checks).toHaveLength(MAX_CHECKS);
    expect(checks[checks.length - 1].at).toBe(MAX_CHECKS + 2);
  });
});

describe('monthly check', () => {
  it('compares the last completed month with the one before, by category', () => {
    expect(lastCompletedMonth({ year: 2026, month: 10 })).toEqual({ year: 2026, month: 9 });
    expect(lastCompletedMonth({ year: 2026, month: 1 })).toEqual({ year: 2025, month: 12 });
    const entries = [
      entry({ date: '2026-09-01', categoryCode: 'rent', amountMinor: 252000 }),
      entry({ date: '2026-08-31', categoryCode: 'rent', amountMinor: 252000 }),
      entry({ date: '2026-09-30', categoryCode: 'dining', amountMinor: 2860 }),
      entry({ date: '2026-08-10', categoryCode: 'dining', amountMinor: 3415 }),
      entry({ date: '2026-08-10', categoryCode: 'opal', amountMinor: 960 }),
      // Income, repayments and other months are left out.
      entry({ date: '2026-09-15', type: 'income', categoryCode: 'salary', amountMinor: 999 }),
      entry({ date: '2026-10-01', categoryCode: 'dining', amountMinor: 999 }),
      entry({ date: '2026-07-31', categoryCode: 'dining', amountMinor: 999 }),
    ];
    expect(compareMonths(entries, { year: 2026, month: 9 })).toEqual({
      total: 254860,
      previousTotal: 256375,
      rows: [
        { code: 'rent', amount: 252000, previous: 252000 },
        { code: 'dining', amount: 2860, previous: 3415 },
        { code: 'opal', amount: 0, previous: 960 },
      ],
    });
  });
});
