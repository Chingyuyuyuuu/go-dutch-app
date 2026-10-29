import { displayDecimals, getCurrency } from './currency';

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
  /** How to round to what is shown (whole dollars for TWD). Default half-up. */
  round?: RoundMode;
};

/**
 * The number shown for an amount, without symbol or sign: "1,234.50" for AUD,
 * "701" for NT$700.60 (TWD shows whole dollars; the stored amount keeps its cents).
 */
export function formatAmountNumber(
  currency: string,
  minor: MinorUnits,
  round: RoundMode = 'half-up',
): string {
  const unit = displayUnit(currency);
  return formatMinorNumber(roundToDisplayUnit(minor, currency, round) / unit, displayDecimals(currency));
}

/** "$1,234.50", "¥2,500", "NT$300". The symbol follows the currency, not the UI language. */
export function formatMoney(currency: string, minor: MinorUnits, options: FormatMoneyOptions = {}): string {
  const { symbol } = getCurrency(currency);
  return `${options.sign ?? ''}${symbol}${formatAmountNumber(currency, minor, options.round)}`;
}

/** All ISO decimals, for showing how a conversion was worked out: "NT$700.60". */
export function formatMoneyExact(currency: string, minor: MinorUnits): string {
  const { symbol, minorUnits } = getCurrency(currency);
  return `${symbol}${formatMinorNumber(minor, minorUnits)}`;
}

/** Balance with a minus sign when negative ("−$12.00"). */
export function formatSignedMoney(currency: string, minor: MinorUnits): string {
  return formatMoney(currency, minor, { sign: minor < 0 ? MINUS_SIGN : '' });
}

// ---------------------------------------------------------------------------
// Keypad input. Typing follows the decimals people use (inputDecimals: none for
// TWD), while inputToMinor / minorToInput take the ISO minor units of the currency. The raw input is a string like "1234.5" so we never go through
// floating point. It is converted to minor units with string arithmetic.

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'del';

export const MAX_INTEGER_DIGITS = 9;

/** Decimals that can be typed for a currency: 2 for AUD, none for JPY and TWD. */
export function inputDecimals(currency: string): number {
  return displayDecimals(currency);
}

/** ISO minor units of a currency, for inputToMinor and minorToInput (2 for TWD: stored in cents). */
export function isoDecimals(currency: string): number {
  return getCurrency(currency).minorUnits;
}

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

/**
 * A stored amount as keypad input in the currency's typed decimals: NT$700.60 -> "701".
 * For prefilling a new amount (settle in full, a reconcile gap). Editing an existing
 * entry keeps its exact amount with minorToInput instead.
 */
export function minorToTypedInput(minor: MinorUnits, currency: string): string {
  return minorToInput(roundToDisplayUnit(minor, currency), isoDecimals(currency));
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

export type RoundMode = 'half-up' | 'floor' | 'ceil';

/** The smallest amount shown, in ISO minor units: 100 for TWD (whole dollars), 1 for AUD and JPY. */
export function displayUnit(currency: string): MinorUnits {
  return 10 ** (getCurrency(currency).minorUnits - displayDecimals(currency));
}

/**
 * Rounds ISO minor units to what is shown for the currency (whole dollars for
 * TWD): 70060 -> 70100. Only for display and settling up; calculations keep the
 * exact amount. half-up rounds halves away from zero; floor and ceil go down and up.
 */
export function roundToDisplayUnit(
  minor: MinorUnits,
  currency: string,
  mode: RoundMode = 'half-up',
): MinorUnits {
  if (!Number.isSafeInteger(minor)) throw new Error(`Amount must be integer minor units, got ${minor}`);
  const unit = displayUnit(currency);
  const rest = ((minor % unit) + unit) % unit;
  const down = minor - rest;
  if (rest === 0 || mode === 'floor') return down;
  if (mode === 'ceil') return down + unit;
  const halfUp = minor < 0 ? rest > unit / 2 : rest >= unit / 2;
  return halfUp ? down + unit : down;
}

/** Rounded to whole units, for estimates like "About $1,101 a month". */
export function formatMoneyWhole(currency: string, minor: MinorUnits): string {
  const { symbol, minorUnits } = getCurrency(currency);
  const whole = Math.round(Math.abs(minor) / 10 ** minorUnits);
  return `${minor < 0 ? MINUS_SIGN : ''}${symbol}${groupThousands(String(whole))}`;
}
