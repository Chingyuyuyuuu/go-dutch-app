import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useAppData, useRepo } from '@/data/AppDataProvider';
import { useI18n } from '@/i18n';
import { categoryGrid, type CategoryCode } from '@/lib/categories';
import { getCurrency } from '@/lib/currency';
import { dayLabel, todayLocal } from '@/lib/date';
import { personalLedgersFor, routePersonalEntry } from '@/lib/ledgers';
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
import { useEntryDraft, useHomeTab } from './draft';

/** Screen 05 (+ 05b note sheet, 05c backdate, 06 ledger routing sheet). */
export function CategoryScreen() {
  const colors = useColors();
  const { t, lang } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const { ledgers, profile } = useAppData();
  const draft = useEntryDraft();
  const params = useLocalSearchParams<{ choose?: string }>();
  const [overlay, setOverlay] = useState<'route' | 'note' | null>(params.choose === '1' ? 'route' : null);
  const [dateOpen, setDateOpen] = useState(false);
  const today = todayLocal();

  const ledger = ledgers.find((l) => l.id === draft.ledgerId);
  if (!ledger) return <Redirect href="/" />;

  const minor = inputToMinor(draft.input, getCurrency(draft.currency).minorUnits);
  const amount = formatMoney(draft.currency, minor);
  const isIncome = draft.type === 'income';
  // TODO(phase 6): use the ledger's category set once ledgers store one.
  const codes = categoryGrid('au_life', isIncome ? 'income' : 'expense').grid;
  const candidates = personalLedgersFor(draft.currency, ledgers);
  const ledgerLabel = `${ledger.name} · ${ledger.currency}`;
  const typeTone = isIncome
    ? { bg: colors.accent2Ramp[200], fg: colors.accent2Ramp[800] }
    : { bg: colors.accentRamp[200], fg: colors.accentRamp[800] };

  const route = routePersonalEntry({
    currency: draft.currency,
    ledgers,
    lastUsedLedgerId: profile.lastUsedLedger[draft.currency],
  });
  const routeIds = route.kind === 'choose' ? route.ledgerIds : candidates.map((l) => l.id);
  const lastUsed = profile.lastUsedLedger[draft.currency];

  const pick = (code: CategoryCode) => {
    draft.set({ categoryCode: code });
    setDateOpen(false);
    setOverlay('note');
  };

  const save = () => {
    if (!draft.categoryCode) return;
    repo.addEntry(ledger.id, {
      type: draft.type,
      amountMinor: minor,
      categoryCode: draft.categoryCode,
      date: draft.date,
      note: draft.note.trim(),
    });
    repo.updateProfile({ lastUsedLedger: { ...profile.lastUsedLedger, [draft.currency]: ledger.id } });
    useHomeTab.getState().select(ledger.id);
    toast(t('entry.savedTo', { name: ledger.name }));
    router.dismissAll();
  };

  return (
    <Screen>
      <ScreenHeader title={t('entry.category')} onBack={() => router.back()} backLabel={t('common.back')} />
      <View style={{ paddingTop: 10, paddingHorizontal: 24, paddingBottom: 18, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Txt
            font="heading"
            size={44}
            tabular
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ flexShrink: 1 }}
          >
            {amount}
          </Txt>
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: typeTone.bg,
            }}
          >
            <Txt font="bold" size={13} color={typeTone.fg}>
              {isIncome ? t('entry.income') : t('entry.expense')}
            </Txt>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          aria-disabled={candidates.length < 2}
          disabled={candidates.length < 2}
          onPress={() => setOverlay('route')}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            height: 44,
            paddingLeft: 16,
            paddingRight: 8,
            borderRadius: 999,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: pressed ? colors.neutral[300] : colors.surface,
          })}
        >
          <Icon name="book-open" size={16} color={colors.accentRamp[700]} />
          <Txt size={14}>
            {t('entry.savingTo')}{' '}
            <Txt font="bold" size={14}>
              {ledgerLabel}
            </Txt>
          </Txt>
          {candidates.length >= 2 && (
            <View
              style={{
                height: 30,
                paddingHorizontal: 12,
                borderRadius: 999,
                backgroundColor: colors.bg,
                justifyContent: 'center',
              }}
            >
              <Txt font="bold" size={12} color={colors.accentRamp[700]}>
                {t('common.change')}
              </Txt>
            </View>
          )}
        </Pressable>
      </View>

      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignContent: 'flex-start',
          rowGap: 18,
          paddingHorizontal: 16,
          paddingTop: 8,
        }}
      >
        {codes.map((code) => (
          <Pressable
            key={code}
            accessibilityRole="button"
            accessibilityLabel={t(`category.${code}`)}
            onPress={() => pick(code)}
            style={{ width: '25%', alignItems: 'center', gap: 7, paddingHorizontal: 3 }}
          >
            <CategoryCircle
              code={code}
              size={64}
              iconSize={26}
              background={isIncome ? colors.accent2Ramp[200] : colors.surface}
              color={isIncome ? colors.accent2Ramp[800] : colors.accentRamp[800]}
            />
            <Txt font="semibold" size={13} align="center" lineHeight={16}>
              {t(`category.${code}`)}
            </Txt>
          </Pressable>
        ))}
      </View>
      <Txt
        size={13}
        color={colors.neutral[700]}
        style={{ paddingHorizontal: 26, paddingTop: 8, paddingBottom: 14 }}
      >
        {t('entry.pickCategoryHint')}
      </Txt>

      {overlay === 'route' && (
        <Sheet onClose={() => setOverlay(null)} style={{ paddingHorizontal: 14, gap: 6 }}>
          <Txt font="heading" size={24} style={{ paddingTop: 12, paddingHorizontal: 8 }}>
            {t('route.title', { cur: draft.currency })}
          </Txt>
          <Txt size={13} color={colors.neutral[700]} style={{ paddingHorizontal: 8, paddingBottom: 8 }}>
            {t('route.sub')}
          </Txt>
          {routeIds.map((id) => {
            const l = ledgers.find((x) => x.id === id);
            if (!l) return null;
            const selected = l.id === ledger.id;
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                aria-selected={selected}
                onPress={() => {
                  draft.set({ ledgerId: id });
                  setOverlay(null);
                }}
                style={{
                  minHeight: 62,
                  paddingHorizontal: 16,
                  borderRadius: 24,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: selected ? colors.accentRamp[100] : colors.surface,
                }}
              >
                <Icon name="book-open" size={18} color={colors.accentRamp[700]} />
                <Txt font="bold" size={16} style={{ flex: 1 }}>
                  {`${l.name} · ${l.currency}`}
                </Txt>
                {id === lastUsed && (
                  <Tag
                    label={t('route.lastUsed')}
                    background={colors.accentRamp[100]}
                    color={colors.accentRamp[800]}
                  />
                )}
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setOverlay(null);
              router.push({ pathname: '/ledger/new', params: { currency: draft.currency, then: 'back' } });
            }}
            style={{
              minHeight: 56,
              marginTop: 4,
              paddingHorizontal: 16,
              borderRadius: 24,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.neutral[500],
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Icon name="plus" size={18} color={colors.text} />
            <Txt size={15}>{t('route.newLedger', { cur: draft.currency })}</Txt>
          </Pressable>
        </Sheet>
      )}

      {overlay === 'note' && draft.categoryCode && (
        <Sheet onClose={() => setOverlay(null)} style={{ paddingHorizontal: 18, gap: 14 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              paddingTop: 8,
              paddingHorizontal: 4,
            }}
          >
            <CategoryCircle code={draft.categoryCode} size={56} iconSize={24} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt font="heading" size={24} lineHeight={27}>
                {t(`category.${draft.categoryCode}`)}
              </Txt>
              <Txt size={13} color={colors.neutral[700]}>
                {ledgerLabel}
              </Txt>
            </View>
            <Txt font="heading" size={26} tabular>
              {amount}
            </Txt>
          </View>
          <View
            style={{
              minHeight: 56,
              paddingHorizontal: 18,
              borderRadius: 999,
              backgroundColor: colors.surface,
              borderWidth: 2,
              borderColor: colors.accent,
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
              autoFocus
              returnKeyType="done"
              onSubmitEditing={save}
              maxLength={200}
              style={{
                flex: 1,
                minWidth: 0,
                height: 52,
                fontFamily: fonts.body,
                fontSize: 16,
                color: colors.text,
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <DateChip
              label={dayLabel(draft.date, today, lang)}
              highlighted={draft.date !== today}
              onPress={() => setDateOpen((v) => !v)}
            />
            <PillButton
              label={t('entry.changeCategory')}
              variant="outline"
              height={44}
              fontSize={14}
              bodyFont
              onPress={() => setOverlay(null)}
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
          <PillButton label={t('common.save')} height={58} fontSize={20} onPress={save} />
        </Sheet>
      )}
    </Screen>
  );
}

export function DateChip({
  label,
  highlighted,
  onPress,
}: {
  label: string;
  highlighted: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const fg = highlighted ? colors.accentRamp[900] : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        height: 44,
        paddingLeft: 16,
        paddingRight: 14,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: highlighted ? colors.accentRamp[200] : colors.surface,
      }}
    >
      <Icon name="calendar" size={16} color={fg} />
      <Txt font="semibold" size={14} color={fg}>
        {label}
      </Txt>
      <Icon name="chevron-down" size={14} color={fg} />
    </Pressable>
  );
}
