import { useMemo } from 'react';

import { ALL_TIME, useLedgerEntries } from '@/data/AppDataProvider';
import { categoryGrid, DEFAULT_CATEGORY_SET } from '@/lib/categories';
import { ledgerCategorySet, type Ledger } from '@/lib/domain';

/**
 * The category grid for a ledger (spec §5.5): its category set, then the other
 * sets' categories already used in it (in the order first used), and the rest
 * under "More categories".
 */
export function useCategoryGrid(ledger: Ledger | undefined, kind: 'expense' | 'income') {
  const entries = useLedgerEntries(ledger?.id, ALL_TIME);
  const set = ledger ? ledgerCategorySet(ledger) : DEFAULT_CATEGORY_SET;
  return useMemo(() => {
    const used = [...entries].sort((a, b) => a.createdAt - b.createdAt).map((e) => e.categoryCode);
    return categoryGrid(set, kind, used);
  }, [entries, set, kind]);
}
