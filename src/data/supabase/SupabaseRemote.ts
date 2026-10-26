import type { SupabaseClient } from '@supabase/supabase-js';

import { isCategoryCode } from '@/lib/categories';
import {
  DEFAULT_PROFILE,
  type EntryType,
  type Ledger,
  type LedgerPref,
  type LocalePref,
  type NewEntry,
  type UserProfile,
} from '@/lib/domain';

import type { Op } from '../local/ops';
import type { PulledEntry, PullResult, PushResult, RemoteApi } from '../sync/SyncEngine';

/**
 * Supabase tables (supabase/migrations): profiles, ledgers, ledger_members,
 * ledger_prefs, entries. Row level security limits every query to the
 * signed-in user's own rows and the ledgers they belong to.
 */
export class SupabaseRemote implements RemoteApi {
  constructor(
    private sb: SupabaseClient,
    private uid: string,
  ) {}

  async push(op: Op): Promise<PushResult> {
    const { error, status } = await this.send(op);
    if (!error) return { status: 'ok' };
    // status 0 = network failure (offline); 5xx / 408 / 429 = try again later.
    if (status === 0 || status >= 500 || status === 408 || status === 429) return { status: 'retry' };
    // Already inserted (a retry after the response was lost).
    if (error.code === '23505' && (op.kind === 'insertLedger' || op.kind === 'insertEntry'))
      return { status: 'ok' };
    return { status: 'rejected', error };
  }

  private send(op: Op) {
    const sb = this.sb;
    switch (op.kind) {
      case 'profile':
        return sb.from('profiles').upsert({ id: this.uid, ...profileRow(op.patch) }, { onConflict: 'id' });
      case 'insertLedger': {
        const l = op.ledger;
        return sb.from('ledgers').insert({
          id: l.id,
          name: l.name,
          currency: l.currency,
          kind: l.kind,
          status: l.status,
          created_at: new Date(l.createdAt).toISOString(),
        });
      }
      case 'ledgerPref':
        return sb
          .from('ledger_prefs')
          .upsert(
            {
              user_id: this.uid,
              ledger_id: op.ledgerId,
              starred: op.pref.starred,
              sort_order: op.pref.order,
            },
            { onConflict: 'user_id,ledger_id' },
          );
      case 'insertEntry': {
        const e = op.entry;
        return sb.from('entries').insert({
          id: e.id,
          ledger_id: e.ledgerId,
          created_at: new Date(e.createdAt).toISOString(),
          is_split: e.isSplit,
          ...entryRow(e),
        });
      }
      case 'updateEntry':
        return sb.from('entries').update(entryRow(op.patch)).eq('id', op.entryId);
      case 'deleteEntry':
        return sb.from('entries').update({ deleted_at: new Date().toISOString() }).eq('id', op.entryId);
    }
  }

  async pull(cursor: string | null): Promise<PullResult> {
    const sb = this.sb;
    const [profileRes, ledgersRes, prefsRes] = await Promise.all([
      sb
        .from('profiles')
        .select('locale, starred_currencies, last_used_ledger')
        .eq('id', this.uid)
        .maybeSingle(),
      sb
        .from('ledgers')
        .select('id, name, currency, kind, status, owner_id, created_at, ledger_members(user_id)'),
      sb.from('ledger_prefs').select('ledger_id, starred, sort_order').eq('user_id', this.uid),
    ]);
    for (const res of [profileRes, ledgersRes, prefsRes]) if (res.error) throw res.error;

    // Re-read a small overlap before the cursor: rows committed slightly out of order are not missed.
    const since = cursor ? new Date(Date.parse(cursor) - 2 * 60_000).toISOString() : null;
    const entries: PulledEntry[] = [];
    let newCursor = cursor ?? new Date(0).toISOString();
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      let q = sb
        .from('entries')
        .select(
          'id, ledger_id, type, is_split, amount_minor, category_code, date, note, created_by, last_edited_by, created_at, updated_at, deleted_at',
        )
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      // First download: deleted rows are irrelevant.
      q = since ? q.gte('updated_at', since) : q.is('deleted_at', null);
      const { data, error } = await q;
      if (error) throw error;
      for (const row of data ?? []) {
        const entry = toEntry(row);
        if (entry) entries.push(entry);
        if (row.updated_at > newCursor) newCursor = row.updated_at;
      }
      if (!data || data.length < PAGE) break;
    }

    const prefs: Record<string, LedgerPref> = {};
    for (const p of prefsRes.data ?? []) prefs[p.ledger_id] = { starred: p.starred, order: p.sort_order };

    return {
      profile: profileRes.data ? toProfile(profileRes.data) : null,
      ledgers: (ledgersRes.data ?? []).map(toLedger),
      prefs,
      entries,
      cursor: newCursor,
    };
  }

  subscribe(onChange: () => void): () => void {
    const channel = this.sb.channel(`sync:${this.uid}`);
    for (const table of ['entries', 'ledgers', 'ledger_prefs', 'profiles']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange());
    }
    channel.subscribe();
    return () => {
      void this.sb.removeChannel(channel);
    };
  }
}

function profileRow(patch: Partial<UserProfile>) {
  return {
    ...(patch.locale !== undefined && { locale: patch.locale }),
    ...(patch.starredCurrencies !== undefined && { starred_currencies: patch.starredCurrencies }),
    ...(patch.lastUsedLedger !== undefined && { last_used_ledger: patch.lastUsedLedger }),
  };
}

function entryRow(patch: Partial<NewEntry>) {
  return {
    ...(patch.type !== undefined && { type: patch.type }),
    ...(patch.amountMinor !== undefined && { amount_minor: patch.amountMinor }),
    ...(patch.categoryCode !== undefined && { category_code: patch.categoryCode }),
    ...(patch.date !== undefined && { date: patch.date }),
    ...(patch.note !== undefined && { note: patch.note }),
  };
}

type Row = Record<string, unknown>;
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const time = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : 0);
const LOCALES: LocalePref[] = ['system', 'zh-TW', 'en-AU'];
const ENTRY_TYPES: EntryType[] = ['expense', 'income', 'repayment'];

function toProfile(row: Row): UserProfile {
  return {
    locale: LOCALES.includes(row.locale as LocalePref) ? (row.locale as LocalePref) : DEFAULT_PROFILE.locale,
    starredCurrencies: Array.isArray(row.starred_currencies)
      ? row.starred_currencies.filter((c): c is string => typeof c === 'string')
      : DEFAULT_PROFILE.starredCurrencies,
    lastUsedLedger:
      row.last_used_ledger && typeof row.last_used_ledger === 'object'
        ? (row.last_used_ledger as Record<string, string>)
        : {},
  };
}

function toLedger(row: Row): Ledger {
  const members = Array.isArray(row.ledger_members) ? (row.ledger_members as { user_id: string }[]) : [];
  return {
    id: str(row.id),
    name: str(row.name),
    currency: str(row.currency, 'AUD'),
    kind: row.kind === 'shared' ? 'shared' : 'personal',
    status: row.status === 'ended' ? 'ended' : 'active',
    ownerUid: str(row.owner_id),
    memberUids: members.map((m) => m.user_id),
    createdAt: time(row.created_at),
  };
}

function toEntry(row: Row): PulledEntry | null {
  const categoryCode = str(row.category_code);
  if (!isCategoryCode(categoryCode) || !ENTRY_TYPES.includes(row.type as EntryType)) return null;
  return {
    id: str(row.id),
    ledgerId: str(row.ledger_id),
    type: row.type as EntryType,
    isSplit: row.is_split === true,
    amountMinor: Number(row.amount_minor),
    categoryCode,
    date: str(row.date),
    note: str(row.note),
    createdBy: str(row.created_by),
    lastEditedBy: str(row.last_edited_by),
    createdAt: time(row.created_at),
    updatedAt: time(row.updated_at),
    deleted: row.deleted_at != null,
  };
}
