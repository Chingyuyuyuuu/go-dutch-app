import type { TFunction } from 'i18next';

import type { UiLang } from '@/lib/date';
import { formatDayMonth } from '@/lib/date';
import type { Ledger, Recurring } from '@/lib/domain';
import { formatMoney } from '@/lib/money';
import {
  AFTERPAY_PAYMENTS,
  chargeAmount,
  isFinished,
  myChargeAmount,
  nextCharge,
  totalCharges,
} from '@/lib/recurring';

/** "Afterpay · Running shoes" for a 4-payment fortnightly plan, otherwise the name. */
export function recurringTitle(r: Recurring, t: TFunction): string {
  const afterpay =
    r.kind === 'instalment' && r.frequency === 'fortnightly' && r.instalments === AFTERPAY_PAYMENTS;
  return afterpay ? t('recurring.afterpayName', { name: r.name }) : r.name;
}

/** Row subtitle on the recurring list (design 16). */
export function recurringSubtitle(
  r: Recurring,
  ledger: Ledger | undefined,
  uid: string,
  t: TFunction,
  lang: UiLang,
): string {
  const freq = t(`recurring.${r.frequency}`);
  const next = nextCharge(r);
  const ledgerName = ledger?.name ?? '';
  if (r.kind === 'instalment') {
    const total = totalCharges(r) ?? AFTERPAY_PAYMENTS;
    if (!next || isFinished(r)) return t('recurring.subInstalmentDone', { total });
    return t('recurring.subInstalment', { paid: r.paidCount, total, date: formatDayMonth(next.date, lang) });
  }
  if (r.kind === 'split') {
    const currency = ledger?.currency ?? 'AUD';
    return t('recurring.subSplit', {
      freq,
      ledger: ledgerName,
      amount: formatMoney(currency, myChargeAmount(r, ledger, uid)),
    });
  }
  return t('recurring.subRegular', {
    freq,
    date: next ? formatDayMonth(next.date, lang) : '',
    ledger: ledgerName,
  });
}

/** The amount shown on the right: the next charge (or the first, for a finished plan). */
export function recurringAmount(r: Recurring): number {
  return nextCharge(r)?.amountMinor ?? chargeAmount(r, 0);
}
