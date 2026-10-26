import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { useAppData, useRepo } from '@/data/AppDataProvider';
import { CurrencyPicker } from '@/features/entry/CurrencyPicker';
import { useEntryDraft, useHomeTab } from '@/features/entry/draft';
import { useI18n } from '@/i18n';
import { currencyName, isCurrencyCode } from '@/lib/currency';
import type { LedgerKind } from '@/lib/domain';
import { PillButton } from '@/ui/Buttons';
import { Icon } from '@/ui/Icon';
import { Screen, ScreenHeader } from '@/ui/Screen';
import { fonts } from '@/ui/theme/fonts';
import { useColors } from '@/ui/theme/ThemeProvider';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

/**
 * Screen 09. `then=category` comes from the "No NZD ledger" dialog, `then=back`
 * from the routing sheet; both continue the entry with the new ledger selected.
 * Shared ledgers arrive in Phase 3.
 */
export function NewLedgerScreen() {
  const colors = useColors();
  const { t, lang } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const { profile } = useAppData();
  const params = useLocalSearchParams<{ currency?: string; then?: 'category' | 'back' }>();
  const presetCurrency = params.currency && isCurrencyCode(params.currency) ? params.currency : undefined;

  const [name, setName] = useState('');
  const [kind, setKind] = useState<LedgerKind>('personal');
  const [currency, setCurrency] = useState(presetCurrency ?? profile.starredCurrencies[0] ?? 'AUD');
  const [pickerOpen, setPickerOpen] = useState(false);

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return toast(t('ledger.nameRequired'));
    const id = repo.createLedger({ name: trimmed, currency, kind: 'personal' });
    toast(t('ledger.created', { name: trimmed, cur: currency }));
    if (params.then === 'category') {
      useEntryDraft.getState().set({ ledgerId: id, currency });
      router.replace('/add/category');
    } else if (params.then === 'back') {
      useEntryDraft.getState().set({ ledgerId: id });
      router.back();
    } else {
      useHomeTab.getState().select(id);
      router.back();
    }
  };

  const kinds: { value: LedgerKind; label: string; sub: string }[] = [
    { value: 'personal', label: t('ledger.personal'), sub: t('ledger.onlyYou') },
    { value: 'shared', label: t('ledger.shared'), sub: t('ledger.withFriends') },
  ];

  return (
    <Screen>
      <ScreenHeader
        title={t('ledger.newLedger')}
        onBack={() => router.back()}
        close
        backLabel={t('common.close')}
      />
      <ScrollView
        contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 20, gap: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 6 }}>
          <Txt font="semibold" size={13} color={colors.neutral[700]}>
            {t('ledger.name')}
          </Txt>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('ledger.namePlaceholder')}
            placeholderTextColor={colors.neutral[600]}
            accessibilityLabel={t('ledger.name')}
            maxLength={40}
            autoFocus
            style={{
              height: 52,
              paddingHorizontal: 18,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.divider,
              backgroundColor: colors.surface,
              fontFamily: fonts.body,
              fontSize: 16,
              color: colors.text,
            }}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Txt font="semibold" size={13} color={colors.neutral[700]}>
            {t('ledger.type')}
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {kinds.map((k) => {
              const on = kind === k.value;
              return (
                <Pressable
                  key={k.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => setKind(k.value)}
                  style={{
                    flex: 1,
                    minHeight: 64,
                    borderRadius: 24,
                    paddingHorizontal: 16,
                    justifyContent: 'center',
                    gap: 2,
                    backgroundColor: on ? colors.text : colors.surface,
                  }}
                >
                  <Txt font="bold" size={15} color={on ? colors.bg : colors.text}>
                    {k.label}
                  </Txt>
                  <Txt size={12} color={on ? colors.bg : colors.text} style={{ opacity: 0.8 }}>
                    {k.sub}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
          {kind === 'shared' && (
            <Txt size={13} color={colors.accentRamp[700]} style={{ paddingHorizontal: 6, paddingTop: 4 }}>
              {t('ledger.sharedLater')}
            </Txt>
          )}
        </View>

        <View style={{ gap: 6 }}>
          <Txt font="semibold" size={13} color={colors.neutral[700]}>
            {t('ledger.currency')}
          </Txt>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('entry.currencyPicker', { cur: currency })}
            onPress={() => setPickerOpen(true)}
            style={{
              minHeight: 52,
              paddingHorizontal: 18,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.divider,
              backgroundColor: colors.surface,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Txt font="bold" size={15}>
              {currency}
            </Txt>
            <Txt size={15} color={colors.neutral[700]} style={{ flex: 1 }} numberOfLines={1}>
              {currencyName(currency, lang)}
            </Txt>
            <Icon name="chevron-down" size={16} color={colors.text} />
          </Pressable>
          <Txt size={12} color={colors.neutral[700]} style={{ paddingLeft: 6 }}>
            {t('ledger.currencyLocked')}
          </Txt>
        </View>
      </ScrollView>
      <View style={{ paddingTop: 10, paddingHorizontal: 16, paddingBottom: 6 }}>
        <PillButton label={t('ledger.create')} height={60} onPress={create} disabled={kind === 'shared'} />
      </View>

      {pickerOpen && (
        <CurrencyPicker
          selected={currency}
          starred={profile.starredCurrencies}
          onToggleStar={(code) => {
            const s = profile.starredCurrencies;
            repo.updateProfile({
              starredCurrencies: s.includes(code) ? s.filter((c) => c !== code) : [...s, code],
            });
          }}
          onSelect={(code) => {
            setCurrency(code);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </Screen>
  );
}
