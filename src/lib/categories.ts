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
  salary: 'briefcase',
  bonus: 'sparkles',
  taxrefund: 'receipt-text',
  super: 'landmark',
  refund: 'rotate-ccw',
  interest: 'piggy-bank',
  sold: 'tag',
  other_in: 'ellipsis',
};

export function isIncomeCategory(code: CategoryCode): code is IncomeCategory {
  return (INCOME_CATEGORIES as readonly string[]).includes(code);
}

export function isCategoryCode(code: string): code is CategoryCode {
  return code in CATEGORY_ICONS;
}
