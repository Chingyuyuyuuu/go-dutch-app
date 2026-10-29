import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useI18n } from '@/i18n';
import { allocateShares } from '@/lib/balances';
import { ownerMemberId, type Ledger } from '@/lib/domain';
import { allocateSettle } from '@/lib/fx';
import {
  formatMoney,
  inputDecimals,
  inputToMinor,
  isoDecimals,
  minorToInput,
  roundToDisplayUnit,
  sanitizeAmountText,
  type MinorUnits,
} from '@/lib/money';
import { splitEvenly } from '@/lib/split';
import { Icon } from '@/ui/Icon';
import { fonts } from '@/ui/theme/fonts';
import { useColors } from '@/ui/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';

import { Avatar, memberColor, memberName } from './members';

export type SplitDraft = {
  kind: 'expense' | 'income';
  /** Members in the split, in ledger order. */
  memberIds: string[];
  payerId: string;
  /** Typed amounts, as typed (string), by member. Others share the rest equally. */
  typed: Record<string, string>;
};

/** A fresh draft: everyone still in the ledger, paid by me, split equally. */
export function newSplitDraft(ledger: Ledger, myUid: string): SplitDraft {
  const active = ledger.members.filter((m) => m.leftAt === null);
  const me = active.find((m) => m.uid === myUid) ?? active[0];
  return { kind: 'expense', memberIds: active.map((m) => m.id), payerId: me?.id ?? '', typed: {} };
}

/** A draft from an existing split entry (for editing). `currency` is the currency it was paid in. */
export function draftFromEntry(
  ledger: Ledger,
  entry: {
    type: string;
    payerMemberId: string | null;
    shares: Record<string, MinorUnits> | null;
    amountMinor: MinorUnits;
  },
  currency: string,
): SplitDraft {
  const shares = entry.shares ?? {};
  const ids = ledger.members.map((m) => m.id).filter((id) => shares[id] !== undefined);
  const decimals = isoDecimals(currency);
  const equal = splitEvenly(entry.amountMinor, Math.max(1, ids.length));
  const isEqual = ids.every((id, i) => shares[id] === equal[i]);
  const typed: Record<string, string> = {};
  if (!isEqual) ids.forEach((id) => (typed[id] = minorToInput(shares[id], decimals) || '0'));
  return {
    kind: entry.type === 'income' ? 'income' : 'expense',
    memberIds: ids,
    payerId: entry.payerMemberId ?? ids[0] ?? '',
    typed,
  };
}

/** Shares for a draft, or why they do not work. `decimals`: ISO minor units of the entry currency. */
export function draftShares(draft: SplitDraft, total: MinorUnits, decimals: number) {
  const fixed: Record<string, MinorUnits> = {};
  for (const id of draft.memberIds) {
    if (draft.typed[id] !== undefined) fixed[id] = inputToMinor(draft.typed[id], decimals);
  }
  return allocateShares(total, draft.memberIds, fixed);
}

/**
 * Screen 08 body: who is in the split, who paid, and the shares (equal by
 * default; tap an amount to type a custom one, the rest share what is left).
 * Shares are in the currency paid in (`currency`); with `settleTotal` (another
 * currency than the ledger's) each share also shows its converted amount.
 * Shown shares are rounded like the balances: the owner's down, the others' up.
 */
export function SplitForm({
  ledger,
  myUid,
  currency,
  total,
  settleTotal,
  draft,
  onChange,
}: {
  ledger: Ledger;
  myUid: string;
  currency: string;
  total: MinorUnits;
  /** The converted total, when paid in another currency than the ledger's. */
  settleTotal?: MinorUnits | null;
  draft: SplitDraft;
  onChange: (draft: SplitDraft) => void;
}) {
  const colors = useColors();
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const decimals = isoDecimals(currency);
  const typedDecimals = inputDecimals(currency);
  const ownerId = ownerMemberId(ledger);
  const roundFor = (id: string) => (id === ownerId ? 'floor' : 'ceil');
  const members = ledger.members.filter((m) => m.leftAt === null || draft.memberIds.includes(m.id));
  const allocation = draftShares(draft, total, decimals);
  const settleShares =
    allocation.ok && settleTotal != null ? allocateSettle(settleTotal, allocation.shares) : null;
  const custom = Object.keys(draft.typed).length > 0;
  const equalShares = splitEvenly(total, Math.max(1, draft.memberIds.length));
  const rem = total - equalShares[equalShares.length - 1] * draft.memberIds.length;
  const name = (id: string) =>
    memberName(
      ledger.members.find((m) => m.id === id),
      myUid,
      t,
    );

  const toggleMember = (id: string) => {
    const on = draft.memberIds.includes(id);
    if (on && draft.memberIds.length <= 1) return;
    const memberIds = on
      ? draft.memberIds.filter((x) => x !== id)
      : ledger.members.map((m) => m.id).filter((x) => x === id || draft.memberIds.includes(x));
    const typed = { ...draft.typed };
    if (on) delete typed[id];
    onChange({ ...draft, memberIds, typed });
  };

  const cyclePayer = () => {
    const ids = ledger.members.filter((m) => m.leftAt === null).map((m) => m.id);
    const i = ids.indexOf(draft.payerId);
    onChange({ ...draft, payerId: ids[(i + 1) % ids.length] });
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Txt font="semibold" size={13} color={colors.neutral[700]}>
          {t('split.splitWith')}
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {members.map((m) => {
            const on = draft.memberIds.includes(m.id);
            return (
              <Pressable
                key={m.id}
                accessibilityRole="checkbox"
                aria-checked={on}
                onPress={() => toggleMember(m.id)}
                style={{
                  height: 46,
                  paddingLeft: 8,
                  paddingRight: 14,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: on ? 'transparent' : colors.divider,
                  backgroundColor: on ? colors.accent2Ramp[200] : 'transparent',
                  opacity: on ? 1 : 0.6,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Avatar
                  name={memberName(m, myUid, t)}
                  color={memberColor(colors, ledger, m.id, myUid)}
                  dashed={!m.uid}
                />
                <Txt font="semibold" size={14}>
                  {memberName(m, myUid, t)}
                </Txt>
                <Icon name={on ? 'check' : 'plus'} size={15} color={colors.text} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ borderRadius: 24, backgroundColor: colors.surface }}>
        <Pressable
          accessibilityRole="button"
          onPress={cyclePayer}
          style={{
            minHeight: 56,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Txt size={15} color={colors.neutral[700]} style={{ flex: 1 }}>
            {draft.kind === 'income' ? t('split.receivedBy') : t('split.paidBy')}
          </Txt>
          <Txt font="bold" size={15}>
            {name(draft.payerId)}
          </Txt>
          <Icon name="chevron-down" size={16} color={colors.text} />
        </Pressable>
        <View style={{ height: 1, backgroundColor: colors.divider, marginHorizontal: 16 }} />
        <Pressable
          accessibilityRole="button"
          aria-expanded={open}
          onPress={() => setOpen((v) => !v)}
          style={{
            minHeight: 56,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Txt size={15} color={colors.neutral[700]} style={{ flex: 1 }}>
            {t('split.shares')}
          </Txt>
          <Txt font="bold" size={15}>
            {custom ? t('split.custom') : t('split.equally')}
          </Txt>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.text} />
        </Pressable>
        {open && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 2 }}>
            {draft.memberIds.map((id) => {
              const shown = allocation.ok ? allocation.shares[id] : undefined;
              const typedValue = draft.typed[id];
              return (
                <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
                  <Avatar name={name(id)} color={memberColor(colors, ledger, id, myUid)} size={26} />
                  <Txt size={14} style={{ flex: 1 }} numberOfLines={1}>
                    {name(id)}
                  </Txt>
                  {settleShares && (
                    <Txt size={12} tabular color={colors.neutral[700]}>
                      {t('fx.approx', {
                        amount: formatMoney(ledger.currency, settleShares[id] ?? 0, { round: roundFor(id) }),
                      })}
                    </Txt>
                  )}
                  <TextInput
                    accessibilityLabel={t('split.editAmount', { name: name(id) })}
                    value={
                      typedValue ??
                      (shown !== undefined
                        ? minorToInput(roundToDisplayUnit(shown, currency, roundFor(id)), decimals) || '0'
                        : '')
                    }
                    onChangeText={(text) => {
                      const clean = sanitizeAmountText(text, typedDecimals);
                      const typed = { ...draft.typed, [id]: clean };
                      onChange({ ...draft, typed });
                    }}
                    keyboardType={typedDecimals ? 'decimal-pad' : 'number-pad'}
                    selectTextOnFocus
                    style={{
                      minWidth: 96,
                      height: 38,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      backgroundColor: typedValue !== undefined ? colors.accentRamp[100] : colors.bg,
                      fontFamily: fonts.bodyBold,
                      fontSize: 15,
                      color: colors.text,
                      textAlign: 'right',
                      fontVariant: ['tabular-nums'],
                    }}
                  />
                </View>
              );
            })}
            {!allocation.ok ? (
              <Txt size={12} color={colors.negative} style={{ paddingTop: 4 }}>
                {Object.keys(draft.typed).length >= draft.memberIds.length
                  ? t('split.mustMatch', { amount: formatMoney(currency, total) })
                  : t('split.overTotal', { amount: formatMoney(currency, total) })}
              </Txt>
            ) : !custom && rem > 0 && typedDecimals === decimals ? (
              // Not for TWD: its cents are not shown, so neither is a remainder of a few cents.
              <Txt size={12} color={colors.neutral[700]} style={{ paddingTop: 4 }}>
                {t('split.remainder', {
                  amount: formatMoney(currency, rem),
                  count: rem,
                  unit: decimals ? t('split.cent') : t('split.unit'),
                })}
              </Txt>
            ) : null}
            {custom && (
              <Pressable
                accessibilityRole="button"
                onPress={() => onChange({ ...draft, typed: {} })}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Txt font="semibold" size={13} color={colors.accentRamp[700]}>
                  {t('split.resetEqual')}
                </Txt>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
