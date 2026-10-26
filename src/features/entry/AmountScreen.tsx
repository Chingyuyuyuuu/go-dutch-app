import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData, useRepo } from '@/data/AppDataProvider';
import { useI18n } from '@/i18n';
import { currencyName, getCurrency } from '@/lib/currency';
import { personalLedgersFor, routePersonalEntry } from '@/lib/ledgers';
import { fitInputToDecimals, formatInput, inputToMinor, pressKey } from '@/lib/money';
import { PillButton } from '@/ui/Buttons';
import { Icon, type IconName } from '@/ui/Icon';
import { Keypad } from '@/ui/Keypad';
import { Dialog } from '@/ui/Overlay';
import { Screen, ScreenHeader } from '@/ui/Screen';
import { useColors } from '@/ui/theme/ThemeProvider';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

import { CurrencyPicker } from './CurrencyPicker';
import { useEntryDraft } from './draft';

type EntryKind = 'expense' | 'income' | 'split';

/** Screen 03: amount first, then currency and type. */
export function AmountScreen() {
  const colors = useColors();
  const { t, lang } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const { ledgers, profile } = useAppData();
  const draft = useEntryDraft();
  const [overlay, setOverlay] = useState<'currency' | 'noLedger' | null>(null);

  const { symbol, minorUnits } = getCurrency(draft.currency);
  const minor = inputToMinor(draft.input, minorUnits);
  const personal = personalLedgersFor(draft.currency, ledgers);
  const fixed = ledgers.find((l) => l.id === draft.fixedLedgerId);
  const shared = ledgers.find((l) => l.id === draft.sourceSharedLedgerId);

  const hint =
    personal.length === 0
      ? t('entry.noLedgerHint', { cur: draft.currency })
      : fixed && fixed.currency === draft.currency
        ? t('entry.fromTab', { name: fixed.name })
        : shared
          ? t('entry.fromShared', { name: shared.name })
          : t('entry.pickType');

  const chooseType = (kind: EntryKind) => {
    if (!minor) return toast(t('entry.enterAmountFirst'));
    if (kind === 'split') return toast(t('entry.splitLater'));
    draft.set({ type: kind });
    const route = routePersonalEntry({
      currency: draft.currency,
      ledgers,
      fixedLedgerId: draft.fixedLedgerId,
      lastUsedLedgerId: profile.lastUsedLedger[draft.currency],
    });
    if (route.kind === 'none') return setOverlay('noLedger');
    if (route.kind === 'auto') {
      draft.set({ ledgerId: route.ledgerId });
      return router.push('/add/category');
    }
    draft.set({ ledgerId: route.defaultId });
    router.push({ pathname: '/add/category', params: { choose: '1' } });
  };

  const types: { kind: EntryKind; label: string; icon: IconName }[] = [
    { kind: 'expense', label: t('entry.expense'), icon: 'arrow-up-right' },
    { kind: 'income', label: t('entry.income'), icon: 'arrow-down-left' },
    { kind: 'split', label: t('entry.split'), icon: 'users' },
  ];

  const toggleStar = (code: string) => {
    const starred = profile.starredCurrencies;
    repo.updateProfile({
      starredCurrencies: starred.includes(code) ? starred.filter((c) => c !== code) : [...starred, code],
    });
  };

  return (
    <Screen>
      <ScreenHeader
        title={t('entry.newEntry')}
        onBack={() => router.back()}
        close
        backLabel={t('common.close')}
      />
      <View style={{ flex: 1, justifyContent: 'center', gap: 14, paddingHorizontal: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('entry.currencyPicker', { cur: draft.currency })}
            onPress={() => setOverlay('currency')}
            style={({ pressed }) => ({
              height: 44,
              paddingLeft: 16,
              paddingRight: 14,
              borderRadius: 999,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: pressed ? colors.neutral[300] : colors.surface,
            })}
          >
            <Txt font="bold" size={16} style={{ letterSpacing: 0.5 }}>
              {draft.currency}
            </Txt>
            <Icon name="chevron-down" size={16} color={colors.text} />
          </Pressable>
          <Txt size={13} color={colors.neutral[700]}>
            {currencyName(draft.currency, lang)}
          </Txt>
        </View>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          accessibilityLabel={`${t('entry.amount')} ${symbol}${formatInput(draft.input)}`}
        >
          <Txt font="heading" size={40} color={colors.neutral[600]}>
            {symbol.trim()}
          </Txt>
          <Txt
            font="heading"
            size={72}
            tabular
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ flexShrink: 1 }}
          >
            {formatInput(draft.input)}
          </Txt>
          <View style={{ width: 3, height: 58, borderRadius: 2, backgroundColor: colors.accent }} />
        </View>
        <Txt size={13} color={colors.neutral[700]}>
          {hint}
        </Txt>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 }}>
        {types.map(({ kind, label, icon }) => {
          const split = kind === 'split';
          const fg = split ? colors.accent2Ramp[900] : colors.text;
          return (
            <Pressable
              key={kind}
              accessibilityRole="button"
              onPress={() => chooseType(kind)}
              style={({ pressed }) => ({
                flex: 1,
                height: 72,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                backgroundColor: split
                  ? pressed
                    ? colors.accent2Ramp[300]
                    : colors.accent2Ramp[200]
                  : pressed
                    ? colors.neutral[300]
                    : colors.surface,
              })}
            >
              <Icon name={icon} size={20} color={fg} />
              <Txt font="bold" size={15} color={fg}>
                {label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      <View style={{ paddingHorizontal: 13, paddingTop: 4, paddingBottom: 6 }}>
        <Keypad
          decimals={minorUnits}
          deleteLabel={t('entry.keypadDelete')}
          onKey={(key) => draft.set({ input: pressKey(draft.input, key, minorUnits) })}
        />
      </View>

      {overlay === 'currency' && (
        <CurrencyPicker
          selected={draft.currency}
          starred={profile.starredCurrencies}
          onToggleStar={toggleStar}
          onClose={() => setOverlay(null)}
          onSelect={(code) => {
            draft.set({
              currency: code,
              input: fitInputToDecimals(draft.input, getCurrency(code).minorUnits),
            });
            setOverlay(null);
          }}
        />
      )}
      {overlay === 'noLedger' && (
        <Dialog onClose={() => setOverlay(null)}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: colors.accentRamp[200],
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="book-plus" size={24} color={colors.accentRamp[800]} />
          </View>
          <Txt font="heading" size={24} lineHeight={28}>
            {t('route.noneTitle', { cur: draft.currency })}
          </Txt>
          <Txt size={14} color={colors.neutral[800]}>
            {t('route.noneBody')}
          </Txt>
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              justifyContent: 'flex-end',
              marginTop: 6,
              flexWrap: 'wrap',
            }}
          >
            <PillButton label={t('route.notNow')} variant="outline" onPress={() => setOverlay(null)} />
            <PillButton
              label={t('route.create', { cur: draft.currency })}
              onPress={() => {
                setOverlay(null);
                router.push({
                  pathname: '/ledger/new',
                  params: { currency: draft.currency, then: 'category' },
                });
              }}
            />
          </View>
        </Dialog>
      )}
    </Screen>
  );
}
