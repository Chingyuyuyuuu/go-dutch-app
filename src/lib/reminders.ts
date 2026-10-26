import { nextUpdateDue } from './banks';
import { addDays, type LocalDate } from './date';
import type { BankAccount, BankReminder, Ledger, Recurring } from './domain';
import type { MinorUnits } from './money';
import { chargeAmount, chargeDate, totalCharges } from './recurring';

/** Phones keep a limited number of scheduled notifications (iOS: 64), so plan only the nearest. */
export const MAX_REMINDERS = 48;
const HORIZON_DAYS = 45;

export type Reminder =
  | {
      kind: 'charged';
      key: string;
      date: LocalDate;
      hour: number;
      recurringId: string;
      seq: number;
      amountMinor: MinorUnits;
    }
  | {
      kind: 'dayBefore';
      key: string;
      date: LocalDate;
      hour: number;
      recurringId: string;
      seq: number;
      amountMinor: MinorUnits;
    }
  | { kind: 'bank'; key: string; date: LocalDate; hour: number; bankId: string };

/** "Netflix charged today" at 9:00, "due tomorrow" at 8:00 the day before, bank reminders at 10:00. */
export const REMINDER_HOURS = { charged: 9, dayBefore: 8, bank: 10 } as const;

/**
 * Local notifications to schedule from `today` on: one per upcoming charge of my
 * recurring payments in personal ledgers ("charged today", with Edit / Delete),
 * a day-before reminder when the payment asks for one, and a reminder when a
 * bank balance is due. Today's are included only if their time is still ahead.
 */
export function planReminders(params: {
  recurring: Recurring[];
  ledgers: Ledger[];
  banks: BankAccount[];
  bankReminder: BankReminder;
  uid: string;
  today: LocalDate;
  /** Hour of day now, so reminders earlier today are skipped. */
  hourNow: number;
}): Reminder[] {
  const { recurring, ledgers, banks, bankReminder, uid, today, hourNow } = params;
  const until = addDays(today, HORIZON_DAYS);
  const upcoming = (date: LocalDate, hour: number) => date > today || (date === today && hour > hourNow);
  const out: Reminder[] = [];

  for (const r of recurring) {
    if (r.ownerUid !== uid) continue;
    const ledger = ledgers.find((l) => l.id === r.ledgerId);
    if (!ledger || ledger.status !== 'active') continue;
    const total = totalCharges(r);
    for (let seq = r.paidCount; total === null || seq < total; seq++) {
      const date = chargeDate(r.startDate, r.frequency, seq);
      if (date > until) break;
      const amountMinor = chargeAmount(r, seq);
      const base = { recurringId: r.id, seq, amountMinor };
      // Splits notify the members from the shared ledger; only personal charges get "charged today".
      if (r.kind !== 'split' && upcoming(date, REMINDER_HOURS.charged)) {
        out.push({
          kind: 'charged',
          key: `charged:${r.id}:${seq}`,
          date,
          hour: REMINDER_HOURS.charged,
          ...base,
        });
      }
      const before = addDays(date, -1);
      if (r.remindDayBefore && upcoming(before, REMINDER_HOURS.dayBefore)) {
        out.push({
          kind: 'dayBefore',
          key: `dayBefore:${r.id}:${seq}`,
          date: before,
          hour: REMINDER_HOURS.dayBefore,
          ...base,
        });
      }
    }
  }

  for (const bank of banks) {
    // Never updated: no reminder until the first balance is in. Already overdue: reminded once already.
    const date = nextUpdateDue(bank, bankReminder);
    if (date && upcoming(date, REMINDER_HOURS.bank) && date <= until) {
      out.push({
        kind: 'bank',
        key: `bank:${bank.id}:${date}`,
        date,
        hour: REMINDER_HOURS.bank,
        bankId: bank.id,
      });
    }
  }

  return out
    .sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.hour - b.hour || (a.key < b.key ? -1 : 1),
    )
    .slice(0, MAX_REMINDERS);
}
