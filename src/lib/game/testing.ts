import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  achievements,
  auctions,
  cards,
  collections,
  gameRules,
  marketPrices,
  marketRules,
  notifications,
  rarityOdds,
  resaleValues,
  series,
  trades,
  users,
} from '@/db/schema';
import type { CatalogCard } from '@/lib/catalog/export-format';
import { importCatalog } from '@/lib/catalog/import';
import { testCatalog } from '@/lib/catalog/testing';
import { RARITIES } from '@/lib/rarity';
import type { OddsSet } from './draw';
import type { GameRules, MarketRules } from './rules';

// Throwaway collections and players for the game's database tests.

export const ODDS_IN_THE_PAST = new Date('2026-01-01T00:00:00Z');

export const TEST_RESALE = { legendary: 500, ultra: 100, super: 50, rare: 10, uncommon: 5, common: 2 } as const;

export interface TestCollection {
  id: number;
  slug: string;
}

export async function createTestCollection(
  list: CatalogCard[],
  { rules = {}, market = {}, odds }: { rules?: Partial<GameRules>; market?: Partial<MarketRules>; odds: OddsSet },
): Promise<TestCollection> {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const [{ id }] = await db
    .insert(collections)
    .values({ slug, name: 'Test', active: true })
    .returning({ id: collections.id });
  await importCatalog(db, testCatalog(list, slug));
  await db.insert(gameRules).values({ collectionId: id, ...rules });
  await db.insert(resaleValues).values(RARITIES.map((rarity) => ({ collectionId: id, rarity, coins: TEST_RESALE[rarity] })));
  await db.insert(marketRules).values({ collectionId: id, ...market });
  // Auction prices from the resale value to 100 times it, like the seed
  await db.insert(marketPrices).values(
    RARITIES.map((rarity) => ({ collectionId: id, rarity, minPrice: TEST_RESALE[rarity], maxPrice: TEST_RESALE[rarity] * 100 })),
  );
  await db
    .insert(rarityOdds)
    .values(RARITIES.map((rarity) => ({ collectionId: id, rarity, perMillion: odds[rarity], validFrom: ODDS_IN_THE_PAST })));
  await db.insert(achievements).values([
    { collectionId: id, code: 'packs-1', kind: 'packs_opened', threshold: 1, rewardCoins: 5, position: 1 },
    { collectionId: id, code: 'packs-3', kind: 'packs_opened', threshold: 3, rewardCoins: 20, position: 2 },
  ]);
  return { id, slug };
}

export async function createTestPlayer(): Promise<string> {
  const tag = randomUUID().slice(0, 12);
  const [{ id }] = await db
    .insert(users)
    .values({ name: `joueur-${tag}`, email: `${tag}@example.test`, emailVerified: true, birthDate: '1990-01-01' })
    .returning({ id: users.id });
  return id;
}

/** Deletes the players (their game rows go with them), then the collections. */
export async function deleteTestData(collectionIds: number[], userIds: string[]) {
  if (userIds.length > 0) await db.delete(users).where(inArray(users.id, userIds));
  if (collectionIds.length === 0) return;
  // Kept, with their players set null, for the other player's history
  await db.delete(trades).where(inArray(trades.collectionId, collectionIds));
  await db.delete(auctions).where(inArray(auctions.collectionId, collectionIds));
  await db.delete(notifications).where(inArray(notifications.collectionId, collectionIds));
  await db.delete(marketPrices).where(inArray(marketPrices.collectionId, collectionIds));
  await db.delete(marketRules).where(inArray(marketRules.collectionId, collectionIds));
  await db.delete(achievements).where(inArray(achievements.collectionId, collectionIds));
  await db.delete(rarityOdds).where(inArray(rarityOdds.collectionId, collectionIds));
  await db.delete(resaleValues).where(inArray(resaleValues.collectionId, collectionIds));
  await db.delete(gameRules).where(inArray(gameRules.collectionId, collectionIds));
  await db.delete(cards).where(inArray(cards.collectionId, collectionIds));
  await db.delete(series).where(inArray(series.collectionId, collectionIds));
  await db.delete(collections).where(inArray(collections.id, collectionIds));
}
