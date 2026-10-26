import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ALL_TIME, useAppData, useLedgerEntries, useRepo } from '@/data/AppDataProvider';
import { useEditingEntry } from '@/features/entry/draft';
import { Avatar, memberColor, memberName } from '@/features/shared/members';
import { BUBBLE_BORDER, BubbleFrost, useBubbleLook } from '@/features/appearance/bubble';
import { useI18n } from '@/i18n';
import { memberNets, shareOf, simplifyDebts, type Transfer } from '@/lib/balances';
import { dayLabel } from '@/lib/date';
import { memberForUid, type Entry, type Ledger } from '@/lib/domain';
import { groupByDay } from '@/lib/ledgers';
import { formatMoney } from '@/lib/money';
import { PillButton } from '@/ui/Buttons';
import { useColors } from '@/ui/theme/ThemeProvider';
import { useScreenOverlay } from '@/ui/Screen';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

import { EndLedgerDialog } from './EndLedgerDialog';
import { EntryBubble } from './EntryBubble';
import { SettleSheet } from './SettleSheet';

/**
 * Screen 02: a shared ledger. Balance card with who owes whom (fewest
 * transfers), settle / end, and every entry with who paid and my share.
 */
export function SharedLedgerBody({ ledger, today }: { ledger: Ledger; today: string }) {
  const colors = useColors();
  const { t, lang } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const { seen, recurring } = useAppData();
  const look = useBubbleLook();
  // What counted as "seen" before this visit, so new entries stay marked while the tab is open.
  const [seenAt] = useState(() => seen[ledger.id] ?? 0);
  const showOverlay = useScreenOverlay();
  const entries = useLedgerEntries(ledger.id, ALL_TIME);
  const groups = useMemo(() => groupByDay(entries), [entries]);
  const me = memberForUid(ledger, repo.uid);
  const transfers = useMemo(() => simplifyDebts(memberNets(entries)), [entries]);
  const ended = ledger.status === 'ended';
  const cur = ledger.currency;

  useEffect(() => {
    repo.markSeen(ledger.id);
  }, [repo, ledger.id]);

  const name = (memberId: string | null) =>
    memberName(
      ledger.members.find((m) => m.id === memberId),
      repo.uid,
      t,
    );
  const nameOfUid = (uid: string) =>
    memberName(
      ledger.members.find((m) => m.uid === uid),
      repo.uid,
      t,
    );
  const mine = transfers.filter((tr) => tr.from === me?.id || tr.to === me?.id);
  const others = transfers.filter((tr) => !mine.includes(tr));

  const describe = (e: Entry) => {
    if (e.type === 'repayment') {
      const to = Object.keys(e.shares ?? {})[0] ?? null;
      return {
        title: t('home.repaid', { from: name(e.payerMemberId), to: name(to) }),
        subtitle: e.recordedOnBehalf ? t('home.recordedFor', { name: name(e.payerMemberId) }) : '',
      };
    }
    const myShare = me ? shareOf(e, me.id) : 0;
    const payer = name(e.payerMemberId);
    const subtitle =
      myShare > 0
        ? t(e.type === 'income' ? 'home.receivedYourShare' : 'home.paidYourShare', {
            name: payer,
            amount: formatMoney(cur, myShare),
          })
        : t('home.paidNotYou', { name: payer });
    return { title: undefined, subtitle };
  };

  const tagsFor = (e: Entry) => {
    const tags: { label: string; tone: 'accent' | 'sage' }[] = [];
    if (e.createdBy !== repo.uid && e.createdAt > seenAt)
      tags.push({ label: t('home.newTag'), tone: 'sage' });
    if (e.lastEditedBy && e.lastEditedBy !== e.createdBy && e.lastEditedBy !== repo.uid) {
      tags.push({ label: t('home.editedBy', { name: nameOfUid(e.lastEditedBy) }), tone: 'accent' });
    }
    if (e.recurringId) {
      const rec = recurring.find((r) => r.id === e.recurringId);
      tags.push({
        label: rec
          ? t('recurring.autoSplitTag', { freq: t(`recurring.${rec.frequency}`) })
          : t('recurring.autoTag'),
        tone: 'sage',
      });
    }
    return tags;
  };

  const transferRow = (tr: Transfer) => {
    const iOwe = tr.from === me?.id;
    return (
      <View key={`${tr.from}-${tr.to}`} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Txt font="semibold" size={16} style={{ flex: 1 }}>
          {iOwe ? t('home.youOwe', { name: name(tr.to) }) : t('home.owesYou', { name: name(tr.from) })}
        </Txt>
        <Txt
          font="heading"
          size={28}
          lineHeight={30}
          tabular
          color={iOwe ? colors.accentRamp[700] : colors.accent2Ramp[700]}
        >
          {formatMoney(cur, tr.amount)}
        </Txt>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
        <View style={{ paddingTop: 14, paddingHorizontal: 14, paddingBottom: 4 }}>
          <View
            style={{
              borderRadius: 28,
              backgroundColor: look.fill,
              borderWidth: 1.5,
              borderColor: BUBBLE_BORDER,
              boxShadow: look.shadow,
              overflow: look.mode === 'semi' ? 'hidden' : 'visible',
              padding: 18,
              gap: 12,
            }}
          >
            <BubbleFrost mode={look.mode} radius={28} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt font="bold" size={12} caps color={colors.accentRamp[700]} style={{ flex: 1 }}>
                {t('home.balance')}
              </Txt>
              <View style={{ flexDirection: 'row' }}>
                {ledger.members
                  .filter((m) => m.leftAt === null)
                  .map((m, i) => (
                    <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                      <Avatar
                        name={memberName(m, repo.uid, t)}
                        color={memberColor(colors, ledger, m.id, repo.uid)}
                        ring={colors.bg}
                        dashed={!m.uid}
                      />
                    </View>
                  ))}
              </View>
            </View>

            {mine.map(transferRow)}
            {mine.length === 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Txt font="semibold" size={16} style={{ flex: 1 }}>
                  {t('home.allSettled')}
                </Txt>
                <Txt font="heading" size={28} lineHeight={30} tabular color={colors.neutral[700]}>
                  {formatMoney(cur, 0)}
                </Txt>
              </View>
            )}
            {others.length > 0 && (
              <View style={{ gap: 2 }}>
                <Txt font="bold" size={11} caps color={colors.neutral[700]}>
                  {t('settle.others')}
                </Txt>
                {others.map((tr) => (
                  <View key={`${tr.from}-${tr.to}`} style={{ flexDirection: 'row', gap: 8 }}>
                    <Txt size={13} color={colors.neutral[800]} style={{ flex: 1 }}>
                      {t('home.owes', { from: name(tr.from), to: name(tr.to) })}
                    </Txt>
                    <Txt font="bold" size={13} tabular color={colors.neutral[800]}>
                      {formatMoney(cur, tr.amount)}
                    </Txt>
                  </View>
                ))}
              </View>
            )}

            {ended ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Txt size={13} color={colors.neutral[700]} style={{ flex: 1 }}>
                  {t('end.readOnly')}
                </Txt>
                <PillButton
                  label={t('home.reopen')}
                  variant="outline"
                  height={44}
                  onPress={() => {
                    repo.updateLedger(ledger.id, { status: 'active' });
                    toast(t('end.reopened', { name: ledger.name }));
                  }}
                />
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <PillButton
                  label={t('home.settleUp')}
                  variant="sage"
                  fontSize={16}
                  flex
                  onPress={() =>
                    mine.length && me
                      ? showOverlay(
                          <SettleSheet
                            ledger={ledger}
                            me={me}
                            transfers={mine}
                            onClose={() => showOverlay(null)}
                          />,
                        )
                      : toast(t('home.allSettled'))
                  }
                />
                <PillButton
                  label={t('home.endLedger')}
                  variant="outline"
                  fontSize={16}
                  flex
                  onPress={() =>
                    me &&
                    showOverlay(
                      <EndLedgerDialog
                        ledger={ledger}
                        me={me}
                        entries={entries}
                        onClose={() => showOverlay(null)}
                      />,
                    )
                  }
                />
              </View>
            )}
          </View>
        </View>

        {groups.map((g) => (
          <View key={g.date} style={{ paddingTop: 8, paddingHorizontal: 14, paddingBottom: 4 }}>
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
            {g.entries.map((e) => {
              const { title, subtitle } = describe(e);
              return (
                <EntryBubble
                  key={e.id}
                  entry={e}
                  currency={cur}
                  title={title}
                  subtitle={subtitle}
                  tags={tagsFor(e)}
                  onPress={() => {
                    if (ended) return toast(t('end.readOnly'));
                    useEditingEntry.getState().open(e);
                    router.push({
                      pathname: '/entry/[ledgerId]/[entryId]',
                      params: { ledgerId: e.ledgerId, entryId: e.id },
                    });
                  }}
                />
              );
            })}
          </View>
        ))}
        <View style={{ alignItems: 'center', paddingTop: 16 }}>
          <PillButton
            label={t('home.ledgerSettings')}
            variant="ghost"
            icon="settings"
            fontSize={14}
            onPress={() => router.push({ pathname: '/ledger/[id]', params: { id: ledger.id } })}
          />
        </View>
      </ScrollView>
    </View>
  );
}
