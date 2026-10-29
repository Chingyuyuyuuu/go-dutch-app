import { useEffect } from 'react';

import { useAppData } from '@/data/AppDataProvider';
import { takePendingJoin } from '@/data/share';
import i18n from '@/i18n';
import { useToast } from '@/ui/Toast';

import { joinResultMessage } from './SharePageScreen';

/** Sends a join request started on a share page while signed out, once the account is ready. */
export function useSendPendingJoin() {
  const { repo } = useAppData();
  const toast = useToast();
  useEffect(() => {
    if (!repo || repo.kind !== 'cloud') return;
    void takePendingJoin().then(async (join) => {
      if (!join) return;
      const result = await repo.requestJoin(join.token, join.memberId);
      toast(joinResultMessage(result, join.ownerName, (key, options) => i18n.t(key, options)));
    });
  }, [repo, toast]);
}
