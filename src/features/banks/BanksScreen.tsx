import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useAppData, useRepo } from '@/data/AppDataProvider';
import { useI18n } from '@/i18n';
import { isUpdateDue, lastCheck } from '@/lib/banks';
import { daysBetween, formatDate, todayLocal } from '@/lib/date';
import type { BankAccount } from '@/lib/domain';
import { formatMoney } from '@/lib/money';
import { SectionLabel } from '@/ui/Buttons';
import { Icon } from '@/ui/Icon';
import { Screen, ScreenHeader } from '@/ui/Screen';
import { Segmented } from '@/ui/Segmented';
import { shadows } from '@/ui/theme/palette';
import { useColors } from '@/ui/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';

import { ensureNotificationPermission } from '../notifications/permission';
import { BankFormSheet } from './BankFormSheet';
import { UpdateBalanceSheet } from './UpdateBalanceSheet';

type Overlay = { kind: 'update'; bankId: string } | { kind: 'form'; bankId: string | null } | null;

/** Screen 20: bank accounts without a bank connection, and when each needs a new balance. */
export function BanksScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const repo = useRepo();
  const { banks, profile } = useAppData();
  const params = useLocalSearchParams<{ update?: string }>();
  // Opened from a "Time to update" notification: straight to that account's update sheet.
  const [overlay, setOverlay] = useState<Overlay>(() =>
    params.update && banks.some((b) => b.id === params.update)
      ? { kind: 'update', bankId: params.update }
      : null,
  );
  const today = todayLocal();
  const close = () => setOverlay(null);

  return (
    <Screen>
      <ScreenHeader title={t('banks.title')} onBack={() => router.back()} backLabel={t('common.back')} />
      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 14, paddingBottom: 16, gap: 14 }}
      >
        <Txt size={14} lineHeight={21} color={colors.neutral[800]} style={{ paddingHorizontal: 8 }}>
          {t('banks.note')}
        </Txt>
        {banks.map((bank) => (
          <BankCard
            key={bank.id}
            bank={bank}
            due={isUpdateDue(bank, profile.bankReminder, today)}
            today={today}
            onEdit={() => setOverlay({ kind: 'form', bankId: bank.id })}
            onUpdate={() => setOverlay({ kind: 'update', bankId: bank.id })}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => setOverlay({ kind: 'form', bankId: null })}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            height: 46,
            paddingHorizontal: 18,
            borderRadius: 999,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.neutral[500],
            backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          })}
        >
          <Icon name="plus" size={16} color={colors.text} />
          <Txt font="heading" size={15}>
            {t('banks.add')}
          </Txt>
        </Pressable>
        <View style={{ gap: 8, paddingTop: 8 }}>
          <View style={{ paddingHorizontal: 2 }}>
            <SectionLabel>{t('banks.remindUpdate')}</SectionLabel>
          </View>
          <Segmented
            value={profile.bankReminder}
            onChange={(bankReminder) => {
              repo.updateProfile({ bankReminder });
              void ensureNotificationPermission();
            }}
            options={[
              { value: 'weekly', label: t('banks.everyWeek') },
              { value: 'monthly', label: t('banks.everyMonth') },
            ]}
          />
        </View>
      </ScrollView>

      {overlay?.kind === 'update' && <UpdateBalanceSheet bankId={overlay.bankId} onClose={close} />}
      {overlay?.kind === 'form' && <BankFormSheet bankId={overlay.bankId} onClose={close} />}
    </Screen>
  );
}

function BankCard({
  bank,
  due,
  today,
  onEdit,
  onUpdate,
}: {
  bank: BankAccount;
  due: boolean;
  today: string;
  onEdit: () => void;
  onUpdate: () => void;
}) {
  const colors = useColors();
  const { t, lang } = useI18n();
  const last = lastCheck(bank);
  const days = last ? daysBetween(last.date, today) : null;
  const updated =
    !last || days === null
      ? t('banks.notUpdated')
      : days <= 0
        ? t('banks.updatedToday')
        : days === 1
          ? t('banks.updatedYesterday')
          : t('banks.updatedOn', { date: formatDate(last.date, lang), days });
  return (
    <View
      style={{
        borderRadius: 32,
        backgroundColor: colors.neutral[100],
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.6)',
        boxShadow: shadows.sm,
        paddingTop: 18,
        paddingRight: 16,
        paddingBottom: 16,
        paddingLeft: 20,
        gap: 10,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('banks.edit', { name: bank.name })}
        onPress={onEdit}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.accent2Ramp[200],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="landmark" size={18} color={colors.accent2Ramp[800]} />
        </View>
        <Txt font="bold" size={16} style={{ flex: 1 }} numberOfLines={1}>
          {bank.name}
        </Txt>
        <View
          style={{
            paddingVertical: 3,
            paddingHorizontal: 10,
            borderRadius: 999,
            backgroundColor: colors.surface,
          }}
        >
          <Txt font="bold" size={12} style={{ letterSpacing: 0.5 }}>
            {bank.currency}
          </Txt>
        </View>
      </Pressable>
      <Txt font="heading" size={34} lineHeight={36} tabular numberOfLines={1} adjustsFontSizeToFit>
        {last ? formatMoney(bank.currency, last.balanceMinor) : '—'}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt size={12.5} color={colors.neutral[700]}>
            {updated}
          </Txt>
          {last && last.gapMinor > 0 && (
            <Txt font="bold" size={12.5} color={colors.accentRamp[700]}>
              {t('banks.gap', { amount: formatMoney(bank.currency, last.gapMinor) })}
            </Txt>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('banks.update')} ${bank.name}`}
          onPress={onUpdate}
          style={({ pressed }) => ({
            height: 44,
            paddingHorizontal: 18,
            borderRadius: 999,
            justifyContent: 'center',
            backgroundColor: due
              ? pressed
                ? colors.accentRamp[700]
                : colors.accent
              : pressed
                ? colors.neutral[300]
                : colors.surface,
          })}
        >
          <Txt font="heading" size={15} color={due ? colors.bg : colors.text}>
            {t('banks.update')}
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}
