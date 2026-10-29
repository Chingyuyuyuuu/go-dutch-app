import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useAppData } from '@/data/AppDataProvider';
import {
  rememberJoin,
  useShareIdentity,
  useSharedLedger,
  type SharedLedgerView,
  type SharedMember,
} from '@/data/share';
import { EntryBubble } from '@/features/home/EntryBubble';
import { useI18n } from '@/i18n';
import { memberNets, settleUpTransfers } from '@/lib/balances';
import { dayLabel, todayLocal } from '@/lib/date';
import { entryCurrency, settledAmount, type Entry } from '@/lib/domain';
import { groupByDay } from '@/lib/ledgers';
import { formatMoney } from '@/lib/money';
import { involves, memberTotals } from '@/lib/share';
import { IconButton, PillButton, Tag } from '@/ui/Buttons';
import { Sheet } from '@/ui/Overlay';
import { Screen } from '@/ui/Screen';
import { useColors } from '@/ui/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';

/**
 * Screen 29: a shared ledger anyone with the link can see, signed in or not
 * (spec §6B.2). Read-only; fetched once with a refresh button. Visitors can say
 * who they are (remembered in this browser) and ask to join (§6B.3).
 */
export function SharePageScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { result, loading, refresh } = useSharedLedger(token ?? '');

  const head = (
    <Head>
      <meta name="robots" content="noindex, nofollow" />
    </Head>
  );

  if (!result) {
    return (
      <Screen style={{ justifyContent: 'center', padding: 24 }}>
        {head}
        <Txt size={16} color={colors.neutral[700]}>
          {t('sharePage.loading')}
        </Txt>
      </Screen>
    );
  }
  if (result.status !== 'ok') {
    const offline = result.status === 'offline';
    return (
      <Screen style={{ justifyContent: 'center', padding: 24, gap: 16 }}>
        {head}
        <Txt font="heading" size={30} lineHeight={34}>
          {offline ? t('sharePage.offlineTitle') : t('sharePage.invalidTitle')}
        </Txt>
        <Txt size={15} lineHeight={22} color={colors.neutral[800]}>
          {offline
            ? t('share.offline')
            : result.status === 'unavailable'
              ? t('sharePage.unavailable')
              : t('sharePage.invalidBody')}
        </Txt>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {offline ? (
            <PillButton label={t('sharePage.retry')} disabled={loading} onPress={() => void refresh()} />
          ) : (
            <PillButton label={t('sharePage.openApp')} onPress={() => router.replace('/')} />
          )}
        </View>
      </Screen>
    );
  }
  return (
    <>
      {head}
      <SharedLedgerPage
        token={token ?? ''}
        view={result.view}
        loading={loading}
        onRefresh={() => void refresh()}
      />
    </>
  );
}

function SharedLedgerPage({
  token,
  view,
  loading,
  onRefresh,
}: {
  token: string;
  view: SharedLedgerView;
  loading: boolean;
  onRefresh: () => void;
}) {
  const colors = useColors();
  const { t, lang } = useI18n();
  const today = todayLocal();
  const [meId, setMeId] = useShareIdentity(token);
  const [onlyMine, setOnlyMine] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const { ledger, members, entries } = view;
  const cur = ledger.currency;
  const me = members.find((m) => m.id === meId);
  const name = (id: string | null) => {
    const m = members.find((x) => x.id === id);
    if (!m) return '?';
    return m.id === me?.id ? t('sharePage.you', { name: m.name }) : m.name;
  };

  const transfers = useMemo(
    () => settleUpTransfers(memberNets(entries), ledger.ownerMemberId, cur),
    [entries, ledger.ownerMemberId, cur],
  );
  const totalSpent = entries.reduce((sum, e) => sum + (e.type === 'expense' ? settledAmount(e) : 0), 0);
  const shown = me && onlyMine ? entries.filter((e) => involves(e, me.id)) : entries;
  const groups = groupByDay(shown);
  const totals = me ? memberTotals(entries, me.id) : null;
  const myTransfers = me ? transfers.filter((tr) => tr.from === me.id || tr.to === me.id) : [];
  const roundFor = (id: string) => (id === ledger.ownerMemberId ? 'floor' : 'ceil');

  const subtitle = (e: Entry) => {
    if (e.type === 'repayment') {
      const to = Object.keys(e.shares ?? {})[0] ?? null;
      return t('sharePage.repaid', { from: name(e.payerMemberId), to: name(to) });
    }
    const by = t(e.type === 'income' ? 'sharePage.receivedBy' : 'sharePage.paidBy', {
      name: name(e.payerMemberId),
    });
    const myShare = me ? (e.shares?.[me.id] ?? 0) : 0;
    if (!me || myShare <= 0) return by;
    const paidIn = entryCurrency(e, ledger);
    const amount = formatMoney(paidIn, myShare, { round: roundFor(me.id) });
    const settled = e.sharesSettle?.[me.id];
    const both =
      paidIn !== cur && settled !== undefined
        ? t('sharePage.bothCurrencies', {
            amount,
            approx: t('fx.approx', { amount: formatMoney(cur, settled, { round: roundFor(me.id) }) }),
          })
        : amount;
    return `${by} · ${t('sharePage.shareOf', { amount: both })}`;
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ paddingTop: 12, paddingHorizontal: 22, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt font="bold" size={12} caps color={colors.accentRamp[700]} style={{ flex: 1 }}>
              {t('sharePage.shared')}
            </Txt>
            <IconButton
              icon="rotate-ccw"
              accessibilityLabel={t('sharePage.refresh')}
              size={44}
              iconSize={18}
              onPress={onRefresh}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Txt font="heading" size={32} lineHeight={36}>
              {ledger.name}
            </Txt>
            <Txt font="bold" size={13} style={{ opacity: 0.65 }}>
              {cur}
            </Txt>
            {ledger.ended && (
              <Tag
                label={t('sharePage.ended')}
                background={colors.neutral[200]}
                color={colors.neutral[800]}
              />
            )}
          </View>
          <Txt size={13} color={colors.neutral[700]}>
            {members.map((m) => m.name).join(' · ')}
          </Txt>
        </View>

        <View style={{ paddingHorizontal: 14, paddingTop: 14, gap: 12 }}>
          <View style={{ borderRadius: 28, backgroundColor: colors.surface, padding: 18, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Txt size={13} color={colors.neutral[700]} style={{ flex: 1 }}>
                {t('sharePage.totalSpent')}
              </Txt>
              <Txt font="heading" size={26} tabular>
                {formatMoney(cur, totalSpent)}
              </Txt>
            </View>
            {me && totals && (
              <View style={{ gap: 4 }}>
                <Txt font="semibold" size={14}>
                  {`${t('sharePage.youPaid', { amount: formatMoney(cur, totals.paid) })} · ${t(
                    'sharePage.yourShare',
                    {
                      amount: formatMoney(cur, totals.share, { round: roundFor(me.id) }),
                    },
                  )}`}
                </Txt>
                {myTransfers.map((tr) => (
                  <Txt
                    key={`${tr.from}-${tr.to}`}
                    font="bold"
                    size={15}
                    color={tr.from === me.id ? colors.accentRamp[700] : colors.accent2Ramp[700]}
                  >
                    {tr.from === me.id
                      ? t('sharePage.youPay', { name: name(tr.to), amount: formatMoney(cur, tr.amount) })
                      : t('sharePage.paysYou', { name: name(tr.from), amount: formatMoney(cur, tr.amount) })}
                  </Txt>
                ))}
              </View>
            )}
            <View style={{ height: 1, backgroundColor: colors.divider }} />
            <Txt font="bold" size={11} caps color={colors.neutral[700]}>
              {t('sharePage.balance')}
            </Txt>
            {transfers.length === 0 ? (
              <Txt size={14}>{t('sharePage.settled')}</Txt>
            ) : (
              transfers.map((tr) => (
                <Txt key={`${tr.from}-${tr.to}`} size={14} tabular>
                  {t('sharePage.pays', {
                    from: name(tr.from),
                    to: name(tr.to),
                    amount: formatMoney(cur, tr.amount),
                  })}
                </Txt>
              ))
            )}
          </View>

          <View style={{ gap: 8 }}>
            <Txt font="semibold" size={13} color={colors.neutral[700]}>
              {t('sharePage.whoAmI')}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {members
                .filter((m) => !m.left)
                .map((m) => (
                  <MemberChip
                    key={m.id}
                    member={m}
                    on={m.id === meId}
                    onPress={() => setMeId(m.id === meId ? null : m.id)}
                  />
                ))}
            </View>
            <Txt size={12} color={colors.neutral[700]}>
              {t('sharePage.whoHint')}
            </Txt>
            {me && (
              <Pressable
                accessibilityRole="switch"
                aria-checked={onlyMine}
                onPress={() => setOnlyMine((v) => !v)}
                style={{
                  alignSelf: 'flex-start',
                  minHeight: 44,
                  paddingHorizontal: 16,
                  borderRadius: 999,
                  justifyContent: 'center',
                  backgroundColor: onlyMine ? colors.text : colors.surface,
                }}
              >
                <Txt font="bold" size={14} color={onlyMine ? colors.bg : colors.text}>
                  {t('sharePage.onlyMine')}
                </Txt>
              </Pressable>
            )}
          </View>
        </View>

        {groups.length === 0 && (
          <Txt size={14} color={colors.neutral[700]} style={{ paddingHorizontal: 24, paddingTop: 20 }}>
            {t('sharePage.noEntries')}
          </Txt>
        )}
        {groups.map((g) => (
          <View key={g.date} style={{ paddingTop: 8, paddingHorizontal: 14 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingTop: 8,
                paddingHorizontal: 10,
              }}
            >
              <Txt font="semibold" size={12} color={colors.neutral[700]}>
                {dayLabel(g.date, today, lang)}
              </Txt>
              <Txt font="semibold" size={12} color={colors.neutral[700]} tabular>
                {g.spent ? formatMoney(cur, g.spent) : ''}
              </Txt>
            </View>
            {g.entries.map((e) => (
              <EntryBubble
                key={e.id}
                entry={e}
                currency={cur}
                subtitle={subtitle(e)}
                subtitleLines={2}
                onPress={() => {}}
              />
            ))}
          </View>
        ))}
        {loading && (
          <Txt size={13} color={colors.neutral[700]} style={{ padding: 16, textAlign: 'center' }}>
            {t('sharePage.loading')}
          </Txt>
        )}
      </ScrollView>
      <View style={{ paddingTop: 10, paddingHorizontal: 16, paddingBottom: 6 }}>
        <PillButton label={t('sharePage.join')} height={56} fontSize={16} onPress={() => setJoinOpen(true)} />
      </View>
      {joinOpen && (
        <JoinSheet
          token={token}
          view={view}
          meId={meId}
          onPick={setMeId}
          onClose={() => setJoinOpen(false)}
          onJoined={onRefresh}
        />
      )}
    </Screen>
  );
}

function MemberChip({ member, on, onPress }: { member: SharedMember; on: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      aria-checked={on}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: 16,
        borderRadius: 999,
        justifyContent: 'center',
        borderWidth: 1,
        borderStyle: member.hasAccount ? 'solid' : 'dashed',
        borderColor: on ? 'transparent' : colors.neutral[500],
        backgroundColor: on ? colors.accent2Ramp[200] : 'transparent',
      }}
    >
      <Txt font="semibold" size={14}>
        {member.name}
      </Txt>
    </Pressable>
  );
}

const NOT_LISTED = 'not-listed';

/** "Join this ledger" (§6B.3): sign in for members with an account, otherwise ask the creator. */
function JoinSheet({
  token,
  view,
  meId,
  onPick,
  onClose,
  onJoined,
}: {
  token: string;
  view: SharedLedgerView;
  meId: string | null;
  onPick: (id: string | null) => void;
  onClose: () => void;
  onJoined: () => void;
}) {
  const colors = useColors();
  const { t } = useI18n();
  const { session, repo } = useAppData();
  const [choice, setChoice] = useState<string | null>(meId);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signedIn = session.status === 'ready' && repo?.kind === 'cloud';
  const owner = view.members.find((m) => m.id === view.ledger.ownerMemberId)?.name ?? t('sharePage.creator');
  const member = view.members.find((m) => m.id === choice);

  const send = async () => {
    const memberId = member ? member.id : null;
    if (!signedIn || !repo) {
      await rememberJoin({ token, memberId, ledgerName: view.ledger.name, ownerName: owner });
      onClose();
      return router.push('/sign-in');
    }
    setBusy(true);
    const result = await repo.requestJoin(token, memberId);
    setBusy(false);
    setMessage(joinResultMessage(result, owner, t));
    if (result === 'sent') onJoined();
  };

  return (
    <Sheet onClose={onClose} style={{ paddingHorizontal: 20, gap: 12 }}>
      <Txt font="heading" size={24} lineHeight={28} style={{ paddingTop: 10 }}>
        {t('sharePage.joinTitle', { name: view.ledger.name })}
      </Txt>
      {message ? (
        <>
          <Txt size={15} lineHeight={22}>
            {message}
          </Txt>
          <PillButton label={t('sharePage.openApp')} onPress={() => router.replace('/')} />
        </>
      ) : (
        <>
          <Txt font="semibold" size={13} color={colors.neutral[700]}>
            {t('sharePage.pickFirst')}
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {view.members
              .filter((m) => !m.left)
              .map((m) => (
                <MemberChip
                  key={m.id}
                  member={m}
                  on={choice === m.id}
                  onPress={() => {
                    setChoice(m.id);
                    onPick(m.id);
                  }}
                />
              ))}
            <Pressable
              accessibilityRole="radio"
              aria-checked={choice === NOT_LISTED}
              onPress={() => setChoice(NOT_LISTED)}
              style={{
                minHeight: 44,
                paddingHorizontal: 16,
                borderRadius: 999,
                justifyContent: 'center',
                backgroundColor: choice === NOT_LISTED ? colors.accentRamp[200] : colors.surface,
              }}
            >
              <Txt font="semibold" size={14}>
                {t('sharePage.notListed')}
              </Txt>
            </Pressable>
          </View>
          {member?.hasAccount ? (
            <>
              <Txt size={14} lineHeight={20}>
                {t('sharePage.hasAccount', { name: member.name })}
              </Txt>
              <PillButton
                label={signedIn ? t('sharePage.openApp') : t('sharePage.signIn')}
                onPress={() => router.replace(signedIn ? '/' : '/sign-in')}
              />
            </>
          ) : member?.claimPending ? (
            <Txt size={14} lineHeight={20}>
              {t('sharePage.claimPending', { name: member.name })}
            </Txt>
          ) : member || choice === NOT_LISTED ? (
            <>
              <Txt size={14} lineHeight={20}>
                {member
                  ? t('sharePage.askAs', { name: member.name, owner })
                  : t('sharePage.askNew', { owner })}
              </Txt>
              <PillButton
                label={signedIn ? t('sharePage.send') : t('sharePage.signInToSend')}
                disabled={busy}
                onPress={() => void send()}
              />
            </>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

/** What to tell the visitor after asking to join (also used after signing in). */
export function joinResultMessage(
  result: 'sent' | 'pending' | 'member' | 'taken' | 'invalid' | 'signed-out' | 'offline' | 'demo',
  owner: string,
  t: (key: string, options?: Record<string, string>) => string,
): string {
  switch (result) {
    case 'sent':
      return t('sharePage.sent', { owner });
    case 'pending':
      return t('sharePage.pending', { owner });
    case 'member':
      return t('sharePage.member');
    case 'taken':
      return t('sharePage.taken');
    case 'invalid':
      return t('sharePage.invalid');
    case 'signed-out':
      return t('sharePage.signedOut');
    case 'offline':
      return t('share.offline');
    case 'demo':
      return t('share.demo');
  }
}
