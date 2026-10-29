import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { useAppData, useRepo } from '@/data/AppDataProvider';
import { draftShares, newSplitDraft, SplitForm, type SplitDraft } from '@/features/shared/SplitForm';
import { useI18n } from '@/i18n';
import type { CategoryCode } from '@/lib/categories';
import { dayLabel, todayLocal } from '@/lib/date';
import { ownerMemberId } from '@/lib/domain';
import { allocateSettle, previewConversion } from '@/lib/fx';
import { formatMoney, inputToMinor, isoDecimals } from '@/lib/money';
import { memberName } from '@/features/shared/members';
import { PillButton, Tag } from '@/ui/Buttons';
import { Icon } from '@/ui/Icon';
import { Sheet } from '@/ui/Overlay';
import { Screen, ScreenHeader } from '@/ui/Screen';
import { fonts } from '@/ui/theme/fonts';
import { useColors } from '@/ui/theme/ThemeProvider';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

import { CalendarPicker } from './CalendarPicker';
import { useCategoryGrid } from './categories';
import { CategoryStrip } from './CategoryStrip';
import { DateChip } from './CategoryScreen';
import { draftManualRate, useEntryDraft, useHomeTab } from './draft';
import { ConversionLine, FxInfoSheet, LedgerRateSheet } from './fx';

/** Screen 08: split with friends in a shared ledger. */
export function SplitScreen() {
  const colors = useColors();
  const { t, lang } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const { ledgers } = useAppData();
  const draft = useEntryDraft();
  const params = useLocalSearchParams<{ choose?: string }>();
  // Any currency can be split in any shared ledger; it is converted to the ledger's currency.
  const candidates = ledgers.filter((l) => l.kind === 'shared' && l.status === 'active');
  const ledger = candidates.find((l) => l.id === draft.sharedLedgerId);
  const [split, setSplit] = useState<SplitDraft | null>(ledger ? newSplitDraft(ledger, repo.uid) : null);
  const [categoryCode, setCategoryCode] = useState<CategoryCode | null>(null);
  const [overlay, setOverlay] = useState<'chooser' | 'fxInfo' | 'addRate' | null>(
    params.choose === '1' ? 'chooser' : null,
  );
  const [submitAfterRate, setSubmitAfterRate] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const today = todayLocal();
  const income = split?.kind === 'income';
  const categories = useCategoryGrid(ledger, income ? 'income' : 'expense');

  if (!ledger || !split) return <Redirect href="/" />;

  const decimals = isoDecimals(draft.currency);
  const total = inputToMinor(draft.input, decimals);
  const manualRate = draftManualRate(draft.manualRate, ledger.currency);
  const conversion = previewConversion(total, draft.currency, ledger, manualRate);
  const allocation = draftShares(split, total, decimals);

  const chooseLedger = (id: string) => {
    const next = candidates.find((l) => l.id === id);
    if (!next) return;
    draft.set({ sharedLedgerId: id });
    setSplit({ ...newSplitDraft(next, repo.uid), kind: split.kind });
    setOverlay(null);
  };

  const submit = (rates = ledger.rates) => {
    if (!allocation.ok) return toast(t('split.overTotal', { amount: formatMoney(draft.currency, total) }));
    const converted = previewConversion(
      total,
      draft.currency,
      { currency: ledger.currency, rates },
      manualRate,
    );
    if (converted.kind === 'missing') {
      setSubmitAfterRate(true);
      return setOverlay('addRate');
    }
    repo.addEntry(ledger.id, {
      type: split.kind,
      amountMinor: total,
      categoryCode: categoryCode ?? (income ? 'other_in' : 'other'),
      date: draft.date,
      note: draft.note.trim(),
      isSplit: true,
      payerMemberId: split.payerId,
      shares: allocation.shares,
      ...(converted.kind === 'converted' && {
        currency: converted.currency,
        fxRate: converted.rate,
        fxSource: converted.source,
      }),
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
          <View style={{ flex: 1 }}>
            <Txt font="heading" size={42} tabular numberOfLines={1} adjustsFontSizeToFit>
              {formatMoney(draft.currency, total)}
            </Txt>
            <ConversionLine
              conversion={conversion}
              onInfo={() => setOverlay('fxInfo')}
              onAddRate={() => setOverlay('addRate')}
            />
          </View>
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
          onPress={() => setOverlay('chooser')}
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

        <SplitForm
          ledger={ledger}
          myUid={repo.uid}
          currency={draft.currency}
          total={total}
          settleTotal={conversion.kind === 'converted' ? conversion.settleMinor : null}
          draft={split}
          onChange={setSplit}
        />

        <View style={{ gap: 8 }}>
          <Txt font="semibold" size={13} color={colors.neutral[700]}>
            {t('split.categoryOptional')}
          </Txt>
          <CategoryStrip
            key={split.kind}
            grid={categories.grid}
            more={categories.more}
            selected={categoryCode}
            income={income}
            onSelect={(code) => setCategoryCode(code === categoryCode ? null : code)}
          />
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
        <PillButton label={t('split.add')} height={60} onPress={() => submit()} />
      </View>

      {overlay === 'fxInfo' && conversion.kind === 'converted' && (
        <FxInfoSheet
          amountMinor={total}
          currency={conversion.currency}
          settleCurrency={conversion.settleCurrency}
          rate={conversion.rate}
          source={conversion.source}
          ledgerName={ledger.name}
          hasLedgerRate={!!ledger.rates?.[draft.currency]}
          shares={
            allocation.ok
              ? (() => {
                  const settled = allocateSettle(conversion.settleMinor, allocation.shares);
                  const ownerId = ownerMemberId(ledger);
                  return split.memberIds.map((id) => ({
                    id,
                    name: memberName(
                      ledger.members.find((m) => m.id === id),
                      repo.uid,
                      t,
                    ),
                    share: allocation.shares[id] ?? 0,
                    settle: settled[id] ?? 0,
                    owner: id === ownerId,
                  }));
                })()
              : undefined
          }
          onSetRate={(rate) =>
            draft.set({ manualRate: rate ? { rate, settleCurrency: ledger.currency } : null })
          }
          onOpenLedgerRates={() => {
            setOverlay(null);
            router.push({ pathname: '/ledger/rates/[id]', params: { id: ledger.id } });
          }}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === 'addRate' && (
        <LedgerRateSheet
          ledgerName={ledger.name}
          currency={draft.currency}
          settleCurrency={ledger.currency}
          onSave={(rate) => {
            const rates = { ...ledger.rates, [draft.currency]: rate };
            repo.updateLedger(ledger.id, { rates });
            setOverlay(null);
            if (submitAfterRate) submit(rates);
          }}
          onClose={() => {
            setSubmitAfterRate(false);
            setOverlay(null);
          }}
        />
      )}
      {overlay === 'chooser' && (
        <Sheet onClose={() => setOverlay(null)} style={{ paddingHorizontal: 14, gap: 6 }}>
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
