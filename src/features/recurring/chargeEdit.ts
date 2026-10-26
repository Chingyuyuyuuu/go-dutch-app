import { create } from 'zustand';

/**
 * The auto-recorded charge to show in the charge sheet (design 19): an entry
 * tapped on home, or a charge opened from its notification (recurring + seq).
 */
export type ChargeTarget = {
  ledgerId: string;
  entryId?: string;
  recurringId?: string;
  seq?: number;
  /** "Delete" pressed on the notification: delete as soon as the entry is found. */
  autoDelete?: boolean;
};

export const useChargeEdit = create<{
  target: ChargeTarget | null;
  open: (target: ChargeTarget) => void;
  close: () => void;
}>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}));
