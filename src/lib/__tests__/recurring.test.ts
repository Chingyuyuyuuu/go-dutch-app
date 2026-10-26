import { addMonths, daysBetween } from '../date';
import type { Ledger, Recurring } from '../domain';
import {
  chargeAmount,
  chargeDate,
  chargesBefore,
  dueCharges,
  instalmentAmounts,
  instalmentSchedule,
  isFinished,
  monthlyFixedCosts,
  nextCharge,
  recurringSplitShares,
  sourceForName,
} from '../recurring';

const ME = 'me';

function rec(patch: Partial<Recurring>): Recurring {
  return {
    id: 'r1',
    ownerUid: ME,
    kind: 'regular',
    name: 'Netflix',
    amountMinor: 2299,
    ledgerId: 'living',
    categoryCode: 'subs',
    frequency: 'monthly',
    startDate: '2026-10-25',
    remindDayBefore: false,
    instalments: null,
    payerMemberId: null,
    source: null,
    paidCount: 0,
    createdAt: 0,
    ...patch,
  };
}

const member = (id: string, uid: string | null, leftAt: number | null = null) => ({
  id,
  uid,
  placeholderId: null,
  name: id,
  leftAt,
});

const living: Ledger = {
  id: 'living',
  name: 'Living',
  currency: 'AUD',
  kind: 'personal',
  status: 'active',
  ownerUid: ME,
  members: [member('m-me', ME)],
  memberUids: [ME],
  createdAt: 0,
};
const flat: Ledger = {
  ...living,
  id: 'flat',
  name: 'Flat',
  kind: 'shared',
  members: [member('c', 'chloe'), member('a', ME), member('b', 'amy')],
  memberUids: [ME, 'amy', 'chloe'],
};

describe('date helpers', () => {
  it('adds months from the start date, clamping to the month end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-03-10', -3)).toBe('2025-12-10');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-10-18', '2026-10-25')).toBe(7);
    expect(daysBetween('2026-10-25', '2026-10-18')).toBe(-7);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});

describe('charge dates', () => {
  it('steps by the frequency from the first charge', () => {
    expect(chargeDate('2026-10-25', 'weekly', 2)).toBe('2026-11-08');
    expect(chargeDate('2026-10-25', 'fortnightly', 3)).toBe('2026-12-06');
    expect(chargeDate('2026-10-31', 'monthly', 1)).toBe('2026-11-30');
    expect(chargeDate('2026-10-31', 'monthly', 2)).toBe('2026-12-31');
    expect(chargeDate('2026-10-25', 'yearly', 1)).toBe('2027-10-25');
  });
});

describe('instalments', () => {
  it('splits into equal payments with the remainder on the first', () => {
    expect(instalmentAmounts(8900, 4)).toEqual([2225, 2225, 2225, 2225]);
    expect(instalmentAmounts(10001, 4)).toEqual([2501, 2500, 2500, 2500]);
    expect(instalmentAmounts(3, 4)).toEqual([3, 0, 0, 0]);
  });

  it('lists the Afterpay schedule every 14 days', () => {
    const afterpay = rec({
      kind: 'instalment',
      amountMinor: 8903,
      instalments: 4,
      frequency: 'fortnightly',
    });
    expect(instalmentSchedule(afterpay)).toEqual([
      { seq: 0, date: '2026-10-25', amountMinor: 2228 },
      { seq: 1, date: '2026-11-08', amountMinor: 2225 },
      { seq: 2, date: '2026-11-22', amountMinor: 2225 },
      { seq: 3, date: '2026-12-06', amountMinor: 2225 },
    ]);
    expect(chargeAmount(afterpay, 0)).toBe(2228);
    expect(chargeAmount(afterpay, 3)).toBe(2225);
  });

  it('stops after the last payment', () => {
    const plan = rec({ kind: 'instalment', amountMinor: 8900, instalments: 4, frequency: 'fortnightly' });
    expect(isFinished({ ...plan, paidCount: 3 })).toBe(false);
    expect(isFinished({ ...plan, paidCount: 4 })).toBe(true);
    expect(nextCharge({ ...plan, paidCount: 4 })).toBeNull();
    expect(dueCharges(plan, '2027-06-01')).toHaveLength(4);
  });
});

describe('which charges are due', () => {
  it('counts charges before the day a payment is added as already paid', () => {
    const shoes = rec({
      kind: 'instalment',
      amountMinor: 8900,
      instalments: 4,
      frequency: 'fortnightly',
      startDate: '2026-10-09',
    });
    // 9/10 and 23/10 are past on 25/10: "Payment 2 of 4 · next 06/11".
    expect(chargesBefore(shoes, '2026-10-25')).toBe(2);
    expect(nextCharge({ ...shoes, paidCount: 2 })?.date).toBe('2026-11-06');
    expect(chargesBefore(rec({}), '2026-10-25')).toBe(0);
  });

  it('records today and any missed charges, oldest first', () => {
    const gym = rec({ frequency: 'weekly', startDate: '2026-10-01', paidCount: 1 });
    expect(dueCharges(gym, '2026-10-22').map((c) => c.date)).toEqual([
      '2026-10-08',
      '2026-10-15',
      '2026-10-22',
    ]);
    expect(dueCharges(gym, '2026-10-07')).toEqual([]);
  });
});

describe('recurring splits', () => {
  it('splits equally between current members, remainder by member key', () => {
    expect(recurringSplitShares(flat, 63001)).toEqual({ a: 21001, b: 21000, c: 21000 });
    const left = { ...flat, members: [...flat.members.slice(0, 2), member('b', 'amy', 5)] };
    expect(recurringSplitShares(left, 63001)).toEqual({ a: 31501, c: 31500 });
  });
});

describe('monthly fixed costs', () => {
  it('adds amount × charges a year / 12 per currency, my share only for splits', () => {
    const list = [
      rec({ id: 'netflix', amountMinor: 2299 }),
      rec({ id: 'gym', amountMinor: 1890, frequency: 'fortnightly' }),
      rec({ id: 'domain', amountMinor: 1200, frequency: 'yearly' }),
      rec({
        id: 'rent',
        kind: 'split',
        ledgerId: 'flat',
        amountMinor: 63000,
        frequency: 'weekly',
        payerMemberId: 'a',
      }),
      // Paid off, and someone else's: neither counts.
      rec({
        id: 'shoes',
        kind: 'instalment',
        amountMinor: 8900,
        instalments: 4,
        frequency: 'fortnightly',
        paidCount: 4,
      }),
      rec({ id: 'theirs', ownerUid: 'amy', amountMinor: 99999 }),
    ];
    // 2299×12 + 1890×26 + 1200×1 + 21000×52 = 27588 + 49140 + 1200 + 1092000 = 1169928 → /12 = 97494
    expect(monthlyFixedCosts(list, [living, flat], ME)).toEqual([
      { currency: 'AUD', monthlyMinor: 97494, count: 4 },
    ]);
  });
});

it('tags Apple ID subscriptions by name', () => {
  expect(sourceForName('Apple iCloud+')).toBe('apple');
  expect(sourceForName('Apple Music')).toBe('apple');
  expect(sourceForName('Pineapple box')).toBeNull();
});
