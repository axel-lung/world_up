import { desc, eq, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { type Database, db, type Transaction } from '@/db';
import { auctions, auditLog, cards, gameRules, marketPrices, marketRules, rarityOdds, resaleValues, trades, users } from '@/db/schema';
import { RARITIES, type Rarity } from '@/lib/rarity';
import { auctionState } from './auctions';
import { type OddsSet, validOdds } from './draw';
import {
  type GameRules,
  getGameRules,
  getMarketPrices,
  getMarketRules,
  getResaleValues,
  type MarketRules,
  type PriceRange,
  visibleCardsByRarity,
} from './rules';
import { tradeState } from './trades';

// The back-office's changes to the game rules: one transaction each, with its
// audit_log row. Odds are never updated: a change is a new dated set.

export class RulesError extends Error {
  constructor(readonly code: 'oddsSum' | 'oddsNoCards' | 'oddsInPast' | 'pricesOrder' | 'unchanged') {
    super(code);
  }
}

function audit(tx: Transaction, adminId: string, action: string, collectionId: number, details: Record<string, unknown>) {
  return tx.insert(auditLog).values({ adminId, action, targetType: 'collection', targetId: String(collectionId), details });
}

export async function updateGameRules(
  database: Database,
  adminId: string,
  collectionId: number,
  rules: GameRules,
): Promise<void> {
  await database.transaction(async (tx) => {
    await tx.execute(sql`SELECT 1 FROM ${gameRules} WHERE ${gameRules.collectionId} = ${collectionId} FOR UPDATE`);
    const before = await getGameRules(tx, collectionId);
    if (Object.entries(rules).every(([key, value]) => before[key as keyof GameRules] === value)) {
      throw new RulesError('unchanged');
    }
    await tx
      .update(gameRules)
      .set({ ...rules, updatedAt: sql`now()` })
      .where(eq(gameRules.collectionId, collectionId));
    await audit(tx, adminId, 'rules.update', collectionId, { from: before, to: rules });
  });
}

export async function updateResaleValues(
  database: Database,
  adminId: string,
  collectionId: number,
  values: Record<Rarity, number>,
): Promise<void> {
  await database.transaction(async (tx) => {
    const before = await getResaleValues(tx, collectionId);
    if (RARITIES.every((rarity) => before[rarity] === values[rarity])) throw new RulesError('unchanged');
    await tx
      .insert(resaleValues)
      .values(RARITIES.map((rarity) => ({ collectionId, rarity, coins: values[rarity] })))
      .onConflictDoUpdate({
        target: [resaleValues.collectionId, resaleValues.rarity],
        set: { coins: sql.raw('excluded."coins"') },
      });
    await audit(tx, adminId, 'resale.update', collectionId, { from: before, to: values });
  });
}

/** The trade and auction rules, switches included: off, they stop new offers, sales and bids at once. */
export async function updateMarketRules(
  database: Database,
  adminId: string,
  collectionId: number,
  rules: MarketRules,
): Promise<void> {
  await database.transaction(async (tx) => {
    await tx.execute(sql`SELECT 1 FROM ${marketRules} WHERE ${marketRules.collectionId} = ${collectionId} FOR UPDATE`);
    const before = await getMarketRules(tx, collectionId);
    // The durations are a list: compared by value
    const same = (key: keyof MarketRules) => JSON.stringify(before[key]) === JSON.stringify(rules[key]);
    if ((Object.keys(rules) as (keyof MarketRules)[]).every(same)) throw new RulesError('unchanged');
    await tx
      .update(marketRules)
      .set({ ...rules, updatedAt: sql`now()` })
      .where(eq(marketRules.collectionId, collectionId));
    await audit(tx, adminId, 'market.update', collectionId, { from: before, to: rules });
  });
}

/** An auction's price range by rarity. Running auctions keep their prices; new bids stay under the new ceiling. */
export async function updateMarketPrices(
  database: Database,
  adminId: string,
  collectionId: number,
  prices: Record<Rarity, PriceRange>,
): Promise<void> {
  if (RARITIES.some((rarity) => prices[rarity].min > prices[rarity].max)) throw new RulesError('pricesOrder');
  await database.transaction(async (tx) => {
    const before = await getMarketPrices(tx, collectionId);
    if (JSON.stringify(before) === JSON.stringify(prices)) throw new RulesError('unchanged');
    await tx
      .insert(marketPrices)
      .values(RARITIES.map((rarity) => ({ collectionId, rarity, minPrice: prices[rarity].min, maxPrice: prices[rarity].max })))
      .onConflictDoUpdate({
        target: [marketPrices.collectionId, marketPrices.rarity],
        set: { minPrice: sql.raw('excluded."min_price"'), maxPrice: sql.raw('excluded."max_price"') },
      });
    await audit(tx, adminId, 'prices.update', collectionId, { from: before, to: prices });
  });
}

/**
 * Publishes a new set of odds, valid from `validFrom` (now or later: a draw
 * already made always keeps the odds it was made with). Every rarity with a
 * chance to come out needs visible cards.
 */
export async function publishOdds(
  database: Database,
  adminId: string,
  collectionId: number,
  odds: OddsSet,
  validFrom: Date,
  now: Date,
): Promise<void> {
  if (!validOdds(odds)) throw new RulesError('oddsSum');
  // A minute's grace for the time the form took to send
  if (validFrom.getTime() < now.getTime() - 60_000) throw new RulesError('oddsInPast');
  const visible = await visibleCardsByRarity(collectionId);
  if (RARITIES.some((rarity) => odds[rarity] > 0 && visible[rarity] === 0)) throw new RulesError('oddsNoCards');
  const from = validFrom < now ? now : validFrom;
  await database.transaction(async (tx) => {
    await tx.insert(rarityOdds).values(RARITIES.map((rarity) => ({ collectionId, rarity, perMillion: odds[rarity], validFrom: from })));
    await audit(tx, adminId, 'odds.publish', collectionId, { validFrom: from.toISOString(), odds });
  });
}

const seller = alias(users, 'seller');
const leader = alias(users, 'leader');
const proposer = alias(users, 'proposer');
const recipient = alias(users, 'recipient');

/** A side of a trade as one line: "château de chambord ×2, pont du gard". */
const tradeSide = (side: 'proposer' | 'recipient') => sql<string>`(
  SELECT string_agg(c.name || CASE WHEN ti.quantity > 1 THEN ' ×' || ti.quantity ELSE '' END, ', ' ORDER BY c.name)
  FROM trade_items AS ti JOIN cards AS c ON c.id = ti.card_id
  WHERE ti.trade_id = ${trades.id} AND ti.side = ${side}
)`;

/**
 * The latest auctions and trades, all states, for the back-office: to spot
 * accounts passing cards or coins to each other. With `userId`, only those the
 * player took part in (sold, led, bid, proposed or received).
 */
export async function listMarketActivity({ userId, limit = 100 }: { userId?: string | null; limit?: number }) {
  const now = new Date();
  const [auctionRows, tradeRows] = await Promise.all([
    db
      .select({
        id: auctions.id,
        card: cards.name,
        cardId: auctions.cardId,
        seller: seller.name,
        leader: leader.name,
        sellerId: auctions.sellerId,
        leaderId: auctions.leaderId,
        price: auctions.currentPrice,
        bidCount: auctions.bidCount,
        status: auctions.status,
        createdAt: auctions.createdAt,
        endsAt: auctions.endsAt,
      })
      .from(auctions)
      .innerJoin(cards, eq(cards.id, auctions.cardId))
      .leftJoin(seller, eq(seller.id, auctions.sellerId))
      .leftJoin(leader, eq(leader.id, auctions.leaderId))
      .where(
        userId
          ? or(
              eq(auctions.sellerId, userId),
              eq(auctions.leaderId, userId),
              sql`EXISTS (SELECT 1 FROM bids AS b WHERE b.auction_id = ${auctions.id} AND b.bidder_id = ${userId})`,
            )
          : undefined,
      )
      .orderBy(desc(auctions.createdAt), desc(auctions.id))
      .limit(limit),
    db
      .select({
        id: trades.id,
        proposer: proposer.name,
        recipient: recipient.name,
        proposerId: trades.proposerId,
        recipientId: trades.recipientId,
        gives: tradeSide('proposer'),
        gets: tradeSide('recipient'),
        status: trades.status,
        createdAt: trades.createdAt,
        expiresAt: trades.expiresAt,
      })
      .from(trades)
      .leftJoin(proposer, eq(proposer.id, trades.proposerId))
      .leftJoin(recipient, eq(recipient.id, trades.recipientId))
      .where(userId ? or(eq(trades.proposerId, userId), eq(trades.recipientId, userId)) : undefined)
      .orderBy(desc(trades.createdAt), desc(trades.id))
      .limit(limit),
  ]);
  return {
    auctions: auctionRows.map((row) => ({ ...row, state: auctionState(row, now) })),
    trades: tradeRows.map((row) => ({ ...row, state: tradeState(row, now) })),
  };
}
