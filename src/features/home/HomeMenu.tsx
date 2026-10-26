import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAppData, useRepo } from '@/data/AppDataProvider';
import { useI18n } from '@/i18n';
import { isUpdateDue } from '@/lib/banks';
import { monthName, parseLocalDate, todayLocal } from '@/lib/date';
import { formatMoneyWhole } from '@/lib/money';
import { lastCompletedMonth } from '@/lib/monthly';
import { monthlyFixedCosts } from '@/lib/recurring';
import { Icon, type IconName } from '@/ui/Icon';
import { useScreenInsets } from '@/ui/Screen';
import { shadows } from '@/ui/theme/palette';
import { useColors } from '@/ui/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';

type Item = { icon: IconName; label: string; href: Href; sub?: string; alert?: boolean };

/** Screen 01b: dropdown under the menu button, with live sub-lines for recurring, banks and the monthly check. */
export function HomeMenu({ onClose }: { onClose: () => void }) {
  const colors = useColors();
  const { t, lang } = useI18n();
  const { top } = useScreenInsets();
  const repo = useRepo();
  const { recurring, ledgers, banks, profile } = useAppData();
  const today = todayLocal();
  const [cost] = monthlyFixedCosts(recurring, ledgers, repo.uid);
  const due = banks.filter((b) => isUpdateDue(b, profile.bankReminder, today)).length;
  const last = lastCompletedMonth(parseLocalDate(today));

  const items: Item[] = [
    {
      icon: 'repeat',
      label: t('menu.recurring'),
      href: '/recurring',
      sub: cost
        ? t('menu.recurringSub', { amount: formatMoneyWhole(cost.currency, cost.monthlyMinor) })
        : undefined,
    },
    {
      icon: 'landmark',
      label: t('menu.banks'),
      href: '/banks',
      sub:
        banks.length === 0
          ? t('menu.banksNone')
          : due
            ? t('menu.banksDue', { count: due })
            : t('menu.banksOk'),
      alert: due > 0,
    },
    {
      icon: 'chart-column',
      label: t('menu.monthly'),
      href: '/monthly',
      sub: t('menu.monthlySub', { month: monthName(last.month, lang) }),
    },
    { icon: 'arrow-up-down', label: t('menu.arrange'), href: '/reorder' },
    { icon: 'book-plus', label: t('menu.newLedger'), href: '/ledger/new' },
    { icon: 'user-plus', label: t('menu.friends'), href: '/friends' },
    { icon: 'settings', label: t('menu.settings'), href: '/settings' },
  ];

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]}>
      <Pressable
        accessibilityLabel={t('common.close')}
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
      />
      <View
        accessibilityViewIsModal
        style={{
          position: 'absolute',
          right: 14,
          top: top + 54,
          width: 272,
          borderRadius: 28,
          backgroundColor: colors.bg,
          boxShadow: shadows.lg,
          padding: 8,
        }}
      >
        {items.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="menuitem"
            onPress={() => {
              onClose();
              router.push(item.href);
            }}
            style={({ pressed }) => ({
              minHeight: 52,
              paddingVertical: 6,
              paddingHorizontal: 14,
              borderRadius: 20,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: pressed ? colors.surface : 'transparent',
            })}
          >
            <Icon name={item.icon} size={18} color={colors.accentRamp[700]} />
            <View style={{ flex: 1 }}>
              <Txt font="semibold" size={15}>
                {item.label}
              </Txt>
              {item.sub && (
                <Txt size={12} color={item.alert ? colors.accentRamp[700] : colors.neutral[700]}>
                  {item.sub}
                </Txt>
              )}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
