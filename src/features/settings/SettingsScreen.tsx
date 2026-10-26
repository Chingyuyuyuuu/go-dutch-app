import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useAppData, useRepo } from '@/data/AppDataProvider';
import { CurrencyPicker } from '@/features/entry/CurrencyPicker';
import { useI18n } from '@/i18n';
import type { LocalePref } from '@/lib/domain';
import { formatDate, todayLocal } from '@/lib/date';
import { PillButton, RadioDot, SectionLabel } from '@/ui/Buttons';
import { Icon, type IconName } from '@/ui/Icon';
import { Dialog } from '@/ui/Overlay';
import { Screen, ScreenHeader } from '@/ui/Screen';
import { useColors, useTheme } from '@/ui/theme/ThemeProvider';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

/** Screen 14. Rows for later phases say so when tapped. */
export function SettingsScreen() {
  const colors = useColors();
  const { background, accent } = useTheme();
  const { t, lang } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const { profile, user, signOut, resetDemo, pending } = useAppData();
  const [overlay, setOverlay] = useState<'currencies' | 'signOut' | null>(null);
  const isDemo = repo.kind === 'demo';

  const languages: { value: LocalePref; label: string; sub?: string }[] = [
    { value: 'system', label: t('settings.matchPhone'), sub: t('settings.currently') },
    { value: 'zh-TW', label: '繁體中文（台灣）' },
    { value: 'en-AU', label: 'English (Australia)' },
  ];

  const later = () => toast(t('common.comingSoon'));
  const rows: { icon: IconName; label: string; value?: string; onPress: () => void }[] = [
    {
      icon: 'palette',
      label: t('settings.appearance'),
      value: `${t(`theme.${background}`)} · ${t(`theme.${accent}`)}`,
      onPress: later,
    },
    {
      icon: 'star',
      label: t('settings.starredCurrencies'),
      value: profile.starredCurrencies.join(', '),
      onPress: () => setOverlay('currencies'),
    },
    { icon: 'users', label: t('settings.friends'), onPress: later },
    { icon: 'layout-grid', label: t('settings.widgets'), onPress: later },
    {
      icon: 'bell',
      label: t('settings.notifications'),
      value: t('settings.notificationsSub'),
      onPress: later,
    },
    {
      icon: 'circle-user',
      label: t('settings.account'),
      value: isDemo ? t('settings.demo') : (user?.email ?? ''),
      onPress: () => setOverlay('signOut'),
    },
  ];

  return (
    <Screen>
      <ScreenHeader title={t('settings.title')} onBack={() => router.back()} backLabel={t('common.back')} />
      <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 18, gap: 18 }}>
        <View style={{ gap: 8 }}>
          <SectionLabel>{t('settings.language')}</SectionLabel>
          <View style={{ borderRadius: 28, backgroundColor: colors.surface, paddingVertical: 4 }}>
            {languages.map((o) => {
              const on = profile.locale === o.value;
              return (
                <Pressable
                  key={o.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => repo.updateProfile({ locale: o.value })}
                  style={{
                    minHeight: 56,
                    paddingHorizontal: 18,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <RadioDot on={on} />
                  <View>
                    <Txt font="semibold" size={15}>
                      {o.label}
                    </Txt>
                    {o.sub ? (
                      <Txt size={12} color={colors.neutral[700]}>
                        {o.sub}
                      </Txt>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Txt size={12} color={colors.neutral[700]} style={{ paddingHorizontal: 8 }}>
            {t('settings.languageNote')}
          </Txt>
        </View>

        <View style={{ gap: 8 }}>
          <SectionLabel>{t('settings.formats')}</SectionLabel>
          <View
            style={{
              borderRadius: 28,
              backgroundColor: colors.surface,
              paddingVertical: 4,
              paddingHorizontal: 18,
            }}
          >
            <View style={{ flexDirection: 'row', minHeight: 50, alignItems: 'center' }}>
              <Txt size={15} style={{ flex: 1 }}>
                {t('settings.date')}
              </Txt>
              <Txt font="bold" tabular>
                {formatDate(todayLocal(), lang)}
              </Txt>
            </View>
            <View style={{ height: 1, backgroundColor: colors.divider }} />
            <View style={{ flexDirection: 'row', minHeight: 50, alignItems: 'center' }}>
              <Txt size={15} style={{ flex: 1 }}>
                {t('settings.amounts')}
              </Txt>
              <Txt font="bold" tabular>
                1,234.50
              </Txt>
            </View>
          </View>
        </View>

        <View style={{ borderRadius: 28, backgroundColor: colors.surface, paddingVertical: 4 }}>
          {rows.map((r) => (
            <Pressable
              key={r.label}
              accessibilityRole="button"
              onPress={r.onPress}
              style={({ pressed }) => ({
                minHeight: 54,
                paddingHorizontal: 18,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: pressed ? colors.neutral[300] : 'transparent',
                borderRadius: 28,
              })}
            >
              <Icon name={r.icon} size={18} color={colors.accentRamp[700]} />
              <Txt size={15} style={{ flex: 1 }}>
                {r.label}
              </Txt>
              {r.value ? (
                <Txt size={13} color={colors.neutral[700]} numberOfLines={1} style={{ maxWidth: 150 }}>
                  {r.value}
                </Txt>
              ) : null}
              <Icon name="chevron-right" size={16} color={colors.neutral[600]} />
            </Pressable>
          ))}
        </View>

        {isDemo && (
          <View style={{ alignItems: 'flex-start' }}>
            <PillButton
              label={t('settings.resetDemo')}
              variant="outline"
              icon="rotate-ccw"
              onPress={() => {
                void resetDemo().then(() => toast(t('settings.resetDemoDone')));
              }}
            />
          </View>
        )}
        {!isDemo && (
          <Txt
            size={12}
            color={pending > 0 ? colors.accentRamp[700] : colors.neutral[700]}
            style={{ paddingHorizontal: 8 }}
            accessibilityLiveRegion="polite"
          >
            {pending > 0 ? t('settings.pending', { count: pending }) : t('settings.synced')}
          </Txt>
        )}
        <Txt size={12} color={colors.neutral[600]} align="center">
          {t('settings.version', { version: Constants.expoConfig?.version ?? '' })}
        </Txt>
      </ScrollView>

      {overlay === 'currencies' && (
        <CurrencyPicker
          starred={profile.starredCurrencies}
          onToggleStar={(code) => {
            const s = profile.starredCurrencies;
            repo.updateProfile({
              starredCurrencies: s.includes(code) ? s.filter((c) => c !== code) : [...s, code],
            });
          }}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === 'signOut' && (
        <Dialog onClose={() => setOverlay(null)}>
          <Txt font="heading" size={24}>
            {t('settings.signOutTitle')}
          </Txt>
          <Txt size={14} color={colors.neutral[800]}>
            {isDemo ? t('home.demoBanner') : t('settings.signOutBody')}
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
            <PillButton label={t('common.cancel')} variant="outline" onPress={() => setOverlay(null)} />
            <PillButton
              label={t('settings.signOut')}
              icon="log-out"
              onPress={() => {
                setOverlay(null);
                void signOut();
              }}
            />
          </View>
        </Dialog>
      )}
    </Screen>
  );
}
