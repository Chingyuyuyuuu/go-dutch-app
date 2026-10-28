import { displayShares, isSettled, roundSettlement } from '../balances';
import {
  CATEGORY_ICONS,
  CATEGORY_SET_CODES,
  CATEGORY_SETS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  categoryGrid,
} from '../categories';
import { displayDecimals } from '../currency';
import { displayUnit, roundToDisplayUnit } from '../money';
import { isIconName } from '@/ui/Icon';

// lucide-react-native ships ESM that Jest does not transform; only the icon names matter here.
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

describe('practical decimals', () => {
  it('shows TWD in whole dollars and other currencies as ISO', () => {
    expect(displayDecimals('TWD')).toBe(0);
    expect(displayDecimals('JPY')).toBe(0);
    expect(displayDecimals('AUD')).toBe(2);
    expect(displayUnit('TWD')).toBe(100);
    expect(displayUnit('JPY')).toBe(1);
    expect(displayUnit('AUD')).toBe(1);
  });
});

describe('roundToDisplayUnit', () => {
  it('rounds TWD cents to whole dollars', () => {
    expect(roundToDisplayUnit(70060, 'TWD')).toBe(70100);
    expect(roundToDisplayUnit(70049, 'TWD')).toBe(70000);
    expect(roundToDisplayUnit(70050, 'TWD')).toBe(70100);
    expect(roundToDisplayUnit(1250, 'TWD')).toBe(1300); // an old NT$12.50 entry shows NT$13
    expect(roundToDisplayUnit(70001, 'TWD', 'floor')).toBe(70000);
    expect(roundToDisplayUnit(70001, 'TWD', 'ceil')).toBe(70100);
    expect(roundToDisplayUnit(70000, 'TWD', 'ceil')).toBe(70000);
  });

  it('rounds negative amounts away from zero at the half', () => {
    expect(roundToDisplayUnit(-70050, 'TWD')).toBe(-70100);
    expect(roundToDisplayUnit(-70040, 'TWD')).toBe(-70000);
    expect(roundToDisplayUnit(-70040, 'TWD', 'floor')).toBe(-70100);
    expect(roundToDisplayUnit(-70040, 'TWD', 'ceil')).toBe(-70000);
  });

  it('leaves currencies without practical decimals alone', () => {
    expect(roundToDisplayUnit(1234, 'AUD', 'ceil')).toBe(1234);
    expect(roundToDisplayUnit(333, 'JPY', 'floor')).toBe(333);
  });
});

describe('displayShares', () => {
  it('rounds the owner down and everyone else up', () => {
    // NT$1,000 ÷ 3 stored exactly in cents
    expect(displayShares({ owner: 33334, b: 33333, c: 33333 }, 'owner', 'TWD')).toEqual({
      owner: 33300,
      b: 33400,
      c: 33400,
    });
    // ¥10,000 at 0.2102 -> NT$700.81 / 700.60 / 700.59
    expect(displayShares({ owner: 70081, b: 70060, c: 70059 }, 'owner', 'TWD')).toEqual({
      owner: 70000,
      b: 70100,
      c: 70100,
    });
  });

  it('does not change exact amounts', () => {
    expect(displayShares({ a: 1250, b: 1250 }, 'a', 'AUD')).toEqual({ a: 1250, b: 1250 });
    expect(displayShares({ a: 70000, b: 70000 }, null, 'TWD')).toEqual({ a: 70000, b: 70000 });
  });
});

describe('settling up', () => {
  it('rounds members up and the owner down', () => {
    expect(roundSettlement(66667, false, 'TWD')).toBe(66700);
    expect(roundSettlement(66667, true, 'TWD')).toBe(66600);
    expect(roundSettlement(1234, false, 'AUD')).toBe(1234);
  });

  it('treats less than one display unit as settled', () => {
    expect(isSettled(0, 'TWD')).toBe(true);
    expect(isSettled(99, 'TWD')).toBe(true);
    expect(isSettled(-99, 'TWD')).toBe(true);
    expect(isSettled(100, 'TWD')).toBe(false);
    expect(isSettled(1, 'AUD')).toBe(false);
    expect(isSettled(0, 'AUD')).toBe(true);
  });
});

describe('category sets', () => {
  it('has the codes from the spec', () => {
    expect(EXPENSE_CATEGORIES).toHaveLength(25);
    expect(INCOME_CATEGORIES).toHaveLength(9);
    expect(CATEGORY_SET_CODES.japan_travel.expense).toHaveLength(16);
    expect(CATEGORY_SET_CODES.japan_travel.income).toHaveLength(4);
    expect(CATEGORY_SET_CODES.au_life.expense).toHaveLength(16);
    expect(CATEGORY_SET_CODES.au_life.income).toHaveLength(8);
  });

  it('only uses known codes without duplicates', () => {
    for (const set of CATEGORY_SETS) {
      for (const kind of ['expense', 'income'] as const) {
        const codes = CATEGORY_SET_CODES[set][kind];
        const all: readonly string[] = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
        expect(new Set(codes).size).toBe(codes.length);
        codes.forEach((code) => expect(all).toContain(code));
      }
    }
  });

  it('every category has an icon the app knows', () => {
    for (const icon of Object.values(CATEGORY_ICONS)) expect(isIconName(icon)).toBe(true);
  });

  it('keeps used categories from other sets in the grid', () => {
    const { grid, more } = categoryGrid('japan_travel', 'expense', ['health', 'dining', 'salary']);
    expect(grid).toHaveLength(17);
    expect(grid[16]).toBe('health');
    expect(grid).not.toContain('salary'); // an income code never shows in the expense grid
    expect(more).not.toContain('health');
    expect(more).toContain('rent');
    expect(grid.length + more.length).toBe(EXPENSE_CATEGORIES.length);
  });

  it('puts the rest of the other set under "More categories"', () => {
    const { grid, more } = categoryGrid('au_life', 'income');
    expect(grid).toEqual(CATEGORY_SET_CODES.au_life.income);
    expect(more).toEqual(['taxfree_refund']);
  });
});
