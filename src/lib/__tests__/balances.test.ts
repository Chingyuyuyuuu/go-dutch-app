import { allocateShares, memberNets, simplifyDebts, spentShare, type BalanceEntry } from '../balances';

const expense = (payer: string, shares: Record<string, number>): BalanceEntry => ({
  type: 'expense',
  amountMinor: Object.values(shares).reduce((a, b) => a + b, 0),
  payerMemberId: payer,
  shares,
});

describe('memberNets', () => {
  it('credits the payer and debits each share', () => {
    // Amy paid ¥4,800 ramen for three.
    expect(memberNets([expense('amy', { me: 1600, amy: 1600, ben: 1600 })])).toEqual({
      amy: 3200,
      me: -1600,
      ben: -1600,
    });
  });

  it('reverses income: the receiver owes the others their shares', () => {
    const refund: BalanceEntry = {
      type: 'income',
      amountMinor: 9000,
      payerMemberId: 'ben',
      shares: { me: 3000, amy: 3000, ben: 3000 },
    };
    expect(memberNets([refund])).toEqual({ ben: -6000, me: 3000, amy: 3000 });
  });

  it('a repayment cancels the debt it pays', () => {
    const repay: BalanceEntry = {
      type: 'repayment',
      amountMinor: 1600,
      payerMemberId: 'me',
      shares: { amy: 1600 },
    };
    const net = memberNets([expense('amy', { me: 1600, amy: 1600 }), repay]);
    expect(net).toEqual({ amy: 0, me: 0 });
  });

  it('always sums to zero', () => {
    const net = memberNets([
      expense('a', { a: 334, b: 333, c: 333 }),
      expense('b', { a: 500, b: 500 }),
      { type: 'income', amountMinor: 700, payerMemberId: 'c', shares: { a: 350, c: 350 } },
    ]);
    expect(Object.values(net).reduce((x, y) => x + y, 0)).toBe(0);
  });
});

describe('simplifyDebts', () => {
  it('settles everyone with the fewest transfers', () => {
    // Pairwise this would be 3 transfers (b→a, c→b, c→a); simplified it is 2.
    const transfers = simplifyDebts({ a: 3000, b: 0, c: -3000 });
    expect(transfers).toEqual([{ from: 'c', to: 'a', amount: 3000 }]);
  });

  it('matches biggest debtors with biggest creditors', () => {
    expect(simplifyDebts({ amy: 2500, ben: -1300, me: -1200 })).toEqual([
      { from: 'ben', to: 'amy', amount: 1300 },
      { from: 'me', to: 'amy', amount: 1200 },
    ]);
  });

  it('settles every net exactly', () => {
    const net = { a: 700, b: 300, c: -400, d: -600 };
    const after = { ...net };
    for (const t of simplifyDebts(net)) {
      after[t.from as keyof typeof after] += t.amount;
      after[t.to as keyof typeof after] -= t.amount;
    }
    expect(Object.values(after)).toEqual([0, 0, 0, 0]);
  });

  it('returns nothing when all settled', () => {
    expect(simplifyDebts({ a: 0, b: 0 })).toEqual([]);
  });
});

describe('spentShare', () => {
  it('counts expense shares minus income shares, not repayments', () => {
    const entries: BalanceEntry[] = [
      expense('amy', { me: 1600, amy: 1600 }),
      { type: 'income', amountMinor: 900, payerMemberId: 'ben', shares: { me: 300, ben: 600 } },
      { type: 'repayment', amountMinor: 1600, payerMemberId: 'me', shares: { amy: 1600 } },
    ];
    expect(spentShare(entries, 'me')).toBe(1300);
  });
});

describe('allocateShares', () => {
  it('splits equally when nothing is typed', () => {
    expect(allocateShares(1000, ['a', 'b', 'c'])).toEqual({ ok: true, shares: { a: 334, b: 333, c: 333 } });
  });

  it('keeps typed amounts and splits the rest', () => {
    expect(allocateShares(1000, ['a', 'b', 'c'], { a: 500 })).toEqual({
      ok: true,
      shares: { a: 500, b: 250, c: 250 },
    });
  });

  it('rejects typed amounts over the total', () => {
    expect(allocateShares(1000, ['a', 'b'], { a: 1200 })).toEqual({ ok: false, reason: 'over-total' });
  });

  it('requires typed amounts to add up when everyone is typed', () => {
    expect(allocateShares(1000, ['a', 'b'], { a: 400, b: 500 })).toEqual({ ok: false, reason: 'over-total' });
    expect(allocateShares(1000, ['a', 'b'], { a: 400, b: 600 })).toEqual({
      ok: true,
      shares: { a: 400, b: 600 },
    });
  });

  it('needs at least one member', () => {
    expect(allocateShares(1000, [])).toEqual({ ok: false, reason: 'no-members' });
  });
});
