import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { useAppData, useRepo } from '@/data/AppDataProvider';
import { draftShares, newSplitDraft, SplitForm, type SplitDraft } from '@/features/shared/SplitForm';
import { useI18n } from '@/i18n';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type CategoryCode } from '@/lib/categories';
import { getCurrency } from '@/lib/currency';
import { dayLabel, todayLocal } from '@/lib/date';
import { formatMoney, inputToMinor } from '@/lib/money';
import { PillButton, Tag } from '@/ui/Buttons';
import { CategoryCircle } from '@/ui/CategoryCircle';
import { Icon } from '@/ui/Icon';
import { Sheet } from '@/ui/Overlay';
import { Screen, ScreenHeader } from '@/ui/Screen';
import { fonts } from '@/ui/theme/fonts';
import { useColors } from '@/ui/theme/ThemeProvider';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

import { CalendarPicker } from './CalendarPicker';
import { DateChip } from './CategoryScreen';
import { useEntryDraft, useHomeTab } from './draft';

/** Screen 08: split with friends in a shared ledger. */
export function SplitScreen() {
  const colors = useColors();
  const { t, lang } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const { ledgers } = useAppData();
  const draft = useEntryDraft();
  const candidates = ledgers.filter(
    (l) => l.kind === 'shared' && l.status === 'active' && l.currency === draft.currency,
  );
  const ledger = candidates.find((l) => l.id === draft.sharedLedgerId);
  const [split, setSplit] = useState<SplitDraft | null>(ledger ? newSplitDraft(ledger, repo.uid) : null);
  const [categoryCode, setCategoryCode] = useState<CategoryCode | null>(null);
  const [chooser, setChooser] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const today = todayLocal();

  if (!ledger || !split) return <Redirect href="/" />;

  const { minorUnits } = getCurrency(ledger.currency);
  const total = inputToMinor(draft.input, minorUnits);
  const income = split.kind === 'income';
  const codes: readonly CategoryCode[] = income ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const chooseLedger = (id: string) => {
    const next = candidates.find((l) => l.id === id);
    if (!next) return;
    draft.set({ sharedLedgerId: id });
    setSplit({ ...newSplitDraft(next, repo.uid), kind: split.kind });
    setChooser(false);
  };

  const submit = () => {
    const allocation = draftShares(split, total, minorUnits);
    if (!allocation.ok) return toast(t('split.overTotal', { amount: formatMoney(ledger.currency, total) }));
    repo.addEntry(ledger.id, {
      type: split.kind,
      amountMinor: total,
      categoryCode: categoryCode ?? (income ? 'other_in' : 'other'),
      date: draft.date,
      note: draft.note.trim(),
      isSplit: true,
      payerMemberId: split.payerId,
      shares: allocation.shares,
    });
    const others = ledger.members.filter((m) => m.uid !== repo.uid && m.leftAt === null).map((m) => m.name);
    useHomeTab.getState().select(ledger.id);
    toast(t('split.added', { ledger: ledger.name, names: others.join(t('split.namesJoin')) }));
    router.dismissAll();
  };

  const kinds: { value: 'expense' | 'income'; label: string }[] = [
    { value: 'expense', label: t('split.cost') },
    { value: 'income', label: t('split.income') },
  ];

  return (
    <Screen>
      <ScreenHeader title={t('split.title')} onBack={() => router.back()} backLabel={t('common.back')} />
      <ScrollView
        contentContainerStyle={{ paddingTop: 6, paddingHorizontal: 18, paddingBottom: 10, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Txt font="heading" size={42} tabular numberOfLines={1} adjustsFontSizeToFit style={{ flex: 1 }}>
            {formatMoney(ledger.currency, total)}
          </Txt>
          <View
            style={{ flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: colors.surface }}
          >
            {kinds.map((k) => {
              const on = split.kind === k.value;
              return (
                <Pressable
                  key={k.value}
                  accessibilityRole="radio"
                  aria-checked={on}
                  onPress={() => {
                    setSplit({ ...split, kind: k.value });
                    setCategoryCode(null);
                  }}
                  style={{
                    height: 38,
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    justifyContent: 'center',
                    backgroundColor: on ? colors.text : 'transparent',
                  }}
                >
                  <Txt font="bold" size={13} color={on ? colors.bg : colors.text} numberOfLines={1}>
                    {k.label}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={candidates.length < 2}
          onPress={() => setChooser(true)}
          style={{
            minHeight: 56,
            paddingHorizontal: 16,
            borderRadius: 24,
            backgroundColor: colors.surface,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Icon name="users" size={18} color={colors.accent2Ramp[700]} />
          <Txt font="semibold" size={15} style={{ flex: 1 }} numberOfLines={1}>
            {`${ledger.name} · ${ledger.currency}`}
          </Txt>
          {candidates.length < 2 ? (
            <Tag
              label={t('split.onlyOne')}
              background={colors.accent2Ramp[100]}
              color={colors.accent2Ramp[800]}
            />
          ) : (
            <Txt font="bold" size={12} color={colors.accentRamp[700]}>
              {t('common.change')}
            </Txt>
          )}
        </Pressable>

        <SplitForm ledger={ledger} myUid={repo.uid} total={total} draft={split} onChange={setSplit} />

        <View style={{ gap: 8 }}>
          <Txt font="semibold" size={13} color={colors.neutral[700]}>
            {t('split.categoryOptional')}
          </Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {codes.map((code) => {
              const on = code === categoryCode;
              return (
                <Pressable
                  key={code}
                  accessibilityRole="button"
                  aria-selected={on}
                  accessibilityLabel={t(`category.${code}`)}
                  onPress={() => setCategoryCode(on ? null : code)}
                  style={{ width: 58, alignItems: 'center', gap: 5 }}
                >
                  <CategoryCircle
                    code={code}
                    size={50}
                    iconSize={21}
                    background={on ? colors.accent : colors.surface}
                    color={on ? colors.bg : colors.accentRamp[800]}
                  />
                  <Txt size={12} align="center" numberOfLines={2}>
                    {t(`category.${code}`)}
                  </Txt>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

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
            value={draft.note}
            onChangeText={(note) => draft.set({ note })}
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
            label={dayLabel(draft.date, today, lang)}
            highlighted={draft.date !== today}
            onPress={() => setDateOpen((v) => !v)}
          />
        </View>
        {dateOpen && (
          <CalendarPicker
            value={draft.date}
            today={today}
            onChange={(date) => {
              draft.set({ date });
              setDateOpen(false);
            }}
          />
        )}
      </ScrollView>
      <View style={{ paddingTop: 10, paddingHorizontal: 16, paddingBottom: 6 }}>
        <PillButton label={t('split.add')} height={60} onPress={submit} />
      </View>

      {chooser && (
        <Sheet onClose={() => setChooser(false)} style={{ paddingHorizontal: 14, gap: 6 }}>
          <Txt font="heading" size={24} style={{ paddingTop: 12, paddingHorizontal: 8, paddingBottom: 8 }}>
            {t('split.chooseLedger')}
          </Txt>
          {candidates.map((l) => (
            <Pressable
              key={l.id}
              accessibilityRole="button"
              aria-selected={l.id === ledger.id}
              onPress={() => chooseLedger(l.id)}
              style={{
                minHeight: 62,
                paddingHorizontal: 16,
                borderRadius: 24,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: l.id === ledger.id ? colors.accentRamp[100] : colors.surface,
              }}
            >
              <Icon name="users" size={18} color={colors.accent2Ramp[700]} />
              <Txt font="bold" size={16} style={{ flex: 1 }}>
                {`${l.name} · ${l.currency}`}
              </Txt>
            </Pressable>
          ))}
        </Sheet>
      )}
    </Screen>
  );
}
