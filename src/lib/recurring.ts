import { addDays, addMonths, type LocalDate } from './date';
import type { Frequency, Ledger, Recurring } from './domain';
import type { MinorUnits } from './money';
import { splitEvenly } from './split';

export const FREQUENCIES: readonly Frequency[] = ['weekly', 'fortnightly', 'monthly', 'yearly'];

/** Charges per year. Monthly cost = amount × CHARGES_PER_YEAR / 12 (weekly 52/12, fortnightly 26/12, …). */
export const CHARGES_PER_YEAR: Record<Frequency, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
  yearly: 1,
};

/** Afterpay: 4 payments, one every 2 weeks. */
export const AFTERPAY_PAYMENTS = 4;
export const MIN_INSTALMENTS = 2;
export const MAX_INSTALMENTS = 52;

/** Never record more than this many missed charges of one payment at once. */
const MAX_CATCH_UP = 60;

/**
 * Date of charge `n` (0 = the first). Months and years count from the start
 * date, so a payment on the 31st falls on the last day of shorter months and
 * goes back to the 31st afterwards. Matches public.recurring_date() in SQL.
 */
export function chargeDate(start: LocalDate, frequency: Frequency, n: number): LocalDate {
  switch (frequency) {
    case 'weekly':
      return addDays(start, 7 * n);
    case 'fortnightly':
      return addDays(start, 14 * n);
    case 'monthly':
      return addMonths(start, n);
    case 'yearly':
      return addMonths(start, 12 * n);
  }
}

/** Instalment amounts: equal parts, with the remainder on the first payment. */
export function instalmentAmounts(total: MinorUnits, count: number): MinorUnits[] {
  if (!Number.isInteger(total) || total < 0) throw new Error(`Invalid total: ${total}`);
  if (!Number.isInteger(count) || count < 1) throw new Error(`Invalid number of payments: ${count}`);
  const base = Math.floor(total / count);
  const rem = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i === 0 ? rem : 0));
}

type Schedule = Pick<Recurring, 'kind' | 'amountMinor' | 'frequency' | 'startDate' | 'instalments'>;

/** How many charges a payment has in total (null = no end). */
export function totalCharges(r: Pick<Recurring, 'kind' | 'instalments'>): number | null {
  return r.kind === 'instalment' ? (r.instalments ?? AFTERPAY_PAYMENTS) : null;
}

/** Amount of charge `seq`. Instalments put the remainder on the first payment. */
export function chargeAmount(r: Schedule, seq: number): MinorUnits {
  if (r.kind !== 'instalment') return r.amountMinor;
  const count = totalCharges(r) ?? AFTERPAY_PAYMENTS;
  return instalmentAmounts(r.amountMinor, count)[seq] ?? 0;
}

/**
 * Charges dated before `today`. A payment added today counts these as already
 * paid: they are not recorded, so nothing the user may have recorded by hand is doubled.
 */
export function chargesBefore(r: Schedule, today: LocalDate): number {
  const limit = Math.min(totalCharges(r) ?? Number.MAX_SAFE_INTEGER, 5000);
  let n = 0;
  while (n < limit && chargeDate(r.startDate, r.frequency, n) < today) n++;
  return n;
}

export function isFinished(r: Pick<Recurring, 'kind' | 'instalments' | 'paidCount'>): boolean {
  const total = totalCharges(r);
  return total !== null && r.paidCount >= total;
}

export type Charge = { seq: number; date: LocalDate; amountMinor: MinorUnits };

/** The next charge not done yet, or null once an instalment plan is paid off. */
export function nextCharge(r: Recurring): Charge | null {
  if (isFinished(r)) return null;
  const seq = r.paidCount;
  return { seq, date: chargeDate(r.startDate, r.frequency, seq), amountMinor: chargeAmount(r, seq) };
}

/** Charges due on or before `today` that have not been recorded yet. */
export function dueCharges(r: Recurring, today: LocalDate): Charge[] {
  const charges: Charge[] = [];
  const total = totalCharges(r);
  for (let seq = r.paidCount; charges.length < MAX_CATCH_UP; seq++) {
    if (total !== null && seq >= total) break;
    const date = chargeDate(r.startDate, r.frequency, seq);
    if (date > today) break;
    charges.push({ seq, date, amountMinor: chargeAmount(r, seq) });
  }
  return charges;
}

/** Every charge of an instalment plan, for the schedule card. */
export function instalmentSchedule(r: Schedule): Charge[] {
  const count = totalCharges(r) ?? AFTERPAY_PAYMENTS;
  const amounts = instalmentAmounts(r.amountMinor, count);
  return amounts.map((amountMinor, seq) => ({
    seq,
    date: chargeDate(r.startDate, r.frequency, seq),
    amountMinor,
  }));
}

/**
 * Equal shares of a recurring split between the ledger's current members,
 * remainder to the first ones in member-key order (same order as the server).
 */
export function recurringSplitShares(ledger: Ledger, amount: MinorUnits): Record<string, MinorUnits> {
  const ids = ledger.members
    .filter((m) => m.leftAt === null)
    .map((m) => m.id)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (ids.length === 0) return {};
  const amounts = splitEvenly(amount, ids.length);
  return Object.fromEntries(ids.map((id, i) => [id, amounts[i]]));
}

/** What one charge costs me: the whole amount, or my share of a split. */
export function myChargeAmount(r: Recurring, ledger: Ledger | undefined, uid: string): MinorUnits {
  const amount = nextCharge(r)?.amountMinor ?? chargeAmount(r, 0);
  if (r.kind !== 'split') return amount;
  if (!ledger) return 0;
  const me = ledger.members.find((m) => m.uid === uid && m.leftAt === null);
  return me ? (recurringSplitShares(ledger, amount)[me.id] ?? 0) : 0;
}

/**
 * Fixed costs a month per currency: Σ(amount × charges a year) / 12, rounded to
 * minor units once at the end. Finished instalment plans and other people's
 * recurring splits do not count; my splits count my share only.
 */
export function monthlyFixedCosts(
  recurring: Recurring[],
  ledgers: Ledger[],
  uid: string,
): { currency: string; monthlyMinor: MinorUnits; count: number }[] {
  const yearly = new Map<string, { sum: number; count: number }>();
  for (const r of recurring) {
    if (r.ownerUid !== uid || isFinished(r)) continue;
    const ledger = ledgers.find((l) => l.id === r.ledgerId);
    if (!ledger) continue;
    const row = yearly.get(ledger.currency) ?? { sum: 0, count: 0 };
    row.sum += myChargeAmount(r, ledger, uid) * CHARGES_PER_YEAR[r.frequency];
    row.count += 1;
    yearly.set(ledger.currency, row);
  }
  return [...yearly.entries()]
    .map(([currency, { sum, count }]) => ({ currency, monthlyMinor: Math.round(sum / 12), count }))
    .sort((a, b) => b.count - a.count || b.monthlyMinor - a.monthlyMinor);
}

/** Apple ID subscriptions get a small tag. */
export function sourceForName(name: string): 'apple' | null {
  return /^apple\b/i.test(name.trim()) ? 'apple' : null;
}
