import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';

import { ALL_TIME, useAppData, useLedgerEntries, useRepo } from '@/data/AppDataProvider';
import { useI18n } from '@/i18n';
import { getCurrency } from '@/lib/currency';
import { formatDate, todayLocal } from '@/lib/date';
import {
  formatMoney,
  inputDecimals,
  inputToMinor,
  isoDecimals,
  minorToInput,
  sanitizeAmountText,
} from '@/lib/money';
import { nextCharge } from '@/lib/recurring';
import { PillButton } from '@/ui/Buttons';
import { Icon } from '@/ui/Icon';
import { Sheet } from '@/ui/Overlay';
import { fonts } from '@/ui/theme/fonts';
import { useColors } from '@/ui/theme/ThemeProvider';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

import type { ChargeTarget } from './chargeEdit';
import { recurringTitle } from './describe';

/**
 * Screen 19: fix or delete one auto-recorded charge. Only this entry changes;
 * the recurring payment keeps its amount unless it is edited too.
 */
export function ChargeEditSheet({ target, onClose }: { target: ChargeTarget; onClose: () => void }) {
  const colors = useColors();
  const { t, lang } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const { ledgers, recurring } = useAppData();
  const entries = useLedgerEntries(target.ledgerId, ALL_TIME);
  const entry = entries.find((e) =>
    target.entryId
      ? e.id === target.entryId
      : e.recurringId === target.recurringId && e.recurringSeq === target.seq,
  );
  const rec = recurring.find((r) => r.id === (entry?.recurringId ?? target.recurringId));
  const ledger = ledgers.find((l) => l.id === target.ledgerId);
  const currency = ledger?.currency ?? 'AUD';
  const { symbol } = getCurrency(currency);
  const typed = inputDecimals(currency);
  const iso = isoDecimals(currency);
  const [input, setInput] = useState<string | null>(null);
  const shown = input ?? (entry ? minorToInput(entry.amountMinor, iso) : '');
  const name = rec ? recurringTitle(rec, t) : (entry?.note ?? '');

  // "Delete" on the notification: remove the charge once it has synced to this phone.
  const entryId = entry?.id;
  const { autoDelete } = target;
  useEffect(() => {
    if (!autoDelete || !entryId) return;
    repo.deleteEntry(target.ledgerId, entryId);
    toast(t('charge.deleted', { name }));
    onClose();
  }, [autoDelete, entryId, repo, target.ledgerId, toast, t, name, onClose]);

  const category = entry ? t(`category.${entry.categoryCode}`) : '';
  const sub = !entry
    ? ''
    : entry.date === todayLocal()
      ? t('charge.subToday', { ledger: ledger?.name ?? '', category })
      : t('charge.subOn', { date: formatDate(entry.date, lang), ledger: ledger?.name ?? '', category });
  const next = rec ? nextCharge(rec) : null;

  const save = () => {
    const amountMinor = inputToMinor(shown, iso);
    if (!entry || !amountMinor) return;
    repo.updateEntry(entry.ledgerId, entry.id, { amountMinor });
    toast(t('charge.updatedTo', { name, amount: formatMoney(currency, amountMinor) }));
    onClose();
  };
  const remove = () => {
    if (!entry) return;
    repo.deleteEntry(entry.ledgerId, entry.id);
    toast(t('charge.deleted', { name }));
    onClose();
  };
  const editRecurring = () => {
    onClose();
    if (rec) router.push({ pathname: '/recurring/[id]', params: { id: rec.id } });
  };

  return (
    <Sheet onClose={onClose} style={{ paddingHorizontal: 22, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 8 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.accentRamp[200],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="repeat" size={24} color={colors.accentRamp[800]} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt font="heading" size={24} lineHeight={27} numberOfLines={1}>
            {name}
          </Txt>
          {sub ? (
            <Txt size={13} color={colors.neutral[700]}>
              {sub}
            </Txt>
          ) : null}
        </View>
      </View>

      {entry ? (
        <>
          <View
            style={{
              height: 76,
              borderRadius: 28,
              backgroundColor: colors.surface,
              borderWidth: 2,
              borderColor: colors.accent,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 22,
              gap: 6,
            }}
          >
            <Txt font="heading" size={30} color={colors.neutral[600]}>
              {symbol.trim()}
            </Txt>
            <TextInput
              value={shown}
              onChangeText={(text) => setInput(sanitizeAmountText(text, typed))}
              keyboardType={typed ? 'decimal-pad' : 'number-pad'}
              accessibilityLabel={t('entry.amount')}
              style={{
                flex: 1,
                minWidth: 0,
                height: 70,
                fontFamily: fonts.heading,
                fontSize: 44,
                color: colors.text,
                fontVariant: ['tabular-nums'],
              }}
            />
          </View>
          {next && (
            <Txt size={13} lineHeight={19} color={colors.neutral[700]}>
              {t('charge.note', { amount: formatMoney(currency, next.amountMinor) })}
            </Txt>
          )}
          <PillButton label={t('common.save')} height={58} fontSize={20} onPress={save} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <PillButton
              label={t('common.delete')}
              variant="danger"
              icon="trash-2"
              height={50}
              flex
              onPress={remove}
            />
            {rec && (
              <PillButton
                label={t('charge.editRecurring')}
                variant="outline"
                height={50}
                flex
                onPress={editRecurring}
              />
            )}
          </View>
        </>
      ) : (
        <>
          <Txt size={14} color={colors.neutral[800]}>
            {t('charge.notRecorded')}
          </Txt>
          {rec && (
            <PillButton
              label={t('charge.editRecurring')}
              variant="outline"
              height={50}
              onPress={editRecurring}
            />
          )}
        </>
      )}
    </Sheet>
  );
}
