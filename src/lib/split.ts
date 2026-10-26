import type { MinorUnits } from './money';

/**
 * Equal split in integer minor units. base = floor(total / n); the first `rem`
 * people get one extra minor unit so the shares always add up to the total.
 */
export function splitEvenly(total: MinorUnits, people: number): MinorUnits[] {
  if (!Number.isInteger(total) || total < 0) throw new Error(`Invalid total: ${total}`);
  if (!Number.isInteger(people) || people < 1) throw new Error(`Invalid number of people: ${people}`);
  const base = Math.floor(total / people);
  const rem = total - base * people;
  return Array.from({ length: people }, (_, i) => base + (i < rem ? 1 : 0));
}
