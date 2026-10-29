import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { useAppData } from '@/data/AppDataProvider';
import { useI18n } from '@/i18n';
import { parseLocalDate, todayLocal } from '@/lib/date';
import { formatAmountNumber, formatMoney } from '@/lib/money';
import { totalCharges } from '@/lib/recurring';
import { planReminders, type Reminder } from '@/lib/reminders';
import { useChargeEdit } from '@/features/recurring/chargeEdit';
import { recurringTitle } from '@/features/recurring/describe';

import { getNotificationStatus } from './permission';

const CHANNEL = 'reminders';
const CHARGE_CATEGORY = 'charge';
const EDIT = 'edit-amount';
const DELETE = 'delete-charge';

type ReminderData = { kind: Reminder['kind']; recurringId?: string; seq?: number; bankId?: string };

// Show reminders as a banner even when the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Keeps the phone's scheduled notifications in step with recurring payments and
 * bank accounts (design 18): "charged today" with Edit amount / Delete, the
 * day-before reminder, and "time to update" for banks. Rescheduled whenever
 * they change; the server records the charges themselves. Phones only (useReminders.ts is the web stub).
 */
export function useReminders() {
  const { t, lang, locale } = useI18n();
  const { repo, recurring, banks, ledgers, profile } = useAppData();
  const lastPlan = useRef('');

  // Notification buttons and the Android channel, in the current language.
  useEffect(() => {
    void (async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync(CHANNEL, {
            name: t('notif.channel'),
            importance: AndroidImportance.DEFAULT,
          });
        }
        await Notifications.setNotificationCategoryAsync(CHARGE_CATEGORY, [
          { identifier: EDIT, buttonTitle: t('notif.editAmount'), options: { opensAppToForeground: true } },
          {
            identifier: DELETE,
            buttonTitle: t('notif.delete'),
            options: { opensAppToForeground: true, isDestructive: true },
          },
        ]);
      } catch (e) {
        console.warn('[notifications] setup failed', e);
      }
    })();
  }, [t, locale]);

  // Schedule the plan whenever what it depends on changes (and when the app comes back).
  useEffect(() => {
    if (!repo) return;
    let cancelled = false;
    const schedule = async () => {
      if ((await getNotificationStatus()) !== 'granted' || cancelled) return;
      const now = new Date();
      const plan = planReminders({
        recurring,
        ledgers,
        banks,
        bankReminder: profile.bankReminder,
        uid: repo.uid,
        today: todayLocal(now),
        hourNow: now.getHours(),
      });
      const requests = plan.map((r) => toRequest(r));
      const signature = JSON.stringify(requests);
      if (signature === lastPlan.current) return;
      lastPlan.current = signature;
      await Notifications.cancelAllScheduledNotificationsAsync();
      for (const request of requests) {
        if (cancelled) return;
        await Notifications.scheduleNotificationAsync(request);
      }
    };
    const toRequest = (r: Reminder): Notifications.NotificationRequestInput => {
      const { year, month, day } = parseLocalDate(r.date);
      const trigger: Notifications.DateTriggerInput = {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(year, month - 1, day, r.hour, 0, 0),
        channelId: CHANNEL,
      };
      if (r.kind === 'bank') {
        const bank = banks.find((b) => b.id === r.bankId);
        return {
          identifier: r.key,
          content: {
            title: t('notif.bankTitle', { name: bank?.name ?? '' }),
            body: t('notif.bankBody'),
            data: { kind: r.kind, bankId: r.bankId } satisfies ReminderData,
          },
          trigger,
        };
      }
      const rec = recurring.find((x) => x.id === r.recurringId);
      const ledger = ledgers.find((l) => l.id === rec?.ledgerId);
      const currency = ledger?.currency ?? 'AUD';
      const name = rec ? recurringTitle(rec, t) : '';
      const data: ReminderData = { kind: r.kind, recurringId: r.recurringId, seq: r.seq };
      if (r.kind === 'charged') {
        return {
          identifier: r.key,
          content: {
            title: t('notif.chargedTitle', { name }),
            body: t('notif.chargedBody', {
              amount: formatAmountNumber(currency, r.amountMinor),
              cur: currency,
              ledger: ledger?.name ?? '',
              category: rec ? t(`category.${rec.categoryCode}`) : '',
            }),
            categoryIdentifier: CHARGE_CATEGORY,
            data,
          },
          trigger,
        };
      }
      const amount = formatMoney(currency, r.amountMinor);
      return {
        identifier: r.key,
        content: {
          title: t('notif.dueTitle', { name }),
          body:
            rec?.kind === 'instalment'
              ? t('notif.dueInstalmentBody', { n: r.seq + 1, total: totalCharges(rec) ?? 0, amount })
              : t('notif.dueBody', { amount }),
          data,
        },
        trigger,
      };
    };
    const timer = setTimeout(() => {
      schedule().catch((e) => console.warn('[notifications] scheduling failed', e));
    }, 800);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') schedule().catch(() => {});
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      sub.remove();
    };
  }, [repo, recurring, banks, ledgers, profile.bankReminder, t, lang]);

  // Tapping a notification (or one of its buttons) opens the matching screen.
  const recurringRef = useRef(recurring);
  useEffect(() => {
    recurringRef.current = recurring;
  }, [recurring]);
  const hasRepo = !!repo;
  useEffect(() => {
    if (!hasRepo) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      Notifications.clearLastNotificationResponse();
      const data = response.notification.request.content.data as Partial<ReminderData> | undefined;
      if (data?.kind === 'bank') {
        router.navigate({ pathname: '/banks', params: data.bankId ? { update: data.bankId } : {} });
      } else if (data?.kind === 'dayBefore') {
        router.navigate('/recurring');
      } else if (data?.kind === 'charged' && data.recurringId && typeof data.seq === 'number') {
        const rec = recurringRef.current.find((r) => r.id === data.recurringId);
        if (!rec) return;
        router.navigate('/');
        useChargeEdit.getState().open({
          ledgerId: rec.ledgerId,
          recurringId: rec.id,
          seq: data.seq,
          autoDelete: response.actionIdentifier === DELETE,
        });
      }
    };
    // Opened from a notification while the app was closed, then any while it runs.
    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [hasRepo]);
}
