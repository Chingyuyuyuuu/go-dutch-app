import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAppData, useEntriesOf, useRepo } from '@/data/AppDataProvider';
import { useEntryDraft } from '@/features/entry/draft';
import { useI18n } from '@/i18n';
import { lastCheck, reconcile } from '@/lib/banks';
import { getCurrency } from '@/lib/currency';
import { addDays, formatDate, todayLocal } from '@/lib/date';
import { formatInput, formatMoney, inputToMinor, MINUS_SIGN, minorToInput, pressKey } from '@/lib/money';
import { PillButton } from '@/ui/Buttons';
import { Icon } from '@/ui/Icon';
import { Keypad } from '@/ui/Keypad';
import { Dialog, Sheet } from '@/ui/Overlay';
import { useColors } from '@/ui/theme/ThemeProvider';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

/**
 * Screen 21 → 22: type in today's balance, then see how much left the account
 * without an entry: gap = (previous − new) − (expenses − income recorded since).
 */
export function UpdateBalanceSheet({ bankId, onClose }: { bankId: string; onClose: () => void }) {
  const colors = useColors();
  const { t, lang } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const { banks, ledgers } = useAppData();
  const bank = banks.find((b) => b.id === bankId);
  const today = todayLocal();
  const [input, setInput] = useState('');
  const [step, setStep] = useState<'enter' | 'reconcile'>('enter');
  const previous = bank ? lastCheck(bank) : undefined;
  const linked = (bank?.linkedLedgerIds ?? []).filter((id) => ledgers.some((l) => l.id === id));
  const entries = useEntriesOf(linked, previous ? addDays(previous.date, 1) : today);
  if (!bank) return null;

  const { symbol, minorUnits } = getCurrency(bank.currency);
  const newBalance = inputToMinor(input, minorUnits);
  const money = (m: number, sign = '') => formatMoney(bank.currency, Math.abs(m), { sign });
  const result = previous
    ? reconcile({ previous, newBalance, entries, linkedLedgerIds: linked, today })
    : null;

  const save = () =>
    repo.recordBalance(bank.id, {
      date: today,
      balanceMinor: newBalance,
      gapMinor: result?.missing ?? 0,
    });

  const check = () => {
    if (!input) return;
    if (!result) {
      save();
      toast(t('banks.updated', { name: bank.name }));
      return onClose();
    }
    setStep('reconcile');
  };

  if (step === 'reconcile' && result && previous) {
    const gap = result.missing > 0;
    const rows = [
      {
        label: result.drop >= 0 ? t('banks.wentDown') : t('banks.wentUp'),
        value: money(result.drop, result.drop >= 0 ? MINUS_SIGN : '+'),
      },
      {
        label: t('banks.recordedSince', { date: formatDate(previous.date, lang) }),
        value: money(result.recorded, result.recorded >= 0 ? MINUS_SIGN : '+'),
      },
    ];
    return (
      <Dialog onClose={onClose}>
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
          <Icon name="scale" size={24} color={colors.accentRamp[800]} />
        </View>
        <Txt font="heading" size={26} lineHeight={30}>
          {gap ? t('banks.gap', { amount: money(result.missing) }) : t('banks.allRecorded')}
        </Txt>
        <View
          style={{ borderRadius: 24, backgroundColor: colors.bg, paddingVertical: 4, paddingHorizontal: 16 }}
        >
          {rows.map((row) => (
            <View
              key={row.label}
              style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <Txt size={14} color={colors.neutral[800]} style={{ flex: 1 }}>
                {row.label}
              </Txt>
              <Txt font="semibold" size={15} tabular>
                {row.value}
              </Txt>
            </View>
          ))}
          <View
            style={{
              minHeight: 48,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              borderTopWidth: 1,
              borderTopColor: colors.divider,
            }}
          >
            <Txt size={14} color={colors.neutral[800]} style={{ flex: 1 }}>
              {t('banks.notRecorded')}
            </Txt>
            <Txt font="bold" size={20} tabular color={colors.accentRamp[700]}>
              {money(result.missing)}
            </Txt>
          </View>
        </View>
        <Txt size={14} lineHeight={21} color={colors.neutral[800]}>
          {gap
            ? t('banks.gapBody', {
                from: formatMoney(bank.currency, previous.balanceMinor),
                to: formatMoney(bank.currency, newBalance),
              })
            : t('banks.matchBody')}
        </Txt>
        <View style={{ gap: 8 }}>
          {gap && (
            <PillButton
              label={t('banks.addMissing')}
              height={52}
              fontSize={17}
              onPress={() => {
                save();
                onClose();
                const target = ledgers.find(
                  (l) => linked.includes(l.id) && l.kind === 'personal' && l.status === 'active',
                );
                useEntryDraft.getState().start({
                  currency: bank.currency,
                  fixedLedgerId: target?.id ?? null,
                  sourceSharedLedgerId: null,
                });
                useEntryDraft.getState().set({ input: minorToInput(result.missing, minorUnits) });
                router.push('/add');
              }}
            />
          )}
          <PillButton
            label={gap ? t('banks.skip') : t('common.done')}
            variant="outline"
            height={52}
            fontSize={17}
            onPress={() => {
              save();
              toast(t('banks.updated', { name: bank.name }));
              onClose();
            }}
          />
        </View>
      </Dialog>
    );
  }

  return (
    <Sheet onClose={onClose} style={{ paddingHorizontal: 22, gap: 14 }}>
      <View style={{ gap: 4, paddingTop: 8 }}>
        <Txt font="heading" size={24}>
          {t('banks.updateTitle', { name: bank.name })}
        </Txt>
        <Txt size={13} color={colors.neutral[700]}>
          {previous
            ? t('banks.lastBalance', {
                amount: formatMoney(bank.currency, previous.balanceMinor),
                date: formatDate(previous.date, lang),
              })
            : t('banks.firstBalance')}
        </Txt>
      </View>
      <View
        accessibilityLabel={`${symbol}${formatInput(input)}`}
        style={{
          height: 76,
          borderRadius: 28,
          backgroundColor: colors.surface,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 22,
          gap: 6,
        }}
      >
        <Txt font="heading" size={30} color={colors.neutral[600]}>
          {symbol.trim()}
        </Txt>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Txt
            font="heading"
            size={44}
            tabular
            numberOfLines={1}
            adjustsFontSizeToFit
            color={input ? colors.text : colors.neutral[500]}
            style={{ flexShrink: 1 }}
          >
            {formatInput(input)}
          </Txt>
          <View style={{ width: 3, height: 40, borderRadius: 2, backgroundColor: colors.accent }} />
        </View>
      </View>
      <Txt size={13} color={colors.neutral[700]}>
        {t('banks.balHint')}
      </Txt>
      <Keypad
        decimals={minorUnits}
        keyHeight={50}
        fontSize={26}
        deleteLabel={t('entry.keypadDelete')}
        onKey={(key) => setInput((v) => pressKey(v, key, minorUnits))}
      />
      <PillButton
        label={previous ? t('banks.check') : t('banks.saveBalance')}
        variant="sage"
        height={58}
        fontSize={19}
        disabled={!input}
        onPress={check}
      />
    </Sheet>
  );
}
