import { RARITIES, type Rarity } from '@/lib/rarity';

// Pure helpers of the map, for the server and the browser.

export type LatLon = readonly [lat: number, lon: number];

const EARTH_RADIUS_M = 6_371_000;
const RAD = Math.PI / 180;

/** Distance along the ground between two points, in metres (haversine). */
export function distanceMetres(a: LatLon, b: LatLon): number {
  const dLat = (b[0] - a[0]) * RAD;
  const dLon = (b[1] - a[1]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A distance as it is shown: metres to the ten under a kilometre, else kilometres to one decimal. */
export function roundedDistance(metres: number): { value: number; unit: 'm' | 'km' } {
  const tens = Math.round(metres / 10) * 10;
  return tens < 1000 ? { value: tens, unit: 'm' } : { value: Math.round(metres / 100) / 10, unit: 'km' };
}

/**
 * The legend's step for a department: 0 when nothing is owned, 5 when all
 * is, else 1 to 4 for under 20 %, 40 %, 70 % and 100 %.
 */
export function progressStep(owned: number, total: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (owned <= 0 || total <= 0) return 0;
  const part = owned / total;
  if (part >= 1) return 5;
  if (part >= 0.7) return 4;
  if (part >= 0.4) return 3;
  if (part >= 0.2) return 2;
  return 1;
}

export const rarityAt = (index: number): Rarity => RARITIES[index] ?? 'common';

/** Whether a point lies in a box: west, south, east, north. */
export function inBounds([lat, lon]: LatLon, [west, south, east, north]: readonly [number, number, number, number]): boolean {
  return lat >= south && lat <= north && lon >= west && lon <= east;
}
