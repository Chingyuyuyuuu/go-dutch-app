import { roundToDisplayUnit, type MinorUnits } from './money';
import { splitEvenly } from './split';

/** The parts of an entry that move money between members of a shared ledger. */
export type BalanceEntry = {
  type: 'expense' | 'income' | 'repayment';
  amountMinor: MinorUnits;
  /** Member who paid (expense, repayment) or received the money (income). */
  payerMemberId: string | null;
  /** Member → share. For a repayment, the single member who was paid back. */
  shares: Record<string, MinorUnits> | null;
};

/**
 * Net position of every member: positive = the others owe them, negative = they owe.
 * - expense / repayment: the payer is owed the total; each share is owed by its member
 * - income (e.g. a shared refund one person received): the opposite
 */
export function memberNets(entries: BalanceEntry[]): Record<string, MinorUnits> {
  const net: Record<string, MinorUnits> = {};
  const add = (id: string, amount: MinorUnits) => {
    net[id] = (net[id] ?? 0) + amount;
  };
  for (const e of entries) {
    if (!e.payerMemberId || !e.shares) continue;
    const sign = e.type === 'income' ? -1 : 1;
    add(e.payerMemberId, sign * e.amountMinor);
    for (const [memberId, share] of Object.entries(e.shares)) add(memberId, -sign * share);
  }
  return net;
}

export type Transfer = { from: string; to: string; amount: MinorUnits };

/**
 * The fewest transfers that settle everyone (greedy: the biggest debtor pays the
 * biggest creditor). Ties break by member id so the result is stable.
 */
export function simplifyDebts(net: Record<string, MinorUnits>): Transfer[] {
  const byAmount = (a: [string, number], b: [string, number]) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1);
  const creditors = Object.entries(net)
    .filter(([, v]) => v > 0)
    .sort(byAmount);
  const debtors = Object.entries(net)
    .filter(([, v]) => v < 0)
    .map(([id, v]): [string, number] => [id, -v])
    .sort(byAmount);
  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i][1], creditors[j][1]);
    if (amount > 0) transfers.push({ from: debtors[i][0], to: creditors[j][0], amount });
    debtors[i][1] -= amount;
    creditors[j][1] -= amount;
    if (debtors[i][1] === 0) i++;
    if (creditors[j][1] === 0) j++;
  }
  return transfers;
}

/**
 * Shares as shown on screen, rounded to the display unit (whole dollars for
 * TWD): the ledger owner's share rounded down, everyone else's rounded up.
 * NT$1,000 ÷ 3 is stored as 333.34 / 333.33 / 333.33 and shows 333 / 334 / 334.
 * The shown total can be off by less than one unit per member; stored shares stay exact.
 */
export function displayShares(
  shares: Record<string, MinorUnits>,
  ownerMemberId: string | null,
  currency: string,
): Record<string, MinorUnits> {
  const shown: Record<string, MinorUnits> = {};
  for (const [memberId, share] of Object.entries(shares)) {
    shown[memberId] = roundToDisplayUnit(share, currency, memberId === ownerMemberId ? 'floor' : 'ceil');
  }
  return shown;
}

/**
 * A settle-up amount in the display unit: rounded up, or down when the ledger
 * owner is the one paying. What is left afterwards is below one unit and counts
 * as settled (see isSettled).
 */
export function roundSettlement(amount: MinorUnits, payerIsOwner: boolean, currency: string): MinorUnits {
  return roundToDisplayUnit(amount, currency, payerIsOwner ? 'floor' : 'ceil');
}

/** A balance smaller than one display unit (NT$1 for TWD, 1 cent for AUD) counts as settled. */
export function isSettled(net: MinorUnits, currency: string): boolean {
  return roundToDisplayUnit(Math.abs(net), currency, 'floor') === 0;
}

/** One member's share of an entry, or 0. */
export function shareOf(entry: Pick<BalanceEntry, 'shares'>, memberId: string): MinorUnits {
  return entry.shares?.[memberId] ?? 0;
}

/**
 * What a member spent in a shared ledger: their expense shares minus their
 * income shares. Repayments only move money between members, so they are left out.
 */
export function spentShare(entries: BalanceEntry[], memberId: string): MinorUnits {
  let total = 0;
  for (const e of entries) {
    if (e.type === 'expense') total += shareOf(e, memberId);
    else if (e.type === 'income') total -= shareOf(e, memberId);
  }
  return total;
}

export type ShareAllocation =
  { ok: true; shares: Record<string, MinorUnits> } | { ok: false; reason: 'over-total' | 'no-members' };

/**
 * Shares for a split. Members with a typed amount (`fixed`) keep it; the rest of
 * the total is split equally between the others, remainder to the first ones.
 * When everyone has a typed amount they must add up to the total.
 */
export function allocateShares(
  total: MinorUnits,
  memberIds: string[],
  fixed: Record<string, MinorUnits> = {},
): ShareAllocation {
  if (memberIds.length === 0) return { ok: false, reason: 'no-members' };
  const fixedIds = memberIds.filter((id) => fixed[id] !== undefined);
  const freeIds = memberIds.filter((id) => fixed[id] === undefined);
  const fixedSum = fixedIds.reduce((sum, id) => sum + fixed[id], 0);
  if (fixedSum > total) return { ok: false, reason: 'over-total' };
  if (freeIds.length === 0 && fixedSum !== total) return { ok: false, reason: 'over-total' };
  const shares: Record<string, MinorUnits> = {};
  fixedIds.forEach((id) => {
    shares[id] = fixed[id];
  });
  if (freeIds.length > 0) {
    splitEvenly(total - fixedSum, freeIds.length).forEach((amount, i) => {
      shares[freeIds[i]] = amount;
    });
  }
  return { ok: true, shares };
}
