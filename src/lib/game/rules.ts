import { and, asc, count, desc, eq, isNull, lte, max, sql } from 'drizzle-orm';
import { cache } from 'react';
import { type Database, db, type Transaction } from '@/db';
import { cards, collections, gameRules, marketPrices, marketRules, rarityOdds, resaleValues } from '@/db/schema';
import { themeEmblem } from '@/lib/collection-theme';
import { RARITIES, type Rarity } from '@/lib/rarity';
import type { OddsSet } from './draw';

// The tunable rules of a collection, read from the database on every use.

type Executor = Database | Transaction;

export type GameRules = Omit<typeof gameRules.$inferSelect, 'collectionId' | 'updatedAt'>;

/**
 * An active collection by its slug (the [collection] segment of the game's
 * URLs) with the emblem of its theme, or null. Cached for the request: the
 * header and the page both ask.
 */
export const getActiveCollection = cache(async (slug: string) => {
  const [collection] = await db
    .select({ id: collections.id, slug: collections.slug, name: collections.name, theme: collections.theme })
    .from(collections)
    .where(and(eq(collections.slug, slug), eq(collections.active, true)));
  if (!collection) return null;
  const { theme, ...rest } = collection;
  return { ...rest, emblem: themeEmblem(theme) };
});

export async function getGameRules(executor: Executor, collectionId: number): Promise<GameRules> {
  const [rules] = await executor
    .select({
      cardsPerPack: gameRules.cardsPerPack,
      signupPacks: gameRules.signupPacks,
      refillMinutes: gameRules.refillMinutes,
      maxReserve: gameRules.maxReserve,
    })
    .from(gameRules)
    .where(eq(gameRules.collectionId, collectionId));
  if (!rules) throw new Error(`No game rules for collection ${collectionId}`);
  return rules;
}

export type MarketRules = Omit<typeof marketRules.$inferSelect, 'collectionId' | 'updatedAt'>;

/** The trade and auction rules of a collection, with its two switches. */
export async function getMarketRules(executor: Executor, collectionId: number): Promise<MarketRules> {
  const [rules] = await executor
    .select({
      tradesEnabled: marketRules.tradesEnabled,
      auctionsEnabled: marketRules.auctionsEnabled,
      tradeExpiryHours: marketRules.tradeExpiryHours,
      tradeMaxCards: marketRules.tradeMaxCards,
      auctionDurationsHours: marketRules.auctionDurationsHours,
      auctionFeePercent: marketRules.auctionFeePercent,
      bidIncrementPercent: marketRules.bidIncrementPercent,
      auctionExtensionMinutes: marketRules.auctionExtensionMinutes,
      maxActiveAuctions: marketRules.maxActiveAuctions,
    })
    .from(marketRules)
    .where(eq(marketRules.collectionId, collectionId));
  if (!rules) throw new Error(`No market rules for collection ${collectionId}`);
  return rules;
}

export type PriceRange = { min: number; max: number };

/** An auction's price range, by rarity. */
export async function getMarketPrices(executor: Executor, collectionId: number): Promise<Record<Rarity, PriceRange>> {
  const rows = await executor.select().from(marketPrices).where(eq(marketPrices.collectionId, collectionId));
  const prices = Object.fromEntries(RARITIES.map((rarity) => [rarity, { min: 0, max: 0 }])) as Record<Rarity, PriceRange>;
  for (const row of rows) prices[row.rarity] = { min: row.minPrice, max: row.maxPrice };
  return prices;
}

/** Coins for one resold duplicate, by rarity (0 when not set). */
export async function getResaleValues(executor: Executor, collectionId: number): Promise<Record<Rarity, number>> {
  const rows = await executor.select().from(resaleValues).where(eq(resaleValues.collectionId, collectionId));
  const values = Object.fromEntries(RARITIES.map((rarity) => [rarity, 0])) as Record<Rarity, number>;
  for (const row of rows) values[row.rarity] = row.coins;
  return values;
}

/** Visible cards of each rarity: what a pack can draw from. */
export async function visibleCardsByRarity(collectionId: number): Promise<Record<Rarity, number>> {
  const rows = await db
    .select({ rarity: cards.rarity, total: count() })
    .from(cards)
    .where(and(eq(cards.collectionId, collectionId), isNull(cards.hiddenReason)))
    .groupBy(cards.rarity);
  const totals = Object.fromEntries(RARITIES.map((rarity) => [rarity, 0])) as Record<Rarity, number>;
  for (const row of rows) totals[row.rarity] = row.total;
  return totals;
}

export interface DatedOdds {
  validFrom: Date;
  odds: OddsSet;
}

function groupOdds(rows: { rarity: Rarity; perMillion: number; validFrom: Date }[]): DatedOdds[] {
  const sets = new Map<number, DatedOdds>();
  for (const row of rows) {
    const key = row.validFrom.getTime();
    let set = sets.get(key);
    if (!set) {
      set = { validFrom: row.validFrom, odds: Object.fromEntries(RARITIES.map((r) => [r, 0])) as OddsSet };
      sets.set(key, set);
    }
    set.odds[row.rarity] = row.perMillion;
  }
  return [...sets.values()];
}

/** The odds in force at `now`: the latest set already valid. */
export async function currentOdds(executor: Executor, collectionId: number, now: Date): Promise<DatedOdds | null> {
  // Compared in SQL: valid_from can hold microseconds, which a JavaScript date would round off
  const latest = executor
    .select({ validFrom: max(rarityOdds.validFrom) })
    .from(rarityOdds)
    .where(and(eq(rarityOdds.collectionId, collectionId), lte(rarityOdds.validFrom, now)));
  const rows = await executor
    .select({ rarity: rarityOdds.rarity, perMillion: rarityOdds.perMillion, validFrom: rarityOdds.validFrom })
    .from(rarityOdds)
    .where(and(eq(rarityOdds.collectionId, collectionId), eq(rarityOdds.validFrom, sql`(${latest})`)));
  return groupOdds(rows)[0] ?? null;
}

/** Every set of odds ever published, newest first, including those not valid yet. */
export async function oddsHistory(collectionId: number): Promise<DatedOdds[]> {
  const rows = await db
    .select({ rarity: rarityOdds.rarity, perMillion: rarityOdds.perMillion, validFrom: rarityOdds.validFrom })
    .from(rarityOdds)
    .where(eq(rarityOdds.collectionId, collectionId))
    .orderBy(desc(rarityOdds.validFrom), asc(rarityOdds.id));
  return groupOdds(rows);
}
