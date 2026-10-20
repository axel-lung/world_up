import { describe, expect, it } from 'vitest';
import { RARITIES, type Rarity } from '@/lib/rarity';
import { drawRarity, type OddsSet, PER_MILLION, validOdds } from './draw';

const LAUNCH_ODDS: OddsSet = {
  legendary: 2_500,
  ultra: 25_000,
  super: 70_000,
  rare: 200_000,
  uncommon: 200_000,
  common: 502_500,
};

describe('drawRarity', () => {
  it('maps each ticket to its rarity, rarest first', () => {
    const at = (ticket: number) => drawRarity(LAUNCH_ODDS, () => ticket);
    expect([0, 2_499, 2_500, 27_499, 27_500, 97_500, 297_500, 497_499, 497_500, PER_MILLION - 1].map(at)).toEqual([
      'legendary',
      'legendary',
      'ultra',
      'ultra',
      'super',
      'rare',
      'uncommon',
      'uncommon',
      'common',
      'common',
    ]);
  });

  it('never draws a rarity whose odds are zero', () => {
    const odds = { ...LAUNCH_ODDS, legendary: 0, common: 505_000 };
    expect(drawRarity(odds, () => 0)).toBe('ultra');
  });

  // The acceptance checklist asks for ±0.05 point after 1,000,000 draws. That
  // is one standard deviation for the commons (50.25 %): a correct draw would
  // fail one run in three. With 25,000,000 draws, the same ±0.05 point is
  // five standard deviations, so the test only fails if the draw is biased.
  it('lands within 0.05 point of each published probability over 25,000,000 draws', () => {
    const draws = 25_000_000;
    const counts = Object.fromEntries(RARITIES.map((rarity) => [rarity, 0])) as Record<Rarity, number>;
    for (let i = 0; i < draws; i++) counts[drawRarity(LAUNCH_ODDS)] += 1;
    for (const rarity of RARITIES) {
      const gap = Math.abs(counts[rarity] / draws - LAUNCH_ODDS[rarity] / PER_MILLION) * 100;
      expect(gap, rarity).toBeLessThan(0.05);
    }
  }, 30_000);
});

describe('validOdds', () => {
  it('wants whole parts per million summing to 1,000,000', () => {
    expect(validOdds(LAUNCH_ODDS)).toBe(true);
    expect(validOdds({ ...LAUNCH_ODDS, common: 502_499 })).toBe(false);
    expect(validOdds({ ...LAUNCH_ODDS, common: 502_499.5, rare: 200_000.5 })).toBe(false);
    expect(validOdds({ ...LAUNCH_ODDS, legendary: -1, common: 505_001 })).toBe(false);
  });
});
