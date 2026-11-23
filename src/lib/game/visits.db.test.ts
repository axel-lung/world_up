import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { achievements, cards, cardVisits, coinLedger, userCards, wishlistItems } from '@/db/schema';
import { testCard } from '@/lib/catalog/testing';
import { visitCounts } from './achievements';
import { playerBadges, setFeaturedBadge } from './badges';
import { collectionCounts, listCollectionCards } from './collection';
import { createTestCollection, createTestPlayer, deleteTestData, type TestCollection } from './testing';
import type { Position } from './visit';
import { cardVisitedAt, playerVisits, visitCount, visitedCards, visitMonument } from './visits';
import { addWish } from './wishlist';

// Q1 the Sainte-Chapelle (Paris), Q2 the Conciergerie 150 m away, Q6 the
// Panthéon (Paris, rare), Q3 Notre-Dame de la Garde (Marseille), Q4 hidden,
// Q5 a coarse point on Réunion (an ultra), Q7 without a point.
const CHAPEL = { lat: 48.855376, lon: 2.345028 };
const CONCIERGERIE = { lat: 48.856726, lon: 2.345028 };
const PANTHEON = { lat: 48.846222, lon: 2.346414 };
const GARDE = { lat: 43.283965, lon: 5.371168 };
const REUNION = { lat: -21.115141, lon: 55.536384 };
const ODDS = { legendary: 0, ultra: 0, super: 0, rare: 0, uncommon: 0, common: 1_000_000 };
// Noon in Paris on 22 November 2026
const t0 = new Date('2026-11-22T11:00:00Z');
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
const here = (point: { lat: number; lon: number }, accuracy = 20): Position => ({ ...point, accuracy });

let collection: TestCollection;
const players: string[] = [];
const ids = new Map<string, number>();

const visit = (userId: string, card: string, position: Position, now: Date) =>
  visitMonument(db, { userId, collectionId: collection.id, cardId: ids.get(card)!, position, now });

async function player() {
  const id = await createTestPlayer();
  players.push(id);
  return id;
}

beforeAll(async () => {
  const paris = { department_code: '75', department: 'Paris', region: 'Île-de-France' };
  collection = await createTestCollection(
    [
      testCard(1, { ...paris, coordinates: { ...CHAPEL, precision: 1 } }),
      testCard(2, { ...paris, coordinates: { ...CONCIERGERIE, precision: 1 } }),
      testCard(3, {
        department_code: '13',
        department: 'Bouches-du-Rhône',
        region: "Provence-Alpes-Côte d'Azur",
        coordinates: { ...GARDE, precision: 4 },
      }),
      testCard(4, { coordinates: { ...CHAPEL, precision: 1 }, memorial: true, hidden_reason: 'memorial' }),
      testCard(5, {
        rarity: 'ultra',
        department_code: '974',
        department: 'La Réunion',
        region: 'La Réunion',
        coordinates: { ...REUNION, precision: 1114 },
      }),
      testCard(6, { ...paris, rarity: 'rare', coordinates: { ...PANTHEON, precision: 1 } }),
      testCard(7, { coordinates: null }),
    ],
    { odds: ODDS, rules: { visitRadiusMetres: 200, visitMaxAccuracyMetres: 100, visitsPerDay: 3 } },
  );
  for (const row of await db
    .select({ id: cards.id, wikidataId: cards.wikidataId })
    .from(cards)
    .where(eq(cards.collectionId, collection.id))) {
    ids.set(row.wikidataId, row.id);
  }
  await db.insert(achievements).values([
    { collectionId: collection.id, code: 'visits-1', kind: 'monuments_visited', threshold: 1, rewardCoins: 20, position: 3 },
    { collectionId: collection.id, code: 'visit-overseas-1', kind: 'overseas_visited', threshold: 1, rewardCoins: 200, position: 4 },
  ]);
});

afterAll(async () => {
  await deleteTestData([collection.id], players);
});

describe('visitMonument', () => {
  it('adds a copy of the card, records the visit and grants the achievements', async () => {
    const id = await player();
    await addWish(db, { userId: id, collectionId: collection.id, cardId: ids.get('Q1')!, now: t0 });
    const outcome = await visit(id, 'Q1', here(CONCIERGERIE, 38), t0);
    expect(outcome).toEqual({
      ok: true,
      visit: {
        visitedAt: t0,
        copies: 1,
        isNew: true,
        visits: 1,
        leftToday: 2,
        achievements: [expect.objectContaining({ code: 'visits-1', rewardCoins: 20 })],
      },
    });
    const [owned] = await db
      .select({ quantity: userCards.quantity })
      .from(userCards)
      .where(and(eq(userCards.userId, id), eq(userCards.cardId, ids.get('Q1')!)));
    expect(owned.quantity).toBe(1);
    // The card leaves the wishlist; the achievement pays
    expect(await db.select().from(wishlistItems).where(eq(wishlistItems.userId, id))).toEqual([]);
    const ledger = await db.select({ amount: coinLedger.amount }).from(coinLedger).where(eq(coinLedger.userId, id));
    expect(ledger).toEqual([{ amount: 20 }]);
    expect(await cardVisitedAt(id, ids.get('Q1')!)).toEqual(t0);
  });

  it('unlocks each monument once', async () => {
    const id = await player();
    expect((await visit(id, 'Q1', here(CHAPEL), t0))?.ok).toBe(true);
    const again = await visit(id, 'Q1', here(CHAPEL), at(60));
    expect(again).toEqual({ ok: false, refusal: { reason: 'alreadyVisited', visitedAt: t0 } });
    expect(await visitCount(db, id, collection.id)).toBe(1);
  });

  it('adds a copy to one the player already owns', async () => {
    const id = await player();
    await db.insert(userCards).values({ userId: id, collectionId: collection.id, cardId: ids.get('Q2')!, quantity: 2, firstObtainedAt: t0 });
    const outcome = await visit(id, 'Q2', here(CONCIERGERIE), t0);
    expect(outcome?.ok && outcome.visit).toMatchObject({ copies: 3, isNew: false });
  });

  it('refuses a position too far or too rough, and records nothing', async () => {
    const id = await player();
    const far = await visit(id, 'Q1', here(PANTHEON), t0);
    expect(far).toMatchObject({ ok: false, refusal: { reason: 'tooFar', radius: 200 } });
    expect(far && !far.ok && far.refusal.reason === 'tooFar' && far.refusal.distance).toBeGreaterThan(900);
    const rough = await visit(id, 'Q1', here(CHAPEL, 250), t0);
    expect(rough).toEqual({ ok: false, refusal: { reason: 'imprecise', accuracy: 250, required: 100 } });
    expect(await visitCount(db, id, collection.id)).toBe(0);
    expect(await db.select().from(userCards).where(eq(userCards.userId, id))).toEqual([]);
  });

  it('widens the radius for a coarse point', async () => {
    const id = await player();
    // 900 m from the point given to 1114 m
    const outcome = await visit(id, 'Q5', here({ lat: REUNION.lat + 0.0081, lon: REUNION.lon }), t0);
    expect(outcome?.ok).toBe(true);
  });

  it('has nothing to visit for a hidden card or one without a point', async () => {
    const id = await player();
    expect(await visit(id, 'Q4', here(CHAPEL), t0)).toBeNull();
    expect(await visit(id, 'Q7', here(CHAPEL), t0)).toBeNull();
  });

  it('allows so many visits a day, in Paris, then again after midnight', async () => {
    const id = await player();
    expect((await visit(id, 'Q1', here(CHAPEL), t0))?.ok).toBe(true);
    expect(await visit(id, 'Q2', here(CONCIERGERIE), at(5))).toMatchObject({ ok: true, visit: { leftToday: 1 } });
    expect(await visit(id, 'Q6', here(PANTHEON), at(30))).toMatchObject({ ok: true, visit: { leftToday: 0 } });
    // A fourth the same day, Q3 moved next to the Panthéon for the test
    await db.update(cards).set({ latitude: PANTHEON.lat, longitude: PANTHEON.lon }).where(eq(cards.id, ids.get('Q3')!));
    try {
      const limited = await visit(id, 'Q3', here(PANTHEON), at(40));
      // Midnight in Paris, 23:00 UTC in winter
      expect(limited).toEqual({
        ok: false,
        refusal: { reason: 'dailyLimit', limit: 3, retryAt: new Date('2026-11-22T23:00:00Z') },
      });
      // 00:30 in Paris the next day
      expect((await visit(id, 'Q3', here(PANTHEON), new Date('2026-11-22T23:30:00Z')))?.ok).toBe(true);
    } finally {
      await db.update(cards).set({ latitude: GARDE.lat, longitude: GARDE.lon }).where(eq(cards.id, ids.get('Q3')!));
    }
  });

  it('waits the time of the trip between two monuments far apart', async () => {
    const id = await player();
    expect((await visit(id, 'Q1', here(CHAPEL), t0))?.ok).toBe(true);
    const soon = await visit(id, 'Q3', here(GARDE), at(10));
    expect(soon).toMatchObject({ ok: false, refusal: { reason: 'tooSoon' } });
    const retryAt = soon && !soon.ok && soon.refusal.reason === 'tooSoon' ? soon.refusal.retryAt : null;
    // About 660 km at 900 km/h
    expect(retryAt!.getTime() - t0.getTime()).toBeGreaterThan(40 * 60_000);
    expect(retryAt!.getTime() - t0.getTime()).toBeLessThan(50 * 60_000);
    expect((await visit(id, 'Q3', here(GARDE), retryAt!))?.ok).toBe(true);
  });

  it('serialises one player’s visits: the same monument sent three times at once unlocks once', async () => {
    const id = await player();
    const outcomes = await Promise.all([1, 2, 3].map(() => visit(id, 'Q1', here(CHAPEL), t0)));
    expect(outcomes.filter((outcome) => outcome?.ok)).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome && !outcome.ok && outcome.refusal.reason === 'alreadyVisited')).toHaveLength(2);
    expect(await visitCount(db, id, collection.id)).toBe(1);
  });
});

describe('the visits as the game shows them', () => {
  let id: string;
  let friend: string;

  beforeAll(async () => {
    id = await player();
    friend = await player();
    await visit(id, 'Q1', here(CHAPEL), t0);
    await visit(id, 'Q6', here(PANTHEON), at(5));
    await visit(id, 'Q5', here(REUNION), new Date('2026-11-24T12:00:00Z'));
  });

  it('counts the monuments, departments, rarities, overseas and the best day', async () => {
    expect(await visitCounts(db, id, collection.id)).toEqual({
      monuments: 3,
      departments: 2,
      bestDay: 2,
      rarities: 3,
      overseas: 1,
    });
  });

  it('lists the visits for the map and the export', async () => {
    expect((await visitedCards(id, collection.id)).map((row) => row.cardId)).toEqual([
      ids.get('Q1'),
      ids.get('Q6'),
      ids.get('Q5'),
    ]);
    expect((await playerVisits(id)).map((row) => row.card)).toEqual(['Q1', 'Q6', 'Q5']);
  });

  it('has a "visited" tab and stamps the player’s own cards only', async () => {
    const counts = await collectionCounts({ userId: id, collectionId: collection.id });
    expect(counts.visited).toBe(3);
    const rows = await listCollectionCards({ userId: id, collectionId: collection.id, tab: 'visited', pages: 1 });
    expect(rows.map((row) => row.slug).sort()).toEqual(['monument-1', 'monument-5', 'monument-6']);
    expect(rows.find((row) => row.slug === 'monument-1')?.visitedAt).toEqual(t0);
    // A friend looking at the collection sees neither the tab nor the stamps
    const seen = await listCollectionCards({ userId: id, viewerId: friend, collectionId: collection.id, tab: 'owned', pages: 1 });
    expect(seen.every((row) => row.visitedAt === null)).toBe(true);
    expect(await listCollectionCards({ userId: id, viewerId: friend, collectionId: collection.id, tab: 'visited', pages: 1 })).toEqual([]);
    expect((await collectionCounts({ userId: id, viewerId: friend, collectionId: collection.id })).visited).toBe(0);
  });

  it('keeps the visits’ badges from being shown beside the pseudo', async () => {
    const badge = (await playerBadges(id, collection.id)).find((item) => item.kind === 'monuments_visited');
    expect(badge?.obtainedAt).not.toBeNull();
    expect(await setFeaturedBadge(id, collection.id, badge!.id)).toBe(false);
  });

  it('goes with the player’s account', async () => {
    const gone = await player();
    await visit(gone, 'Q1', here(CHAPEL), t0);
    await deleteTestData([], [gone]);
    expect(await db.select().from(cardVisits).where(eq(cardVisits.userId, gone))).toEqual([]);
  });
});
