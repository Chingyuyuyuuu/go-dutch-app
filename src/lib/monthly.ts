import type { CategoryCode } from './categories';
import { shiftMonth, toLocalDate, daysInMonth } from './date';
import type { Entry } from './domain';
import type { MinorUnits } from './money';

export type MonthRef = { year: number; month: number };

/** The last month that has fully ended: in October, September. */
export function lastCompletedMonth(today: { year: number; month: number }): MonthRef {
  return shiftMonth(today.year, today.month, -1);
}

export function monthRange({ year, month }: MonthRef): { from: string; to: string } {
  return { from: toLocalDate(year, month, 1), to: toLocalDate(year, month, daysInMonth(year, month)) };
}

export type CategoryComparison = { code: CategoryCode; amount: MinorUnits; previous: MinorUnits };

export type MonthComparison = {
  total: MinorUnits;
  previousTotal: MinorUnits;
  /** Categories spent on in either month, biggest this month first. */
  rows: CategoryComparison[];
};

/** Spending (expenses only) of a month against the month before, by category. */
export function compareMonths(entries: Entry[], month: MonthRef): MonthComparison {
  const current = monthRange(month);
  const before = monthRange(shiftMonth(month.year, month.month, -1));
  const rows = new Map<CategoryCode, CategoryComparison>();
  let total = 0;
  let previousTotal = 0;
  for (const e of entries) {
    if (e.type !== 'expense') continue;
    const inCurrent = e.date >= current.from && e.date <= current.to;
    const inBefore = e.date >= before.from && e.date <= before.to;
    if (!inCurrent && !inBefore) continue;
    const row = rows.get(e.categoryCode) ?? { code: e.categoryCode, amount: 0, previous: 0 };
    if (inCurrent) {
      row.amount += e.amountMinor;
      total += e.amountMinor;
    } else {
      row.previous += e.amountMinor;
      previousTotal += e.amountMinor;
    }
    rows.set(e.categoryCode, row);
  }
  return {
    total,
    previousTotal,
    rows: [...rows.values()].sort((a, b) => b.amount - a.amount || b.previous - a.previous),
  };
}
