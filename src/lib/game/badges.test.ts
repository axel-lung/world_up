import { describe, expect, it } from 'vitest';
import { badgeTiers } from './badges';

const achievement = (id: number, kind: 'packs_opened' | 'distinct_cards' | 'series_completed', threshold: number) => ({
  id,
  kind,
  threshold,
  rarity: null,
});

describe('badgeTiers', () => {
  it('climbs the rarity ladder with the thresholds of a kind, its last one legendary', () => {
    const packs = [1, 10, 50, 100, 500, 1000].map((threshold, i) => achievement(i + 1, 'packs_opened', threshold));
    const tiers = badgeTiers([...packs].reverse());
    expect(packs.map((a) => tiers.get(a.id))).toEqual(['common', 'uncommon', 'rare', 'super', 'ultra', 'legendary']);
  });

  it('ends the ladder for a kind with few achievements, and spreads a long one over it', () => {
    const series = badgeTiers([achievement(1, 'series_completed', 1), achievement(2, 'series_completed', 3)]);
    expect([series.get(1), series.get(2)]).toEqual(['ultra', 'legendary']);
    const distinct = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000].map((threshold, i) =>
      achievement(i + 1, 'distinct_cards', threshold),
    );
    const tiers = badgeTiers(distinct);
    expect(distinct.map((a) => tiers.get(a.id))).toEqual([
      'common',
      'uncommon',
      'uncommon',
      'rare',
      'super',
      'super',
      'ultra',
      'ultra',
      'legendary',
    ]);
  });

  it('gives an achievement for a rarity that rarity', () => {
    const tiers = badgeTiers([{ id: 7, kind: 'rarity_owned', threshold: 1, rarity: 'super' }]);
    expect(tiers.get(7)).toBe('super');
  });
});
