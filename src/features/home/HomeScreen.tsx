import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useAppData, useLedgerEntries } from '@/data/AppDataProvider';
import { useEditingEntry, useEntryDraft, useHomeTab } from '@/features/entry/draft';
import { useI18n } from '@/i18n';
import {
  dayLabel,
  monthLabel,
  parseLocalDate,
  shiftMonth,
  startOfMonth,
  todayLocal,
  toLocalDate,
} from '@/lib/date';
import type { Entry, Ledger } from '@/lib/domain';
import { groupByDay, summarise } from '@/lib/ledgers';
import { formatMoney, formatSignedMoney } from '@/lib/money';
import { IconButton, PillButton } from '@/ui/Buttons';
import { CategoryCircle } from '@/ui/CategoryCircle';
import { Icon } from '@/ui/Icon';
import { Screen } from '@/ui/Screen';
import { shadows } from '@/ui/theme/palette';
import { useColors } from '@/ui/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';

import { HomeMenu } from './HomeMenu';

/** Screen 01: sheet-tab home (direction 1a). */
export function HomeScreen() {
  const colors = useColors();
  const { t, lang } = useI18n();
  const { orderedLedgers, prefs, repo, profile, loaded } = useAppData();
  const selectedId = useHomeTab((s) => s.ledgerId);
  const selectTab = useHomeTab((s) => s.select);
  const [menuOpen, setMenuOpen] = useState(false);

  const today = todayLocal();
  const { year, month } = parseLocalDate(today);
  const ledger = orderedLedgers.find((l) => l.id === selectedId) ?? orderedLedgers[0];

  const startAdd = () => {
    useEntryDraft.getState().start({
      currency: ledger?.currency ?? profile.starredCurrencies[0] ?? 'AUD',
      fixedLedgerId: ledger?.kind === 'personal' ? ledger.id : null,
      sourceSharedLedgerId: ledger?.kind === 'shared' ? ledger.id : null,
    });
    router.push('/add');
  };

  return (
    <Screen>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingTop: 6,
          paddingRight: 16,
          paddingBottom: 12,
          paddingLeft: 22,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Txt size={13} color={colors.neutral[700]}>
            {monthLabel(year, month, lang)}
          </Txt>
          <Txt font="heading" size={26} lineHeight={29} accessibilityRole="header">
            {t('home.myLedgers')}
          </Txt>
        </View>
        <IconButton icon="menu" onPress={() => setMenuOpen(true)} accessibilityLabel={t('home.menu')} />
      </View>
      {repo?.kind === 'demo' && (
        <Txt
          size={12}
          color={colors.neutral[700]}
          style={{ paddingHorizontal: 22, marginTop: -6, paddingBottom: 8 }}
        >
          {t('home.demoBanner')}
        </Txt>
      )}

      <LedgerTabs
        ledgers={orderedLedgers}
        activeId={ledger?.id}
        starred={(id) => !!prefs[id]?.starred}
        onSelect={selectTab}
      />

      {ledger ? (
        <LedgerBody key={ledger.id} ledger={ledger} today={today} />
      ) : loaded ? (
        <EmptyState />
      ) : (
        <View style={{ flex: 1 }} />
      )}

      <View style={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 6 }}>
        <PillButton label={t('home.addEntry')} icon="plus" height={60} onPress={startAdd} />
      </View>

      {menuOpen && <HomeMenu onClose={() => setMenuOpen(false)} />}
    </Screen>
  );
}

function EmptyState() {
  const colors = useColors();
  const { t } = useI18n();
  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12 }}>
      <Txt font="heading" size={24}>
        {t('home.emptyTitle')}
      </Txt>
      <Txt size={15} color={colors.neutral[800]} lineHeight={22}>
        {t('home.emptyBody')}
      </Txt>
      <View style={{ flexDirection: 'row' }}>
        <PillButton
          label={t('home.createFirst')}
          variant="surface"
          icon="book-plus"
          onPress={() => router.push('/ledger/new')}
        />
      </View>
    </View>
  );
}

function LedgerTabs({
  ledgers,
  activeId,
  starred,
  onSelect,
}: {
  ledgers: Ledger[];
  activeId?: string;
  starred: (id: string) => boolean;
  onSelect: (id: string) => void;
}) {
  const colors = useColors();
  const { t } = useI18n();
  return (
    <View style={{ flexGrow: 0 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 4, paddingHorizontal: 12 }}
      >
        {ledgers.map((l) => {
          const active = l.id === activeId;
          const ended = l.status === 'ended';
          return (
            <Pressable
              key={l.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityHint={t('home.tabHint')}
              onPress={() => onSelect(l.id)}
              onLongPress={() => router.push('/reorder')}
              style={{
                height: 46,
                paddingHorizontal: 14,
                borderTopLeftRadius: 18,
                borderTopRightRadius: 18,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: active ? colors.surface : colors.surfaceMuted,
              }}
            >
              {starred(l.id) && !ended && (
                <Txt size={13} color={colors.accent}>
                  ★
                </Txt>
              )}
              {l.kind === 'shared' && <Icon name="users" size={14} color={colors.accent2Ramp[700]} />}
              <Txt
                font="semibold"
                size={14}
                color={ended ? colors.neutral[600] : colors.text}
                numberOfLines={1}
              >
                {l.name}
              </Txt>
              <Txt font="bold" size={11} style={{ letterSpacing: 0.55, opacity: 0.65 }}>
                {l.currency}
              </Txt>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.newLedgerTab')}
          onPress={() => router.push('/ledger/new')}
          style={{
            width: 46,
            height: 46,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceMuted,
          }}
        >
          <Icon name="plus" size={18} color={colors.text} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

function LedgerBody({ ledger, today }: { ledger: Ledger; today: string }) {
  const colors = useColors();
  const { t, lang } = useI18n();
  const monthStart = startOfMonth(today);
  const [since, setSince] = useState(monthStart);
  const entries = useLedgerEntries(ledger.id, since);
  const thisMonth = useMemo(() => entries.filter((e) => e.date >= monthStart), [entries, monthStart]);
  const sum = summarise(thisMonth);
  const groups = useMemo(() => groupByDay(entries), [entries]);
  const cur = ledger.currency;

  const showEarlier = () => {
    const { year, month } = parseLocalDate(since);
    const prev = shiftMonth(year, month, -1);
    setSince(toLocalDate(prev.year, prev.month, 1));
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
      <View style={{ flexDirection: 'row', gap: 8, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 8 }}>
        <View style={{ flex: 1.3, gap: 4 }}>
          <Txt size={12} color={colors.neutral[700]}>
            {t('home.spent')}
          </Txt>
          <Txt font="heading" size={26} lineHeight={28} tabular numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(cur, sum.spent)}
          </Txt>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt size={12} color={colors.neutral[700]}>
            {t('home.income')}
          </Txt>
          <Txt
            font="bold"
            size={16}
            tabular
            color={colors.accent2Ramp[700]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatMoney(cur, sum.income)}
          </Txt>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt size={12} color={colors.neutral[700]}>
            {t('home.balance')}
          </Txt>
          <Txt
            font="bold"
            size={16}
            tabular
            color={sum.balance < 0 ? colors.negative : colors.accent2Ramp[700]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatSignedMoney(cur, sum.balance)}
          </Txt>
        </View>
      </View>

      {groups.length === 0 && (
        <Txt size={14} color={colors.neutral[700]} style={{ paddingHorizontal: 24, paddingTop: 24 }}>
          {t('home.noEntries')}
        </Txt>
      )}
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
          {g.entries.map((e) => (
            <EntryBubble key={e.id} entry={e} currency={cur} />
          ))}
        </View>
      ))}
      <View style={{ alignItems: 'center', paddingTop: 16 }}>
        <PillButton label={t('home.showEarlier')} variant="ghost" fontSize={14} onPress={showEarlier} />
      </View>
    </ScrollView>
  );
}

function EntryBubble({ entry, currency }: { entry: Entry; currency: string }) {
  const colors = useColors();
  const { t } = useI18n();
  const income = entry.type === 'income';
  const categoryLabel = t(`category.${entry.categoryCode}`);
  const amount = formatMoney(currency, entry.amountMinor, { sign: income ? '+' : '' });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.note || categoryLabel}, ${amount}`}
      onPress={() => {
        useEditingEntry.getState().open(entry);
        router.push({
          pathname: '/entry/[ledgerId]/[entryId]',
          params: { ledgerId: entry.ledgerId, entryId: entry.id },
        });
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 58,
        marginTop: 8,
        paddingVertical: 8,
        paddingLeft: 8,
        paddingRight: 18,
        borderRadius: 999,
        backgroundColor: pressed ? colors.neutral[200] : colors.neutral[100],
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.6)',
        boxShadow: shadows.sm,
      })}
    >
      <CategoryCircle code={entry.categoryCode} size={42} iconSize={19} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Txt font="semibold" size={15} numberOfLines={1}>
          {entry.note || categoryLabel}
        </Txt>
        {entry.note ? (
          <Txt size={12.5} color={colors.neutral[700]} numberOfLines={1}>
            {categoryLabel}
          </Txt>
        ) : null}
      </View>
      <Txt font="bold" size={15} tabular color={income ? colors.accent2Ramp[700] : colors.text}>
        {amount}
      </Txt>
    </Pressable>
  );
}
