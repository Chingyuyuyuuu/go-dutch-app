import { addDays, addMonths, type LocalDate } from './date';
import { settledAmount, type BalanceCheck, type BankAccount, type BankReminder, type Entry } from './domain';
import type { MinorUnits } from './money';

/** At most this many balance checks are kept per account. */
export const MAX_CHECKS = 24;

export function lastCheck(account: BankAccount): BalanceCheck | undefined {
  return account.checks[account.checks.length - 1];
}

/** When the next update is due: a week or a month after the last one. Never updated = due now. */
export function nextUpdateDue(account: BankAccount, reminder: BankReminder): LocalDate | null {
  const last = lastCheck(account);
  if (!last) return null;
  return reminder === 'weekly' ? addDays(last.date, 7) : addMonths(last.date, 1);
}

export function isUpdateDue(account: BankAccount, reminder: BankReminder, today: LocalDate): boolean {
  const due = nextUpdateDue(account, reminder);
  return due === null || due <= today;
}

export type Reconciliation = {
  /** How much the balance went down (negative when it went up). */
  drop: MinorUnits;
  /** Expenses minus income recorded in the linked ledgers since the previous check. */
  recorded: MinorUnits;
  /** drop − recorded. Positive: money left the account that was never recorded. */
  gap: MinorUnits;
  /** The gap, or 0 when everything is recorded. */
  missing: MinorUnits;
};

/**
 * gap = (previous balance − new balance) − (expenses − income recorded since then).
 * "Since" means entries dated after the previous check's day, up to today, in the
 * account's linked ledgers. Repayments between friends are not counted.
 */
export function reconcile(params: {
  previous: BalanceCheck;
  newBalance: MinorUnits;
  entries: Entry[];
  linkedLedgerIds: string[];
  today: LocalDate;
}): Reconciliation {
  const { previous, newBalance, entries, linkedLedgerIds, today } = params;
  const linked = new Set(linkedLedgerIds);
  let recorded = 0;
  for (const e of entries) {
    if (!linked.has(e.ledgerId) || e.date <= previous.date || e.date > today) continue;
    if (e.type === 'expense') recorded += settledAmount(e);
    else if (e.type === 'income') recorded -= settledAmount(e);
  }
  const drop = previous.balanceMinor - newBalance;
  const gap = drop - recorded;
  return { drop, recorded, gap, missing: Math.max(gap, 0) };
}

/** Adds a check, keeping the newest MAX_CHECKS. */
export function addCheck(checks: BalanceCheck[], check: BalanceCheck): BalanceCheck[] {
  return [...checks, check].slice(-MAX_CHECKS);
}
