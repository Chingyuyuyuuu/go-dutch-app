import type { BankAccount, Ledger, Recurring } from '../domain';
import { planReminders } from '../reminders';

const ME = 'me';
const ledger = (id: string, patch: Partial<Ledger> = {}): Ledger => ({
  id,
  name: id,
  currency: 'AUD',
  kind: 'personal',
  status: 'active',
  ownerUid: ME,
  members: [],
  memberUids: [ME],
  createdAt: 0,
  ...patch,
});

function rec(patch: Partial<Recurring>): Recurring {
  return {
    id: 'netflix',
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

const plan = (
  recurring: Recurring[],
  opts: { banks?: BankAccount[]; hourNow?: number; today?: string; ledgers?: Ledger[] } = {},
) =>
  planReminders({
    recurring,
    ledgers: opts.ledgers ?? [ledger('living'), ledger('flat', { kind: 'shared' })],
    banks: opts.banks ?? [],
    bankReminder: 'weekly',
    uid: ME,
    today: opts.today ?? '2026-10-24',
    hourNow: opts.hourNow ?? 7,
  });

describe('planned reminders', () => {
  it('announces each upcoming charge at 9:00 on the day', () => {
    const out = plan([rec({})]);
    expect(out.map((r) => `${r.kind} ${r.date} ${r.hour}`)).toEqual([
      'charged 2026-10-25 9',
      'charged 2026-11-25 9',
    ]);
  });

  it('reminds the day before at 8:00 when asked, and skips times already past', () => {
    const afterpay = rec({
      id: 'shoes',
      kind: 'instalment',
      amountMinor: 8900,
      instalments: 4,
      frequency: 'fortnightly',
      remindDayBefore: true,
    });
    // 8:00 today has passed at 9 o'clock: the reminder for tomorrow's payment is not scheduled.
    const out = plan([afterpay], { hourNow: 9 });
    expect(out.filter((r) => r.kind === 'dayBefore').map((r) => r.date)).toEqual([
      '2026-11-07',
      '2026-11-21',
      '2026-12-05',
    ]);
    expect(out.filter((r) => r.kind === 'charged')).toHaveLength(4);
  });

  it('stops after the last instalment and skips paid ones', () => {
    const afterpay = rec({
      kind: 'instalment',
      amountMinor: 8900,
      instalments: 4,
      frequency: 'fortnightly',
      paidCount: 3,
    });
    const out = plan([afterpay], { today: '2026-11-30' });
    expect(out.map((r) => r.date)).toEqual(['2026-12-06']);
    expect(out[0].kind === 'charged' && out[0].seq).toBe(3);
  });

  it('leaves out splits (members are told by the shared ledger), others’ payments and ended ledgers', () => {
    const out = plan(
      [
        rec({ id: 'rent', kind: 'split', ledgerId: 'flat', payerMemberId: 'x', remindDayBefore: true }),
        rec({ id: 'theirs', ownerUid: 'amy' }),
        rec({ id: 'old', ledgerId: 'ended' }),
      ],
      { ledgers: [ledger('flat', { kind: 'shared' }), ledger('ended', { status: 'ended' })] },
    );
    expect(out.map((r) => `${r.kind} ${r.key}`)).toEqual([
      'dayBefore dayBefore:rent:0',
      'dayBefore dayBefore:rent:1',
    ]);
  });

  it('reminds to update a bank balance a week after the last update', () => {
    const banks: BankAccount[] = [
      {
        id: 'cba',
        name: 'CommBank',
        currency: 'AUD',
        linkedLedgerIds: [],
        checks: [{ date: '2026-10-20', balanceMinor: 1, gapMinor: 0, at: 0 }],
        createdAt: 0,
      },
      { id: 'new', name: 'ING', currency: 'AUD', linkedLedgerIds: [], checks: [], createdAt: 0 },
    ];
    expect(plan([], { banks })).toEqual([
      { kind: 'bank', key: 'bank:cba:2026-10-27', date: '2026-10-27', hour: 10, bankId: 'cba' },
    ]);
  });
});
