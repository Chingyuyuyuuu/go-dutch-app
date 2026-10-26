import { CURRENCIES } from './currencies.data';
import type { CurrencyInfo } from './types';

export type { CurrencyInfo } from './types';

export const ALL_CURRENCY_CODES: readonly string[] = Object.keys(CURRENCIES).sort();

export function getCurrency(code: string): CurrencyInfo {
  const info = CURRENCIES[code];
  if (!info) throw new Error(`Unknown currency code: ${code}`);
  return info;
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
