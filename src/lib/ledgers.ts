import { isIncomeCategory } from './categories';
import type { LocalDate } from './date';
import type { Entry, Ledger, LedgerPref } from './domain';
import type { MinorUnits } from './money';

/**
 * Home tab order: starred first, then the user's manual order, ended ledgers last.
 * Ledgers without a saved position go after the ones that have one, oldest first.
 */
export function orderLedgers(ledgers: Ledger[], prefs: Record<string, LedgerPref>): Ledger[] {
  const position = (l: Ledger) => prefs[l.id]?.order ?? Number.MAX_SAFE_INTEGER;
  const byManualOrder = (a: Ledger, b: Ledger) => position(a) - position(b) || a.createdAt - b.createdAt;
  const active = ledgers.filter((l) => l.status === 'active');
  const ended = ledgers.filter((l) => l.status === 'ended');
  return [
    ...active.filter((l) => prefs[l.id]?.starred).sort(byManualOrder),
    ...active.filter((l) => !prefs[l.id]?.starred).sort(byManualOrder),
    ...ended.sort(byManualOrder),
  ];
}

/** Returns a copy of `items` with the item at `fromIndex` moved to `toIndex`. */
export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, moved);
  return next;
}

export type RouteResult =
  | { kind: 'none' }
  | { kind: 'auto'; ledgerId: string }
  | { kind: 'choose'; ledgerIds: string[]; defaultId: string };

/**
 * Which personal ledger a personal expense or income goes to.
 * - started from a personal tab of the same currency: use that ledger
 * - 0 ledgers: ask to create one; 1: use it; 2+: let the user pick, last used first
 */
export function routePersonalEntry(params: {
  currency: string;
  ledgers: Ledger[];
  fixedLedgerId?: string | null;
  lastUsedLedgerId?: string;
}): RouteResult {
  const { currency, ledgers, fixedLedgerId, lastUsedLedgerId } = params;
  const candidates = ledgers.filter(
    (l) => l.kind === 'personal' && l.status === 'active' && l.currency === currency,
  );
  if (fixedLedgerId && candidates.some((l) => l.id === fixedLedgerId)) {
    return { kind: 'auto', ledgerId: fixedLedgerId };
  }
  if (candidates.length === 0) return { kind: 'none' };
  if (candidates.length === 1) return { kind: 'auto', ledgerId: candidates[0].id };
  const ids = candidates.map((l) => l.id);
  const lastUsed = lastUsedLedgerId && ids.includes(lastUsedLedgerId) ? lastUsedLedgerId : undefined;
  const ledgerIds = lastUsed ? [lastUsed, ...ids.filter((id) => id !== lastUsed)] : ids;
  return { kind: 'choose', ledgerIds, defaultId: ledgerIds[0] };
}

export function personalLedgersFor(currency: string, ledgers: Ledger[]): Ledger[] {
  return ledgers.filter((l) => l.kind === 'personal' && l.status === 'active' && l.currency === currency);
}

export type Summary = { spent: MinorUnits; income: MinorUnits; balance: MinorUnits };

export function summarise(entries: Entry[]): Summary {
  let spent = 0;
  let income = 0;
  for (const e of entries) {
    if (e.type === 'income') income += e.amountMinor;
    else if (e.type === 'expense') spent += e.amountMinor;
  }
  return { spent, income, balance: income - spent };
}

/** Entry type that matches a category, so the two can never disagree. */
export function entryTypeFor(categoryCode: Entry['categoryCode']): 'expense' | 'income' {
  return isIncomeCategory(categoryCode) ? 'income' : 'expense';
}

export type DayGroup = { date: LocalDate; spent: MinorUnits; entries: Entry[] };

/** Newest day first; inside a day, newest entry first. */
export function groupByDay(entries: Entry[]): DayGroup[] {
  const map = new Map<LocalDate, Entry[]>();
  for (const e of entries) {
    const list = map.get(e.date) ?? [];
    list.push(e);
    map.set(e.date, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, list]) => {
      const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
      return { date, entries: sorted, spent: summarise(sorted).spent };
    });
}
