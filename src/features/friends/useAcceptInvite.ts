import { useCallback } from 'react';

import { useRepo } from '@/data/AppDataProvider';
import { useI18n } from '@/i18n';
import { useToast } from '@/ui/Toast';

/** Accepts an invite code, says how it went (toast), and returns the result. */
export function useAcceptInvite() {
  const repo = useRepo();
  const toast = useToast();
  const { t } = useI18n();
  return useCallback(
    async (code: string) => {
      const result = await repo.acceptInvite(code.trim().toLowerCase());
      const message = {
        ok: t('friends.joined'),
        invalid: t('friends.invalid'),
        self: t('friends.self'),
        used: t('friends.used'),
        offline: t('friends.offline'),
        demo: t('friends.demo'),
      }[result];
      toast(message);
      return { result, message };
    },
    [repo, toast, t],
  );
}
