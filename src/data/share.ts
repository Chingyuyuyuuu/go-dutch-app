import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { isCategoryCode } from '@/lib/categories';
import type { Entry, FxSource } from '@/lib/domain';
import { normaliseRate } from '@/lib/fx';

import { getSupabase, isSupabaseConfigured } from './supabase/client';

/** One member as the share page sees them: no account details (spec §6B.2). */
export type SharedMember = {
  id: string;
  name: string;
  hasAccount: boolean;
  left: boolean;
  /** Someone has asked to be this member and is waiting for the creator. */
  claimPending: boolean;
};

export type SharedLedgerView = {
  ledger: { id: string; name: string; currency: string; ended: boolean; ownerMemberId: string | null };
  members: SharedMember[];
  /** Newest first. Shaped like app entries so the same balance code and bubbles work. */
  entries: Entry[];
};

export type SharedLedgerResult =
  | { status: 'ok'; view: SharedLedgerView }
  /** Unknown or turned-off link, or the ledger was deleted. */
  | { status: 'invalid' }
  | { status: 'offline' }
  /** This build has no server (demo-only web preview). */
  | { status: 'unavailable' };

type Row = Record<string, unknown>;
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const amounts = (v: unknown): Record<string, number> | null =>
  v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v as Row).map(([k, n]) => [k, Number(n)]))
    : null;
const FX_SOURCES: FxSource[] = ['same', 'ledger', 'manual', 'split'];

function toEntry(row: Row, ledgerId: string): Entry | null {
  const categoryCode = str(row.categoryCode);
  const type = row.type;
  if (!isCategoryCode(categoryCode) || (type !== 'expense' && type !== 'income' && type !== 'repayment')) {
    return null;
  }
  const rate = row.fxRate != null ? normaliseRate(String(row.fxRate)) : null;
  const createdAt = Date.parse(str(row.createdAt)) || 0;
  return {
    id: str(row.id),
    ledgerId,
    type,
    isSplit: row.isSplit === true,
    amountMinor: Number(row.amountMinor),
    ...(typeof row.currency === 'string' && {
      currency: row.currency,
      fxRate: rate ?? '1',
      fxSource: FX_SOURCES.includes(row.fxSource as FxSource) ? (row.fxSource as FxSource) : 'same',
      ...(row.amountSettleMinor != null && { amountSettleMinor: Number(row.amountSettleMinor) }),
      sharesSettle: amounts(row.sharesSettle),
    }),
    categoryCode,
    date: str(row.date),
    note: str(row.note),
    payerMemberId: typeof row.payerMemberId === 'string' ? row.payerMemberId : null,
    shares: amounts(row.shares),
    recordedOnBehalf: row.recordedOnBehalf === true,
    sourceEntryId: null,
    sourceLedgerId: null,
    recurringId: null,
    recurringSeq: null,
    createdBy: '',
    lastEditedBy: '',
    createdAt,
    updatedAt: createdAt,
  };
}

/** Reads get_shared_ledger's JSON. Null when it is not a share page. */
export function parseSharedLedger(value: unknown): SharedLedgerView | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Row;
  const ledger = data.ledger as Row | undefined;
  if (!ledger || typeof ledger.id !== 'string') return null;
  const members = Array.isArray(data.members) ? (data.members as Row[]) : [];
  const entries = Array.isArray(data.entries) ? (data.entries as Row[]) : [];
  return {
    ledger: {
      id: ledger.id,
      name: str(ledger.name),
      currency: str(ledger.currency, 'TWD'),
      ended: ledger.status === 'ended',
      ownerMemberId: typeof ledger.ownerMemberId === 'string' ? ledger.ownerMemberId : null,
    },
    members: members.map((m) => ({
      id: str(m.id),
      name: str(m.name),
      hasAccount: m.hasAccount === true,
      left: m.left === true,
      claimPending: m.claimPending === true,
    })),
    entries: entries.flatMap((e) => toEntry(e, ledger.id as string) ?? []),
  };
}

/** Fetches a share page. Works signed out (spec §6B.4). */
export async function fetchSharedLedger(token: string): Promise<SharedLedgerResult> {
  if (!isSupabaseConfigured()) return { status: 'unavailable' };
  try {
    const { data, error } = await getSupabase().rpc('get_shared_ledger', { p_token: token });
    if (error) {
      // A server without the share page migration has no such function: the link cannot work.
      return error.code === 'PGRST202' ? { status: 'invalid' } : { status: 'offline' };
    }
    const view = parseSharedLedger(data);
    return view ? { status: 'ok', view } : { status: 'invalid' };
  } catch {
    return { status: 'offline' };
  }
}

/** The share page, fetched once, with a manual refresh (no live updates, §6B.2). */
export function useSharedLedger(token: string) {
  const [result, setResult] = useState<SharedLedgerResult | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    void fetchSharedLedger(token).then((fetched) => {
      if (!live) return;
      setResult(fetched);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [token]);
  const refresh = useCallback(async () => {
    setLoading(true);
    setResult(await fetchSharedLedger(token));
    setLoading(false);
  }, [token]);
  return { result, loading, refresh };
}

// "Who am I?" on a share page: remembered in this browser only, per link.
const whoKey = (token: string) => `go-dutch/share-me/${token}`;

/** The member a visitor picked on this share page, remembered in this browser. */
export function useShareIdentity(token: string) {
  const [memberId, setMemberId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void AsyncStorage.getItem(whoKey(token)).then((id) => {
      if (live) setMemberId(id);
    });
    return () => {
      live = false;
    };
  }, [token]);
  const choose = useCallback(
    (id: string | null) => {
      setMemberId(id);
      void (id ? AsyncStorage.setItem(whoKey(token), id) : AsyncStorage.removeItem(whoKey(token)));
    },
    [token],
  );
  return [memberId, choose] as const;
}

// A join request started while signed out is sent right after sign-in.
const PENDING_JOIN_KEY = 'go-dutch/pending-join';

export type PendingJoin = { token: string; memberId: string | null; ledgerName: string; ownerName: string };

export async function rememberJoin(join: PendingJoin) {
  await AsyncStorage.setItem(PENDING_JOIN_KEY, JSON.stringify(join));
}

export async function takePendingJoin(): Promise<PendingJoin | null> {
  const raw = await AsyncStorage.getItem(PENDING_JOIN_KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(PENDING_JOIN_KEY);
  try {
    const join = JSON.parse(raw) as PendingJoin;
    return typeof join.token === 'string' ? join : null;
  } catch {
    return null;
  }
}
