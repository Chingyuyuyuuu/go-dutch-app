import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useAppData, useRepo } from '@/data/AppDataProvider';
import { CurrencyPicker } from '@/features/entry/CurrencyPicker';
import { RateField, useRateInput } from '@/features/entry/fx';
import { useI18n } from '@/i18n';
import { currencyName } from '@/lib/currency';
import type { Ledger } from '@/lib/domain';
import { PillButton, RadioDot } from '@/ui/Buttons';
import { Icon } from '@/ui/Icon';
import { Sheet } from '@/ui/Overlay';
import { Screen, ScreenHeader } from '@/ui/Screen';
import { useColors } from '@/ui/theme/ThemeProvider';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

/**
 * Screen 26b: the ledger rates, one per currency (spec §6A.2). Changing one
 * applies to new entries, or optionally converts this currency's entries again
 * (entries corrected by hand keep their own rate). Shared ledgers share them.
 */
export function LedgerRatesScreen() {
  const colors = useColors();
  const { t, lang } = useI18n();
  const repo = useRepo();
  const { ledgers, profile } = useAppData();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ledger = ledgers.find((l) => l.id === id);
  const [editing, setEditing] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  if (!ledger) return <Redirect href="/" />;
  const readOnly = ledger.status === 'ended';
  const rates = ledger.rates ?? {};
  const codes = [
    ...(ledger.entryCurrency && ledger.entryCurrency !== ledger.currency && !rates[ledger.entryCurrency]
      ? [ledger.entryCurrency]
      : []),
    ...Object.keys(rates).sort(),
  ];

  return (
    <Screen>
      <ScreenHeader title={t('rates.title')} onBack={() => router.back()} backLabel={t('common.back')} />
      <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 20, gap: 14 }}>
        <Txt size={13} lineHeight={19} color={colors.neutral[700]}>
          {t('rates.intro', { name: ledger.name, cur: ledger.currency })}
          {ledger.kind === 'shared' ? ` ${t('rates.shared')}` : ''}
        </Txt>
        <View style={{ borderRadius: 24, backgroundColor: colors.surface, paddingVertical: 4 }}>
          {codes.length === 0 && (
            <Txt size={14} color={colors.neutral[700]} style={{ padding: 16 }}>
              {t('rates.none')}
            </Txt>
          )}
          {codes.map((code, i) => (
            <Pressable
              key={code}
              accessibilityRole="button"
              disabled={readOnly}
              onPress={() => setEditing(code)}
              style={{
                minHeight: 60,
                paddingHorizontal: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.divider,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Txt font="bold" size={15} tabular>
                  {rates[code]
                    ? `1 ${code} = ${rates[code]} ${ledger.currency}`
                    : `${code} · ${t('rates.notSet')}`}
                </Txt>
                <Txt size={12} color={colors.neutral[700]}>
                  {currencyName(code, lang)}
                </Txt>
              </View>
              {!readOnly && <Icon name="chevron-right" size={18} color={colors.neutral[700]} />}
            </Pressable>
          ))}
        </View>
        {!readOnly && (
          <View style={{ flexDirection: 'row' }}>
            <PillButton
              label={t('rates.add')}
              variant="outline"
              icon="plus"
              onPress={() => setPicking(true)}
            />
          </View>
        )}
        <Txt size={12} lineHeight={17} color={colors.neutral[700]}>
          {t('fx.footnote')}
        </Txt>
      </ScrollView>

      {picking && (
        <CurrencyPicker
          selected={ledger.currency}
          starred={profile.starredCurrencies}
          onToggleStar={(code) => {
            const s = profile.starredCurrencies;
            repo.updateProfile({
              starredCurrencies: s.includes(code) ? s.filter((c) => c !== code) : [...s, code],
            });
          }}
          onSelect={(code) => {
            setPicking(false);
            if (code !== ledger.currency) setEditing(code);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {editing && <RateEditSheet ledger={ledger} currency={editing} onClose={() => setEditing(null)} />}
    </Screen>
  );
}

function RateEditSheet({
  ledger,
  currency,
  onClose,
}: {
  ledger: Ledger;
  currency: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const { t } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const current = ledger.rates?.[currency];
  const field = useRateInput(currency, ledger.currency, current);
  const [recalc, setRecalc] = useState(false);

  const save = () => {
    if (!field.rate) return toast(t('fx.needRate', { cur: currency }));
    const changed = repo.setLedgerRate(ledger.id, currency, field.rate, !!current && recalc);
    toast(
      changed > 0
        ? t('rates.savedRecalc', { cur: currency, count: changed })
        : t('rates.saved', { cur: currency, rate: field.rate }),
    );
    onClose();
  };

  const options = [
    { value: false, label: t('rates.futureOnly') },
    { value: true, label: t('rates.recalcAll', { cur: currency }) },
  ];

  return (
    <Sheet onClose={onClose} style={{ paddingHorizontal: 20, gap: 14 }}>
      <Txt font="heading" size={24} style={{ paddingTop: 10 }}>
        {t('rates.editTitle', { cur: currency })}
      </Txt>
      <RateField
        from={currency}
        to={ledger.currency}
        value={field.value}
        onChange={field.setValue}
        suggestion={field.suggestion}
        loading={field.loading}
        autoFocus
      />
      {current && (
        <View style={{ gap: 4 }}>
          {options.map((o) => (
            <Pressable
              key={String(o.value)}
              accessibilityRole="radio"
              aria-checked={recalc === o.value}
              onPress={() => setRecalc(o.value)}
              style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <RadioDot on={recalc === o.value} />
              <Txt size={14} style={{ flex: 1 }}>
                {o.label}
              </Txt>
            </Pressable>
          ))}
          {recalc && (
            <Txt size={12} color={colors.neutral[700]}>
              {ledger.kind === 'shared' ? t('rates.recalcSharedNote') : t('rates.recalcNote')}
            </Txt>
          )}
        </View>
      )}
      <PillButton label={t('fx.saveRate')} height={56} fontSize={18} disabled={!field.rate} onPress={save} />
    </Sheet>
  );
}
