import type { BalanceEntry } from '../balances';
import type { Ledger, LedgerMember } from '../domain';
import { canAnswerJoinRequests, involves, joinRequestsToAnswer, ledgerNotices, memberTotals } from '../share';

const member = (id: string, uid: string | null, extra: Partial<LedgerMember> = {}): LedgerMember => ({
  id,
  uid,
  placeholderId: null,
  name: id,
  leftAt: null,
  ...extra,
});

const ledger = (members: LedgerMember[], extra: Partial<Ledger> = {}) => ({
  ownerUid: 'me',
  members,
  rateChanges: {},
  joinRequests: [{ id: 'r1', uid: 'kai', name: 'Kai', memberId: null, createdAt: 5 }],
  ...extra,
});

describe('ledgerNotices', () => {
  const trip = ledger(
    [member('m-me', 'me'), member('m-amy', 'amy'), member('m-ben', 'ben', { shareJoinedAt: 30 })],
    {
      rateChanges: {
        JPY: { byUid: 'amy', rate: '0.211', at: 20 },
        KRW: { byUid: 'me', rate: '0.0235', at: 25 },
        USD: { byUid: 'amy', rate: '31.5', at: 5 },
      },
    },
  );

  it("lists other members' rate changes and share-link joins since I last looked, oldest first", () => {
    expect(ledgerNotices(trip, 'me', 10)).toEqual([
      { kind: 'rate', currency: 'JPY', rate: '0.211', byUid: 'amy', at: 20 },
      { kind: 'joined', memberId: 'm-ben', at: 30 },
    ]);
  });

  it('leaves out my own changes and older ones', () => {
    expect(ledgerNotices(trip, 'me', 30)).toEqual([]);
    expect(ledgerNotices(trip, 'ben', 0).map((n) => n.kind)).toEqual(['rate', 'rate', 'rate']);
  });
});

describe('join requests', () => {
  it('are answered by the creator, or by anyone once the creator left', () => {
    const active = ledger([member('m-me', 'me'), member('m-amy', 'amy')]);
    expect(canAnswerJoinRequests(active, 'me')).toBe(true);
    expect(canAnswerJoinRequests(active, 'amy')).toBe(false);
    expect(joinRequestsToAnswer(active, 'amy')).toEqual([]);
    expect(joinRequestsToAnswer(active, 'me')).toHaveLength(1);

    const ownerLeft = ledger([member('m-me', 'me', { leftAt: 1 }), member('m-amy', 'amy')]);
    expect(canAnswerJoinRequests(ownerLeft, 'amy')).toBe(true);
    expect(canAnswerJoinRequests(ownerLeft, 'me')).toBe(false);
  });
});

describe('share page totals', () => {
  const entries: BalanceEntry[] = [
    // ¥10,000 paid by Amy, converted NT$2,102.00.
    {
      type: 'expense',
      amountMinor: 10000,
      payerMemberId: 'amy',
      shares: { me: 3334, amy: 3333, dad: 3333 },
      amountSettleMinor: 210200,
      sharesSettle: { me: 70081, amy: 70060, dad: 70059 },
    },
    { type: 'expense', amountMinor: 30000, payerMemberId: 'me', shares: { me: 15000, amy: 15000 } },
    { type: 'repayment', amountMinor: 5000, payerMemberId: 'dad', shares: { amy: 5000 } },
  ];

  it('adds up what a member paid and their share, in the settlement currency', () => {
    expect(memberTotals(entries, 'amy')).toEqual({ paid: 210200, share: 85060 });
    expect(memberTotals(entries, 'dad')).toEqual({ paid: 0, share: 70059 });
  });

  it('finds the entries a member is part of', () => {
    expect(entries.filter((e) => involves(e, 'dad'))).toHaveLength(2);
    expect(entries.filter((e) => involves(e, 'ben'))).toHaveLength(0);
  });
});
