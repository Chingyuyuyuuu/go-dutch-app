import type { SupabaseClient } from '@supabase/supabase-js';

import { DEFAULT_CATEGORY_SET, isCategoryCode, isCategorySet } from '@/lib/categories';
import {
  ACCENT_THEMES,
  BG_THEMES,
  BUBBLE_OPACITIES,
  DEFAULT_PROFILE,
  type BankAccount,
  type BalanceCheck,
  type Entry,
  type EntryType,
  type JoinRequest,
  type RateChange,
  type FxSource,
  type Friend,
  type Invite,
  type Ledger,
  type LedgerMember,
  type LedgerPref,
  type LocalePref,
  type NewEntry,
  type PlaceholderFriend,
  type Recurring,
  type ShareHandling,
  type UserProfile,
} from '@/lib/domain';
import { FREQUENCIES } from '@/lib/recurring';

import { normaliseRate } from '@/lib/fx';

import type { BankPatch, LedgerPatch, Op, RecurringPatch } from '../local/ops';
import type {
  AcceptInviteResult,
  AnswerJoinResult,
  MidRate,
  RequestJoinResult,
  ShareLink,
  PulledEntry,
  PullResult,
  PushResult,
  RemoteApi,
} from '../sync/SyncEngine';

// All columns: a server one migration behind (or ahead) still syncs.
const ENTRY_COLUMNS = '*';
const PAGE = 1000;
/** Postgres / PostgREST codes for a table the server doesn't have yet. */
const MISSING_TABLE = ['42P01', 'PGRST205'];

/**
 * Supabase tables and functions (supabase/migrations). Row level security limits
 * every query to the signed-in user's own rows and the ledgers they belong to;
 * membership and friendships only change through the server functions.
 */
export class SupabaseRemote implements RemoteApi {
  constructor(
    private sb: SupabaseClient,
    private uid: string,
    /** The phone's IANA time zone: charges are recorded on the user's own calendar day. */
    private timeZone: () => string | null = () => null,
  ) {}

  async push(op: Op): Promise<PushResult> {
    const { error, status } = await this.send(op);
    if (!error) return { status: 'ok' };
    // status 0 = network failure (offline); 5xx / 408 / 429 = try again later.
    if (status === 0 || status >= 500 || status === 408 || status === 429) return { status: 'retry' };
    // Already created (a retry after the response was lost).
    const isInsert = [
      'insertLedger',
      'insertEntry',
      'addPlaceholder',
      'createInvite',
      'insertRecurring',
      'insertBank',
    ].includes(op.kind);
    if (error.code === '23505' && isInsert) return { status: 'ok' };
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
          // Phase 6 settings only when they differ from the server's defaults, so a server without
          // the Phase 6 migration still accepts the ledger.
          ...(l.entryCurrency && { entry_currency: l.entryCurrency }),
          ...(l.categorySet && l.categorySet !== DEFAULT_CATEGORY_SET && { category_set: l.categorySet }),
          ...(l.rates && Object.keys(l.rates).length > 0 && { rates: l.rates }),
        });
      }
      case 'createSharedLedger': {
        const l = op.ledger;
        return sb.rpc('create_shared_ledger', {
          p_ledger: {
            id: l.id,
            name: l.name,
            currency: l.currency,
            createdAt: new Date(l.createdAt).toISOString(),
            // Ignored by a server without the Phase 6 migration.
            entryCurrency: l.entryCurrency ?? null,
            categorySet: l.categorySet ?? DEFAULT_CATEGORY_SET,
            rates: l.rates ?? {},
          },
          p_members: l.members.map(memberArg),
        });
      }
      case 'addMembers':
        return sb.rpc('add_ledger_members', {
          p_ledger_id: op.ledgerId,
          p_members: op.members.map(memberArg),
        });
      case 'updateLedger':
        return sb.from('ledgers').update(ledgerRow(op.patch)).eq('id', op.ledgerId);
      case 'leaveLedger':
        return sb.rpc('leave_ledger', { p_ledger_id: op.ledgerId });
      case 'ledgerPref':
        return sb.from('ledger_prefs').upsert(
          {
            user_id: this.uid,
            ledger_id: op.ledgerId,
            starred: op.pref.starred,
            sort_order: op.pref.order,
            ...(op.pref.shareHandling && { share_handling: op.pref.shareHandling }),
            ...(op.pref.shareTargetLedgerId !== undefined && {
              share_target_ledger_id: op.pref.shareTargetLedgerId,
            }),
          },
          { onConflict: 'user_id,ledger_id' },
        );
      case 'insertEntry': {
        const e = op.entry;
        return sb.from('entries').insert({
          id: e.id,
          ledger_id: e.ledgerId,
          created_at: new Date(e.createdAt).toISOString(),
          ...entryRow(e),
        });
      }
      case 'updateEntry':
        return sb.from('entries').update(entryRow(op.patch)).eq('id', op.entryId);
      case 'deleteEntry':
        return sb.from('entries').update({ deleted_at: new Date().toISOString() }).eq('id', op.entryId);
      case 'friendStar':
        return sb
          .from('friendships')
          .update({ starred: op.starred })
          .eq('user_id', this.uid)
          .eq('friend_id', op.uid);
      case 'addPlaceholder':
        return sb.from('placeholder_friends').insert({
          id: op.placeholder.id,
          name: op.placeholder.name,
          created_at: new Date(op.placeholder.createdAt).toISOString(),
        });
      case 'createInvite':
        return sb.from('invites').insert({
          code: op.invite.code,
          placeholder_id: op.invite.placeholderId,
          created_at: new Date(op.invite.createdAt).toISOString(),
        });
      case 'insertRecurring': {
        const r = op.recurring;
        return sb.from('recurring').insert({
          id: r.id,
          kind: r.kind,
          created_at: new Date(r.createdAt).toISOString(),
          ...recurringRow(r),
        });
      }
      case 'updateRecurring':
        return sb.from('recurring').update(recurringRow(op.patch)).eq('id', op.recurringId);
      case 'deleteRecurring':
        return sb.from('recurring').update({ deleted_at: new Date().toISOString() }).eq('id', op.recurringId);
      case 'insertBank': {
        const b = op.bank;
        return sb.from('bank_accounts').insert({
          id: b.id,
          created_at: new Date(b.createdAt).toISOString(),
          ...bankRow(b),
        });
      }
      case 'updateBank':
        return sb.from('bank_accounts').update(bankRow(op.patch)).eq('id', op.bankId);
      case 'deleteBank':
        return sb.from('bank_accounts').update({ deleted_at: new Date().toISOString() }).eq('id', op.bankId);
    }
  }

  async runRecurring(): Promise<void> {
    const { error } = await this.sb.rpc('run_my_recurring', { p_time_zone: this.timeZone() });
    if (error) throw error;
  }

  async midRate(from: string, to: string): Promise<MidRate | null> {
    const { data, error } = await this.sb.rpc('mid_rate', { p_from: from, p_to: to });
    if (error) throw error;
    const row: unknown = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== 'object') return null;
    const { mid, as_of: asOf } = row as Row;
    const rate = typeof mid === 'number' || typeof mid === 'string' ? normaliseRate(String(mid)) : null;
    return rate && typeof asOf === 'string' ? { mid: rate, asOf } : null;
  }

  async getShareLink(ledgerId: string): Promise<ShareLink | null> {
    const { data, error } = await this.sb
      .from('ledger_share_links')
      .select('token, revoked_at')
      .eq('ledger_id', ledgerId)
      .maybeSingle();
    if (error) throw error;
    return data ? { token: str(data.token), live: !data.revoked_at } : null;
  }

  async createShareLink(ledgerId: string, regenerate: boolean): Promise<string> {
    const { data, error } = await this.sb.rpc('create_share_link', {
      p_ledger_id: ledgerId,
      p_regenerate: regenerate,
    });
    if (error) throw error;
    return str(data);
  }

  async revokeShareLink(ledgerId: string): Promise<void> {
    const { error } = await this.sb.rpc('revoke_share_link', { p_ledger_id: ledgerId });
    if (error) throw error;
  }

  async requestJoin(token: string, memberId: string | null): Promise<RequestJoinResult> {
    const { data, error } = await this.sb.rpc('request_join', { p_token: token, p_member_id: memberId });
    if (error) throw error;
    return oneOf<RequestJoinResult>(
      ['sent', 'pending', 'member', 'taken', 'invalid', 'signed-out'],
      data,
      'invalid',
    );
  }

  async answerJoinRequest(requestId: string, approve: boolean): Promise<AnswerJoinResult> {
    const { data, error } = await this.sb.rpc('answer_join_request', {
      p_request_id: requestId,
      p_approve: approve,
    });
    if (error) throw error;
    return oneOf<AnswerJoinResult>(['approved', 'rejected', 'taken', 'answered', 'gone'], data, 'gone');
  }

  async acceptInvite(code: string): Promise<AcceptInviteResult> {
    const { data, error, status } = await this.sb.rpc('accept_invite', { p_code: code });
    if (error) {
      if (status === 0 || status >= 500) return 'offline';
      throw error;
    }
    return data === 'ok' || data === 'self' || data === 'used' ? data : 'invalid';
  }

  async pull(cursor: string | null, knownLedgerIds: string[]): Promise<PullResult> {
    const sb = this.sb;
    const optional = async <T>(query: PromiseLike<{ data: T[] | null; error: { code?: string } | null }>) => {
      const { data, error } = await query;
      if (error && !MISSING_TABLE.includes(error.code ?? '')) throw error;
      return error ? [] : (data ?? []);
    };
    const [recurringRows, bankRows, requestRows] = await Promise.all([
      optional<Row>(sb.from('recurring').select('*').is('deleted_at', null)),
      optional<Row>(sb.from('bank_accounts').select('*').is('deleted_at', null)),
      // Phase 6 share page: join requests waiting for an answer.
      optional<Row>(sb.from('ledger_join_requests').select('*').eq('status', 'pending')),
    ]);
    const [profileRes, ledgersRes, prefsRes, friendsRes, placeholdersRes, invitesRes] = await Promise.all([
      sb.from('profiles').select('*').eq('id', this.uid).maybeSingle(),
      sb.from('ledgers').select(
        // All ledger columns: works with or without the Phase 6 migration.
        '*, ledger_members(*)',
      ),
      sb.from('ledger_prefs').select('*').eq('user_id', this.uid),
      sb.from('friendships').select('friend_id, friend_name, starred').eq('user_id', this.uid),
      sb.from('placeholder_friends').select('id, name, merged_user_id, created_at'),
      sb.from('invites').select('code, placeholder_id, created_at').eq('created_by', this.uid),
    ]);
    for (const res of [profileRes, ledgersRes, prefsRes, friendsRes, placeholdersRes, invitesRes]) {
      if (res.error) throw res.error;
    }
    const requests = requestRows.map(toJoinRequest);
    const ledgers = (ledgersRes.data ?? []).map((row) => {
      const ledger = toLedger(row);
      const waiting = requests.filter((r) => r.ledgerId === ledger.id).map(({ ledgerId: _, ...r }) => r);
      return waiting.length > 0 ? { ...ledger, joinRequests: waiting } : ledger;
    });

    // Re-read a small overlap before the cursor: rows committed slightly out of order are not missed.
    const since = cursor ? new Date(Date.parse(cursor) - 2 * 60_000).toISOString() : null;
    const entries: PulledEntry[] = [];
    let newCursor = cursor ?? new Date(0).toISOString();
    const collect = (rows: Record<string, unknown>[]) => {
      for (const row of rows) {
        const entry = toEntry(row);
        if (entry) entries.push(entry);
        if (typeof row.updated_at === 'string' && row.updated_at > newCursor) newCursor = row.updated_at;
      }
    };

    // Changes in ledgers this device already has (everything on the first download).
    await this.pages(collect, { since });
    // Ledgers that are new here (just joined, or a placeholder merged into this account): all their entries.
    const known = new Set(knownLedgerIds);
    const fresh = since ? ledgers.filter((l) => !known.has(l.id)).map((l) => l.id) : [];
    if (fresh.length > 0) await this.pages(collect, { since: null, ledgerIds: fresh });

    const prefs: Record<string, LedgerPref> = {};
    for (const p of prefsRes.data ?? []) {
      prefs[p.ledger_id] = {
        starred: p.starred,
        order: p.sort_order,
        shareHandling: (p.share_handling ?? 'ask') as ShareHandling,
        ...(p.share_target_ledger_id !== undefined && {
          shareTargetLedgerId: typeof p.share_target_ledger_id === 'string' ? p.share_target_ledger_id : null,
        }),
      };
    }

    return {
      profile: profileRes.data ? toProfile(profileRes.data) : null,
      ledgers,
      prefs,
      entries,
      friends: (friendsRes.data ?? []).map((f): Friend => ({
        uid: f.friend_id,
        name: f.friend_name,
        starred: f.starred,
      })),
      placeholders: (placeholdersRes.data ?? []).map((p): PlaceholderFriend => ({
        id: p.id,
        name: p.name,
        mergedUid: p.merged_user_id,
        createdAt: Date.parse(p.created_at),
      })),
      invites: (invitesRes.data ?? []).map((i): Invite => ({
        code: i.code,
        placeholderId: i.placeholder_id,
        createdAt: Date.parse(i.created_at),
      })),
      recurring: recurringRows.flatMap((r) => toRecurring(r) ?? []),
      banks: bankRows.map(toBank),
      cursor: newCursor,
    };
  }

  /**
   * Reads entries page by page, oldest change first: changes since `since`
   * (including deletions), or all live entries when `since` is null.
   */
  private async pages(
    collect: (rows: Record<string, unknown>[]) => void,
    filter: { since: string | null; ledgerIds?: string[] },
  ) {
    for (let from = 0; ; from += PAGE) {
      let q = this.sb
        .from('entries')
        .select(ENTRY_COLUMNS)
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      q = filter.since ? q.gte('updated_at', filter.since) : q.is('deleted_at', null);
      if (filter.ledgerIds) q = q.in('ledger_id', filter.ledgerIds);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      collect(rows);
      if (rows.length < PAGE) break;
    }
  }

  subscribe(onChange: () => void): () => void {
    const channel = this.sb.channel(`sync:${this.uid}`);
    const tables = [
      'entries',
      'ledgers',
      'ledger_members',
      'ledger_prefs',
      'profiles',
      'friendships',
      'placeholder_friends',
      'invites',
      'recurring',
      'bank_accounts',
    ];
    for (const table of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange());
    }
    channel.subscribe();
    return () => {
      void this.sb.removeChannel(channel);
    };
  }
}

function memberArg(m: LedgerMember) {
  return { id: m.id, uid: m.uid, placeholderId: m.placeholderId, name: m.name };
}

function recurringRow(patch: RecurringPatch) {
  return {
    ...(patch.name !== undefined && { name: patch.name }),
    ...(patch.amountMinor !== undefined && { amount_minor: patch.amountMinor }),
    ...(patch.ledgerId !== undefined && { ledger_id: patch.ledgerId }),
    ...(patch.categoryCode !== undefined && { category_code: patch.categoryCode }),
    ...(patch.frequency !== undefined && { frequency: patch.frequency }),
    ...(patch.startDate !== undefined && { start_date: patch.startDate }),
    ...(patch.remindDayBefore !== undefined && { remind_day_before: patch.remindDayBefore }),
    ...(patch.instalments !== undefined && { instalments: patch.instalments }),
    ...(patch.payerMemberId !== undefined && { payer_member_id: patch.payerMemberId }),
    ...(patch.source !== undefined && { source: patch.source }),
  };
}

function bankRow(patch: BankPatch) {
  return {
    ...(patch.name !== undefined && { name: patch.name }),
    ...(patch.currency !== undefined && { currency: patch.currency }),
    ...(patch.linkedLedgerIds !== undefined && { linked_ledger_ids: patch.linkedLedgerIds }),
    ...(patch.checks !== undefined && { checks: patch.checks }),
  };
}

function ledgerRow(patch: LedgerPatch) {
  return {
    ...(patch.name !== undefined && { name: patch.name }),
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.entryCurrency !== undefined && { entry_currency: patch.entryCurrency }),
    ...(patch.categorySet !== undefined && { category_set: patch.categorySet }),
    ...(patch.rates !== undefined && { rates: patch.rates }),
  };
}

function profileRow(patch: Partial<UserProfile>) {
  return {
    ...(patch.displayName !== undefined && { display_name: patch.displayName }),
    ...(patch.locale !== undefined && { locale: patch.locale }),
    ...(patch.starredCurrencies !== undefined && { starred_currencies: patch.starredCurrencies }),
    ...(patch.lastUsedLedger !== undefined && { last_used_ledger: patch.lastUsedLedger }),
    ...(patch.lastLedgerId !== undefined && { last_ledger_id: patch.lastLedgerId }),
    ...(patch.bankReminder !== undefined && { bank_reminder: patch.bankReminder }),
    ...(patch.bgTheme !== undefined && { bg_theme: patch.bgTheme }),
    ...(patch.accentTheme !== undefined && { accent_theme: patch.accentTheme }),
    ...(patch.bubbleOpacity !== undefined && { bubble_opacity: patch.bubbleOpacity }),
    ...(patch.homePhoto !== undefined && { home_photo_path: patch.homePhoto }),
  };
}

function entryRow(patch: Partial<NewEntry> | Entry) {
  return {
    ...(patch.type !== undefined && { type: patch.type }),
    ...(patch.amountMinor !== undefined && { amount_minor: patch.amountMinor }),
    ...(patch.categoryCode !== undefined && { category_code: patch.categoryCode }),
    ...(patch.date !== undefined && { date: patch.date }),
    ...(patch.note !== undefined && { note: patch.note }),
    ...(patch.isSplit !== undefined && { is_split: patch.isSplit }),
    ...(patch.payerMemberId !== undefined && { payer_member_id: patch.payerMemberId }),
    ...(patch.shares !== undefined && { shares: patch.shares }),
    ...(patch.recordedOnBehalf !== undefined && { recorded_on_behalf: patch.recordedOnBehalf }),
    ...(patch.sourceEntryId !== undefined && { source_entry_id: patch.sourceEntryId }),
    ...(patch.sourceLedgerId !== undefined && { source_ledger_id: patch.sourceLedgerId }),
    // Only set for entries in another currency (LocalRepo leaves them out otherwise). The converted
    // amounts are never sent: the server derives them from the rate.
    ...(patch.currency !== undefined && { currency: patch.currency }),
    ...(patch.fxRate !== undefined && { fx_rate: patch.fxRate }),
    ...(patch.fxSource !== undefined && { fx_source: patch.fxSource }),
  };
}

type Row = Record<string, unknown>;
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: unknown) => (typeof v === 'string' ? v : null);
const time = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : 0);
const LOCALES: LocalePref[] = ['system', 'zh-TW', 'en-AU'];
const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;
const ENTRY_TYPES: EntryType[] = ['expense', 'income', 'repayment'];

function toProfile(row: Row): UserProfile {
  return {
    displayName: str(row.display_name),
    locale: LOCALES.includes(row.locale as LocalePref) ? (row.locale as LocalePref) : DEFAULT_PROFILE.locale,
    starredCurrencies: Array.isArray(row.starred_currencies)
      ? row.starred_currencies.filter((c): c is string => typeof c === 'string')
      : DEFAULT_PROFILE.starredCurrencies,
    lastUsedLedger:
      row.last_used_ledger && typeof row.last_used_ledger === 'object'
        ? (row.last_used_ledger as Record<string, string>)
        : {},
    lastLedgerId: strOrNull(row.last_ledger_id),
    bankReminder: row.bank_reminder === 'monthly' ? 'monthly' : 'weekly',
    bgTheme: oneOf(BG_THEMES, row.bg_theme, DEFAULT_PROFILE.bgTheme),
    accentTheme: oneOf(ACCENT_THEMES, row.accent_theme, DEFAULT_PROFILE.accentTheme),
    bubbleOpacity: oneOf(BUBBLE_OPACITIES, row.bubble_opacity, DEFAULT_PROFILE.bubbleOpacity),
    homePhoto: strOrNull(row.home_photo_path),
  };
}

const KINDS: Recurring['kind'][] = ['regular', 'instalment', 'split'];

function toRecurring(row: Row): Recurring | null {
  const categoryCode = str(row.category_code);
  const kind = row.kind as Recurring['kind'];
  const frequency = row.frequency as Recurring['frequency'];
  if (!isCategoryCode(categoryCode) || !KINDS.includes(kind) || !FREQUENCIES.includes(frequency)) return null;
  return {
    id: str(row.id),
    ownerUid: str(row.owner_id),
    kind,
    name: str(row.name),
    amountMinor: Number(row.amount_minor),
    ledgerId: str(row.ledger_id),
    categoryCode,
    frequency,
    startDate: str(row.start_date),
    remindDayBefore: row.remind_day_before === true,
    instalments: typeof row.instalments === 'number' ? row.instalments : null,
    payerMemberId: strOrNull(row.payer_member_id),
    source: row.source === 'apple' ? 'apple' : null,
    paidCount: Number(row.paid_count) || 0,
    createdAt: time(row.created_at),
  };
}

function toBank(row: Row): BankAccount {
  const checks = Array.isArray(row.checks) ? (row.checks as Row[]) : [];
  return {
    id: str(row.id),
    name: str(row.name),
    currency: str(row.currency, 'AUD'),
    linkedLedgerIds: Array.isArray(row.linked_ledger_ids)
      ? row.linked_ledger_ids.filter((id): id is string => typeof id === 'string')
      : [],
    checks: checks.map((c): BalanceCheck => ({
      date: str(c.date),
      balanceMinor: Number(c.balanceMinor) || 0,
      gapMinor: Number(c.gapMinor) || 0,
      at: Number(c.at) || 0,
    })),
    createdAt: time(row.created_at),
  };
}

function toLedger(row: Row): Ledger {
  const rows = Array.isArray(row.ledger_members) ? (row.ledger_members as Row[]) : [];
  const members: LedgerMember[] = rows.map((m) => ({
    id: str(m.id),
    uid: strOrNull(m.user_id),
    placeholderId: strOrNull(m.placeholder_id),
    name: str(m.display_name),
    leftAt: m.left_at ? time(m.left_at) : null,
    ...(m.share_joined_at !== undefined && {
      shareJoinedAt: m.share_joined_at ? time(m.share_joined_at) : null,
    }),
  }));
  const categorySet = str(row.category_set);
  return {
    id: str(row.id),
    name: str(row.name),
    currency: str(row.currency, 'AUD'),
    // Phase 6 columns; missing on a server without the migration.
    ...('entry_currency' in row && { entryCurrency: strOrNull(row.entry_currency) }),
    ...(isCategorySet(categorySet) && { categorySet }),
    ...(row.rates !== undefined && { rates: toRates(row.rates) }),
    ...(row.rate_changes !== undefined && { rateChanges: toRateChanges(row.rate_changes) }),
    kind: row.kind === 'shared' ? 'shared' : 'personal',
    status: row.status === 'ended' ? 'ended' : 'active',
    ownerUid: str(row.owner_id),
    members,
    memberUids: members.filter((m) => m.uid && m.leftAt === null).map((m) => m.uid as string),
    createdAt: time(row.created_at),
  };
}

function toRateChanges(value: unknown): Record<string, RateChange> {
  if (!value || typeof value !== 'object') return {};
  const changes: Record<string, RateChange> = {};
  for (const [code, change] of Object.entries(value as Record<string, Row>)) {
    if (!change || typeof change !== 'object') continue;
    const rate = typeof change.rate === 'string' ? normaliseRate(change.rate) : null;
    if (rate) changes[code] = { byUid: strOrNull(change.by), rate, at: time(change.at) };
  }
  return changes;
}

function toJoinRequest(row: Row): JoinRequest & { ledgerId: string } {
  return {
    id: str(row.id),
    ledgerId: str(row.ledger_id),
    uid: str(row.user_id),
    name: str(row.requester_name),
    memberId: strOrNull(row.member_id),
    createdAt: time(row.created_at),
  };
}

function toRates(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const rates: Record<string, string> = {};
  for (const [code, rate] of Object.entries(value as Record<string, unknown>)) {
    const normalised = typeof rate === 'string' ? normaliseRate(rate) : null;
    if (normalised) rates[code] = normalised;
  }
  return rates;
}

const FX_SOURCES: FxSource[] = ['same', 'ledger', 'manual', 'split'];

/** A jsonb object of member key -> whole minor units. */
function toAmounts(value: unknown): Record<string, number> | null {
  return value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, Number(v)]))
    : null;
}

/** Phase 6 conversion columns, when the server has them. numeric arrives as a JSON number. */
function toConversion(row: Row): Partial<Entry> {
  if (typeof row.currency !== 'string') return {};
  const rate = typeof row.fx_rate === 'number' || typeof row.fx_rate === 'string' ? String(row.fx_rate) : '1';
  return {
    currency: row.currency,
    fxRate: normaliseRate(rate) ?? '1',
    fxSource: oneOf(FX_SOURCES, row.fx_source, 'same'),
    ...(row.amount_settle_minor != null && { amountSettleMinor: Number(row.amount_settle_minor) }),
    sharesSettle: toAmounts(row.shares_settle),
  };
}

function toEntry(row: Row): PulledEntry | null {
  const categoryCode = str(row.category_code);
  if (!isCategoryCode(categoryCode) || !ENTRY_TYPES.includes(row.type as EntryType)) return null;
  const shares = toAmounts(row.shares);
  return {
    id: str(row.id),
    ledgerId: str(row.ledger_id),
    type: row.type as EntryType,
    isSplit: row.is_split === true,
    amountMinor: Number(row.amount_minor),
    ...toConversion(row),
    categoryCode,
    date: str(row.date),
    note: str(row.note),
    payerMemberId: strOrNull(row.payer_member_id),
    shares,
    recordedOnBehalf: row.recorded_on_behalf === true,
    sourceEntryId: strOrNull(row.source_entry_id),
    sourceLedgerId: strOrNull(row.source_ledger_id),
    recurringId: strOrNull(row.recurring_id),
    recurringSeq: typeof row.recurring_seq === 'number' ? row.recurring_seq : null,
    createdBy: str(row.created_by),
    lastEditedBy: str(row.last_edited_by),
    createdAt: time(row.created_at),
    updatedAt: time(row.updated_at),
    deleted: row.deleted_at != null,
  };
}
