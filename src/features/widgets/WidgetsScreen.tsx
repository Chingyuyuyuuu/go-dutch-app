import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { useAppData, useLedgerEntries } from '@/data/AppDataProvider';
import { useI18n } from '@/i18n';
import { monthName, parseLocalDate, startOfMonth, todayLocal } from '@/lib/date';
import { activePersonalLedgers, lastPersonalLedgerId, summarise } from '@/lib/ledgers';
import { formatMoney } from '@/lib/money';
import { withAlpha } from '@/lib/color';
import { Icon, type IconName } from '@/ui/Icon';
import { Screen, ScreenHeader } from '@/ui/Screen';
import { shadows } from '@/ui/theme/palette';
import { useColors } from '@/ui/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';

type Shortcut = 'expense' | 'income' | 'split';

/**
 * Screen 13 as a preview: the small and medium widgets and the "+" control,
 * each opening the amount screen the way the real widgets will (godutch://add?type=…).
 */
export function WidgetsScreen() {
  const colors = useColors();
  const { t, lang } = useI18n();
  const { orderedLedgers, profile } = useAppData();
  const today = todayLocal();
  const lastId = lastPersonalLedgerId(profile, orderedLedgers);
  const ledger = orderedLedgers.find((l) => l.id === lastId) ?? activePersonalLedgers(orderedLedgers)[0];
  const currency = ledger?.currency ?? profile.starredCurrencies[0] ?? 'TWD';
  const entries = useLedgerEntries(ledger?.id, startOfMonth(today));
  const spent = summarise(entries).spent;
  const open = (type: Shortcut) => router.push({ pathname: '/add', params: { type } });
  const tile = withAlpha(colors.neutral[100], 0.55);

  const shortcuts: { type: Shortcut; label: string; icon: IconName }[] = [
    { type: 'expense', label: t('entry.expense'), icon: 'arrow-up-right' },
    { type: 'income', label: t('entry.income'), icon: 'arrow-down-left' },
    { type: 'split', label: t('entry.split'), icon: 'users' },
  ];

  return (
    <Screen style={{ backgroundColor: colors.accent2Ramp[300] }}>
      <ScreenHeader title={t('widgets.title')} onBack={() => router.back()} backLabel={t('common.back')} />
      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 24, paddingBottom: 20, gap: 22 }}
      >
        <Txt size={14} lineHeight={20} color={colors.accent2Ramp[900]}>
          {t('widgets.note')}
        </Txt>
        <View style={{ flexDirection: 'row', gap: 22 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('home.addEntry')}, ${formatMoney(currency, spent)}`}
            onPress={() => open('expense')}
            style={{
              width: 158,
              height: 158,
              borderRadius: 26,
              backgroundColor: colors.bg,
              padding: 14,
              justifyContent: 'space-between',
              boxShadow: shadows.md,
            }}
          >
            <View style={{ gap: 2 }}>
              <Txt size={12} color={colors.neutral[700]} numberOfLines={1}>
                {t('widgets.spentTitle', {
                  month: monthName(parseLocalDate(today).month, lang),
                  ledger: ledger?.name ?? '',
                })}
              </Txt>
              <Txt font="heading" size={26} lineHeight={28} tabular numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(currency, spent)}
              </Txt>
              <Txt size={12} color={colors.neutral[700]}>
                {t('widgets.spent')}
              </Txt>
            </View>
            <View
              style={{
                height: 40,
                borderRadius: 999,
                backgroundColor: colors.accent,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Icon name="plus" size={16} color={colors.bg} />
              <Txt font="heading" size={15} color={colors.bg}>
                {t('home.addEntry')}
              </Txt>
            </View>
          </Pressable>
          <View
            style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 20, justifyContent: 'flex-end' }}
          >
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: tile }} />
            ))}
          </View>
        </View>

        <View
          style={{
            height: 158,
            borderRadius: 26,
            backgroundColor: colors.bg,
            padding: 12,
            flexDirection: 'row',
            gap: 10,
            boxShadow: shadows.md,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home.addEntry')}
            onPress={() => open('expense')}
            style={{
              flex: 1,
              borderRadius: 20,
              backgroundColor: colors.accent,
              padding: 14,
              justifyContent: 'space-between',
            }}
          >
            <Icon name="plus" size={26} color={colors.bg} />
            <Txt font="heading" size={20} lineHeight={22} color={colors.bg}>
              {t('home.addEntry')}
            </Txt>
          </Pressable>
          <View style={{ flex: 1, gap: 6 }}>
            {shortcuts.map((s) => (
              <Pressable
                key={s.type}
                accessibilityRole="button"
                onPress={() => open(s.type)}
                style={{
                  flex: 1,
                  borderRadius: 999,
                  backgroundColor: colors.surface,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 12,
                }}
              >
                <Icon name={s.icon} size={16} color={colors.accentRamp[700]} />
                <Txt font="bold" size={14}>
                  {s.label}
                </Txt>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ alignItems: 'center', gap: 10, paddingTop: 8 }}>
          <Txt font="semibold" size={12} color={colors.accent2Ramp[900]}>
            {t('widgets.control')}
          </Txt>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home.addEntry')}
            onPress={() => open('expense')}
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: withAlpha(colors.neutral[900], 0.7),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="plus" size={28} color={colors.bg} />
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}
