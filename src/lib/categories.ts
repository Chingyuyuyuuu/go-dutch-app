/** Built-in categories. Entries store the code; labels come from i18n (`category.<code>`). */
export const EXPENSE_CATEGORIES = [
  'dining',
  'groceries',
  'coffee',
  'transport',
  'rent',
  'opal',
  'bond',
  'bills',
  'subs',
  'shopping',
  'health',
  'fun',
  'travel',
  'housing',
  'gifts',
  'other',
  // Japan trip set (Phase 6)
  'konbini',
  'drugstore',
  'souvenirs',
  'ic_card',
  'rail_pass',
  'tickets',
  'tours',
  'flights',
  'esim',
] as const;

export const INCOME_CATEGORIES = [
  'salary',
  'bonus',
  'taxrefund',
  'super',
  'refund',
  'interest',
  'sold',
  'other_in',
  // Japan trip set (Phase 6): tax-free refund, not the Australian tax return
  'taxfree_refund',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];
export type CategoryCode = ExpenseCategory | IncomeCategory;

/** Lucide icon names, matching the design handoff. */
export const CATEGORY_ICONS: Record<CategoryCode, string> = {
  dining: 'utensils',
  groceries: 'shopping-cart',
  coffee: 'coffee',
  transport: 'bus',
  rent: 'house',
  opal: 'tram-front',
  bond: 'key-round',
  bills: 'receipt',
  subs: 'repeat',
  shopping: 'shopping-bag',
  health: 'heart-pulse',
  fun: 'film',
  travel: 'plane',
  housing: 'bed-double',
  gifts: 'gift',
  other: 'ellipsis',
  konbini: 'store',
  drugstore: 'pill',
  souvenirs: 'package',
  ic_card: 'credit-card',
  rail_pass: 'train-front',
  tickets: 'ticket',
  tours: 'compass',
  flights: 'plane-takeoff',
  esim: 'wifi',
  salary: 'briefcase',
  bonus: 'sparkles',
  taxrefund: 'receipt-text',
  super: 'landmark',
  refund: 'rotate-ccw',
  interest: 'piggy-bank',
  sold: 'tag',
  other_in: 'ellipsis',
  taxfree_refund: 'receipt-text',
};

export function isIncomeCategory(code: CategoryCode): code is IncomeCategory {
  return (INCOME_CATEGORIES as readonly string[]).includes(code);
}

export function isCategoryCode(code: string): code is CategoryCode {
  return code in CATEGORY_ICONS;
}

// ---------------------------------------------------------------------------
// Category sets. A ledger picks one set; it only decides which categories the
// grid shows by default. Codes are shared, so switching sets never touches entries.

export const CATEGORY_SETS = ['japan_travel', 'au_life'] as const;
export type CategorySet = (typeof CATEGORY_SETS)[number];

/** New ledgers use the Japan trip set; ledgers from before Phase 6 use au_life. */
export const DEFAULT_CATEGORY_SET: CategorySet = 'japan_travel';

export const CATEGORY_SET_CODES: Record<
  CategorySet,
  { expense: readonly ExpenseCategory[]; income: readonly IncomeCategory[] }
> = {
  japan_travel: {
    expense: [
      'dining',
      'coffee',
      'konbini',
      'drugstore',
      'souvenirs',
      'shopping',
      'transport',
      'ic_card',
      'rail_pass',
      'tickets',
      'tours',
      'housing',
      'flights',
      'esim',
      'fun',
      'other',
    ],
    income: ['taxfree_refund', 'refund', 'sold', 'other_in'],
  },
  au_life: {
    expense: [
      'dining',
      'groceries',
      'coffee',
      'transport',
      'rent',
      'opal',
      'bond',
      'bills',
      'subs',
      'shopping',
      'health',
      'fun',
      'travel',
      'housing',
      'gifts',
      'other',
    ],
    income: ['salary', 'bonus', 'taxrefund', 'super', 'refund', 'interest', 'sold', 'other_in'],
  },
};

export function isCategorySet(value: string): value is CategorySet {
  return (CATEGORY_SETS as readonly string[]).includes(value);
}

/**
 * The category grid for a ledger. `grid` is the ledger's set followed by
 * categories from other sets already used in this ledger (in the order given),
 * so they stay without opening "More categories". `more` is everything else.
 */
export function categoryGrid(
  set: CategorySet,
  kind: 'expense' | 'income',
  usedCodes: readonly CategoryCode[] = [],
): { grid: CategoryCode[]; more: CategoryCode[] } {
  const all: readonly CategoryCode[] = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const grid: CategoryCode[] = [...CATEGORY_SET_CODES[set][kind]];
  for (const code of usedCodes) {
    if (all.includes(code) && !grid.includes(code)) grid.push(code);
  }
  return { grid, more: all.filter((code) => !grid.includes(code)) };
}
