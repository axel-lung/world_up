import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { cards, series, userCards } from '@/db/schema';
import { testCard } from '@/lib/catalog/testing';
import { type CollectionTab, collectionCounts, ownedByRarity, ownedNeighbours } from './collection';
import { distinctCards, playerRank } from './leaderboard';
import { createTestCollection, createTestPlayer, deleteTestData, type TestCollection } from './testing';

// Commons Q1, Q2, Q4 and rare Q3 in the Centre-Val de Loire series (and in
// Loir-et-Cher), Q5 hidden there, common Q6 in another series, in Paris
const CARDS = [
  testCard(1),
  testCard(2),
  testCard(3, { rarity: 'rare' }),
  testCard(4),
  testCard(5, { memorial: true, hidden_reason: 'memorial' }),
  testCard(6, { series: ['chateaux-forteresses'], department_code: '75', department: 'Paris', region: 'Île-de-France' }),
];
const ODDS = { legendary: 0, ultra: 0, super: 0, rare: 500_000, uncommon: 0, common: 500_000 };

let collection: TestCollection;
const players: string[] = [];
let player: string;
let other: string;

async function give(userId: string, owned: Record<string, number>) {
  const rows = await db.select({ id: cards.id, wikidataId: cards.wikidataId }).from(cards).where(eq(cards.collectionId, collection.id));
  await db.insert(userCards).values(
    Object.entries(owned).map(([wikidataId, quantity]) => ({
      userId,
      collectionId: collection.id,
      cardId: rows.find((row) => row.wikidataId === wikidataId)!.id,
      quantity,
      firstObtainedAt: new Date(),
    })),
  );
}

async function cardId(wikidataId: string) {
  const [row] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.collectionId, collection.id), eq(cards.wikidataId, wikidataId)));
  return row.id;
}

beforeAll(async () => {
  collection = await createTestCollection(CARDS, { odds: ODDS });
  player = await createTestPlayer();
  other = await createTestPlayer();
  players.push(player, other);
  // Not Q4; the hidden Q5 owned from before it was hidden
  await give(player, { Q1: 1, Q2: 2, Q3: 1, Q5: 1, Q6: 1 });
  await give(other, { Q1: 3 });
});

afterAll(async () => {
  await deleteTestData([collection.id], players);
});

const around = async (
  wikidataId: string,
  filters: { tab?: CollectionTab; rarity?: 'rare' | null; seriesId?: number | null; departmentCode?: string | null } = {},
) =>
  ownedNeighbours({ userId: player, collectionId: collection.id, tab: 'owned', ...filters }, await cardId(wikidataId));

describe('ownedNeighbours', () => {
  it("places a card among the player's visible cards, by rank, and loops at both ends", async () => {
    expect(await around('Q2')).toEqual({ position: 2, total: 4, previous: 'monument-1', next: 'monument-3' });
    expect(await around('Q1')).toEqual({ position: 1, total: 4, previous: 'monument-6', next: 'monument-2' });
    expect(await around('Q6')).toEqual({ position: 4, total: 4, previous: 'monument-3', next: 'monument-1' });
    // The whole collection's list goes through the owned cards only
    expect(await around('Q2', { tab: 'all' })).toEqual({ position: 2, total: 4, previous: 'monument-1', next: 'monument-3' });
  });

  it("follows the list's filters", async () => {
    expect(await around('Q2', { tab: 'duplicates' })).toEqual({ position: 1, total: 1, previous: 'monument-2', next: 'monument-2' });
    expect(await around('Q3', { rarity: 'rare' })).toEqual({ position: 1, total: 1, previous: 'monument-3', next: 'monument-3' });
    const [region] = await db
      .select({ id: series.id })
      .from(series)
      .where(and(eq(series.collectionId, collection.id), eq(series.name, 'Centre-Val de Loire')));
    expect(await around('Q3', { seriesId: region.id })).toEqual({ position: 3, total: 3, previous: 'monument-2', next: 'monument-1' });
    expect(await around('Q6', { departmentCode: '75' })).toEqual({ position: 1, total: 1, previous: 'monument-6', next: 'monument-6' });
  });

  it('has nothing for a card out of the list: not owned, hidden, or filtered out', async () => {
    expect(await around('Q4')).toBeNull();
    expect(await around('Q5')).toBeNull();
    expect(await around('Q1', { tab: 'duplicates' })).toBeNull();
    expect(await around('Q1', { tab: 'missing' })).toBeNull();
  });
});

describe('collectionCounts', () => {
  it("limits the cards to a department's, from the map", async () => {
    expect(await collectionCounts({ userId: player, collectionId: collection.id, departmentCode: '41' })).toMatchObject({
      all: 4,
      owned: 3,
      missing: 1,
    });
    expect(await collectionCounts({ userId: player, collectionId: collection.id, departmentCode: '75' })).toMatchObject({
      all: 1,
      owned: 1,
    });
  });
});

describe('ownedByRarity', () => {
  it('counts the visible cards owned of each rarity', async () => {
    expect(await ownedByRarity({ userId: player, collectionId: collection.id })).toEqual({
      legendary: 0,
      ultra: 0,
      super: 0,
      rare: 1,
      uncommon: 0,
      common: 3,
    });
  });
});

describe('playerRank and distinctCards', () => {
  it('ranks a player by visible cards, and has no rank before the first one', async () => {
    expect(await playerRank(collection.id, player)).toBe(1);
    expect(await playerRank(collection.id, other)).toBe(2);
    const newcomer = await createTestPlayer();
    players.push(newcomer);
    expect(await playerRank(collection.id, newcomer)).toBeNull();
  });

  it('counts the visible cards of each player asked for', async () => {
    const counts = await distinctCards(collection.id, [player, other]);
    expect(counts.get(player)).toBe(4);
    expect(counts.get(other)).toBe(1);
    expect(await distinctCards(collection.id, [])).toEqual(new Map());
  });
});
