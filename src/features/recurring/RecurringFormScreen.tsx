import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { useAppData, useRepo } from '@/data/AppDataProvider';
import { CalendarPicker } from '@/features/entry/CalendarPicker';
import { Avatar, memberColor, memberName } from '@/features/shared/members';
import { useI18n } from '@/i18n';
import type { CategoryCode } from '@/lib/categories';
import { getCurrency } from '@/lib/currency';
import { addDays, formatDate, todayLocal, type LocalDate } from '@/lib/date';
import type { Frequency, Ledger, RecurringKind } from '@/lib/domain';
import { lastPersonalLedgerId } from '@/lib/ledgers';
import {
  formatMoney,
  inputDecimals,
  inputToMinor,
  isoDecimals,
  minorToInput,
  sanitizeAmountText,
} from '@/lib/money';
import {
  AFTERPAY_PAYMENTS,
  chargesBefore,
  FREQUENCIES,
  instalmentSchedule,
  MAX_INSTALMENTS,
  MIN_INSTALMENTS,
  recurringSplitShares,
  sourceForName,
} from '@/lib/recurring';
import { IconButton, PillButton } from '@/ui/Buttons';
import { CategoryCircle } from '@/ui/CategoryCircle';
import { Icon, type IconName } from '@/ui/Icon';
import { Dialog, Sheet } from '@/ui/Overlay';
import { Screen, ScreenHeader } from '@/ui/Screen';
import { Segmented } from '@/ui/Segmented';
import { fonts } from '@/ui/theme/fonts';
import { shadows } from '@/ui/theme/palette';
import { useColors } from '@/ui/theme/ThemeProvider';
import { Toggle } from '@/ui/Toggle';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

import { ensureNotificationPermission } from '../notifications/permission';

/** Categories offered for each kind (design 17). The current one is always included. */
const CATEGORY_SETS: Record<RecurringKind, CategoryCode[]> = {
  regular: ['subs', 'bills', 'health', 'fun', 'other'],
  instalment: ['shopping', 'fun', 'travel', 'gifts', 'other'],
  split: ['rent', 'bills', 'groceries', 'other'],
};
const DEFAULTS: Record<RecurringKind, { frequency: Frequency; category: CategoryCode }> = {
  regular: { frequency: 'monthly', category: 'subs' },
  instalment: { frequency: 'fortnightly', category: 'shopping' },
  split: { frequency: 'weekly', category: 'rent' },
};

type Preset = { name: string; amount: string; icon: IconName; category: CategoryCode };

type Overlay = 'ledger' | 'date' | 'payer' | 'delete' | null;

/** Screen 17: new or edit a recurring payment (Regular / Afterpay / Split). */
export function RecurringFormScreen() {
  const colors = useColors();
  const { t, lang } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const { recurring, orderedLedgers, profile } = useAppData();
  const { id } = useLocalSearchParams<{ id: string }>();
  const editing = recurring.find((r) => r.id === id && r.ownerUid === repo.uid);
  const today = todayLocal();

  const activeLedgers = orderedLedgers.filter((l) => l.status === 'active');
  const ledgersFor = (k: RecurringKind) =>
    activeLedgers.filter((l) => (k === 'split' ? l.kind === 'shared' : l.kind === 'personal'));
  const defaultLedger = (k: RecurringKind): Ledger | undefined => {
    const list = ledgersFor(k);
    if (k === 'split') return list[0];
    const last = lastPersonalLedgerId(profile, list);
    return list.find((l) => l.id === last) ?? list[0];
  };
  const myMemberId = (ledger: Ledger | undefined) =>
    ledger?.members.find((m) => m.uid === repo.uid && m.leftAt === null)?.id ?? null;

  const [kind, setKind] = useState<RecurringKind>(editing?.kind ?? 'regular');
  const [name, setName] = useState(editing?.name ?? '');
  const initialLedger = editing
    ? activeLedgers.find((l) => l.id === editing.ledgerId)
    : defaultLedger('regular');
  const [ledgerId, setLedgerId] = useState<string | null>(initialLedger?.id ?? null);
  const ledger = activeLedgers.find((l) => l.id === ledgerId);
  const currency = ledger?.currency ?? profile.starredCurrencies[0] ?? 'AUD';
  const { symbol } = getCurrency(currency);
  const typed = inputDecimals(currency);
  const [amount, setAmount] = useState(
    editing ? minorToInput(editing.amountMinor, isoDecimals(currency)) : '',
  );
  const [frequency, setFrequency] = useState<Frequency>(editing?.frequency ?? DEFAULTS.regular.frequency);
  const [category, setCategory] = useState<CategoryCode>(editing?.categoryCode ?? DEFAULTS.regular.category);
  const [startDate, setStartDate] = useState<LocalDate>(editing?.startDate ?? today);
  const [remind, setRemind] = useState<boolean | null>(editing ? editing.remindDayBefore : null);
  const [instalments, setInstalments] = useState(editing?.instalments ?? AFTERPAY_PAYMENTS);
  const [payerId, setPayerId] = useState<string | null>(
    editing?.payerMemberId ?? (initialLedger?.kind === 'shared' ? myMemberId(initialLedger) : null),
  );
  const [overlay, setOverlay] = useState<Overlay>(null);

  const amountMinor = inputToMinor(amount, isoDecimals(currency));
  const isAfterpay = kind === 'instalment';
  const remindOn = remind ?? isAfterpay;
  const effectiveFrequency: Frequency = isAfterpay ? 'fortnightly' : frequency;
  const payer = ledger?.members.find((m) => m.id === payerId && m.leftAt === null);

  const switchKind = (k: RecurringKind) => {
    if (k === kind) return;
    setKind(k);
    setFrequency(DEFAULTS[k].frequency);
    setCategory(DEFAULTS[k].category);
    setRemind(null);
    const next = defaultLedger(k);
    setLedgerId(next?.id ?? null);
    setPayerId(k === 'split' ? myMemberId(next) : null);
  };

  const presets: Preset[] = [
    { name: 'Apple iCloud+', amount: '4.49', icon: 'cloud', category: 'subs' },
    { name: 'Apple Music', amount: '12.99', icon: 'music', category: 'subs' },
    { name: 'Netflix', amount: '22.99', icon: 'tv', category: 'subs' },
    { name: 'Spotify', amount: '13.99', icon: 'headphones', category: 'subs' },
    { name: t('recurring.presetPhone'), amount: '35.00', icon: 'smartphone', category: 'bills' },
  ];

  const categories = CATEGORY_SETS[kind].includes(category)
    ? CATEGORY_SETS[kind]
    : [category, ...CATEGORY_SETS[kind]];

  const schedule = isAfterpay
    ? instalmentSchedule({ kind, amountMinor, frequency: 'fortnightly', startDate, instalments })
    : [];
  const shares = kind === 'split' && ledger ? recurringSplitShares(ledger, amountMinor) : {};
  const others = ledger?.members.filter((m) => m.leftAt === null && m.uid !== repo.uid) ?? [];
  const scheduleChanged =
    !editing ||
    editing.startDate !== startDate ||
    editing.frequency !== effectiveFrequency ||
    (isAfterpay && editing.instalments !== instalments);
  const skipsPast =
    scheduleChanged &&
    chargesBefore({ kind, amountMinor, frequency: effectiveFrequency, startDate, instalments }, today) > 0;

  const save = () => {
    if (!amountMinor) return toast(t('recurring.enterAmount'));
    if (!ledger) return toast(kind === 'split' ? t('recurring.noShared') : t('recurring.noPersonal'));
    if (kind === 'split' && !payer) return setOverlay('payer');
    const trimmed = name.trim() || t('recurring.untitled');
    const fields = {
      name: trimmed,
      amountMinor,
      ledgerId: ledger.id,
      categoryCode: category,
      frequency: effectiveFrequency,
      startDate,
      remindDayBefore: remindOn,
      instalments: isAfterpay ? instalments : null,
      payerMemberId: kind === 'split' ? (payer?.id ?? null) : null,
      source: sourceForName(trimmed),
    };
    if (editing) {
      repo.updateRecurring(editing.id, fields);
      toast(t('recurring.updated', { name: trimmed }));
    } else {
      repo.addRecurring({ kind, ...fields });
      toast(t('recurring.saved', { name: trimmed }));
    }
    void ensureNotificationPermission();
    router.back();
  };

  const rows: { label: string; value: string; onPress?: () => void; right?: ReactNode }[] = [
    {
      label: t('recurring.ledger'),
      value: ledger ? `${ledger.name} · ${ledger.currency}` : '—',
      onPress: () => setOverlay('ledger'),
    },
    {
      label:
        kind === 'split'
          ? t('recurring.starts')
          : isAfterpay
            ? t('recurring.firstPayment')
            : t('recurring.firstCharge'),
      value: formatDate(startDate, lang),
      onPress: () => setOverlay('date'),
    },
  ];
  if (isAfterpay) {
    rows.push({
      label: t('recurring.plan'),
      value: t('recurring.planValue', { count: instalments }),
      right: (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <IconButton
            icon="minus"
            size={36}
            iconSize={16}
            background={colors.bg}
            accessibilityLabel={t('recurring.fewer')}
            onPress={() => setInstalments((n) => Math.max(MIN_INSTALMENTS, n - 1))}
          />
          <IconButton
            icon="plus"
            size={36}
            iconSize={16}
            background={colors.bg}
            accessibilityLabel={t('recurring.more')}
            onPress={() => setInstalments((n) => Math.min(MAX_INSTALMENTS, n + 1))}
          />
        </View>
      ),
    });
  }
  if (kind === 'split') {
    rows.push({
      label: t('recurring.paidBy'),
      value: payer ? memberName(payer, repo.uid, t) : '—',
      onPress: () => setOverlay('payer'),
    });
  }

  const noShared = kind === 'split' && ledgersFor('split').length === 0;

  return (
    <Screen>
      <ScreenHeader
        title={editing ? t('recurring.editTitle') : t('recurring.newTitle')}
        onBack={() => router.back()}
        close
        backLabel={t('common.close')}
      />
      <ScrollView
        contentContainerStyle={{ paddingTop: 6, paddingHorizontal: 18, paddingBottom: 10, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        {!editing && (
          <Segmented
            value={kind}
            onChange={switchKind}
            options={[
              { value: 'regular', label: t('recurring.kindRegular') },
              { value: 'instalment', label: t('recurring.kindAfterpay') },
              { value: 'split', label: t('recurring.kindSplit') },
            ]}
          />
        )}

        {kind === 'regular' && (
          <View style={{ gap: 8 }}>
            <Txt font="semibold" size={13} color={colors.neutral[700]} style={{ paddingHorizontal: 6 }}>
              {t('recurring.quickPick')}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {presets.map((p) => {
                const on = name === p.name;
                return (
                  <Pressable
                    key={p.name}
                    accessibilityRole="button"
                    aria-selected={on}
                    onPress={() => {
                      setName(p.name);
                      setCategory(p.category);
                      setFrequency('monthly');
                      if (currency === 'AUD') setAmount(p.amount);
                    }}
                    style={{
                      height: 44,
                      paddingLeft: 10,
                      paddingRight: 14,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: on ? colors.accent : colors.divider,
                      backgroundColor: on ? colors.accentRamp[100] : 'transparent',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Icon name={p.icon} size={15} color={colors.accentRamp[700]} />
                    <Txt font="semibold" size={13}>
                      {p.name}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {kind === 'split' && ledger && (
          <View
            style={{
              minHeight: 56,
              paddingHorizontal: 16,
              borderRadius: 24,
              backgroundColor: colors.accent2Ramp[200],
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Icon name="users" size={18} color={colors.accent2Ramp[900]} />
            <Txt font="bold" size={15} color={colors.accent2Ramp[900]} style={{ flex: 1 }} numberOfLines={1}>
              {`${ledger.name} · ${ledger.currency}`}
            </Txt>
            <View style={{ flexDirection: 'row' }}>
              {ledger.members
                .filter((m) => m.leftAt === null)
                .map((m, i) => (
                  <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                    <Avatar
                      name={memberName(m, repo.uid, t)}
                      color={memberColor(colors, ledger, m.id, repo.uid)}
                      size={28}
                      ring={colors.accent2Ramp[200]}
                    />
                  </View>
                ))}
            </View>
          </View>
        )}

        {noShared && (
          <View style={{ borderRadius: 28, backgroundColor: colors.surface, padding: 18, gap: 12 }}>
            <Txt size={14} color={colors.neutral[800]}>
              {t('recurring.noShared')}
            </Txt>
            <View style={{ flexDirection: 'row' }}>
              <PillButton
                label={t('recurring.createShared')}
                icon="book-plus"
                onPress={() => router.push({ pathname: '/ledger/new', params: { kind: 'shared' } })}
              />
            </View>
          </View>
        )}

        <View
          style={{
            minHeight: 56,
            paddingHorizontal: 18,
            borderRadius: 999,
            backgroundColor: colors.surface,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Txt font="semibold" size={13} color={colors.neutral[700]} style={{ width: 64 }}>
            {t('recurring.name')}
          </Txt>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={40}
            accessibilityLabel={t('recurring.name')}
            style={{
              flex: 1,
              minWidth: 0,
              height: 52,
              fontFamily: fonts.bodySemiBold,
              fontSize: 16,
              color: colors.text,
            }}
          />
        </View>
        <View
          style={{
            minHeight: 64,
            paddingHorizontal: 18,
            borderRadius: 999,
            backgroundColor: colors.surface,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Txt font="semibold" size={13} color={colors.neutral[700]} style={{ width: 64 }}>
            {isAfterpay ? t('recurring.total') : t('recurring.amount')}
          </Txt>
          <Txt font="heading" size={22} color={colors.neutral[600]}>
            {symbol.trim()}
          </Txt>
          <TextInput
            value={amount}
            onChangeText={(text) => setAmount(sanitizeAmountText(text, typed))}
            keyboardType={typed ? 'decimal-pad' : 'number-pad'}
            accessibilityLabel={isAfterpay ? t('recurring.total') : t('recurring.amount')}
            placeholder="0"
            placeholderTextColor={colors.neutral[500]}
            style={{
              flex: 1,
              minWidth: 0,
              height: 60,
              fontFamily: fonts.heading,
              fontSize: 26,
              color: colors.text,
              fontVariant: ['tabular-nums'],
            }}
          />
        </View>

        {!isAfterpay && (
          <View style={{ gap: 8 }}>
            <Txt font="semibold" size={13} color={colors.neutral[700]} style={{ paddingHorizontal: 6 }}>
              {t('recurring.repeats')}
            </Txt>
            <Segmented
              value={frequency}
              onChange={setFrequency}
              height={40}
              fontSize={13}
              options={FREQUENCIES.map((f) => ({ value: f, label: t(`recurring.${f}`) }))}
            />
          </View>
        )}

        <View style={{ gap: 8 }}>
          <Txt font="semibold" size={13} color={colors.neutral[700]} style={{ paddingHorizontal: 6 }}>
            {t('recurring.category')}
          </Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {categories.map((code) => {
              const on = code === category;
              return (
                <Pressable
                  key={code}
                  accessibilityRole="radio"
                  aria-checked={on}
                  accessibilityLabel={t(`category.${code}`)}
                  onPress={() => setCategory(code)}
                  style={{ width: 66, alignItems: 'center', gap: 5 }}
                >
                  <CategoryCircle
                    code={code}
                    size={50}
                    iconSize={21}
                    background={on ? colors.accent : colors.surface}
                    color={on ? colors.bg : colors.accentRamp[800]}
                  />
                  <Txt size={12} align="center" lineHeight={14}>
                    {t(`category.${code}`)}
                  </Txt>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View
          style={{
            borderRadius: 28,
            backgroundColor: colors.surface,
            paddingVertical: 4,
            paddingHorizontal: 18,
          }}
        >
          {rows.map((row) => (
            <Pressable
              key={row.label}
              accessibilityRole={row.onPress ? 'button' : undefined}
              disabled={!row.onPress}
              onPress={row.onPress}
              style={{
                minHeight: 52,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.divider,
              }}
            >
              <Txt size={15} color={colors.neutral[800]} style={{ flex: 1 }}>
                {row.label}
              </Txt>
              <Txt font="bold" size={15} numberOfLines={1} style={{ flexShrink: 1 }}>
                {row.value}
              </Txt>
              {row.right ?? <Icon name="chevron-right" size={16} color={colors.neutral[600]} />}
            </Pressable>
          ))}
          <View style={{ minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Txt size={15}>{t('recurring.remind')}</Txt>
              <Txt size={12} color={colors.neutral[700]}>
                {isAfterpay ? t('recurring.remindAfterpay') : t('recurring.remindOff')}
              </Txt>
            </View>
            <Toggle on={remindOn} onChange={setRemind} accessibilityLabel={t('recurring.remind')} />
          </View>
        </View>

        {isAfterpay && (
          <View
            style={{
              borderRadius: 28,
              backgroundColor: colors.neutral[100],
              borderWidth: 1.5,
              borderColor: 'rgba(255, 255, 255, 0.6)',
              boxShadow: shadows.sm,
              paddingVertical: 16,
              paddingHorizontal: 18,
              gap: 2,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 6 }}>
              <Txt font="bold" size={15} style={{ flex: 1 }}>
                {t('recurring.schedule')}
              </Txt>
              <View
                style={{
                  paddingVertical: 3,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  backgroundColor: colors.accentRamp[100],
                }}
              >
                <Txt font="bold" size={12} color={colors.accentRamp[800]}>
                  Afterpay
                </Txt>
              </View>
            </View>
            {schedule.map((c) => {
              const paid = !!editing && !scheduleChanged && c.seq < editing.paidCount;
              const next = c.seq === (editing && !scheduleChanged ? editing.paidCount : 0);
              return (
                <View
                  key={c.seq}
                  style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: next ? colors.accent : paid ? colors.accent2Ramp[200] : colors.surface,
                    }}
                  >
                    {paid ? (
                      <Icon name="check" size={14} color={colors.accent2Ramp[800]} />
                    ) : (
                      <Txt font="bold" size={12} color={next ? colors.bg : colors.text}>
                        {String(c.seq + 1)}
                      </Txt>
                    )}
                  </View>
                  <Txt size={14} style={{ flex: 1 }}>
                    {formatDate(c.date, lang)}
                  </Txt>
                  <Txt font="bold" size={15} tabular>
                    {formatMoney(currency, c.amountMinor)}
                  </Txt>
                </View>
              );
            })}
          </View>
        )}

        {kind === 'split' && ledger && (
          <View
            style={{
              borderRadius: 28,
              backgroundColor: colors.surface,
              paddingVertical: 14,
              paddingHorizontal: 18,
              gap: 2,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 4 }}>
              <Txt size={15} color={colors.neutral[800]} style={{ flex: 1 }}>
                {t('recurring.shares')}
              </Txt>
              <Txt font="bold" size={15}>
                {t('recurring.equally')}
              </Txt>
            </View>
            {ledger.members
              .filter((m) => m.leftAt === null)
              .map((m) => (
                <View
                  key={m.id}
                  style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <Avatar
                    name={memberName(m, repo.uid, t)}
                    color={memberColor(colors, ledger, m.id, repo.uid)}
                    size={26}
                  />
                  <Txt size={14} style={{ flex: 1 }}>
                    {memberName(m, repo.uid, t)}
                  </Txt>
                  <View
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      backgroundColor: colors.bg,
                    }}
                  >
                    <Txt font="bold" size={15} tabular>
                      {formatMoney(currency, shares[m.id] ?? 0)}
                    </Txt>
                  </View>
                </View>
              ))}
          </View>
        )}

        <Txt size={13} lineHeight={19} color={colors.neutral[700]} style={{ paddingHorizontal: 6 }}>
          {isAfterpay
            ? t('recurring.noteAfterpay', { count: instalments })
            : kind === 'split'
              ? t('recurring.noteSplit', {
                  ledger: ledger?.name ?? '',
                  names: others.map((m) => m.name).join(t('split.namesJoin')),
                })
              : t('recurring.noteRegular')}
        </Txt>
        {skipsPast && (
          <Txt font="semibold" size={13} color={colors.accentRamp[700]} style={{ paddingHorizontal: 6 }}>
            {t('recurring.pastNote')}
          </Txt>
        )}
        {editing && (
          <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
            <PillButton
              label={t('recurring.delete')}
              variant="danger"
              icon="trash-2"
              onPress={() => setOverlay('delete')}
            />
          </View>
        )}
      </ScrollView>
      <View style={{ paddingTop: 10, paddingHorizontal: 16, paddingBottom: 6 }}>
        <PillButton
          label={editing ? t('recurring.saveChanges') : t('recurring.save')}
          height={60}
          disabled={noShared}
          onPress={save}
        />
      </View>

      {overlay === 'ledger' && (
        <Sheet onClose={() => setOverlay(null)} style={{ paddingHorizontal: 14, gap: 6 }}>
          <Txt font="heading" size={24} style={{ paddingTop: 12, paddingHorizontal: 8, paddingBottom: 8 }}>
            {t('recurring.chooseLedger')}
          </Txt>
          {ledgersFor(kind).map((l) => (
            <ChoiceRow
              key={l.id}
              icon={l.kind === 'shared' ? 'users' : 'book-open'}
              label={`${l.name} · ${l.currency}`}
              selected={l.id === ledgerId}
              onPress={() => {
                setLedgerId(l.id);
                if (kind === 'split') setPayerId(myMemberId(l));
                // Amounts keep their digits; a currency with fewer decimals drops the extra ones.
                setAmount((a) => sanitizeAmountText(a, inputDecimals(l.currency)));
                setOverlay(null);
              }}
            />
          ))}
        </Sheet>
      )}
      {overlay === 'payer' && ledger && (
        <Sheet onClose={() => setOverlay(null)} style={{ paddingHorizontal: 14, gap: 6 }}>
          <Txt font="heading" size={24} style={{ paddingTop: 12, paddingHorizontal: 8, paddingBottom: 8 }}>
            {t('recurring.choosePayer')}
          </Txt>
          {ledger.members
            .filter((m) => m.leftAt === null)
            .map((m) => (
              <ChoiceRow
                key={m.id}
                icon="circle-user"
                label={memberName(m, repo.uid, t)}
                selected={m.id === payerId}
                onPress={() => {
                  setPayerId(m.id);
                  setOverlay(null);
                }}
              />
            ))}
        </Sheet>
      )}
      {overlay === 'date' && (
        <Sheet onClose={() => setOverlay(null)} style={{ paddingHorizontal: 18, gap: 12 }}>
          <Txt font="heading" size={24} style={{ paddingTop: 12, paddingHorizontal: 4 }}>
            {rows[1].label}
          </Txt>
          <CalendarPicker
            value={startDate}
            today={today}
            maxDate={addDays(today, 366)}
            quickDays={[[today, t('common.today')]]}
            onChange={(date) => {
              setStartDate(date);
              setOverlay(null);
            }}
          />
        </Sheet>
      )}
      {overlay === 'delete' && editing && (
        <Dialog onClose={() => setOverlay(null)}>
          <Txt font="heading" size={24}>
            {t('recurring.deleteTitle', { name: editing.name })}
          </Txt>
          <Txt size={14} color={colors.neutral[800]}>
            {t('recurring.deleteBody')}
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
            <PillButton label={t('common.cancel')} variant="outline" onPress={() => setOverlay(null)} />
            <PillButton
              label={t('common.delete')}
              variant="danger"
              onPress={() => {
                repo.deleteRecurring(editing.id);
                toast(t('recurring.deleted', { name: editing.name }));
                router.back();
              }}
            />
          </View>
        </Dialog>
      )}
    </Screen>
  );
}

function ChoiceRow({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: IconName;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      aria-checked={selected}
      onPress={onPress}
      style={{
        minHeight: 62,
        paddingHorizontal: 16,
        borderRadius: 24,
        backgroundColor: selected ? colors.accentRamp[100] : colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Icon name={icon} size={18} color={colors.accentRamp[700]} />
      <Txt font="bold" size={16} style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </Txt>
      {selected && <Icon name="check" size={18} color={colors.accentRamp[700]} />}
    </Pressable>
  );
}
