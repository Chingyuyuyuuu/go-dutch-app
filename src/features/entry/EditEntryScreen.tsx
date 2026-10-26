import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { useAppData, useRepo } from '@/data/AppDataProvider';
import { draftFromEntry, draftShares, SplitForm, type SplitDraft } from '@/features/shared/SplitForm';
import { useI18n } from '@/i18n';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type CategoryCode } from '@/lib/categories';
import { getCurrency } from '@/lib/currency';
import { dayLabel, todayLocal } from '@/lib/date';
import {
  formatInput,
  formatMinorNumber,
  formatMoney,
  inputToMinor,
  minorToInput,
  pressKey,
} from '@/lib/money';
import { PillButton, SectionLabel } from '@/ui/Buttons';
import { CategoryCircle } from '@/ui/CategoryCircle';
import { Icon } from '@/ui/Icon';
import { Keypad } from '@/ui/Keypad';
import { Dialog } from '@/ui/Overlay';
import { Screen, ScreenHeader } from '@/ui/Screen';
import { fonts } from '@/ui/theme/fonts';
import { useColors } from '@/ui/theme/ThemeProvider';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

import { CalendarPicker } from './CalendarPicker';
import { DateChip } from './CategoryScreen';
import { useEditingEntry } from './draft';

/**
 * Edit or delete one entry (tapped from the home list). Not in the design
 * handoff; built from the same parts as screens 03, 05b and 08. Split entries
 * also edit who paid and the shares; repayments only the amount, note and date.
 */
export function EditEntryScreen() {
  const colors = useColors();
  const { t, lang } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const { ledgers } = useAppData();
  const entry = useEditingEntry((s) => s.entry);
  const ledger = ledgers.find((l) => l.id === entry?.ledgerId);
  const decimals = ledger ? getCurrency(ledger.currency).minorUnits : 2;

  const [input, setInput] = useState(entry ? minorToInput(entry.amountMinor, decimals) : '');
  const [categoryCode, setCategoryCode] = useState<CategoryCode | undefined>(entry?.categoryCode);
  const [note, setNote] = useState(entry?.note ?? '');
  const [date, setDate] = useState(entry?.date ?? todayLocal());
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [split, setSplit] = useState<SplitDraft | null>(() =>
    entry && ledger && entry.isSplit ? draftFromEntry(ledger, entry) : null,
  );
  const today = todayLocal();

  if (!entry || !ledger || !categoryCode) return <Redirect href="/" />;

  const { symbol } = getCurrency(ledger.currency);
  const minor = inputToMinor(input, decimals);
  const isIncome = split ? split.kind === 'income' : entry.type === 'income';
  const codes: readonly CategoryCode[] = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const repayment = entry.type === 'repayment';

  const save = () => {
    if (!minor) return toast(t('entry.enterAmountFirst'));
    const base = { amountMinor: minor, categoryCode, note: note.trim(), date };
    if (split) {
      const allocation = draftShares(split, minor, decimals);
      if (!allocation.ok) return toast(t('split.overTotal', { amount: formatMoney(ledger.currency, minor) }));
      repo.updateEntry(ledger.id, entry.id, {
        ...base,
        type: split.kind,
        payerMemberId: split.payerId,
        shares: allocation.shares,
      });
    } else if (repayment) {
      const to = Object.keys(entry.shares ?? {})[0];
      repo.updateEntry(ledger.id, entry.id, { ...base, shares: to ? { [to]: minor } : entry.shares });
    } else {
      repo.updateEntry(ledger.id, entry.id, base);
    }
    toast(t('entry.updated'));
    router.back();
  };

  const remove = () => {
    repo.deleteEntry(ledger.id, entry.id);
    toast(t('entry.deleted'));
    router.back();
  };

  return (
    <Screen>
      <ScreenHeader title={t('entry.editEntry')} onBack={() => router.back()} backLabel={t('common.back')} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 18 }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('entry.amount')} ${symbol}${formatInput(input)}`}
          onPress={() => setKeypadOpen((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8 }}
        >
          <Txt font="heading" size={30} color={colors.neutral[600]}>
            {symbol.trim()}
          </Txt>
          <Txt
            font="heading"
            size={52}
            tabular
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ flexShrink: 1 }}
          >
            {keypadOpen ? formatInput(input) : formatMinorNumber(minor, decimals)}
          </Txt>
          {keypadOpen && (
            <View style={{ width: 3, height: 44, borderRadius: 2, backgroundColor: colors.accent }} />
          )}
          <View style={{ flex: 1 }} />
          <Txt font="bold" size={13} color={colors.neutral[700]}>
            {`${ledger.name} · ${ledger.currency}`}
          </Txt>
        </Pressable>
        {keypadOpen && (
          <Keypad
            decimals={decimals}
            keyHeight={48}
            fontSize={24}
            deleteLabel={t('entry.keypadDelete')}
            onKey={(key) => setInput(pressKey(input, key, decimals))}
          />
        )}

        {split && (
          <SplitForm ledger={ledger} myUid={repo.uid} total={minor} draft={split} onChange={setSplit} />
        )}

        {!repayment && (
          <View style={{ gap: 8 }}>
            <SectionLabel>{t('entry.category')}</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {codes.map((code) => {
                const on = code === categoryCode;
                return (
                  <Pressable
                    key={code}
                    accessibilityRole="button"
                    aria-selected={on}
                    accessibilityLabel={t(`category.${code}`)}
                    onPress={() => setCategoryCode(code)}
                    style={{ width: 62, alignItems: 'center', gap: 5 }}
                  >
                    <CategoryCircle
                      code={code}
                      size={50}
                      iconSize={21}
                      background={on ? colors.accent : colors.surface}
                      color={on ? colors.bg : isIncome ? colors.accent2Ramp[800] : colors.accentRamp[800]}
                    />
                    <Txt size={12} align="center" numberOfLines={2}>
                      {t(`category.${code}`)}
                    </Txt>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        <View
          style={{
            minHeight: 52,
            paddingHorizontal: 16,
            borderRadius: 999,
            backgroundColor: colors.surface,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Icon name="sticky-note" size={17} color={colors.neutral[700]} />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t('entry.notePlaceholder')}
            placeholderTextColor={colors.neutral[600]}
            accessibilityLabel={t('entry.note')}
            maxLength={200}
            style={{
              flex: 1,
              minWidth: 0,
              height: 50,
              fontFamily: fonts.body,
              fontSize: 15,
              color: colors.text,
            }}
          />
        </View>

        <View style={{ flexDirection: 'row' }}>
          <DateChip
            label={dayLabel(date, today, lang)}
            highlighted={date !== today}
            onPress={() => setDateOpen((v) => !v)}
          />
        </View>
        {dateOpen && (
          <CalendarPicker
            value={date}
            today={today}
            onChange={(d) => {
              setDate(d);
              setDateOpen(false);
            }}
          />
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 8 }}>
        <PillButton label={t('common.save')} height={58} fontSize={20} onPress={save} />
        <PillButton
          label={t('common.delete')}
          variant="danger"
          icon="trash-2"
          onPress={() => setConfirmDelete(true)}
        />
      </View>

      {confirmDelete && (
        <Dialog onClose={() => setConfirmDelete(false)}>
          <Txt font="heading" size={24} lineHeight={28}>
            {t('entry.deleteTitle')}
          </Txt>
          <Txt size={14} color={colors.neutral[800]}>
            {t('entry.deleteBody', { name: ledger.name })}
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
            <PillButton
              label={t('common.cancel')}
              variant="outline"
              onPress={() => setConfirmDelete(false)}
            />
            <PillButton label={t('common.delete')} variant="danger" onPress={remove} />
          </View>
        </Dialog>
      )}
    </Screen>
  );
}
