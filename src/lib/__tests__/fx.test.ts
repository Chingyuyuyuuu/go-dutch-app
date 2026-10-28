import {
  allocateSettle,
  convertMinor,
  isValidRate,
  normaliseRate,
  parseRate,
  rateFromAmounts,
  settlementFor,
  suggestedRate,
} from '../fx';

describe('parseRate / normaliseRate', () => {
  it('accepts positive decimals with up to 10 integer and 10 fractional digits', () => {
    expect(parseRate('0.2102')).toBe(2_102_000_000n);
    expect(parseRate('1')).toBe(10_000_000_000n);
    expect(isValidRate('9999999999.9999999999')).toBe(true);
    expect(normaliseRate(' 0.21020 ')).toBe('0.2102');
    expect(normaliseRate('150.50')).toBe('150.5');
    expect(normaliseRate('2.000')).toBe('2');
  });

  it('rejects zero, negatives, too many digits and junk', () => {
    for (const bad of [
      '',
      '0',
      '0.0',
      '-1',
      '1e3',
      '.5',
      '1.',
      '0.12345678901',
      '12345678901',
      'abc',
      '1,000',
    ]) {
      expect(parseRate(bad)).toBeNull();
    }
  });
});

describe('convertMinor', () => {
  it('converts with the ledger rate and keeps TWD cents', () => {
    expect(convertMinor(10000, 'JPY', 'TWD', '0.2102')).toBe(210200); // ¥10,000 -> NT$2,102.00
    expect(convertMinor(3333, 'JPY', 'TWD', '0.2102')).toBe(70060); // NT$700.5966 -> 700.60
    expect(convertMinor(1600, 'JPY', 'TWD', '0.2102')).toBe(33632);
  });

  it('rounds half-up', () => {
    expect(convertMinor(1, 'JPY', 'TWD', '0.005')).toBe(1); // 0.5 cent
    expect(convertMinor(1, 'JPY', 'TWD', '0.0049999999')).toBe(0);
  });

  it('handles the decimals of both currencies', () => {
    expect(convertMinor(2100, 'TWD', 'JPY', '4.757')).toBe(100); // NT$21.00 -> ¥99.897 -> ¥100
    expect(convertMinor(1250, 'AUD', 'TWD', '21.03')).toBe(26288); // A$12.50 -> NT$262.875 -> 262.88
    expect(convertMinor(1250, 'AUD', 'AUD', '1')).toBe(1250);
  });

  it('stays exact for the largest amounts the keypad allows', () => {
    expect(convertMinor(999_999_999, 'JPY', 'TWD', '0.2102')).toBe(21_019_999_979);
  });

  it('rejects bad input', () => {
    expect(() => convertMinor(1.5, 'JPY', 'TWD', '0.2')).toThrow();
    expect(() => convertMinor(100, 'JPY', 'TWD', 'x')).toThrow();
  });
});

describe('rateFromAmounts', () => {
  it('derives the rate from what was actually paid', () => {
    expect(rateFromAmounts(10000, 'JPY', 213100, 'TWD')).toBe('0.2131');
    expect(rateFromAmounts(3, 'JPY', 100, 'TWD')).toBe('0.3333333333');
  });

  it('round-trips through convertMinor for everyday amounts', () => {
    for (const yen of [1, 7, 333, 3333, 98765, 1_000_000]) {
      for (const paid of [100, 2131_00, 700_00, 12345_67]) {
        const rate = rateFromAmounts(yen, 'JPY', paid, 'TWD');
        if (rate === null) continue;
        expect(convertMinor(yen, 'JPY', 'TWD', rate)).toBe(paid);
      }
    }
  });

  it('returns null when there is no sensible rate', () => {
    expect(rateFromAmounts(0, 'JPY', 100, 'TWD')).toBeNull();
    expect(rateFromAmounts(100, 'JPY', 0, 'TWD')).toBeNull();
    expect(rateFromAmounts(1_000_000_000, 'JPY', 1, 'TWD')).toBeNull(); // below 10 decimals
  });
});

describe('suggestedRate', () => {
  it('adds 1.5% and keeps 4 significant digits', () => {
    expect(suggestedRate('0.2071')).toBe('0.2102'); // 0.2102065
    expect(suggestedRate('20.72')).toBe('21.03'); // 21.0308
    expect(suggestedRate('0.0234')).toBe('0.02375'); // 0.023751
    expect(suggestedRate('4.7')).toBe('4.771'); // 4.7705 -> half-up
  });

  it('returns null for an invalid mid rate', () => {
    expect(suggestedRate('0')).toBeNull();
    expect(suggestedRate('abc')).toBeNull();
  });
});

describe('allocateSettle', () => {
  it('splits the converted total by the entry-currency shares (largest remainder)', () => {
    // ¥10,000 split 3,334 / 3,333 / 3,333 -> NT$2,102.00
    expect(allocateSettle(210200, { a: 3334, b: 3333, c: 3333 })).toEqual({
      a: 70081,
      b: 70060,
      c: 70059,
    });
  });

  it('breaks ties by member key, whatever order the shares come in', () => {
    expect(allocateSettle(100, { c: 1, a: 1, b: 1 })).toEqual({ a: 34, b: 33, c: 33 });
    expect(allocateSettle(200, { c: 1, b: 1, a: 1 })).toEqual({ a: 67, b: 67, c: 66 });
  });

  it('always adds up to the total', () => {
    const shares = { a: 1234, b: 1, c: 98765, d: 4321 };
    for (const total of [0, 1, 99, 210200, 9_999_999_999]) {
      const settle = allocateSettle(total, shares);
      expect(Object.values(settle).reduce((x, y) => x + y, 0)).toBe(total);
    }
  });

  it('gives zero to zero shares and handles no shares at all', () => {
    expect(allocateSettle(500, { a: 0, b: 10 })).toEqual({ a: 0, b: 500 });
    expect(allocateSettle(500, { a: 0, b: 0 })).toEqual({ a: 0, b: 0 });
  });
});

describe('settlementFor (same rules as the server guard)', () => {
  const base = { amountMinor: 10000, shares: null };

  it('treats a missing currency as the settlement currency', () => {
    expect(settlementFor(base, 'TWD')).toEqual({
      currency: 'TWD',
      fxRate: '1',
      fxSource: 'same',
      amountSettleMinor: 10000,
      sharesSettle: null,
    });
  });

  it('converts with the rate and splits the converted shares', () => {
    expect(
      settlementFor(
        {
          amountMinor: 10000,
          currency: 'JPY',
          fxRate: '0.2102',
          fxSource: 'ledger',
          shares: { a: 5000, b: 5000 },
        },
        'TWD',
      ),
    ).toEqual({
      currency: 'JPY',
      fxRate: '0.2102',
      fxSource: 'ledger',
      amountSettleMinor: 210200,
      sharesSettle: { a: 105100, b: 105100 },
    });
  });

  it('resets the rate when the entry is back in the settlement currency', () => {
    expect(
      settlementFor({ ...base, currency: 'TWD', fxRate: '0.2102', fxSource: 'manual' }, 'TWD'),
    ).toMatchObject({
      fxRate: '1',
      fxSource: 'same',
      amountSettleMinor: 10000,
    });
  });

  it('keeps the converted amount of a personal copy', () => {
    expect(
      settlementFor(
        { ...base, currency: 'JPY', fxRate: '0.2102', fxSource: 'split', amountSettleMinor: 210199 },
        'TWD',
      ),
    ).toMatchObject({ fxSource: 'split', amountSettleMinor: 210199 });
  });

  it('never leaves another currency marked "same"', () => {
    expect(settlementFor({ ...base, currency: 'JPY', fxRate: '0.2', fxSource: 'same' }, 'TWD')).toMatchObject(
      {
        fxSource: 'ledger',
        amountSettleMinor: 200000,
      },
    );
  });
});
