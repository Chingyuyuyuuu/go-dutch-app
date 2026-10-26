import type { Entry, Ledger, LedgerPref, NewEntry, UserProfile } from '@/lib/domain';

/**
 * A change made on this device that still has to reach the server. Ops are
 * kept in order in the outbox and sent one by one when online.
 */
export type Op =
  | { kind: 'profile'; patch: Partial<UserProfile> }
  | { kind: 'insertLedger'; ledger: Ledger }
  | { kind: 'ledgerPref'; ledgerId: string; pref: LedgerPref }
  | { kind: 'insertEntry'; entry: Entry }
  | { kind: 'updateEntry'; ledgerId: string; entryId: string; patch: Partial<NewEntry> }
  | { kind: 'deleteEntry'; ledgerId: string; entryId: string };

export type QueuedOp = Op & { opId: string };

/** The row an op touches, so a server pull never overwrites a change that has not been sent yet. */
export function opRowKey(op: Op): string {
  switch (op.kind) {
    case 'profile':
      return 'profile';
    case 'insertLedger':
      return `ledger:${op.ledger.id}`;
    case 'ledgerPref':
      return `pref:${op.ledgerId}`;
    case 'insertEntry':
      return `entry:${op.entry.id}`;
    case 'updateEntry':
    case 'deleteEntry':
      return `entry:${op.entryId}`;
  }
}

/**
 * Adds an op to the outbox, folding it into earlier unsent ops for the same row
 * where possible: edits to an unsent entry change the insert itself, deleting an
 * unsent entry drops it, and repeated profile / pref changes keep only the latest.
 */
export function enqueueOp(outbox: readonly QueuedOp[], op: Op, opId: string): QueuedOp[] {
  const key = opRowKey(op);
  const sameRow = (q: QueuedOp) => opRowKey(q) === key;

  switch (op.kind) {
    case 'profile': {
      const i = outbox.findIndex((q) => q.kind === 'profile');
      if (i >= 0) {
        const prev = outbox[i] as Extract<QueuedOp, { kind: 'profile' }>;
        return outbox.map((q, j) => (j === i ? { ...prev, patch: { ...prev.patch, ...op.patch } } : q));
      }
      break;
    }
    case 'ledgerPref': {
      const i = outbox.findIndex((q) => q.kind === 'ledgerPref' && sameRow(q));
      if (i >= 0) return outbox.map((q, j) => (j === i ? { ...op, opId: q.opId } : q));
      break;
    }
    case 'updateEntry': {
      const i = outbox.findIndex((q) => (q.kind === 'insertEntry' || q.kind === 'updateEntry') && sameRow(q));
      if (i >= 0) {
        const prev = outbox[i];
        if (prev.kind === 'insertEntry') {
          return outbox.map((q, j) => (j === i ? { ...prev, entry: { ...prev.entry, ...op.patch } } : q));
        }
        if (prev.kind === 'updateEntry') {
          return outbox.map((q, j) => (j === i ? { ...prev, patch: { ...prev.patch, ...op.patch } } : q));
        }
      }
      break;
    }
    case 'deleteEntry': {
      const neverSent = outbox.some((q) => q.kind === 'insertEntry' && sameRow(q));
      const rest = outbox.filter((q) => !sameRow(q));
      return neverSent ? rest : [...rest, { ...op, opId }];
    }
  }
  return [...outbox, { ...op, opId }];
}
