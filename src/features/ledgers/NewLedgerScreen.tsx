import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { useAppData, useRepo } from '@/data/AppDataProvider';
import { CurrencyPicker } from '@/features/entry/CurrencyPicker';
import { useEntryDraft, useHomeTab } from '@/features/entry/draft';
import { RateField, useRateInput } from '@/features/entry/fx';
import { useI18n } from '@/i18n';
import { DEFAULT_CATEGORY_SET, type CategorySet } from '@/lib/categories';
import { currencyName, isCurrencyCode } from '@/lib/currency';
import type { LedgerKind, ShareHandling } from '@/lib/domain';
import { MemberPicker, ShareHandlingPicker, usePeople, type PersonKey } from '@/features/shared/MemberPicker';
import { PillButton } from '@/ui/Buttons';
import { Icon } from '@/ui/Icon';
import { Screen, ScreenHeader } from '@/ui/Screen';
import { fonts } from '@/ui/theme/fonts';
import { useColors } from '@/ui/theme/ThemeProvider';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

/** Settlement currency of a new ledger unless chosen otherwise (spec §3: a trip settled in TWD). */
export const DEFAULT_SETTLE_CURRENCY = 'TWD';

/**
 * Screen 09 (+ 26): name, type, settlement currency, usual entry currency with
 * its ledger rate, and category set. `then=category` comes from the "No personal
 * ledger" dialog, `then=back` from the routing sheet, `then=split` from "No
 * shared ledger"; each continues the entry with the new ledger selected.
 */
export function NewLedgerScreen() {
  const colors = useColors();
  const { t, lang } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const { profile } = useAppData();
  const params = useLocalSearchParams<{
    currency?: string;
    /** Currency of the entry being added: becomes the usual entry currency. */
    entryCurrency?: string;
    kind?: LedgerKind;
    then?: 'category' | 'back' | 'split';
  }>();
  const people = usePeople();
  const presetCurrency = params.currency && isCurrencyCode(params.currency) ? params.currency : undefined;
  const presetEntry =
    params.entryCurrency && isCurrencyCode(params.entryCurrency) ? params.entryCurrency : undefined;

  const [name, setName] = useState('');
  const [kind, setKind] = useState<LedgerKind>(params.kind === 'shared' ? 'shared' : 'personal');
  const [selected, setSelected] = useState<PersonKey[]>([]);
  const [shareHandling, setShareHandling] = useState<ShareHandling>('ask');
  const [currency, setCurrency] = useState(presetCurrency ?? DEFAULT_SETTLE_CURRENCY);
  const [entryCurrency, setEntryCurrency] = useState(
    presetEntry ?? presetCurrency ?? DEFAULT_SETTLE_CURRENCY,
  );
  const [categorySet, setCategorySet] = useState<CategorySet>(DEFAULT_CATEGORY_SET);
  const [picker, setPicker] = useState<'settle' | 'entry' | null>(null);
  const foreign = entryCurrency !== currency;
  const rateInput = useRateInput(foreign ? entryCurrency : null, currency);

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return toast(t('ledger.nameRequired'));
    const members = people.filter((p) => selected.includes(p.key)).map((p) => p.member);
    if (kind === 'shared' && members.length === 0) return toast(t('ledger.needMember'));
    if (foreign && !rateInput.rate) return toast(t('fx.needRate', { cur: entryCurrency }));
    const id = repo.createLedger({
      name: trimmed,
      currency,
      kind,
      members,
      shareHandling,
      entryCurrency: foreign ? entryCurrency : null,
      categorySet,
      rates: foreign && rateInput.rate ? { [entryCurrency]: rateInput.rate } : {},
    });
    toast(t('ledger.created', { name: trimmed, cur: currency }));
    if (params.then === 'split' && kind === 'shared') {
      useEntryDraft.getState().set({ sharedLedgerId: id });
      router.replace('/add/split');
    } else if (params.then === 'category' && kind === 'personal') {
      useEntryDraft.getState().set({ ledgerId: id });
      router.replace('/add/category');
    } else if (params.then === 'back') {
      useEntryDraft.getState().set({ ledgerId: id });
      router.back();
    } else {
      useHomeTab.getState().select(id);
      router.back();
    }
  };

  const kinds: { value: LedgerKind; label: string; sub: string }[] = [
    { value: 'personal', label: t('ledger.personal'), sub: t('ledger.onlyYou') },
    { value: 'shared', label: t('ledger.shared'), sub: t('ledger.withFriends') },
  ];
  const sets: { value: CategorySet; label: string; sub: string }[] = [
    { value: 'japan_travel', label: t('ledger.setJapan'), sub: t('ledger.setJapanSub') },
    { value: 'au_life', label: t('ledger.setAu'), sub: t('ledger.setAuSub') },
  ];

  const currencyButton = (code: string, which: 'settle' | 'entry', label: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${code}`}
      onPress={() => setPicker(which)}
      style={{
        minHeight: 52,
        paddingHorizontal: 18,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.divider,
        backgroundColor: colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Txt font="bold" size={15}>
        {code}
      </Txt>
      <Txt size={15} color={colors.neutral[700]} style={{ flex: 1 }} numberOfLines={1}>
        {currencyName(code, lang)}
      </Txt>
      <Icon name="chevron-down" size={16} color={colors.text} />
    </Pressable>
  );

  return (
    <Screen>
      <ScreenHeader
        title={t('ledger.newLedger')}
        onBack={() => router.back()}
        close
        backLabel={t('common.close')}
      />
      <ScrollView
        contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 20, gap: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 6 }}>
          <Txt font="semibold" size={13} color={colors.neutral[700]}>
            {t('ledger.name')}
          </Txt>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('ledger.namePlaceholder')}
            placeholderTextColor={colors.neutral[600]}
            accessibilityLabel={t('ledger.name')}
            maxLength={40}
            autoFocus
            style={{
              height: 52,
              paddingHorizontal: 18,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.divider,
              backgroundColor: colors.surface,
              fontFamily: fonts.body,
              fontSize: 16,
              color: colors.text,
            }}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Txt font="semibold" size={13} color={colors.neutral[700]}>
            {t('ledger.type')}
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {kinds.map((k) => {
              const on = kind === k.value;
              return (
                <Pressable
                  key={k.value}
                  accessibilityRole="radio"
                  aria-checked={on}
                  onPress={() => setKind(k.value)}
                  style={{
                    flex: 1,
                    minHeight: 64,
                    borderRadius: 24,
                    paddingHorizontal: 16,
                    justifyContent: 'center',
                    gap: 2,
                    backgroundColor: on ? colors.text : colors.surface,
                  }}
                >
                  <Txt font="bold" size={15} color={on ? colors.bg : colors.text}>
                    {k.label}
                  </Txt>
                  <Txt size={12} color={on ? colors.bg : colors.text} style={{ opacity: 0.8 }}>
                    {k.sub}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Txt font="semibold" size={13} color={colors.neutral[700]}>
            {t('ledger.settleCurrency')}
          </Txt>
          {currencyButton(currency, 'settle', t('ledger.settleCurrency'))}
          <Txt size={12} color={colors.neutral[700]} style={{ paddingLeft: 6 }}>
            {t('ledger.currencyLocked')}
          </Txt>
        </View>

        <View style={{ gap: 6 }}>
          <Txt font="semibold" size={13} color={colors.neutral[700]}>
            {t('ledger.entryCurrency')}
          </Txt>
          {currencyButton(entryCurrency, 'entry', t('ledger.entryCurrency'))}
          <Txt size={12} color={colors.neutral[700]} style={{ paddingLeft: 6 }}>
            {t('ledger.entryCurrencyHint')}
          </Txt>
        </View>

        {foreign && (
          <View style={{ gap: 6 }}>
            <Txt font="semibold" size={13} color={colors.neutral[700]}>
              {t('ledger.rateFor', { cur: entryCurrency })}
            </Txt>
            <RateField
              from={entryCurrency}
              to={currency}
              value={rateInput.value}
              onChange={rateInput.setValue}
              suggestion={rateInput.suggestion}
              loading={rateInput.loading}
            />
          </View>
        )}

        <View style={{ gap: 6 }}>
          <Txt font="semibold" size={13} color={colors.neutral[700]}>
            {t('ledger.categorySet')}
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {sets.map((s) => {
              const on = categorySet === s.value;
              return (
                <Pressable
                  key={s.value}
                  accessibilityRole="radio"
                  aria-checked={on}
                  onPress={() => setCategorySet(s.value)}
                  style={{
                    flex: 1,
                    minHeight: 64,
                    borderRadius: 24,
                    paddingHorizontal: 16,
                    justifyContent: 'center',
                    gap: 2,
                    backgroundColor: on ? colors.text : colors.surface,
                  }}
                >
                  <Txt font="bold" size={15} color={on ? colors.bg : colors.text}>
                    {s.label}
                  </Txt>
                  <Txt size={12} color={on ? colors.bg : colors.text} style={{ opacity: 0.8 }}>
                    {s.sub}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </View>

        {kind === 'shared' && (
          <>
            <View style={{ gap: 8 }}>
              <Txt font="semibold" size={13} color={colors.neutral[700]}>
                {t('ledger.members')}
              </Txt>
              <MemberPicker selected={selected} onChange={setSelected} />
            </View>
            <View style={{ gap: 8 }}>
              <Txt font="semibold" size={13} color={colors.neutral[700]}>
                {t('ledger.yourShare')}
              </Txt>
              <ShareHandlingPicker value={shareHandling} onChange={setShareHandling} />
            </View>
          </>
        )}
      </ScrollView>
      <View style={{ paddingTop: 10, paddingHorizontal: 16, paddingBottom: 6 }}>
        <PillButton label={t('ledger.create')} height={60} onPress={create} />
      </View>

      {picker && (
        <CurrencyPicker
          selected={picker === 'settle' ? currency : entryCurrency}
          starred={profile.starredCurrencies}
          onToggleStar={(code) => {
            const s = profile.starredCurrencies;
            repo.updateProfile({
              starredCurrencies: s.includes(code) ? s.filter((c) => c !== code) : [...s, code],
            });
          }}
          onSelect={(code) => {
            if (picker === 'settle') {
              // The usual currency follows unless a different one was chosen.
              if (entryCurrency === currency) setEntryCurrency(code);
              setCurrency(code);
            } else {
              setEntryCurrency(code);
            }
            rateInput.setValue(null);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </Screen>
  );
}
