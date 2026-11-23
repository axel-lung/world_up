import { describe, expect, it } from 'vitest';
import { distanceMetres } from '@/lib/map/geo';
import { isVisitKind, MAX_TRAVEL_KMH, MAX_VISIT_RADIUS_METRES, placeRefusal, plausibleAfter, visitRadius } from './visit';

// The Sainte-Chapelle and points around it
const CHAPEL = [48.855376, 2.345028] as const;
// About 150 m and 540 m north of it
const NEAR = { lat: 48.856726, lon: 2.345028 };
const FAR = { lat: 48.860232, lon: 2.345028 };
const RULES = { visitMaxAccuracyMetres: 100 };

describe('visitRadius', () => {
  it('is the rule for a precise point', () => {
    expect(visitRadius(200, 1)).toBe(200);
    expect(visitRadius(200, null)).toBe(200);
  });

  it('widens to a coarse point, up to the ceiling', () => {
    expect(visitRadius(200, 1114)).toBe(1114);
    expect(visitRadius(200, 11_132)).toBe(MAX_VISIT_RADIUS_METRES);
  });

  it('never goes below the rule', () => {
    expect(visitRadius(3000, 11_132)).toBe(3000);
  });
});

describe('placeRefusal', () => {
  it('accepts a precise position near enough', () => {
    expect(placeRefusal(RULES, { ...NEAR, accuracy: 38 }, CHAPEL, 200)).toBeNull();
  });

  it('refuses a position known too roughly, before measuring', () => {
    expect(placeRefusal(RULES, { ...NEAR, accuracy: 1234.4 }, CHAPEL, 200)).toEqual({
      reason: 'imprecise',
      accuracy: 1234,
      required: 100,
    });
  });

  it('accepts an accuracy exactly at the limit', () => {
    expect(placeRefusal(RULES, { ...NEAR, accuracy: 100 }, CHAPEL, 200)).toBeNull();
  });

  it('refuses a position too far, saying how far', () => {
    const refusal = placeRefusal(RULES, { ...FAR, accuracy: 10 }, CHAPEL, 200);
    expect(refusal).toMatchObject({ reason: 'tooFar', radius: 200 });
    expect(refusal && 'distance' in refusal && refusal.distance).toBe(Math.round(distanceMetres([FAR.lat, FAR.lon], CHAPEL)));
  });

  it('accepts the same position within a widened radius', () => {
    expect(placeRefusal(RULES, { ...FAR, accuracy: 10 }, CHAPEL, 1114)).toBeNull();
  });
});

describe('plausibleAfter', () => {
  const at = new Date('2026-11-22T12:00:00Z');

  it('lets two monuments close to each other follow at once', () => {
    const next = plausibleAfter({ at, point: CHAPEL, radius: 200 }, { point: [NEAR.lat, NEAR.lon], radius: 200 });
    expect(next).toEqual(at);
  });

  it('waits the time of the trip, less both radii, at an airliner’s speed', () => {
    // Paris to Marseille, about 660 km
    const marseille = [43.296482, 5.36978] as const;
    const ground = distanceMetres(CHAPEL, marseille) - 400;
    const next = plausibleAfter({ at, point: CHAPEL, radius: 200 }, { point: marseille, radius: 200 });
    const hours = (next.getTime() - at.getTime()) / 3_600_000;
    expect(hours).toBeCloseTo(ground / 1000 / MAX_TRAVEL_KMH, 3);
    expect(hours).toBeGreaterThan(0.7);
    expect(hours).toBeLessThan(0.8);
  });
});

describe('isVisitKind', () => {
  it('tells the visits’ achievements from the others', () => {
    expect(isVisitKind('monuments_visited')).toBe(true);
    expect(isVisitKind('overseas_visited')).toBe(true);
    expect(isVisitKind('distinct_cards')).toBe(false);
    expect(isVisitKind('packs_opened')).toBe(false);
  });
});
