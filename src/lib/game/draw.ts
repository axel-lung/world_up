import { randomInt } from 'node:crypto';
import { RARITIES, type Rarity } from '@/lib/rarity';

// Odds are integers in parts per million, so a draw is one integer pick with
// no rounding: 0.25 % is 2,500.
export const PER_MILLION = 1_000_000;

export type OddsSet = Record<Rarity, number>;

/** A uniform integer in [0, max). crypto.randomInt in production; tests pass their own. */
export type RandomInt = (max: number) => number;

export const secureRandom: RandomInt = (max) => randomInt(max);

/** Whole, non-negative parts per million summing to 1,000,000. */
export function validOdds(odds: OddsSet): boolean {
  const values = RARITIES.map((rarity) => odds[rarity]);
  return values.every((value) => Number.isInteger(value) && value >= 0) && values.reduce((a, b) => a + b, 0) === PER_MILLION;
}

/** A rarity picked with the given odds. */
export function drawRarity(odds: OddsSet, random: RandomInt = secureRandom): Rarity {
  let ticket = random(PER_MILLION);
  for (const rarity of RARITIES) {
    ticket -= odds[rarity];
    if (ticket < 0) return rarity;
  }
  throw new Error('The odds do not sum to 1,000,000');
}
