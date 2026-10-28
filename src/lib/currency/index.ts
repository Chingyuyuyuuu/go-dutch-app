import { CURRENCIES } from './currencies.data';
import type { CurrencyInfo } from './types';

export type { CurrencyInfo } from './types';

export const ALL_CURRENCY_CODES: readonly string[] = Object.keys(CURRENCIES).sort();

export function getCurrency(code: string): CurrencyInfo {
  const info = CURRENCIES[code];
  if (!info) throw new Error(`Unknown currency code: ${code}`);
  return info;
}

/**
 * Currencies people use without their ISO minor units: Taiwan prices are whole
 * dollars. Only input and display follow this; amounts are still stored and
 * calculated in ISO minor units (TWD in cents).
 */
const PRACTICAL_DECIMALS: Readonly<Record<string, number>> = { TWD: 0 };

/** Decimals shown and typed for a currency: 0 for TWD and JPY, 2 for AUD. */
export function displayDecimals(code: string): number {
  return PRACTICAL_DECIMALS[code] ?? getCurrency(code).minorUnits;
}

export function isCurrencyCode(code: string): boolean {
  return code in CURRENCIES;
}

export function currencyName(code: string, lang: 'en' | 'zh'): string {
  const info = getCurrency(code);
  return lang === 'zh' ? info.nameZh : info.nameEn;
}

/** Matches the code, the English name or the Chinese name (case-insensitive). */
export function matchesCurrency(code: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const info = getCurrency(code);
  return (
    info.code.toLowerCase().includes(q) ||
    info.nameEn.toLowerCase().includes(q) ||
    info.nameZh.includes(query.trim())
  );
}
