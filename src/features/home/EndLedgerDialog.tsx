import { View } from 'react-native';

import { useAppData, useRepo } from '@/data/AppDataProvider';
import { useI18n } from '@/i18n';
import { spentShare } from '@/lib/balances';
import { todayLocal } from '@/lib/date';
import type { Entry, Ledger, LedgerMember } from '@/lib/domain';
import { lastPersonalLedgerId, routePersonalEntry } from '@/lib/ledgers';
import { formatMoney } from '@/lib/money';
import { PillButton } from '@/ui/Buttons';
import { Dialog } from '@/ui/Overlay';
import { useColors } from '@/ui/theme/ThemeProvider';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

/**
 * Screen 12: end a shared ledger. When my share is handled "at the end", offer
 * to add it to my personal ledger with the same settlement currency.
 * Ended ledgers are read-only, move to the end of the tabs, and can be reopened.
 */
export function EndLedgerDialog({
  ledger,
  me,
  entries,
  onClose,
}: {
  ledger: Ledger;
  me: LedgerMember;
  entries: Entry[];
  onClose: () => void;
}) {
  const colors = useColors();
  const { t } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const { ledgers, prefs, profile } = useAppData();
  const myShare = spentShare(entries, me.id);
  const handling = prefs[ledger.id]?.shareHandling ?? 'ask';
  // Same order as the server's personal_ledger_for: my chosen ledger, the last used, then the first.
  const route = routePersonalEntry({
    currency: ledger.currency,
    ledgers,
    fixedLedgerId: prefs[ledger.id]?.shareTargetLedgerId,
    lastLedgerId: lastPersonalLedgerId(profile, ledgers),
  });
  const targetId = route.kind === 'auto' ? route.ledgerId : route.kind === 'choose' ? route.defaultId : null;
  const target = ledgers.find((l) => l.id === targetId);
  const offerAdd = handling === 'ask' && myShare > 0;
  const amount = formatMoney(ledger.currency, myShare);

  const end = (add: boolean) => {
    if (add && target) {
      repo.addEntry(target.id, {
        type: 'expense',
        amountMinor: myShare,
        categoryCode: 'other',
        date: todayLocal(),
        note: t('end.myShare', { name: ledger.name }),
        sourceLedgerId: ledger.id,
      });
    }
    repo.updateLedger(ledger.id, { status: 'ended' });
    toast(
      add && target
        ? t('end.endedAdded', { name: ledger.name, amount })
        : t('end.ended', { name: ledger.name }),
    );
    onClose();
  };

  return (
    <Dialog onClose={onClose}>
      <Txt font="heading" size={24}>
        {t('end.title', { name: ledger.name })}
      </Txt>
      {offerAdd && (
        <Txt size={14} color={colors.neutral[800]}>
          {target
            ? t('end.bodyAsk', { amount, ledger: `${target.name} · ${target.currency}` })
            : t('end.bodyNoTarget', { amount, cur: ledger.currency })}
        </Txt>
      )}
      <View style={{ gap: 8, marginTop: 4 }}>
        {offerAdd && target ? (
          <>
            <PillButton label={t('end.addAndEnd')} height={52} fontSize={17} onPress={() => end(true)} />
            <PillButton
              label={t('end.endOnly')}
              variant="outline"
              height={52}
              fontSize={17}
              onPress={() => end(false)}
            />
          </>
        ) : (
          <PillButton label={t('end.end')} height={52} fontSize={17} onPress={() => end(false)} />
        )}
        <PillButton label={t('common.cancel')} variant="ghost" height={44} onPress={onClose} />
      </View>
      <Txt size={12} color={colors.neutral[700]}>
        {t('end.note')}
      </Txt>
    </Dialog>
  );
}
