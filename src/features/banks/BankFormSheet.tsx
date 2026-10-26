import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useAppData, useRepo } from '@/data/AppDataProvider';
import { CurrencyPicker } from '@/features/entry/CurrencyPicker';
import { useI18n } from '@/i18n';
import { currencyName } from '@/lib/currency';
import { personalLedgersFor } from '@/lib/ledgers';
import { PillButton } from '@/ui/Buttons';
import { Icon } from '@/ui/Icon';
import { Dialog, Sheet } from '@/ui/Overlay';
import { fonts } from '@/ui/theme/fonts';
import { useColors } from '@/ui/theme/ThemeProvider';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

/** Add or edit a bank account: a name, a currency and the personal ledgers it pays for. */
export function BankFormSheet({ bankId, onClose }: { bankId: string | null; onClose: () => void }) {
  const colors = useColors();
  const { t, lang } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const { banks, orderedLedgers, profile } = useAppData();
  const editing = banks.find((b) => b.id === bankId);
  const [name, setName] = useState(editing?.name ?? '');
  const [currency, setCurrency] = useState(editing?.currency ?? profile.starredCurrencies[0] ?? 'AUD');
  const choices = personalLedgersFor(currency, orderedLedgers);
  const [linked, setLinked] = useState<string[]>(
    editing?.linkedLedgerIds ?? (choices[0] ? [choices[0].id] : []),
  );
  const [step, setStep] = useState<'form' | 'currency' | 'delete'>('form');

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return toast(t('banks.nameRequired'));
    const linkedLedgerIds = linked.filter((id) => choices.some((l) => l.id === id));
    if (editing) {
      repo.updateBank(editing.id, { name: trimmed, linkedLedgerIds });
      toast(t('banks.updated', { name: trimmed }));
    } else {
      repo.addBank({ name: trimmed, currency, linkedLedgerIds });
      toast(t('banks.added', { name: trimmed }));
    }
    onClose();
  };

  if (step === 'currency') {
    return (
      <CurrencyPicker
        selected={currency}
        starred={profile.starredCurrencies}
        onToggleStar={(code) => {
          const s = profile.starredCurrencies;
          repo.updateProfile({
            starredCurrencies: s.includes(code) ? s.filter((c) => c !== code) : [...s, code],
          });
        }}
        onSelect={(code) => {
          setCurrency(code);
          setLinked(
            personalLedgersFor(code, orderedLedgers)
              .slice(0, 1)
              .map((l) => l.id),
          );
          setStep('form');
        }}
        onClose={() => setStep('form')}
      />
    );
  }

  if (step === 'delete' && editing) {
    return (
      <Dialog onClose={() => setStep('form')}>
        <Txt font="heading" size={24}>
          {t('banks.deleteTitle', { name: editing.name })}
        </Txt>
        <Txt size={14} color={colors.neutral[800]}>
          {t('banks.deleteBody')}
        </Txt>
        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          <PillButton label={t('common.cancel')} variant="outline" onPress={() => setStep('form')} />
          <PillButton
            label={t('common.delete')}
            variant="danger"
            onPress={() => {
              repo.deleteBank(editing.id);
              toast(t('banks.deleted', { name: editing.name }));
              onClose();
            }}
          />
        </View>
      </Dialog>
    );
  }

  return (
    <Sheet onClose={onClose} style={{ paddingHorizontal: 22, gap: 14 }}>
      <Txt font="heading" size={24} style={{ paddingTop: 8 }}>
        {editing ? t('banks.formEdit') : t('banks.formNew')}
      </Txt>
      <View style={{ gap: 6 }}>
        <Txt font="semibold" size={13} color={colors.neutral[700]}>
          {t('banks.name')}
        </Txt>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('banks.namePlaceholder')}
          placeholderTextColor={colors.neutral[600]}
          accessibilityLabel={t('banks.name')}
          maxLength={40}
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
          {t('banks.currency')}
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('entry.currencyPicker', { cur: currency })}
          disabled={!!editing}
          onPress={() => setStep('currency')}
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
            {currency}
          </Txt>
          <Txt size={15} color={colors.neutral[700]} style={{ flex: 1 }} numberOfLines={1}>
            {currencyName(currency, lang)}
          </Txt>
          {!editing && <Icon name="chevron-down" size={16} color={colors.text} />}
        </Pressable>
      </View>
      <View style={{ gap: 8 }}>
        <Txt font="semibold" size={13} color={colors.neutral[700]}>
          {t('banks.linked')}
        </Txt>
        {choices.length === 0 ? (
          <Txt size={13} color={colors.neutral[700]}>
            {t('banks.noLedgers', { cur: currency })}
          </Txt>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {choices.map((l) => {
              const on = linked.includes(l.id);
              return (
                <Pressable
                  key={l.id}
                  accessibilityRole="checkbox"
                  aria-checked={on}
                  onPress={() => setLinked((ids) => (on ? ids.filter((id) => id !== l.id) : [...ids, l.id]))}
                  style={{
                    height: 44,
                    paddingLeft: 12,
                    paddingRight: 16,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: on ? colors.accent : colors.divider,
                    backgroundColor: on ? colors.accentRamp[100] : 'transparent',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Icon name={on ? 'check' : 'book-open'} size={15} color={colors.accentRamp[700]} />
                  <Txt font="semibold" size={14}>
                    {l.name}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        )}
        <Txt size={12} color={colors.neutral[700]}>
          {t('banks.linkedHint')}
        </Txt>
      </View>
      <PillButton label={t('common.save')} height={58} fontSize={20} onPress={save} />
      {editing && (
        <PillButton
          label={t('banks.delete')}
          variant="ghost"
          icon="trash-2"
          onPress={() => setStep('delete')}
        />
      )}
    </Sheet>
  );
}
