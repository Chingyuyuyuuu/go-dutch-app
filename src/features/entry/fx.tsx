import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useRepo } from '@/data/AppDataProvider';
import { useI18n } from '@/i18n';
import { formatDate } from '@/lib/date';
import {
  convertMinor,
  normaliseRate,
  rateFromAmounts,
  sanitizeRateText,
  type Conversion,
  type RateSuggestion,
} from '@/lib/fx';
import type { FxSource } from '@/lib/domain';
import {
  formatMoney,
  formatMoneyExact,
  inputDecimals,
  inputToMinor,
  isoDecimals,
  sanitizeAmountText,
  type MinorUnits,
} from '@/lib/money';
import { getCurrency } from '@/lib/currency';
import { PillButton } from '@/ui/Buttons';
import { Icon } from '@/ui/Icon';
import { Sheet } from '@/ui/Overlay';
import { fonts } from '@/ui/theme/fonts';
import { useColors } from '@/ui/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';

/** Suggested ledger rate for `from` → `to`, fetched once (null offline or same currency). */
export function useRateSuggestion(from: string | null, to: string) {
  const repo = useRepo();
  const [state, setState] = useState<{ key: string; suggestion: RateSuggestion | null } | null>(null);
  const key = from && from !== to ? `${from}-${to}` : null;
  useEffect(() => {
    if (!key || !from) return;
    let live = true;
    void repo.suggestRate(from, to).then((suggestion) => {
      if (live) setState({ key, suggestion });
    });
    return () => {
      live = false;
    };
  }, [repo, key, from, to]);
  return {
    suggestion: state?.key === key ? state.suggestion : null,
    loading: key !== null && state?.key !== key,
  };
}

/** The ⓘ button next to a converted amount: at least 44×44, labelled for screen readers. */
export function InfoButton({ onPress, color }: { onPress: () => void; color?: string }) {
  const colors = useColors();
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('fx.info')}
      onPress={onPress}
      hitSlop={6}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginVertical: -12 }}
    >
      <Icon name="info" size={16} color={color ?? colors.neutral[700]} />
    </Pressable>
  );
}

/**
 * "≈ NT$2,102 ⓘ" under an amount in another currency (spec §5.1, §6A.4), or
 * "This ledger has no KRW rate yet" with a button to add it.
 */
export function ConversionLine({
  conversion,
  onInfo,
  onAddRate,
  size = 14,
}: {
  conversion: Conversion;
  onInfo: () => void;
  onAddRate: () => void;
  size?: number;
}) {
  const colors = useColors();
  const { t } = useI18n();
  if (conversion.kind === 'same') return null;
  if (conversion.kind === 'missing') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Txt size={size - 1} color={colors.accentRamp[800]}>
          {t('fx.noRate', { cur: conversion.currency })}
        </Txt>
        <PillButton
          label={t('fx.addRate')}
          variant="outline"
          height={36}
          fontSize={13}
          bodyFont
          onPress={onAddRate}
        />
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Txt font="semibold" size={size} tabular color={colors.neutral[800]}>
        {t('fx.approx', { amount: formatMoney(conversion.settleCurrency, conversion.settleMinor) })}
      </Txt>
      <InfoButton onPress={onInfo} />
    </View>
  );
}

const inputStyle = (colors: ReturnType<typeof useColors>) => ({
  flex: 1,
  minWidth: 0,
  height: 52,
  paddingHorizontal: 18,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: colors.divider,
  backgroundColor: colors.surface,
  fontFamily: fonts.bodyBold,
  fontSize: 17,
  color: colors.text,
  fontVariant: ['tabular-nums' as const],
});

/**
 * "1 JPY = [0.2102] TWD" with the suggested rate and where it came from (spec §6A.2).
 * The suggestion is filled in by the caller; this only shows it.
 */
export function RateField({
  from,
  to,
  value,
  onChange,
  suggestion,
  loading,
  autoFocus,
}: {
  from: string;
  to: string;
  value: string;
  onChange: (rate: string) => void;
  suggestion: RateSuggestion | null;
  loading: boolean;
  autoFocus?: boolean;
}) {
  const colors = useColors();
  const { t, lang } = useI18n();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Txt font="bold" size={15}>
          {`1 ${from} =`}
        </Txt>
        <TextInput
          value={value}
          onChangeText={(text) => onChange(sanitizeRateText(text))}
          keyboardType="decimal-pad"
          placeholder={loading ? '…' : '0'}
          placeholderTextColor={colors.neutral[500]}
          accessibilityLabel={t('fx.rateFor', { from, to })}
          autoFocus={autoFocus}
          selectTextOnFocus
          style={inputStyle(colors)}
        />
        <Txt font="bold" size={15}>
          {to}
        </Txt>
      </View>
      {suggestion ? (
        <Txt size={12} color={colors.neutral[700]} style={{ paddingLeft: 6 }}>
          {suggestion.sample
            ? t('fx.suggestedSample', { rate: suggestion.rate })
            : t('fx.suggested', {
                mid: suggestion.mid,
                date: formatDate(suggestion.asOf, lang),
              })}
          {suggestion.sample ? '' : ` · ${t('fx.attribution')}`}
        </Txt>
      ) : (
        !loading && (
          <Txt size={12} color={colors.neutral[700]} style={{ paddingLeft: 6 }}>
            {t('fx.offlineHint')}
          </Txt>
        )
      )}
      <Txt size={12} color={colors.neutral[700]} style={{ paddingLeft: 6 }}>
        {t('fx.betterRate')}
      </Txt>
    </View>
  );
}

/** A rate field that starts with the suggested rate once it arrives (until the user types). */
export function useRateInput(from: string | null, to: string, initial = '') {
  const { suggestion, loading } = useRateSuggestion(from, to);
  const [typed, setTyped] = useState<string | null>(initial || null);
  const value = typed ?? suggestion?.rate ?? '';
  return { value, setValue: setTyped, suggestion, loading, rate: normaliseRate(value) };
}

/**
 * First entry in a currency the ledger has no rate for (spec §6A.2): set the
 * ledger rate once, then every entry in that currency uses it.
 */
export function LedgerRateSheet({
  ledgerName,
  currency,
  settleCurrency,
  onSave,
  onClose,
}: {
  ledgerName: string;
  currency: string;
  settleCurrency: string;
  onSave: (rate: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const { t } = useI18n();
  const field = useRateInput(currency, settleCurrency);
  return (
    <Sheet onClose={onClose} style={{ paddingHorizontal: 20, gap: 14 }}>
      <View style={{ gap: 4, paddingTop: 10 }}>
        <Txt font="heading" size={24} lineHeight={28}>
          {t('fx.askTitle', { cur: currency })}
        </Txt>
        <Txt size={13} color={colors.neutral[700]}>
          {t('fx.askBody', { cur: currency, name: ledgerName })}
        </Txt>
      </View>
      <RateField
        from={currency}
        to={settleCurrency}
        value={field.value}
        onChange={field.setValue}
        suggestion={field.suggestion}
        loading={field.loading}
        autoFocus
      />
      <PillButton
        label={t('fx.saveRate')}
        height={56}
        fontSize={18}
        disabled={!field.rate}
        onPress={() => field.rate && onSave(field.rate)}
      />
    </Sheet>
  );
}

/** One member's line in the ⓘ sheet of a split. */
export type FxShareRow = { id: string; name: string; share: MinorUnits; settle: MinorUnits; owner: boolean };

/**
 * Screen 24: the ⓘ sheet. Shows the rate, where it came from and how the
 * converted amount was worked out; lets the user correct this entry (actual
 * amount paid, or its own rate) or go to the ledger rates.
 */
export function FxInfoSheet({
  amountMinor,
  currency,
  settleCurrency,
  rate,
  source,
  ledgerName,
  hasLedgerRate,
  shares,
  readOnly,
  onSetRate,
  onOpenLedgerRates,
  onClose,
}: {
  amountMinor: MinorUnits;
  currency: string;
  settleCurrency: string;
  rate: string;
  source: FxSource;
  ledgerName: string;
  /** The ledger has a rate for this currency, so "use the ledger rate again" can be offered. */
  hasLedgerRate: boolean;
  shares?: FxShareRow[];
  readOnly?: boolean;
  /** A rate for this entry only, or null to go back to the ledger rate. */
  onSetRate?: (rate: string | null) => void;
  onOpenLedgerRates?: () => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const { t } = useI18n();
  const [mode, setMode] = useState<'info' | 'actual' | 'rate'>('info');
  const [actual, setActual] = useState('');
  const [newRate, setNewRate] = useState(rate);
  const settleMinor = convertMinor(amountMinor, currency, settleCurrency, rate);
  const original = formatMoney(currency, amountMinor);
  const converted = formatMoney(settleCurrency, settleMinor);
  const exact = formatMoneyExact(settleCurrency, settleMinor);
  const roundedForDisplay = inputDecimals(settleCurrency) < isoDecimals(settleCurrency);
  const editable = !readOnly && !!onSetRate && source !== 'split';

  const sourceLabel =
    source === 'manual'
      ? t('fx.sourceManual')
      : source === 'split'
        ? t('fx.sourceSplit')
        : t('fx.sourceLedger', { name: ledgerName });

  const row = (label: string, value: string) => (
    <View style={{ flexDirection: 'row', gap: 12, minHeight: 24 }}>
      <Txt size={14} color={colors.neutral[700]} style={{ width: 64 }}>
        {label}
      </Txt>
      <Txt size={14} tabular style={{ flex: 1 }}>
        {value}
      </Txt>
    </View>
  );

  const actualMinor = inputToMinor(actual, isoDecimals(settleCurrency));
  const actualRate = actualMinor ? rateFromAmounts(amountMinor, currency, actualMinor, settleCurrency) : null;
  const typedRate = normaliseRate(newRate);

  return (
    <Sheet onClose={onClose} style={{ paddingHorizontal: 20, gap: 14 }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: 10, flexWrap: 'wrap' }}
      >
        <Txt font="heading" size={26} tabular>
          {original}
        </Txt>
        <Txt font="heading" size={20} tabular color={colors.neutral[700]}>
          {t('fx.approx', { amount: converted })}
        </Txt>
      </View>
      <View style={{ height: 1, backgroundColor: colors.divider }} />

      {mode === 'info' && (
        <>
          <View style={{ gap: 8 }}>
            {row(t('fx.rateLabel'), `1 ${currency} = ${rate} ${settleCurrency}`)}
            {row(t('fx.sourceLabel'), sourceLabel)}
            {row(
              t('fx.formulaLabel'),
              `${original} × ${rate} = ${exact}${roundedForDisplay ? t('fx.shownAs', { amount: converted }) : ''}`,
            )}
          </View>
          {shares && shares.length > 0 && (
            <View style={{ gap: 4 }}>
              <Txt font="semibold" size={13} color={colors.neutral[700]}>
                {t('fx.splitTitle')}
              </Txt>
              {shares.map((s) => (
                <View key={s.id} style={{ flexDirection: 'row', gap: 8, minHeight: 22 }}>
                  <Txt size={13} style={{ flex: 1 }} numberOfLines={1}>
                    {s.name}
                  </Txt>
                  <Txt size={13} tabular color={colors.neutral[700]}>
                    {formatMoney(currency, s.share)}
                  </Txt>
                  <Txt size={13} tabular>
                    {`→ ${formatMoneyExact(settleCurrency, s.settle)}`}
                    {roundedForDisplay
                      ? t('fx.shownAs', {
                          amount: formatMoney(settleCurrency, s.settle, {
                            round: s.owner ? 'floor' : 'ceil',
                          }),
                        })
                      : ''}
                  </Txt>
                </View>
              ))}
            </View>
          )}
          {editable && (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <PillButton
                label={t('fx.enterActual', { cur: settleCurrency })}
                variant="outline"
                height={44}
                fontSize={14}
                bodyFont
                onPress={() => setMode('actual')}
              />
              <PillButton
                label={t('fx.editRate')}
                variant="outline"
                height={44}
                fontSize={14}
                bodyFont
                onPress={() => setMode('rate')}
              />
              {source === 'manual' && hasLedgerRate && (
                <PillButton
                  label={t('fx.restore')}
                  variant="ghost"
                  height={44}
                  fontSize={14}
                  bodyFont
                  onPress={() => {
                    onSetRate?.(null);
                    onClose();
                  }}
                />
              )}
            </View>
          )}
          {!readOnly && onOpenLedgerRates && (
            <Pressable
              accessibilityRole="button"
              onPress={onOpenLedgerRates}
              style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
            >
              <Txt font="semibold" size={14} color={colors.accentRamp[700]}>
                {t('fx.editLedgerRate')}
              </Txt>
            </Pressable>
          )}
          <Txt size={12} lineHeight={17} color={colors.neutral[700]}>
            {t('fx.footnote')}
          </Txt>
        </>
      )}

      {mode === 'actual' && (
        <View style={{ gap: 10 }}>
          <Txt font="semibold" size={14}>
            {t('fx.actualPaid', { amount: original })}
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Txt font="heading" size={22} color={colors.neutral[600]}>
              {getCurrency(settleCurrency).symbol.trim()}
            </Txt>
            <TextInput
              value={actual}
              onChangeText={(text) => setActual(sanitizeAmountText(text, inputDecimals(settleCurrency)))}
              keyboardType={inputDecimals(settleCurrency) ? 'decimal-pad' : 'number-pad'}
              placeholder={converted.replace(/[^0-9.,]/g, '')}
              placeholderTextColor={colors.neutral[500]}
              accessibilityLabel={t('fx.enterActual', { cur: settleCurrency })}
              autoFocus
              style={inputStyle(colors)}
            />
          </View>
          <Txt size={12} color={colors.neutral[700]}>
            {actualRate ? t('fx.actualRate', { rate: actualRate }) : t('fx.actualHint')}
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <PillButton label={t('common.back')} variant="outline" flex onPress={() => setMode('info')} />
            <PillButton
              label={t('fx.apply')}
              flex
              disabled={!actualRate}
              onPress={() => {
                if (!actualRate) return;
                onSetRate?.(actualRate);
                onClose();
              }}
            />
          </View>
        </View>
      )}

      {mode === 'rate' && (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Txt font="bold" size={15}>
              {`1 ${currency} =`}
            </Txt>
            <TextInput
              value={newRate}
              onChangeText={(text) => setNewRate(sanitizeRateText(text))}
              keyboardType="decimal-pad"
              accessibilityLabel={t('fx.rateFor', { from: currency, to: settleCurrency })}
              autoFocus
              selectTextOnFocus
              style={inputStyle(colors)}
            />
            <Txt font="bold" size={15}>
              {settleCurrency}
            </Txt>
          </View>
          {typedRate && (
            <Txt size={12} tabular color={colors.neutral[700]}>
              {t('fx.approx', {
                amount: formatMoney(
                  settleCurrency,
                  convertMinor(amountMinor, currency, settleCurrency, typedRate),
                ),
              })}
            </Txt>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <PillButton label={t('common.back')} variant="outline" flex onPress={() => setMode('info')} />
            <PillButton
              label={t('fx.apply')}
              flex
              disabled={!typedRate}
              onPress={() => {
                if (!typedRate) return;
                onSetRate?.(typedRate);
                onClose();
              }}
            />
          </View>
        </View>
      )}
    </Sheet>
  );
}
