import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useRepo } from '@/data/AppDataProvider';
import { Avatar, memberColor, memberName } from '@/features/shared/members';
import { useI18n } from '@/i18n';
import type { Transfer } from '@/lib/balances';
import { getCurrency } from '@/lib/currency';
import { todayLocal } from '@/lib/date';
import type { Ledger, LedgerMember } from '@/lib/domain';
import { formatInput, formatMoney, inputToMinor, minorToInput, pressKey } from '@/lib/money';
import { PillButton, Tag } from '@/ui/Buttons';
import { Icon } from '@/ui/Icon';
import { Keypad } from '@/ui/Keypad';
import { Sheet } from '@/ui/Overlay';
import { useColors } from '@/ui/theme/ThemeProvider';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

/**
 * Screen 11: record a repayment for one of my suggested transfers. The amount
 * starts empty, is capped at what is owed, and can be a part payment. When the
 * other person owes me, I record it on their behalf.
 */
export function SettleSheet({
  ledger,
  me,
  transfers,
  onClose,
}: {
  ledger: Ledger;
  me: LedgerMember;
  transfers: Transfer[];
  onClose: () => void;
}) {
  const colors = useColors();
  const { t } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const { symbol, minorUnits } = getCurrency(ledger.currency);
  const transfer = transfers[Math.min(index, transfers.length - 1)];
  if (!transfer) return null;

  const iOwe = transfer.from === me.id;
  const otherId = iOwe ? transfer.to : transfer.from;
  const other = memberName(
    ledger.members.find((m) => m.id === otherId),
    repo.uid,
    t,
  );
  const entered = Math.min(transfer.amount, inputToMinor(input, minorUnits));
  const isFull = entered === transfer.amount;
  const money = (m: number) => formatMoney(ledger.currency, m);
  const avatar = (id: string) => (
    <Avatar
      name={memberName(
        ledger.members.find((m) => m.id === id),
        repo.uid,
        t,
      )}
      color={memberColor(colors, ledger, id, repo.uid)}
      size={40}
    />
  );

  const onKey = (key: Parameters<typeof pressKey>[1]) => {
    const next = pressKey(input, key, minorUnits);
    // Never more than what is owed.
    setInput(
      inputToMinor(next, minorUnits) > transfer.amount ? minorToInput(transfer.amount, minorUnits) : next,
    );
  };

  const record = () => {
    if (!entered) return;
    repo.addEntry(ledger.id, {
      type: 'repayment',
      amountMinor: entered,
      categoryCode: 'other',
      date: todayLocal(),
      note: '',
      payerMemberId: transfer.from,
      shares: { [transfer.to]: entered },
      recordedOnBehalf: transfer.from !== me.id,
    });
    toast(
      !isFull
        ? t('settle.donePart', { amount: money(entered), left: money(transfer.amount - entered) })
        : iOwe
          ? t('settle.done', { name: other })
          : t('settle.doneProxy', { name: other }),
    );
    onClose();
  };

  const body = iOwe
    ? isFull || !entered
      ? t('settle.bodyFull', { ledger: ledger.name, name: other })
      : t('settle.bodyPart', { ledger: ledger.name, name: other })
    : t('settle.bodyProxy', { name: other });

  return (
    <Sheet onClose={onClose} style={{ paddingHorizontal: 22, gap: 12 }}>
      <Txt font="heading" size={24} style={{ paddingTop: 8 }}>
        {t('settle.title')}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {transfers.map((tr, i) => {
          const id = tr.from === me.id ? tr.to : tr.from;
          const on = i === index;
          const label = memberName(
            ledger.members.find((m) => m.id === id),
            repo.uid,
            t,
          );
          return (
            <Pressable
              key={`${tr.from}-${tr.to}`}
              accessibilityRole="radio"
              aria-checked={on}
              onPress={() => {
                setIndex(i);
                setInput('');
              }}
              style={{
                height: 44,
                paddingLeft: 7,
                paddingRight: 14,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: on ? 'transparent' : colors.divider,
                backgroundColor: on ? colors.accent2Ramp[200] : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Avatar name={label} color={memberColor(colors, ledger, id, repo.uid)} />
              <Txt font="semibold" size={14}>{`${label} · ${money(tr.amount)}`}</Txt>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {avatar(transfer.from)}
        <Icon name="arrow-right" size={18} color={colors.neutral[600]} />
        {avatar(transfer.to)}
        <Txt font="semibold" size={16}>
          {iOwe ? t('settle.youPay', { name: other }) : t('settle.paidYou', { name: other })}
        </Txt>
        {!iOwe && (
          <Tag
            label={t('settle.forName', { name: other })}
            background={colors.accent2Ramp[100]}
            color={colors.accent2Ramp[800]}
          />
        )}
      </View>

      <View
        style={{
          height: 76,
          borderRadius: 28,
          backgroundColor: colors.surface,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 22,
          paddingRight: 10,
          gap: 6,
        }}
        accessibilityLabel={`${symbol}${formatInput(input)}`}
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
        <Pressable
          accessibilityRole="button"
          onPress={() => setInput(minorToInput(transfer.amount, minorUnits))}
          style={{
            height: 44,
            paddingHorizontal: 14,
            borderRadius: 999,
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: isFull ? 'transparent' : colors.divider,
            backgroundColor: isFull ? colors.accent2 : 'transparent',
          }}
        >
          <Txt font="bold" size={13} color={isFull ? colors.bg : colors.text}>
            {t('settle.full')}
          </Txt>
        </Pressable>
      </View>

      {entered > 0 && !isFull && (
        <Txt font="semibold" size={13} color={colors.accentRamp[700]}>
          {t('settle.stillOwed', { amount: money(transfer.amount - entered) })}
        </Txt>
      )}
      <Txt size={13} color={colors.neutral[700]}>
        {body}
      </Txt>
      <Keypad
        decimals={minorUnits}
        keyHeight={50}
        fontSize={26}
        deleteLabel={t('entry.keypadDelete')}
        onKey={onKey}
      />
      <PillButton
        label={!entered ? t('settle.enterAmount') : isFull ? t('settle.record') : t('settle.recordPart')}
        variant="sage"
        height={58}
        fontSize={19}
        disabled={!entered}
        onPress={record}
      />
    </Sheet>
  );
}
