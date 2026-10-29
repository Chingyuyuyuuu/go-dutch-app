import { memberNets, settleUpTransfers } from '@/lib/balances';

import { parseSharedLedger } from '../share';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot use import
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/** What get_shared_ledger returns (see supabase/tests/share.test.mjs). */
const page = {
  ledger: { id: 'trip', name: 'Osaka', currency: 'TWD', status: 'active', ownerMemberId: 'm-me' },
  members: [
    { id: 'm-me', name: 'Winnie', hasAccount: true, left: false, claimPending: false },
    { id: 'm-amy', name: 'Amy', hasAccount: true, left: false, claimPending: false },
    { id: 'm-dad', name: 'Dad', hasAccount: false, left: false, claimPending: true },
  ],
  entries: [
    {
      id: 'e1',
      type: 'expense',
      isSplit: true,
      amountMinor: 10000,
      currency: 'JPY',
      fxRate: '0.2102000000',
      fxSource: 'ledger',
      amountSettleMinor: 210200,
      shares: { 'm-me': 3334, 'm-amy': 3333, 'm-dad': 3333 },
      sharesSettle: { 'm-me': 70081, 'm-amy': 70060, 'm-dad': 70059 },
      payerMemberId: 'm-amy',
      categoryCode: 'drugstore',
      date: '2026-10-27',
      note: 'Matsukiyo',
      recordedOnBehalf: false,
      createdAt: '2026-10-27T03:00:00+00:00',
    },
    // From a newer app version: skipped.
    { id: 'e2', type: 'expense', categoryCode: 'not-a-category', amountMinor: 1 },
  ],
};

describe('parseSharedLedger', () => {
  it('reads the share page into app shapes', () => {
    const view = parseSharedLedger(page);
    expect(view?.ledger).toEqual({
      id: 'trip',
      name: 'Osaka',
      currency: 'TWD',
      ended: false,
      ownerMemberId: 'm-me',
    });
    expect(view?.members[2]).toEqual({
      id: 'm-dad',
      name: 'Dad',
      hasAccount: false,
      left: false,
      claimPending: true,
    });
    expect(view?.entries).toHaveLength(1);
    expect(view?.entries[0]).toMatchObject({
      ledgerId: 'trip',
      currency: 'JPY',
      fxRate: '0.2102',
      amountSettleMinor: 210200,
      payerMemberId: 'm-amy',
      createdAt: Date.parse('2026-10-27T03:00:00Z'),
    });
  });

  it('gives the same balances as the app', () => {
    const view = parseSharedLedger(page);
    const net = memberNets(view?.entries ?? []);
    expect(settleUpTransfers(net, 'm-me', 'TWD')).toEqual([
      { from: 'm-me', to: 'm-amy', amount: 70000 },
      { from: 'm-dad', to: 'm-amy', amount: 70100 },
    ]);
  });

  it('is null for anything that is not a share page', () => {
    expect(parseSharedLedger(null)).toBeNull();
    expect(parseSharedLedger({ members: [] })).toBeNull();
  });
});
