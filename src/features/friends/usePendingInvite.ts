import { useEffect } from 'react';

import { useAppData } from '@/data/AppDataProvider';
import i18n from '@/i18n';
import { useToast } from '@/ui/Toast';

import { takePendingInvite } from './invites';

/** Accepts an invite that was opened while signed out, once the account is ready. */
export function useAcceptPendingInvite() {
  const { repo } = useAppData();
  const toast = useToast();
  useEffect(() => {
    if (!repo || repo.kind !== 'cloud') return;
    void takePendingInvite().then(async (code) => {
      if (!code) return;
      const result = await repo.acceptInvite(code);
      const key = result === 'ok' ? 'friends.joined' : `friends.${result}`;
      toast(i18n.t(key));
    });
  }, [repo, toast]);
}
