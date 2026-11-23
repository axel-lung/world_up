import { distanceMetres, type LatLon } from '@/lib/map/geo';
import type { Achievement } from './achievements';
import type { VisitRules } from './rules';

// Unlocking a card on site ("Je suis ici", decided on 2026-11-22): the pure
// checks, for the server (visits.ts) and the tests. The database rules give
// the distance, the accuracy and the visits a day; the two limits below are
// anti-abuse constants, like MAX_FRIENDS.

/**
 * A monument whose point Wikidata gives coarsely (location_precision, about
 * 80 cards over 1 km) unlocks within that precision instead, up to this far:
 * beyond it, the point says too little of where the monument stands.
 */
export const MAX_VISIT_RADIUS_METRES = 2000;

/**
 * Faster than this between two monuments, door to door, the second visit
 * waits: an airliner's speed, which no player beats from one monument to the
 * next. It holds back a position faked from place to place, without stopping
 * a real trip.
 */
export const MAX_TRAVEL_KMH = 900;

/** The device's position: degrees, and its accuracy in metres. */
export interface Position {
  lat: number;
  lon: number;
  accuracy: number;
}

/** The distance within which a monument unlocks: the rule's, widened for a coarse point. */
export function visitRadius(radiusMetres: number, precisionMetres: number | null): number {
  return Math.max(radiusMetres, Math.min(precisionMetres ?? 0, MAX_VISIT_RADIUS_METRES));
}

export type PlaceRefusal =
  | { reason: 'imprecise'; accuracy: number; required: number }
  | { reason: 'tooFar'; distance: number; radius: number };

/**
 * Why a position doesn't stand at the monument, or null when it does: it must
 * be known closely enough, then lie near enough. Distances in whole metres.
 */
export function placeRefusal(
  rules: Pick<VisitRules, 'visitMaxAccuracyMetres'>,
  position: Position,
  monument: LatLon,
  radius: number,
): PlaceRefusal | null {
  if (position.accuracy > rules.visitMaxAccuracyMetres) {
    return { reason: 'imprecise', accuracy: Math.round(position.accuracy), required: rules.visitMaxAccuracyMetres };
  }
  const distance = distanceMetres([position.lat, position.lon], monument);
  if (distance > radius) return { reason: 'tooFar', distance: Math.round(distance), radius };
  return null;
}

/** A monument visited or about to be: its point and the radius it unlocked within. */
export interface VisitPlace {
  point: LatLon;
  radius: number;
}

/**
 * The earliest moment a visit here can follow the last one: the ground between
 * the two monuments, less both radii (the player stood anywhere within them),
 * at MAX_TRAVEL_KMH. The last visit's moment when they are that close.
 */
export function plausibleAfter(last: VisitPlace & { at: Date }, here: VisitPlace): Date {
  const ground = Math.max(0, distanceMetres(last.point, here.point) - last.radius - here.radius);
  const metresPerMs = (MAX_TRAVEL_KMH * 1000) / 3_600_000;
  return new Date(last.at.getTime() + Math.ceil(ground / metresPerMs));
}

/**
 * The achievements of the visits. Private like the visits: the player's own
 * profile shows them, never a friend's page, and they can't be shown beside
 * the pseudo.
 */
const VISIT_KINDS: ReadonlySet<Achievement['kind']> = new Set([
  'monuments_visited',
  'departments_visited',
  'visits_in_a_day',
  'rarities_visited',
  'overseas_visited',
]);

export const isVisitKind = (kind: Achievement['kind']) => VISIT_KINDS.has(kind);
