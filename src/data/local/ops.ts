import type {
  BankAccount,
  Entry,
  Invite,
  Ledger,
  LedgerMember,
  LedgerPref,
  LedgerStatus,
  NewEntry,
  PlaceholderFriend,
  Recurring,
  UserProfile,
} from '@/lib/domain';

/** What a device may change on a recurring payment (paid count and owner are the server's). */
export type RecurringPatch = Partial<Omit<Recurring, 'id' | 'ownerUid' | 'kind' | 'paidCount' | 'createdAt'>>;
export type BankPatch = Partial<Omit<BankAccount, 'id' | 'createdAt'>>;

/**
 * A change made on this device that still has to reach the server. Ops are
 * kept in order in the outbox and sent one by one when online.
 */
export type Op =
  | { kind: 'profile'; patch: Partial<UserProfile> }
  | { kind: 'insertLedger'; ledger: Ledger }
  | { kind: 'createSharedLedger'; ledger: Ledger }
  | { kind: 'updateLedger'; ledgerId: string; patch: { name?: string; status?: LedgerStatus } }
  | { kind: 'addMembers'; ledgerId: string; members: LedgerMember[] }
  /** Personal: delete. Shared: leave (deleted when the last member leaves). */
  | { kind: 'leaveLedger'; ledgerId: string }
  | { kind: 'ledgerPref'; ledgerId: string; pref: LedgerPref }
  | { kind: 'insertEntry'; entry: Entry }
  | { kind: 'updateEntry'; ledgerId: string; entryId: string; patch: Partial<NewEntry> }
  | { kind: 'deleteEntry'; ledgerId: string; entryId: string }
  | { kind: 'friendStar'; uid: string; starred: boolean }
  | { kind: 'addPlaceholder'; placeholder: PlaceholderFriend }
  | { kind: 'createInvite'; invite: Invite }
  | { kind: 'insertRecurring'; recurring: Recurring }
  | { kind: 'updateRecurring'; recurringId: string; patch: RecurringPatch }
  | { kind: 'deleteRecurring'; recurringId: string }
  | { kind: 'insertBank'; bank: BankAccount }
  | { kind: 'updateBank'; bankId: string; patch: BankPatch }
  | { kind: 'deleteBank'; bankId: string };

export type QueuedOp = Op & { opId: string };

/** The ledger an op belongs to, if any. */
export function opLedgerId(op: Op): string | null {
  switch (op.kind) {
    case 'insertLedger':
    case 'createSharedLedger':
      return op.ledger.id;
    case 'insertEntry':
      return op.entry.ledgerId;
    case 'updateLedger':
    case 'addMembers':
    case 'leaveLedger':
    case 'ledgerPref':
    case 'updateEntry':
    case 'deleteEntry':
      return op.ledgerId;
    default:
      return null;
  }
}

/** The row an op touches, so a server pull never overwrites a change that has not been sent yet. */
export function opRowKey(op: Op): string {
  switch (op.kind) {
    case 'profile':
      return 'profile';
    case 'insertLedger':
    case 'createSharedLedger':
      return `ledger:${op.ledger.id}`;
    case 'updateLedger':
    case 'addMembers':
    case 'leaveLedger':
      return `ledger:${op.ledgerId}`;
    case 'ledgerPref':
      return `pref:${op.ledgerId}`;
    case 'insertEntry':
      return `entry:${op.entry.id}`;
    case 'updateEntry':
    case 'deleteEntry':
      return `entry:${op.entryId}`;
    case 'friendStar':
      return `friend:${op.uid}`;
    case 'addPlaceholder':
      return `placeholder:${op.placeholder.id}`;
    case 'createInvite':
      return `invite:${op.invite.code}`;
    case 'insertRecurring':
      return `recurring:${op.recurring.id}`;
    case 'updateRecurring':
    case 'deleteRecurring':
      return `recurring:${op.recurringId}`;
    case 'insertBank':
      return `bank:${op.bank.id}`;
    case 'updateBank':
    case 'deleteBank':
      return `bank:${op.bankId}`;
  }
}

const isLedgerCreate = (
  q: QueuedOp,
): q is Extract<QueuedOp, { kind: 'insertLedger' | 'createSharedLedger' }> =>
  q.kind === 'insertLedger' || q.kind === 'createSharedLedger';

/**
 * Adds an op to the outbox, folding it into earlier unsent ops for the same row
 * where possible: edits to an unsent entry or ledger change the insert itself,
 * deleting something that was never sent drops it, and repeated profile / pref /
 * star changes keep only the latest.
 *
 * `inFlightId` is the op being uploaded right now (always the first). It counts
 * as sent: nothing is folded into it, or the folded change would be dropped
 * with it when the upload finishes.
 */
export function enqueueOp(
  outbox: readonly QueuedOp[],
  op: Op,
  opId: string,
  inFlightId: string | null = null,
): QueuedOp[] {
  if (inFlightId && outbox[0]?.opId === inFlightId) {
    return [outbox[0], ...foldOp(outbox.slice(1), op, opId)];
  }
  return foldOp(outbox, op, opId);
}

function foldOp(outbox: readonly QueuedOp[], op: Op, opId: string): QueuedOp[] {
  const key = opRowKey(op);
  const sameRow = (q: QueuedOp) => opRowKey(q) === key;
  const replaceAt = (i: number, next: QueuedOp) => outbox.map((q, j) => (j === i ? next : q));

  switch (op.kind) {
    case 'profile': {
      const i = outbox.findIndex((q) => q.kind === 'profile');
      if (i >= 0) {
        const prev = outbox[i] as Extract<QueuedOp, { kind: 'profile' }>;
        return replaceAt(i, { ...prev, patch: { ...prev.patch, ...op.patch } });
      }
      break;
    }
    case 'ledgerPref':
    case 'friendStar': {
      const i = outbox.findIndex((q) => q.kind === op.kind && sameRow(q));
      if (i >= 0) return replaceAt(i, { ...op, opId: outbox[i].opId });
      break;
    }
    case 'updateLedger':
    case 'addMembers': {
      const i = outbox.findIndex((q) => isLedgerCreate(q) && sameRow(q));
      if (i >= 0) {
        const prev = outbox[i] as Extract<QueuedOp, { kind: 'insertLedger' | 'createSharedLedger' }>;
        const ledger =
          op.kind === 'updateLedger'
            ? { ...prev.ledger, ...op.patch }
            : { ...prev.ledger, members: [...prev.ledger.members, ...op.members] };
        return replaceAt(i, { ...prev, ledger });
      }
      if (op.kind === 'updateLedger') {
        const j = outbox.findIndex((q) => q.kind === 'updateLedger' && sameRow(q));
        if (j >= 0) {
          const prev = outbox[j] as Extract<QueuedOp, { kind: 'updateLedger' }>;
          return replaceAt(j, { ...prev, patch: { ...prev.patch, ...op.patch } });
        }
      }
      break;
    }
    case 'leaveLedger': {
      // Never reached the server: forget the ledger and everything queued for it.
      const neverSent = outbox.some((q) => isLedgerCreate(q) && sameRow(q));
      if (neverSent) return outbox.filter((q) => opLedgerId(q) !== op.ledgerId);
      break;
    }
    case 'updateEntry': {
      const i = outbox.findIndex((q) => (q.kind === 'insertEntry' || q.kind === 'updateEntry') && sameRow(q));
      if (i >= 0) {
        const prev = outbox[i];
        if (prev.kind === 'insertEntry')
          return replaceAt(i, { ...prev, entry: { ...prev.entry, ...op.patch } });
        if (prev.kind === 'updateEntry')
          return replaceAt(i, { ...prev, patch: { ...prev.patch, ...op.patch } });
      }
      break;
    }
    case 'deleteEntry': {
      const neverSent = outbox.some((q) => q.kind === 'insertEntry' && sameRow(q));
      const rest = outbox.filter((q) => !sameRow(q));
      return neverSent ? rest : [...rest, { ...op, opId }];
    }
    case 'updateRecurring': {
      const i = outbox.findIndex(
        (q) => (q.kind === 'insertRecurring' || q.kind === 'updateRecurring') && sameRow(q),
      );
      if (i >= 0) {
        const prev = outbox[i];
        if (prev.kind === 'insertRecurring')
          return replaceAt(i, { ...prev, recurring: { ...prev.recurring, ...op.patch } });
        if (prev.kind === 'updateRecurring')
          return replaceAt(i, { ...prev, patch: { ...prev.patch, ...op.patch } });
      }
      break;
    }
    case 'updateBank': {
      const i = outbox.findIndex((q) => (q.kind === 'insertBank' || q.kind === 'updateBank') && sameRow(q));
      if (i >= 0) {
        const prev = outbox[i];
        if (prev.kind === 'insertBank') return replaceAt(i, { ...prev, bank: { ...prev.bank, ...op.patch } });
        if (prev.kind === 'updateBank')
          return replaceAt(i, { ...prev, patch: { ...prev.patch, ...op.patch } });
      }
      break;
    }
    case 'deleteRecurring':
    case 'deleteBank': {
      const insert = op.kind === 'deleteRecurring' ? 'insertRecurring' : 'insertBank';
      const neverSent = outbox.some((q) => q.kind === insert && sameRow(q));
      const rest = outbox.filter((q) => !sameRow(q));
      return neverSent ? rest : [...rest, { ...op, opId }];
    }
  }
  return [...outbox, { ...op, opId }];
}
