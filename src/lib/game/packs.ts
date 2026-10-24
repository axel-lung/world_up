import { and, asc, count, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { type Database, db, type Transaction } from '@/db';
import { cards, packCards, packOpenings, packState, userCards } from '@/db/schema';
import type { Rarity } from '@/lib/rarity';
import { type AwardedAchievement, awardAchievements } from './achievements';
import { addCoins } from './coins';
import { drawRarity, type RandomInt, secureRandom } from './draw';
import { GameError } from './game-error';
import { type Reserve, refill, takePack } from './refill';
import { currentOdds, type GameRules, getGameRules } from './rules';

// Free packs: the reserve and the opening. The server decides everything; the
// clock is a parameter so the tests can move it.

type Executor = Database | Transaction;

// Openings per player and minute, on top of the reserve: a script can't hammer the draw
export const OPENINGS_PER_MINUTE = 20;

/** The reserve row, created with the signup packs on the player's first visit. */
async function ensureReserve(executor: Executor, userId: string, collectionId: number, rules: GameRules, now: Date) {
  await executor
    .insert(packState)
    .values({ userId, collectionId, packs: rules.signupPacks, lastRefill: now })
    .onConflictDoNothing();
}

export type PlayerReserve = Reserve & Pick<GameRules, 'maxReserve' | 'refillMinutes'>;

export async function getReserve(userId: string, collectionId: number, now: Date): Promise<PlayerReserve> {
  const rules = await getGameRules(db, collectionId);
  await ensureReserve(db, userId, collectionId, rules, now);
  const [stored] = await db
    .select({ packs: packState.packs, lastRefill: packState.lastRefill })
    .from(packState)
    .where(and(eq(packState.userId, userId), eq(packState.collectionId, collectionId)));
  return { ...refill(stored, rules, now), maxReserve: rules.maxReserve, refillMinutes: rules.refillMinutes };
}

/** `count` card IDs: a rarity by the odds in force, then a uniform pick among its visible cards. */
async function drawCards(tx: Transaction, collectionId: number, count: number, now: Date, random: RandomInt) {
  const odds = await currentOdds(tx, collectionId, now);
  if (!odds) throw new Error(`No odds for collection ${collectionId}`);
  const visibleCounts = async () => {
    const rows = await tx
      .select({ rarity: cards.rarity, total: sql<number>`count(*)::int` })
      .from(cards)
      .where(and(eq(cards.collectionId, collectionId), isNull(cards.hiddenReason)))
      .groupBy(cards.rarity);
    return new Map<Rarity, number>(rows.map((row) => [row.rarity, row.total]));
  };
  let totals = await visibleCounts();

  const drawn: number[] = [];
  let retries = 0;
  while (drawn.length < count) {
    const rarity = drawRarity(odds.odds, random);
    const total = totals.get(rarity) ?? 0;
    if (total === 0) throw new Error(`No visible ${rarity} card in collection ${collectionId}`);
    const [card] = await tx
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.collectionId, collectionId), eq(cards.rarity, rarity), isNull(cards.hiddenReason)))
      .orderBy(asc(cards.id))
      .limit(1)
      .offset(random(total));
    if (card) {
      drawn.push(card.id);
    } else {
      // A card was hidden since the counts were read: count again and draw this card again
      if (++retries > 3) throw new Error('The visible cards keep changing during the draw');
      totals = await visibleCounts();
    }
  }
  return drawn;
}

export interface OpenedPack {
  openingId: number;
  /** A request with the same idempotency key had already opened this pack. */
  repeated: boolean;
  /** Coins the opening credited, achievements apart. */
  coins: number;
  achievements: AwardedAchievement[];
}

/**
 * Opens one free pack, in one transaction holding the player's reserve row:
 * takes a pack, draws the cards, records the opening, adds the cards to the
 * collection, credits the opening's coins and grants the achievements reached.
 * A second request with the same idempotency key (a double click) gets the
 * first one's opening.
 */
export async function openPack(
  database: Database,
  input: { userId: string; collectionId: number; idempotencyKey: string; now: Date; random?: RandomInt },
): Promise<OpenedPack> {
  const { userId, collectionId, idempotencyKey, now, random = secureRandom } = input;
  return database.transaction(async (tx) => {
    const rules = await getGameRules(tx, collectionId);
    await ensureReserve(tx, userId, collectionId, rules, now);
    const [stored] = await tx
      .select({ packs: packState.packs, lastRefill: packState.lastRefill })
      .from(packState)
      .where(and(eq(packState.userId, userId), eq(packState.collectionId, collectionId)))
      .for('update');

    const [previous] = await tx
      .select({ id: packOpenings.id })
      .from(packOpenings)
      .where(and(eq(packOpenings.userId, userId), eq(packOpenings.idempotencyKey, idempotencyKey)));
    if (previous) return { openingId: previous.id, repeated: true, coins: 0, achievements: [] };

    const [{ recent }] = await tx
      .select({ recent: count() })
      .from(packOpenings)
      .where(and(eq(packOpenings.userId, userId), gte(packOpenings.createdAt, new Date(now.getTime() - 60_000))));
    if (recent >= OPENINGS_PER_MINUTE) throw new GameError('tooFast');

    const reserve = refill(stored, rules, now);
    if (reserve.packs < 1) throw new GameError('noPack');

    const drawn = await drawCards(tx, collectionId, rules.cardsPerPack, now, random);
    const owned = new Set(
      (
        await tx
          .select({ cardId: userCards.cardId })
          .from(userCards)
          .where(and(eq(userCards.userId, userId), inArray(userCards.cardId, drawn)))
      ).map((row) => row.cardId),
    );
    const [opening] = await tx
      .insert(packOpenings)
      .values({ userId, collectionId, origin: 'free', idempotencyKey, createdAt: now })
      .returning({ id: packOpenings.id });
    await tx.insert(packCards).values(
      drawn.map((cardId, index) => {
        // The same card twice in a pack is new only the first time
        const isNew = !owned.has(cardId);
        owned.add(cardId);
        return { openingId: opening.id, position: index + 1, cardId, isNew };
      }),
    );

    const quantities = new Map<number, number>();
    for (const cardId of drawn) quantities.set(cardId, (quantities.get(cardId) ?? 0) + 1);
    await tx
      .insert(userCards)
      .values([...quantities].map(([cardId, quantity]) => ({ userId, collectionId, cardId, quantity, firstObtainedAt: now })))
      .onConflictDoUpdate({
        target: [userCards.userId, userCards.cardId],
        set: { quantity: sql.raw('"user_cards"."quantity" + excluded."quantity"') },
      });

    await tx
      .update(packState)
      .set(takePack(reserve, rules, now))
      .where(and(eq(packState.userId, userId), eq(packState.collectionId, collectionId)));

    if (rules.coinsPerOpening > 0) {
      await addCoins(tx, {
        userId,
        collectionId,
        amount: rules.coinsPerOpening,
        reason: 'pack_opening',
        reference: String(opening.id),
        now,
      });
    }

    const awarded = await awardAchievements(tx, userId, collectionId, now);
    return { openingId: opening.id, repeated: false, coins: rules.coinsPerOpening, achievements: awarded };
  });
}

/** The cards of one of the player's openings, in reveal order, with the copies owned now. */
export async function getOpeningCards(userId: string, openingId: number) {
  return db
    .select({
      position: packCards.position,
      isNew: packCards.isNew,
      cardId: packCards.cardId,
      quantity: userCards.quantity,
    })
    .from(packCards)
    .innerJoin(packOpenings, eq(packOpenings.id, packCards.openingId))
    .leftJoin(userCards, and(eq(userCards.userId, userId), eq(userCards.cardId, packCards.cardId)))
    .where(and(eq(packCards.openingId, openingId), eq(packOpenings.userId, userId)))
    .orderBy(asc(packCards.position));
}

/** The player's openings and their cards, for the account export. */
export async function playerOpenings(userId: string) {
  const openings = await db
    .select({ id: packOpenings.id, origin: packOpenings.origin, openedAt: packOpenings.createdAt })
    .from(packOpenings)
    .where(eq(packOpenings.userId, userId))
    .orderBy(asc(packOpenings.createdAt));
  if (openings.length === 0) return [];
  const drawn = await db
    .select({ openingId: packCards.openingId, card: cards.wikidataId, name: cards.name, isNew: packCards.isNew })
    .from(packCards)
    .innerJoin(cards, eq(cards.id, packCards.cardId))
    .innerJoin(packOpenings, eq(packOpenings.id, packCards.openingId))
    .where(eq(packOpenings.userId, userId))
    .orderBy(asc(packCards.openingId), asc(packCards.position));
  return openings.map(({ id, ...opening }) => ({
    ...opening,
    cards: drawn
      .filter((card) => card.openingId === id)
      .map((card) => ({ card: card.card, name: card.name, isNew: card.isNew })),
  }));
}
