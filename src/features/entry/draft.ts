import { create } from 'zustand';

import type { CategoryCode } from '@/lib/categories';
import { todayLocal, type LocalDate } from '@/lib/date';
import type { Entry } from '@/lib/domain';

/** State of the "Add entry" flow, shared by the amount and category screens. */
type EntryDraft = {
  input: string;
  currency: string;
  /** Personal ledger whose tab "Add entry" was pressed on. Routing skips the question for it. */
  fixedLedgerId: string | null;
  /** Shared ledger tab the flow started from (only changes the hint for now). */
  sourceSharedLedgerId: string | null;
  type: 'expense' | 'income';
  /** Type chosen on a widget shortcut: highlighted on the amount screen. */
  presetType: 'expense' | 'income' | 'split' | null;
  ledgerId: string | null;
  /** Shared ledger chosen for a split. */
  sharedLedgerId: string | null;
  categoryCode: CategoryCode | null;
  note: string;
  date: LocalDate;
  start: (params: {
    currency: string;
    fixedLedgerId: string | null;
    sourceSharedLedgerId: string | null;
    presetType?: EntryDraft['presetType'];
  }) => void;
  set: (patch: Partial<Omit<EntryDraft, 'start' | 'set'>>) => void;
};

export const useEntryDraft = create<EntryDraft>((set) => ({
  input: '',
  currency: 'AUD',
  fixedLedgerId: null,
  sourceSharedLedgerId: null,
  type: 'expense',
  presetType: null,
  ledgerId: null,
  sharedLedgerId: null,
  categoryCode: null,
  note: '',
  date: todayLocal(),
  start: (params) =>
    set({
      presetType: null,
      ...params,
      input: '',
      type: 'expense',
      ledgerId: null,
      sharedLedgerId: null,
      categoryCode: null,
      note: '',
      date: todayLocal(),
    }),
  set: (patch) => set(patch),
}));

/** Which tab the home screen shows. Saving an entry switches to that entry's ledger. */
export const useHomeTab = create<{ ledgerId: string | null; select: (id: string) => void }>((set) => ({
  ledgerId: null,
  select: (ledgerId) => set({ ledgerId }),
}));

/** The entry opened from the home list, read by the edit screen. */
export const useEditingEntry = create<{ entry: Entry | null; open: (entry: Entry) => void }>((set) => ({
  entry: null,
  open: (entry) => set({ entry }),
}));
