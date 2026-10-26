import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useAppData, useLedgerEntries, useRepo } from '@/data/AppDataProvider';
import { useI18n } from '@/i18n';
import { lastCheck } from '@/lib/banks';
import { monthName, parseLocalDate, shiftMonth, todayLocal, toLocalDate } from '@/lib/date';
import { formatMoney, formatMoneyWhole } from '@/lib/money';
import { compareMonths, lastCompletedMonth } from '@/lib/monthly';
import { monthlyFixedCosts } from '@/lib/recurring';
import { CategoryCircle } from '@/ui/CategoryCircle';
import { Icon, type IconName } from '@/ui/Icon';
import { Screen, ScreenHeader } from '@/ui/Screen';
import { useColors } from '@/ui/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';

/** Screen 23: the last completed month against the one before, for one personal ledger. */
export function MonthlyScreen() {
  const colors = useColors();
  const { t, lang } = useI18n();
  const repo = useRepo();
  const { orderedLedgers, recurring, ledgers, banks } = useAppData();
  const personal = orderedLedgers.filter((l) => l.kind === 'personal');
  const [ledgerId, setLedgerId] = useState(personal[0]?.id);
  const ledger = personal.find((l) => l.id === ledgerId) ?? personal[0];

  const month = lastCompletedMonth(parseLocalDate(todayLocal()));
  const before = shiftMonth(month.year, month.month, -1);
  const entries = useLedgerEntries(ledger?.id, toLocalDate(before.year, before.month, 1));
  const comparison = compareMonths(entries, month);
  const thisName = monthName(month.month, lang);
  const prevName = monthName(before.month, lang);

  const header = (
    <ScreenHeader title={t('monthly.title')} onBack={() => router.back()} backLabel={t('common.back')} />
  );
  if (!ledger) {
    return (
      <Screen>
        {header}
        <Txt size={15} color={colors.neutral[800]} style={{ padding: 24 }}>
          {t('monthly.noPersonal')}
        </Txt>
      </Screen>
    );
  }

  const cur = ledger.currency;
  const money = (m: number) => formatMoney(cur, m);
  const delta = comparison.total - comparison.previousTotal;
  const fixed = monthlyFixedCosts(
    recurring.filter((r) => r.ownerUid === repo.uid),
    ledgers,
    repo.uid,
  ).find((c) => c.currency === cur);
  const checks = banks
    .filter((b) => b.linkedLedgerIds.includes(ledger.id))
    .flatMap((b) => {
      // An account's first balance has nothing to compare with, so it is not a check yet.
      const last = b.checks.length >= 2 ? lastCheck(b) : undefined;
      return last ? [{ ...last, currency: b.currency }] : [];
    })
    .sort((a, b) => b.at - a.at);
  const lastGap = checks[0];
  const max = Math.max(1, ...comparison.rows.map((r) => Math.max(r.amount, r.previous)));
  const deltaText = (d: number) =>
    d === 0
      ? t('monthly.same', { month: prevName })
      : d > 0
        ? t('monthly.more', { amount: money(d), month: prevName })
        : t('monthly.less', { amount: money(-d), month: prevName });

  const cards: { icon: IconName; value: string; label: string; bg: string; fg: string; go: () => void }[] = [
    {
      icon: 'repeat',
      value: fixed ? formatMoneyWhole(cur, fixed.monthlyMinor) : formatMoneyWhole(cur, 0),
      label: t('monthly.fixedCard', { count: fixed?.count ?? 0 }),
      bg: colors.accent2Ramp[200],
      fg: colors.accent2Ramp[900],
      go: () => router.push('/recurring'),
    },
    {
      icon: 'scale',
      value: lastGap ? formatMoney(lastGap.currency, lastGap.gapMinor) : '—',
      label: lastGap ? t('monthly.gapCard') : t('monthly.noCheck'),
      bg: colors.accentRamp[200],
      fg: colors.accentRamp[900],
      go: () => router.push('/banks'),
    },
  ];

  return (
    <Screen>
      {header}
      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 14, paddingBottom: 16, gap: 14 }}
      >
        {personal.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {personal.map((l) => {
              const on = l.id === ledger.id;
              return (
                <Pressable
                  key={l.id}
                  accessibilityRole="radio"
                  aria-checked={on}
                  onPress={() => setLedgerId(l.id)}
                  style={{
                    height: 44,
                    paddingHorizontal: 16,
                    borderRadius: 999,
                    justifyContent: 'center',
                    backgroundColor: on ? colors.text : colors.surface,
                  }}
                >
                  <Txt font="bold" size={14} color={on ? colors.bg : colors.text}>
                    {`${l.name} · ${l.currency}`}
                  </Txt>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        <View
          style={{ paddingTop: 6, paddingHorizontal: 8, paddingBottom: 4, gap: 10, alignItems: 'flex-start' }}
        >
          <Txt size={13} color={colors.neutral[700]}>
            {t('monthly.kicker', { month: thisName, ledger: ledger.name })}
          </Txt>
          <Txt font="heading" size={50} lineHeight={52} tabular numberOfLines={1} adjustsFontSizeToFit>
            {money(comparison.total)}
          </Txt>
          <View
            style={{
              paddingVertical: 6,
              paddingHorizontal: 14,
              borderRadius: 999,
              backgroundColor: delta > 0 ? colors.accentRamp[100] : colors.accent2Ramp[100],
            }}
          >
            <Txt font="bold" size={13} color={delta > 0 ? colors.accentRamp[800] : colors.accent2Ramp[800]}>
              {deltaText(delta)}
            </Txt>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {cards.map((card) => (
            <Pressable
              key={card.icon}
              accessibilityRole="button"
              accessibilityLabel={`${card.value}, ${card.label}`}
              onPress={card.go}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 124,
                borderRadius: 28,
                padding: 16,
                gap: 6,
                backgroundColor: card.bg,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Icon name={card.icon} size={18} color={card.fg} />
              <Txt
                font="heading"
                size={24}
                lineHeight={26}
                color={card.fg}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {card.value}
              </Txt>
              <Txt size={12.5} lineHeight={17} color={card.fg}>
                {card.label}
              </Txt>
            </Pressable>
          ))}
        </View>

        <View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingTop: 10,
              paddingHorizontal: 8,
            }}
          >
            <Txt font="bold" size={12} caps color={colors.neutral[700]} style={{ flex: 1 }}>
              {t('monthly.byCategory')}
            </Txt>
            <Legend color={colors.accent} label={monthName(month.month, lang, true)} />
            <Legend color={colors.neutral[400]} label={monthName(before.month, lang, true)} />
          </View>
          {comparison.rows.length === 0 && (
            <Txt size={14} color={colors.neutral[700]} style={{ padding: 10 }}>
              {t('monthly.empty', { month: thisName })}
            </Txt>
          )}
          {comparison.rows.map((row) => {
            const d = row.amount - row.previous;
            return (
              <View
                key={row.code}
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 10 }}
              >
                <CategoryCircle code={row.code} size={40} iconSize={18} />
                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Txt font="semibold" size={15} style={{ flex: 1 }} numberOfLines={1}>
                      {t(`category.${row.code}`)}
                    </Txt>
                    <Txt font="bold" size={15} tabular>
                      {money(row.amount)}
                    </Txt>
                  </View>
                  <View style={{ gap: 3 }}>
                    <Bar width={row.amount / max} color={colors.accent} />
                    <Bar width={row.previous / max} color={colors.neutral[400]} />
                  </View>
                  <Txt
                    font="semibold"
                    size={12}
                    color={
                      d > 0 ? colors.accentRamp[700] : d < 0 ? colors.accent2Ramp[700] : colors.neutral[700]
                    }
                  >
                    {deltaText(d)}
                  </Txt>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Txt font="semibold" size={12}>
        {label}
      </Txt>
    </View>
  );
}

function Bar({ width, color }: { width: number; color: string }) {
  return (
    <View
      style={{ height: 8, borderRadius: 999, backgroundColor: color, width: `${Math.max(0, width) * 100}%` }}
    />
  );
}
