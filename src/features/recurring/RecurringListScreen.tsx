import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { useAppData, useRepo } from '@/data/AppDataProvider';
import { useI18n } from '@/i18n';
import type { Ledger, Recurring } from '@/lib/domain';
import { formatMoney, formatMoneyWhole } from '@/lib/money';
import { monthlyFixedCosts, totalCharges } from '@/lib/recurring';
import { IconButton, PillButton, SectionLabel, Tag } from '@/ui/Buttons';
import { CategoryCircle } from '@/ui/CategoryCircle';
import { Screen, ScreenHeader } from '@/ui/Screen';
import { shadows } from '@/ui/theme/palette';
import { useColors } from '@/ui/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';

import { recurringAmount, recurringSubtitle, recurringTitle } from './describe';

/** Screen 16: recurring payments, with the monthly fixed costs on top. */
export function RecurringListScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const repo = useRepo();
  const { recurring, ledgers } = useAppData();
  const mine = recurring.filter((r) => r.ownerUid === repo.uid && ledgers.some((l) => l.id === r.ledgerId));
  const costs = monthlyFixedCosts(mine, ledgers, repo.uid);
  const [main, ...others] = costs;

  const sections: { title: string; rows: Recurring[] }[] = [
    { title: t('recurring.sectionRegular'), rows: mine.filter((r) => r.kind === 'regular') },
    { title: t('recurring.sectionInstalments'), rows: mine.filter((r) => r.kind === 'instalment') },
    { title: t('recurring.sectionSplit'), rows: mine.filter((r) => r.kind === 'split') },
  ].filter((s) => s.rows.length > 0);

  const openNew = () => router.push({ pathname: '/recurring/[id]', params: { id: 'new' } });

  return (
    <Screen>
      <ScreenHeader
        title={t('recurring.title')}
        onBack={() => router.back()}
        backLabel={t('common.back')}
        right={
          <IconButton
            icon="plus"
            accessibilityLabel={t('recurring.add')}
            background={colors.accent}
            color={colors.bg}
            onPress={openNew}
          />
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 14, paddingBottom: 16, gap: 10 }}
      >
        {mine.length === 0 ? (
          <View style={{ padding: 10, gap: 12 }}>
            <Txt font="heading" size={24}>
              {t('recurring.emptyTitle')}
            </Txt>
            <Txt size={15} color={colors.neutral[800]} lineHeight={22}>
              {t('recurring.emptyBody')}
            </Txt>
            <View style={{ flexDirection: 'row' }}>
              <PillButton label={t('recurring.add')} icon="plus" onPress={openNew} />
            </View>
          </View>
        ) : (
          <View
            style={{
              borderRadius: 30,
              backgroundColor: colors.accent2Ramp[200],
              paddingVertical: 20,
              paddingHorizontal: 22,
              gap: 6,
            }}
          >
            <Txt font="bold" size={12} caps color={colors.accent2Ramp[900]}>
              {t('recurring.fixedCosts')}
            </Txt>
            {main && (
              <Txt font="heading" size={36} lineHeight={38} color={colors.accent2Ramp[900]} tabular>
                {t('recurring.aboutMonth', { amount: formatMoneyWhole(main.currency, main.monthlyMinor) })}
              </Txt>
            )}
            {others.length > 0 && (
              <Txt font="semibold" size={14} color={colors.accent2Ramp[900]} tabular>
                {t('recurring.alsoMonth', {
                  amounts: others.map((c) => formatMoneyWhole(c.currency, c.monthlyMinor)).join(' · '),
                })}
              </Txt>
            )}
            <Txt size={13} lineHeight={19} color={colors.accent2Ramp[900]}>
              {t('recurring.summarySub', { count: mine.length })}
            </Txt>
          </View>
        )}

        {sections.map((section) => (
          <View key={section.title}>
            <View style={{ paddingTop: 12, paddingHorizontal: 4 }}>
              <SectionLabel>{section.title}</SectionLabel>
            </View>
            {section.rows.map((r) => (
              <RecurringRow
                key={r.id}
                recurring={r}
                ledger={ledgers.find((l) => l.id === r.ledgerId)}
                onPress={() => router.push({ pathname: '/recurring/[id]', params: { id: r.id } })}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function RecurringRow({
  recurring: r,
  ledger,
  onPress,
}: {
  recurring: Recurring;
  ledger: Ledger | undefined;
  onPress: () => void;
}) {
  const colors = useColors();
  const { t, lang } = useI18n();
  const repo = useRepo();
  const title = recurringTitle(r, t);
  const subtitle = recurringSubtitle(r, ledger, repo.uid, t, lang);
  const amount = formatMoney(ledger?.currency ?? 'AUD', recurringAmount(r));
  const split = r.kind === 'split';
  const dots = r.kind === 'instalment' ? (totalCharges(r) ?? 0) : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${amount}, ${subtitle}`}
      onPress={onPress}
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
      <CategoryCircle
        code={r.categoryCode}
        size={42}
        iconSize={19}
        background={split ? colors.accent2Ramp[200] : colors.accentRamp[200]}
        color={split ? colors.accent2Ramp[800] : colors.accentRamp[800]}
      />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Txt font="semibold" size={15} numberOfLines={1}>
          {title}
        </Txt>
        <Txt size={12.5} color={colors.neutral[700]} numberOfLines={1}>
          {subtitle}
        </Txt>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Txt font="bold" size={15} tabular>
          {amount}
        </Txt>
        {dots > 0 && (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {Array.from({ length: dots }, (_, i) => (
              <View
                key={i}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: i < r.paidCount ? colors.accent : colors.neutral[400],
                }}
              />
            ))}
          </View>
        )}
        {r.source === 'apple' && (
          <Tag label={t('recurring.appleTag')} background={colors.neutral[200]} color={colors.neutral[800]} />
        )}
      </View>
    </Pressable>
  );
}
