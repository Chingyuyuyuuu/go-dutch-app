import { spentShare, type BalanceEntry } from './balances';
import { settledAmount, type JoinRequest, type Ledger } from './domain';
import type { MinorUnits } from './money';

/** Something another member did that this device has not shown yet (spec §6A.2, §6B.3). */
export type LedgerNotice =
  | { kind: 'rate'; currency: string; rate: string; byUid: string; at: number }
  | { kind: 'joined'; memberId: string; at: number };

/**
 * What changed in a shared ledger since `since` (when I last opened it), done by
 * someone else: rate changes and members who joined from the share link. Oldest first.
 */
export function ledgerNotices(
  ledger: Pick<Ledger, 'rateChanges' | 'members'>,
  myUid: string,
  since: number,
): LedgerNotice[] {
  const notices: LedgerNotice[] = [];
  for (const [currency, change] of Object.entries(ledger.rateChanges ?? {})) {
    if (change.byUid && change.byUid !== myUid && change.at > since) {
      notices.push({ kind: 'rate', currency, rate: change.rate, byUid: change.byUid, at: change.at });
    }
  }
  for (const m of ledger.members) {
    if (m.shareJoinedAt && m.shareJoinedAt > since && m.uid !== myUid) {
      notices.push({ kind: 'joined', memberId: m.id, at: m.shareJoinedAt });
    }
  }
  return notices.sort((a, b) => a.at - b.at);
}

/** The ledger creator answers join requests; once they have left, any member can (spec §6B.3). */
export function canAnswerJoinRequests(ledger: Pick<Ledger, 'ownerUid' | 'members'>, myUid: string): boolean {
  const active = (uid: string) => ledger.members.some((m) => m.uid === uid && m.leftAt === null);
  if (!active(myUid)) return false;
  return myUid === ledger.ownerUid || !active(ledger.ownerUid);
}

/** Join requests I should answer. */
export function joinRequestsToAnswer(
  ledger: Pick<Ledger, 'ownerUid' | 'members' | 'joinRequests'>,
  myUid: string,
): JoinRequest[] {
  return canAnswerJoinRequests(ledger, myUid) ? (ledger.joinRequests ?? []) : [];
}

/**
 * The share page's line for the member a visitor picked (§6B.2): what they paid
 * for the group and their own share, both in the settlement currency.
 */
export function memberTotals(
  entries: BalanceEntry[],
  memberId: string,
): { paid: MinorUnits; share: MinorUnits } {
  let paid = 0;
  for (const e of entries) {
    if (e.type === 'expense' && e.payerMemberId === memberId) paid += settledAmount(e);
  }
  return { paid, share: spentShare(entries, memberId) };
}

/** An entry the member paid, received, or has a share in ("only mine" on the share page). */
export function involves(entry: Pick<BalanceEntry, 'payerMemberId' | 'shares'>, memberId: string): boolean {
  return entry.payerMemberId === memberId || (entry.shares?.[memberId] ?? 0) > 0;
}
