import { getCurrency } from './currency';
import type { Entry, FxSource } from './domain';
import type { MinorUnits } from './money';

/**
 * Exchange rates. A rate is a decimal string ("0.2102") meaning
 * 1 unit of the entry currency = rate units of the settlement currency.
 * All arithmetic is done on BigInt so no floating point ever touches money.
 * Results are integer ISO 4217 minor units (TWD keeps its cents here; rounding
 * to whole dollars only happens for display and settling up, see money.ts).
 */

/** Matches PostgreSQL numeric(20,10): at most 10 integer and 10 fractional digits. */
export const RATE_DECIMALS = 10;
const RATE_SCALE = 10n ** BigInt(RATE_DECIMALS);
const RATE_PATTERN = /^(\d{1,10})(?:\.(\d{1,10}))?$/;

/** Rate as an integer scaled by 10^RATE_DECIMALS, or null when not a valid positive rate. */
export function parseRate(rate: string): bigint | null {
  const match = RATE_PATTERN.exec(rate.trim());
  if (!match) return null;
  const [, whole, fraction = ''] = match;
  const scaled = BigInt(whole) * RATE_SCALE + BigInt(fraction.padEnd(RATE_DECIMALS, '0'));
  return scaled > 0n ? scaled : null;
}

/** Cleans a typed rate: digits and one point, at most 10 digits on each side. Commas are ignored. */
export function sanitizeRateText(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const dot = cleaned.indexOf('.');
  const whole = (dot < 0 ? cleaned : cleaned.slice(0, dot)).replace(/^0+(?=\d)/, '').slice(0, 10);
  if (dot < 0) return whole;
  const fraction = cleaned
    .slice(dot + 1)
    .replace(/\./g, '')
    .slice(0, RATE_DECIMALS);
  return `${whole || '0'}.${fraction}`;
}

export function isValidRate(rate: string): boolean {
  return parseRate(rate) !== null;
}

/** Canonical text for a scaled rate: no trailing zeros ("0.2102", "1", "150.5"). */
function formatScaledRate(scaled: bigint): string {
  const whole = scaled / RATE_SCALE;
  const fraction = (scaled % RATE_SCALE).toString().padStart(RATE_DECIMALS, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Normalises a typed rate ("0.21020" -> "0.2102"); null when invalid. */
export function normaliseRate(rate: string): string | null {
  const scaled = parseRate(rate);
  return scaled === null ? null : formatScaledRate(scaled);
}

/** numerator / denominator rounded half away from zero (denominator > 0). */
function divRound(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const rounded = (abs * 2n + denominator) / (denominator * 2n);
  return negative ? -rounded : rounded;
}

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

/**
 * Converts an amount in the entry currency to the settlement currency, in ISO
 * minor units, rounded half-up. `¥3,333 × 0.2102` -> 70060 (NT$700.60).
 */
export function convertMinor(amountMinor: MinorUnits, from: string, to: string, rate: string): MinorUnits {
  if (!Number.isSafeInteger(amountMinor)) throw new Error(`Invalid amount: ${amountMinor}`);
  const scaled = parseRate(rate);
  if (scaled === null) throw new Error(`Invalid rate: ${rate}`);
  const shift = getCurrency(to).minorUnits - getCurrency(from).minorUnits;
  const numerator = BigInt(amountMinor) * scaled * pow10(Math.max(shift, 0));
  const denominator = RATE_SCALE * pow10(Math.max(-shift, 0));
  return Number(divRound(numerator, denominator));
}

/**
 * The rate implied by what was actually paid ("I paid NT$2,131 for ¥10,000"),
 * rounded half-up to RATE_DECIMALS. Null when the amounts cannot make a rate.
 * Store the converted amount as convertMinor(amount, rate) so the two always agree.
 */
export function rateFromAmounts(
  amountMinor: MinorUnits,
  from: string,
  settleMinor: MinorUnits,
  to: string,
): string | null {
  if (!Number.isSafeInteger(amountMinor) || !Number.isSafeInteger(settleMinor)) return null;
  if (amountMinor <= 0 || settleMinor <= 0) return null;
  const shift = getCurrency(from).minorUnits - getCurrency(to).minorUnits;
  const numerator = BigInt(settleMinor) * RATE_SCALE * pow10(Math.max(shift, 0));
  const denominator = BigInt(amountMinor) * pow10(Math.max(-shift, 0));
  const scaled = divRound(numerator, denominator);
  if (scaled <= 0n || scaled >= 10n ** 10n * RATE_SCALE) return null;
  return formatScaledRate(scaled);
}

/** Rounds a positive scaled rate to `digits` significant digits, half-up. */
function roundSignificant(scaled: bigint, digits: number): bigint {
  const length = scaled.toString().length;
  if (length <= digits) return scaled;
  const unit = pow10(length - digits);
  return divRound(scaled, unit) * unit;
}

/** The markup on the mid-market rate for a suggested ledger rate (cash exchange or card fees). */
export const SUGGESTED_MARKUP = '1.015';

/**
 * Suggested ledger rate: mid-market rate × 1.015, rounded to 4 significant
 * digits. `0.2071` -> `0.2102`. Null when the mid rate is not valid.
 */
export function suggestedRate(midRate: string, markup: string = SUGGESTED_MARKUP): string | null {
  const mid = parseRate(midRate);
  const factor = parseRate(markup);
  if (mid === null || factor === null) return null;
  const marked = divRound(mid * factor, RATE_SCALE);
  if (marked <= 0n) return null;
  return formatScaledRate(roundSignificant(marked, 4));
}

/**
 * Each member's share in the settlement currency (`shares_settle`): the
 * converted total split in proportion to `shares` (entry currency) with the
 * largest remainder method, so it always adds up to `settleTotal`. Ties go to
 * the lower member key (plain character order), the same rule as the server's
 * allocate_settle, so both always agree.
 */
export function allocateSettle(
  settleTotal: MinorUnits,
  shares: Record<string, MinorUnits>,
): Record<string, MinorUnits> {
  const ordered = Object.keys(shares).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const shareSum = ordered.reduce((sum, id) => sum + BigInt(shares[id]), 0n);
  const result: Record<string, MinorUnits> = {};
  if (shareSum === 0n) {
    ordered.forEach((id) => {
      result[id] = 0;
    });
    return result;
  }
  const total = BigInt(settleTotal);
  const parts = ordered.map((id) => {
    const exact = total * BigInt(shares[id]);
    return { id, floor: exact / shareSum, remainder: exact % shareSum };
  });
  let left = total - parts.reduce((sum, part) => sum + part.floor, 0n);
  const byRemainder = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? 0 : a.remainder > b.remainder ? -1 : 1,
  );
  for (const part of byRemainder) {
    if (left <= 0n) break;
    part.floor += 1n;
    left -= 1n;
  }
  parts.forEach((part) => {
    result[part.id] = Number(part.floor);
  });
  return result;
}

export type Settlement = {
  currency: string;
  fxRate: string;
  fxSource: FxSource;
  amountSettleMinor: MinorUnits;
  sharesSettle: Record<string, MinorUnits> | null;
};

/**
 * The conversion fields of an entry in a ledger settled in `settleCurrency`.
 * Same rules as the server (guard_entry_write), which recalculates them anyway:
 * - paid in the settlement currency: rate 1, source "same", converted = amount
 * - split (a personal copy): keeps the converted amount it was given
 * - otherwise: amount × rate, rounded half-up to ISO minor units
 * The converted shares are the converted amount split in proportion to `shares`.
 */
export function settlementFor(
  entry: Pick<Entry, 'amountMinor' | 'shares' | 'currency' | 'fxRate' | 'fxSource' | 'amountSettleMinor'>,
  settleCurrency: string,
): Settlement {
  const currency = entry.currency ?? settleCurrency;
  let fxRate = (entry.fxRate && normaliseRate(entry.fxRate)) || '1';
  let fxSource: FxSource = entry.fxSource ?? 'same';
  let amountSettleMinor: MinorUnits;
  if (currency === settleCurrency) {
    fxRate = '1';
    if (fxSource !== 'split') fxSource = 'same';
    amountSettleMinor = entry.amountMinor;
  } else if (fxSource === 'split' && entry.amountSettleMinor !== undefined) {
    amountSettleMinor = entry.amountSettleMinor;
  } else {
    // The server refuses "same" for another currency; the app always sends a source with a rate.
    if (fxSource === 'same' || fxSource === 'split') fxSource = 'ledger';
    amountSettleMinor = convertMinor(entry.amountMinor, currency, settleCurrency, fxRate);
  }
  return {
    currency,
    fxRate,
    fxSource,
    amountSettleMinor,
    sharesSettle: entry.shares ? allocateSettle(amountSettleMinor, entry.shares) : null,
  };
}

/** What the entry screens show under an amount in a ledger settled in another currency. */
export type Conversion =
  | { kind: 'same' }
  /** The ledger has no rate for this currency yet: ask for one before saving. */
  | { kind: 'missing'; currency: string; settleCurrency: string }
  | {
      kind: 'converted';
      currency: string;
      settleCurrency: string;
      rate: string;
      /** "ledger": the ledger rate; "manual": a rate set for this entry only. */
      source: 'ledger' | 'manual';
      settleMinor: MinorUnits;
    };

/**
 * The conversion of a new or edited entry: the entry's own rate when one was set
 * (`manualRate`), else the ledger rate for the currency.
 */
export function previewConversion(
  amountMinor: MinorUnits,
  currency: string,
  ledger: { currency: string; rates?: Record<string, string> },
  manualRate?: string | null,
): Conversion {
  const settleCurrency = ledger.currency;
  if (currency === settleCurrency) return { kind: 'same' };
  const manual = manualRate ? normaliseRate(manualRate) : null;
  const ledgerRate = ledger.rates?.[currency] ? normaliseRate(ledger.rates[currency]) : null;
  const rate = manual ?? ledgerRate;
  if (!rate) return { kind: 'missing', currency, settleCurrency };
  return {
    kind: 'converted',
    currency,
    settleCurrency,
    rate,
    source: manual ? 'manual' : 'ledger',
    settleMinor: convertMinor(amountMinor, currency, settleCurrency, rate),
  };
}

/**
 * Cross rate from rates against one base currency (`{ TWD: "32.2", JPY: "155.5" }`
 * = 1 USD in each): 1 `from` = rates[to] / rates[from] `to`, rounded half-up to
 * RATE_DECIMALS. The server's suggest_rate does the same with its fx_rates table.
 */
export function crossRate(
  rates: Record<string, string>,
  base: string,
  from: string,
  to: string,
): string | null {
  const scaledOf = (code: string) =>
    code === base ? RATE_SCALE : rates[code] ? parseRate(rates[code]) : null;
  const fromScaled = scaledOf(from);
  const toScaled = scaledOf(to);
  if (fromScaled === null || toScaled === null) return null;
  const scaled = divRound(toScaled * RATE_SCALE, fromScaled);
  return scaled > 0n ? formatScaledRate(scaled) : null;
}

/** A suggested ledger rate (mid-market rate × 1.015) and the mid rate it came from. */
export type RateSuggestion = {
  rate: string;
  mid: string;
  /** Day of the mid rate (YYYY-MM-DD). */
  asOf: string;
  /** Demo mode: made-up sample rates, not market data. */
  sample: boolean;
};
