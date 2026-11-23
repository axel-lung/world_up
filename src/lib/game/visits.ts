import { and, asc, count, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { type Database, db, type Transaction } from '@/db';
import { cards, cardVisits, userCards } from '@/db/schema';
import { fromParisDateTime } from '@/lib/paris-time';
import { type AwardedAchievement, awardAchievements } from './achievements';
import { getGameRules } from './rules';
import { nextDay, parisDay } from './streak';
import { type PlaceRefusal, placeRefusal, plausibleAfter, type Position, visitRadius } from './visit';
import { fulfilWishes } from './wishlist';

// Unlocking a card on site (decided on 2026-11-22): "Je suis ici" on the map
// sends the device's position once; the server checks it against the
// monument's point and adds a copy of the card, which counts and trades like
// a pack's. Each monument unlocks once per player, a few a day. The position
// is never kept: card_visits holds the card and the moment only. Visits are
// private: friends see how many, never which.

type Executor = Database | Transaction;

export type VisitRefusal =
  | PlaceRefusal
  | { reason: 'alreadyVisited'; visitedAt: Date }
  | { reason: 'dailyLimit'; limit: number; retryAt: Date }
  | { reason: 'tooSoon'; retryAt: Date };

export interface Visit {
  visitedAt: Date;
  /** The player's copies of the card now, this one included. */
  copies: number;
  /** Their first copy. */
  isNew: boolean;
  /** Monuments visited in the collection, this one included. */
  visits: number;
  /** Visits still possible today, in Paris. */
  leftToday: number;
  achievements: AwardedAchievement[];
}

export type VisitOutcome = { ok: true; visit: Visit } | { ok: false; refusal: VisitRefusal };

/** The Paris day of a stored instant, in SQL. */
const visitDay = sql`(${cardVisits.visitedAt} AT TIME ZONE 'Europe/Paris')::date`;

/** Midnight in Paris after `today`: when the day's limit lifts. */
const nextMidnight = (today: string) => fromParisDateTime(`${nextDay(today)}T00:00`)!;

/**
 * Unlocks a card on site, in one transaction holding the player's visits
 * lock: the card must be visible with a point, not visited yet by the player,
 * the position precise and near enough, the day's visits under the limit, and
 * the trip from the last monument visited plausible. Then the visit is
 * recorded and a copy added (leaving the wishlist), and the achievements
 * reached are granted. Null when there is no such card to visit.
 */
export async function visitMonument(
  database: Database,
  input: { userId: string; collectionId: number; cardId: number; position: Position; now: Date },
): Promise<VisitOutcome | null> {
  const { userId, collectionId, cardId, position, now } = input;
  return database.transaction(async (tx) => {
    // One player's visits one at a time: two at once can't both pass the day's limit
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`visits:${userId}`}, 0))`);

    const [card] = await tx
      .select({ latitude: cards.latitude, longitude: cards.longitude, precision: cards.locationPrecision })
      .from(cards)
      .where(
        and(eq(cards.id, cardId), eq(cards.collectionId, collectionId), isNull(cards.hiddenReason), isNotNull(cards.latitude)),
      );
    if (!card || card.latitude === null || card.longitude === null) return null;

    const [already] = await tx
      .select({ visitedAt: cardVisits.visitedAt })
      .from(cardVisits)
      .where(and(eq(cardVisits.userId, userId), eq(cardVisits.cardId, cardId)));
    if (already) return { ok: false, refusal: { reason: 'alreadyVisited', visitedAt: already.visitedAt } };

    const rules = await getGameRules(tx, collectionId);
    const radius = visitRadius(rules.visitRadiusMetres, card.precision);
    const refused = placeRefusal(rules, position, [card.latitude, card.longitude], radius);
    if (refused) return { ok: false, refusal: refused };

    const today = parisDay(now);
    const [{ todays }] = await tx
      .select({ todays: count() })
      .from(cardVisits)
      .where(and(eq(cardVisits.userId, userId), eq(cardVisits.collectionId, collectionId), sql`${visitDay} = ${today}`));
    if (todays >= rules.visitsPerDay) {
      return { ok: false, refusal: { reason: 'dailyLimit', limit: rules.visitsPerDay, retryAt: nextMidnight(today) } };
    }

    // From the last monument visited, in any collection: a player is in one place at a time
    const [last] = await tx
      .select({ at: cardVisits.visitedAt, latitude: cards.latitude, longitude: cards.longitude, precision: cards.locationPrecision })
      .from(cardVisits)
      .innerJoin(cards, eq(cards.id, cardVisits.cardId))
      .where(eq(cardVisits.userId, userId))
      .orderBy(desc(cardVisits.visitedAt))
      .limit(1);
    if (last && last.latitude !== null && last.longitude !== null) {
      const retryAt = plausibleAfter(
        { at: last.at, point: [last.latitude, last.longitude], radius: visitRadius(rules.visitRadiusMetres, last.precision) },
        { point: [card.latitude, card.longitude], radius },
      );
      if (retryAt > now) return { ok: false, refusal: { reason: 'tooSoon', retryAt } };
    }

    await tx.insert(cardVisits).values({ userId, collectionId, cardId, visitedAt: now });
    const [owned] = await tx
      .insert(userCards)
      .values({ userId, collectionId, cardId, quantity: 1, firstObtainedAt: now })
      .onConflictDoUpdate({
        target: [userCards.userId, userCards.cardId],
        set: { quantity: sql.raw('"user_cards"."quantity" + excluded."quantity"') },
      })
      .returning({ quantity: userCards.quantity });
    await fulfilWishes(tx, userId, [cardId]);
    const achievements = await awardAchievements(tx, userId, collectionId, now);
    const visits = await visitCount(tx, userId, collectionId);

    return {
      ok: true,
      visit: {
        visitedAt: now,
        copies: owned.quantity,
        isNew: owned.quantity === 1,
        visits,
        leftToday: Math.max(0, rules.visitsPerDay - todays - 1),
        achievements,
      },
    };
  });
}

/** Monuments the player visited in the collection. */
export async function visitCount(executor: Executor, userId: string, collectionId: number): Promise<number> {
  const [{ visits }] = await executor
    .select({ visits: count() })
    .from(cardVisits)
    .where(and(eq(cardVisits.userId, userId), eq(cardVisits.collectionId, collectionId)));
  return visits;
}

/** The player's visits in the collection, oldest first: the map's stamps and filter. */
export async function visitedCards(userId: string, collectionId: number): Promise<{ cardId: number; visitedAt: Date }[]> {
  return db
    .select({ cardId: cardVisits.cardId, visitedAt: cardVisits.visitedAt })
    .from(cardVisits)
    .where(and(eq(cardVisits.userId, userId), eq(cardVisits.collectionId, collectionId)))
    .orderBy(asc(cardVisits.visitedAt));
}

/** When the player visited this card's monument, or null. */
export async function cardVisitedAt(userId: string, cardId: number): Promise<Date | null> {
  const [row] = await db
    .select({ visitedAt: cardVisits.visitedAt })
    .from(cardVisits)
    .where(and(eq(cardVisits.userId, userId), eq(cardVisits.cardId, cardId)));
  return row?.visitedAt ?? null;
}

/** The player's visits, for the account export. */
export async function playerVisits(userId: string) {
  return db
    .select({ card: cards.wikidataId, name: cards.name, visitedAt: cardVisits.visitedAt })
    .from(cardVisits)
    .innerJoin(cards, eq(cards.id, cardVisits.cardId))
    .where(eq(cardVisits.userId, userId))
    .orderBy(asc(cardVisits.visitedAt));
}
