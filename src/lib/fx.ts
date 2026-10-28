import { getCurrency } from './currency';
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
 * the member that comes first in `memberOrder`.
 */
export function allocateSettle(
  settleTotal: MinorUnits,
  shares: Record<string, MinorUnits>,
  memberOrder: readonly string[] = [],
): Record<string, MinorUnits> {
  const ids = Object.keys(shares);
  const rank = (id: string) => {
    const index = memberOrder.indexOf(id);
    return index < 0 ? memberOrder.length + ids.indexOf(id) : index;
  };
  const ordered = [...ids].sort((a, b) => rank(a) - rank(b));
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
