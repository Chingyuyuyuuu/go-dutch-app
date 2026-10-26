import { getCurrency } from './currency';

/** Amounts are always integer minor units (e.g. 1250 = 12.50 AUD). */
export type MinorUnits = number;

export const MINUS_SIGN = '−';

/** Groups the integer part with commas: 1234567 -> "1,234,567". Same in en-AU and zh-TW. */
export function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "1,234.50" for 123450 minor units with 2 decimals. Sign is not included. */
export function formatMinorNumber(minor: MinorUnits, decimals: number): string {
  if (!Number.isInteger(minor)) throw new Error(`Amount must be integer minor units, got ${minor}`);
  const abs = Math.abs(minor);
  const factor = 10 ** decimals;
  const whole = groupThousands(String(Math.floor(abs / factor)));
  if (decimals === 0) return whole;
  return `${whole}.${String(abs % factor).padStart(decimals, '0')}`;
}

export type FormatMoneyOptions = {
  /** Prefix shown before the symbol, e.g. "+" for income or MINUS_SIGN for negative balances. */
  sign?: string;
};

/** "$1,234.50", "¥2,500", "NT$300.00". The symbol follows the currency, not the UI language. */
export function formatMoney(currency: string, minor: MinorUnits, options: FormatMoneyOptions = {}): string {
  const { symbol, minorUnits } = getCurrency(currency);
  return `${options.sign ?? ''}${symbol}${formatMinorNumber(minor, minorUnits)}`;
}

/** Balance with a minus sign when negative ("−$12.00"). */
export function formatSignedMoney(currency: string, minor: MinorUnits): string {
  return formatMoney(currency, minor, { sign: minor < 0 ? MINUS_SIGN : '' });
}

// ---------------------------------------------------------------------------
// Keypad input. The raw input is a string like "1234.5" so we never go through
// floating point. It is converted to minor units with string arithmetic.

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'del';

export const MAX_INTEGER_DIGITS = 9;

export function pressKey(input: string, key: KeypadKey, decimals: number): string {
  if (key === 'del') return input.slice(0, -1);
  if (key === '.') {
    if (decimals === 0 || input.includes('.')) return input;
    return `${input || '0'}.`;
  }
  const [whole, fraction] = input.split('.');
  if (fraction !== undefined) {
    return fraction.length >= decimals ? input : input + key;
  }
  if (whole.length >= MAX_INTEGER_DIGITS) return input;
  return (whole === '0' ? '' : whole) + key;
}

export function inputToMinor(input: string, decimals: number): MinorUnits {
  if (!input) return 0;
  const [whole = '', fraction = ''] = input.split('.');
  const digits = (whole || '0') + fraction.padEnd(decimals, '0').slice(0, decimals);
  return Number.parseInt(digits, 10) || 0;
}

/** Inverse of inputToMinor, used when editing an existing entry. Drops trailing zero decimals. */
export function minorToInput(minor: MinorUnits, decimals: number): string {
  if (minor === 0) return '';
  const formatted = formatMinorNumber(minor, decimals).replace(/,/g, '');
  if (decimals === 0) return formatted;
  return formatted.replace(/\.?0+$/, '');
}

/** What the big amount label shows while typing: "1,234.5". Empty input shows "0". */
export function formatInput(input: string): string {
  const [whole, fraction] = (input || '0').split('.');
  const grouped = groupThousands(String(Number.parseInt(whole || '0', 10)));
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** Switching to a currency with fewer decimals drops the extra digits (JPY has none). */
export function fitInputToDecimals(input: string, decimals: number): string {
  const [whole, fraction] = input.split('.');
  if (fraction === undefined) return input;
  if (decimals === 0) return whole;
  return `${whole}.${fraction.slice(0, decimals)}`;
}

/**
 * Cleans text typed into an amount field (system keyboard, e.g. custom shares):
 * digits and one decimal point only, decimals capped at the currency's minor
 * units, at most MAX_INTEGER_DIGITS before the point. Commas are ignored.
 */
export function sanitizeAmountText(text: string, decimals: number): string {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const dot = cleaned.indexOf('.');
  const whole = (dot < 0 ? cleaned : cleaned.slice(0, dot))
    .replace(/^0+(?=\d)/, '')
    .slice(0, MAX_INTEGER_DIGITS);
  if (dot < 0 || decimals === 0) return whole;
  const fraction = cleaned
    .slice(dot + 1)
    .replace(/\./g, '')
    .slice(0, decimals);
  return `${whole || '0'}.${fraction}`;
}

/** Rounded to whole units, for estimates like "About $1,101 a month". */
export function formatMoneyWhole(currency: string, minor: MinorUnits): string {
  const { symbol, minorUnits } = getCurrency(currency);
  const whole = Math.round(Math.abs(minor) / 10 ** minorUnits);
  return `${minor < 0 ? MINUS_SIGN : ''}${symbol}${groupThousands(String(whole))}`;
}
