import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { cards, coinLedger, friendships, notifications, packCards, userCards, users, wishlistItems } from '@/db/schema';
import { testCard } from '@/lib/catalog/testing';
import { cancelAuction, createAuction, placeBid } from './auctions';
import { listCollectionCards, toCollectionCards } from './collection';
import { GameError } from './game-error';
import { auctionsOfCards, listMarket, wishesOnSale } from './market';
import { openPack, playerOpenings } from './packs';
import { createTestCollection, createTestPlayer, deleteTestData, type TestCollection } from './testing';
import { acceptTrade, proposeTrade, tradeableCards } from './trades';
import {
  addWish,
  isWished,
  listWishlist,
  playerWishlist,
  removeWish,
  WISHED_AUCTION_NOTICE_HOURS,
  wishCount,
  wishesViewerOwns,
  WISHLIST_MAX,
} from './wishlist';

// Commons Q1 to Q4 (a pack draws Q1 five times with the first card each
// time), hidden Q5, rare Q6. A second collection holds WISHLIST_MAX + 1 cards.
const t0 = new Date('2026-11-22T12:00:00Z');
const at = (hours: number) => new Date(t0.getTime() + hours * 60 * 60_000);
const ODDS = { legendary: 0, ultra: 0, super: 0, rare: 0, uncommon: 0, common: 1_000_000 };

let collection: TestCollection;
let large: TestCollection;
const players: string[] = [];
const ids = new Map<string, number>();
const largeIds: number[] = [];

beforeAll(async () => {
  collection = await createTestCollection(
    [
      testCard(1),
      testCard(2),
      testCard(3),
      testCard(4),
      testCard(5, { memorial: true, hidden_reason: 'memorial' }),
      testCard(6, { rarity: 'rare' }),
    ],
    { odds: ODDS },
  );
  for (const row of await db.select({ id: cards.id, wikidataId: cards.wikidataId }).from(cards).where(eq(cards.collectionId, collection.id))) {
    ids.set(row.wikidataId, row.id);
  }
  large = await createTestCollection(
    Array.from({ length: WISHLIST_MAX + 1 }, (_, index) => testCard(1000 + index)),
    { odds: ODDS },
  );
  const rows = await db.select({ id: cards.id }).from(cards).where(eq(cards.collectionId, large.id)).orderBy(cards.id);
  largeIds.push(...rows.map((row) => row.id));
});

afterAll(async () => {
  await deleteTestData([collection.id, large.id], players);
});

const card = (q: string) => ids.get(q)!;

/** A player with these cards (Wikidata ID to copies) and coins. */
async function newPlayer(copies: Record<string, number> = {}, coins = 0) {
  const id = await createTestPlayer();
  players.push(id);
  const owned = Object.entries(copies);
  if (owned.length) {
    await db.insert(userCards).values(
      owned.map(([q, quantity]) => ({ userId: id, collectionId: collection.id, cardId: card(q), quantity, firstObtainedAt: t0 })),
    );
  }
  if (coins) {
    await db
      .insert(coinLedger)
      .values({ userId: id, collectionId: collection.id, amount: coins, reason: 'achievement', reference: randomUUID(), createdAt: t0 });
  }
  return id;
}

const wish = (userId: string, q: string, now = t0) => addWish(db, { userId, collectionId: collection.id, cardId: card(q), now });

async function wishes(userId: string) {
  const rows = await db.select({ cardId: wishlistItems.cardId }).from(wishlistItems).where(eq(wishlistItems.userId, userId));
  return rows.map((row) => [...ids].find(([, id]) => id === row.cardId)?.[0]).sort();
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GameError) return error.code;
    throw error;
  }
  return null;
}

const sell = (seller: string, q: string, options: { buyout?: number; now?: Date } = {}) =>
  createAuction(db, {
    userId: seller,
    collectionId: collection.id,
    cardId: card(q),
    startPrice: 10,
    buyoutPrice: options.buyout ?? null,
    durationHours: 24,
    idempotencyKey: randomUUID(),
    now: options.now ?? t0,
  });

async function wishedNotices(userId: string) {
  return db
    .select({ data: notifications.data })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.kind, 'auction_wished')));
}

async function friends(a: string, b: string) {
  await db.insert(friendships).values({ requesterId: a, addresseeId: b, status: 'accepted', acceptedAt: t0 });
}

describe('wishlist', () => {
  it('adds a card the player lacks once, and takes it off', async () => {
    const player = await newPlayer();
    await wish(player, 'Q2');
    await wish(player, 'Q2');
    expect(await wishes(player)).toEqual(['Q2']);
    expect(await isWished(player, card('Q2'))).toBe(true);
    expect(await wishCount(db, player, collection.id)).toBe(1);
    await removeWish(db, { userId: player, cardId: card('Q2') });
    await removeWish(db, { userId: player, cardId: card('Q2') });
    expect(await wishes(player)).toEqual([]);
  });

  it('refuses a card the player owns, a hidden card and a card of another collection', async () => {
    const player = await newPlayer({ Q1: 1 });
    expect(await rejection(wish(player, 'Q1'))).toBe('wishOwned');
    expect(await rejection(wish(player, 'Q5'))).toBe('wishUnavailable');
    expect(
      await rejection(addWish(db, { userId: player, collectionId: large.id, cardId: card('Q2'), now: t0 })),
    ).toBe('wishUnavailable');
    expect(await wishes(player)).toEqual([]);
  });

  it(`holds ${WISHLIST_MAX} cards a collection at most`, async () => {
    const player = await newPlayer();
    const add = (cardId: number) => addWish(db, { userId: player, collectionId: large.id, cardId, now: t0 });
    // Two at once can't both take the last place
    await Promise.all(largeIds.slice(0, WISHLIST_MAX - 1).map(add));
    const last = await Promise.allSettled([add(largeIds[WISHLIST_MAX - 1]), add(largeIds[WISHLIST_MAX])]);
    expect(last.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(await wishCount(db, player, large.id)).toBe(WISHLIST_MAX);
    // A card already on the list stays, without error
    await add(largeIds[0]);
    // Another collection has its own room
    await wish(player, 'Q2');
    expect(await wishCount(db, player, collection.id)).toBe(1);
  });

  it('takes the cards of a pack off the wishlist and marks them in the opening', async () => {
    const player = await newPlayer();
    await wish(player, 'Q1');
    await wish(player, 'Q2');
    const { openingId } = await openPack(db, {
      userId: player,
      collectionId: collection.id,
      idempotencyKey: randomUUID(),
      now: t0,
      random: () => 0,
    });
    expect(await wishes(player)).toEqual(['Q2']);
    const rows = await db
      .select({ isNew: packCards.isNew, wished: packCards.wished })
      .from(packCards)
      .where(eq(packCards.openingId, openingId))
      .orderBy(packCards.position);
    // Q1 five times: wished and new the first time only
    expect(rows.map((row) => row.wished)).toEqual([true, false, false, false, false]);
    expect((await playerOpenings(player))[0].cards[0]).toMatchObject({ isNew: true, wished: true });
  });

  it('takes a card bought at auction off the buyer\'s wishlist', async () => {
    const seller = await newPlayer({ Q3: 1 });
    const buyer = await newPlayer({}, 100);
    await wish(buyer, 'Q3');
    const { auctionId } = await sell(seller, 'Q3', { buyout: 20 });
    await placeBid(db, { userId: buyer, collectionId: collection.id, auctionId, maxAmount: 20, idempotencyKey: randomUUID(), now: at(1) });
    expect(await wishes(buyer)).toEqual([]);
  });

  it('takes the cards of an accepted trade off both wishlists', async () => {
    const [a, b] = [await newPlayer({ Q1: 1 }), await newPlayer({ Q2: 1 })];
    await friends(a, b);
    await wish(a, 'Q2');
    await wish(b, 'Q1');
    await wish(b, 'Q3');
    const { tradeId } = await proposeTrade(db, {
      userId: a,
      recipientId: b,
      collectionId: collection.id,
      gives: [{ cardId: card('Q1'), quantity: 1 }],
      wants: [{ cardId: card('Q2'), quantity: 1 }],
      idempotencyKey: randomUUID(),
      now: t0,
    });
    await acceptTrade(db, { userId: b, tradeId, now: at(1) });
    expect(await wishes(a)).toEqual([]);
    expect(await wishes(b)).toEqual(['Q3']);
  });
});

describe('auctions of wished cards', () => {
  it('tells the players who wish for the card, once a day at most', async () => {
    const seller = await newPlayer({ Q4: 2 });
    const [wisher, banned, owner, other] = [await newPlayer(), await newPlayer(), await newPlayer(), await newPlayer()];
    await wish(wisher, 'Q4');
    await wish(banned, 'Q4');
    await wish(owner, 'Q4');
    await wish(other, 'Q2');
    await db.update(users).set({ bannedAt: t0 }).where(eq(users.id, banned));
    // Obtained since, without the wish being taken off (a race): no notice either
    await db.insert(userCards).values({ userId: owner, collectionId: collection.id, cardId: card('Q4'), quantity: 1, firstObtainedAt: t0 });

    const first = await sell(seller, 'Q4');
    expect(await wishedNotices(wisher)).toEqual([{ data: { auctionId: first.auctionId, cardId: card('Q4') } }]);
    for (const player of [banned, owner, other, seller]) expect(await wishedNotices(player)).toEqual([]);

    // Withdrawn and put up again, or a second copy: no second notice the same day
    await cancelAuction(db, { userId: seller, collectionId: collection.id, auctionId: first.auctionId, now: at(1) });
    await sell(seller, 'Q4', { now: at(2) });
    expect(await wishedNotices(wisher)).toHaveLength(1);

    const later = await sell(seller, 'Q4', { now: at(WISHED_AUCTION_NOTICE_HOURS + 1) });
    expect((await wishedNotices(wisher)).map((row) => row.data)).toContainEqual({ auctionId: later.auctionId, cardId: card('Q4') });
  });

  it('counts the wished cards on sale and filters the market on them', async () => {
    const seller = await newPlayer({ Q2: 1, Q3: 1 });
    const player = await newPlayer({ Q6: 1 });
    await wish(player, 'Q2');
    const { auctionId } = await sell(seller, 'Q2');
    await sell(seller, 'Q3');
    // The player's own sale isn't one to buy
    await sell(player, 'Q6');

    expect(await wishesOnSale(player, collection.id, at(1))).toBe(1);
    const sales = await auctionsOfCards([card('Q2'), card('Q3'), card('Q6')], player, at(1));
    expect(sales.get(card('Q2'))).toEqual({ count: 1, lowestPrice: 10 });
    expect(sales.has(card('Q6'))).toBe(false);
    const market = await listMarket({
      collectionId: collection.id,
      viewerId: player,
      wished: true,
      sort: 'ending',
      pages: 1,
      now: at(1),
    });
    expect(market.auctions.map((auction) => auction.id)).toEqual([auctionId]);
  });
});

describe('reading wishlists', () => {
  it("lists the player's wishes with the friends who own them, without hidden or owned cards", async () => {
    const player = await newPlayer();
    const [friend, stranger] = [await newPlayer({ Q2: 3, Q3: 1 }), await newPlayer({ Q2: 1 })];
    await friends(player, friend);
    await wish(player, 'Q2', t0);
    await wish(player, 'Q3', at(1));
    await wish(player, 'Q4', at(2));
    // Hidden since, and obtained without the wish being taken off: both left out
    await db.insert(wishlistItems).values({ userId: player, collectionId: collection.id, cardId: card('Q5'), createdAt: at(3) });
    await db.insert(userCards).values({ userId: player, collectionId: collection.id, cardId: card('Q4'), quantity: 1, firstObtainedAt: t0 });

    const list = await listWishlist(player, collection.id);
    expect(list.map((entry) => [entry.name, entry.friends])).toEqual([
      ['monument 3', [await pseudo(friend)]],
      ['monument 2', [await pseudo(friend)]],
    ]);
    expect(await wishCount(db, player, collection.id)).toBe(2);
    expect(await wishesViewerOwns(player, friend, collection.id)).toBe(2);
    expect(await wishesViewerOwns(player, stranger, collection.id)).toBe(1);
    expect((await playerWishlist(player)).map((row) => row.card)).toEqual(['Q2', 'Q3', 'Q4', 'Q5']);
  });

  it('puts the cards the other side wishes for first in the trade composer', async () => {
    const [player, friend] = [await newPlayer({ Q1: 1, Q2: 1, Q6: 1 }), await newPlayer({ Q3: 1, Q4: 1 })];
    await wish(friend, 'Q2');
    await wish(player, 'Q4');
    const mine = await tradeableCards(player, collection.id, t0, undefined, friend);
    expect(mine.map((row) => [row.name, row.wished])).toEqual([
      ['monument 2', true],
      // Then the rarest first, as before
      ['monument 6', false],
      ['monument 1', false],
    ]);
    const theirs = await tradeableCards(friend, collection.id, t0, player, player);
    expect(theirs[0]).toMatchObject({ name: 'monument 4', wished: true });
  });

  it('shows the heart on the cards the player looking lacks', async () => {
    const [player, friend] = [await newPlayer({ Q1: 1 }), await newPlayer({ Q1: 1, Q2: 1 })];
    await wish(player, 'Q2');
    await wish(player, 'Q3');
    const labels = { publicDomain: 'domaine public', unknownLicense: 'licence inconnue' };
    const hearts = async (rows: Awaited<ReturnType<typeof listCollectionCards>>) =>
      Object.fromEntries((await toCollectionCards(rows, collection.slug, labels)).map((row) => [row.data.name, row.wish]));

    // Their own collection: on the cards they lack
    expect(await hearts(await listCollectionCards({ userId: player, collectionId: collection.id, tab: 'all', pages: 1 }))).toMatchObject({
      'monument 1': null,
      'monument 2': true,
      'monument 3': true,
      'monument 4': false,
    });
    // A friend's: on the friend's cards the player lacks, by the player's wishlist
    expect(
      await hearts(await listCollectionCards({ userId: friend, viewerId: player, collectionId: collection.id, tab: 'owned', pages: 1 })),
    ).toEqual({ 'monument 1': null, 'monument 2': true });
  });
});

async function pseudo(userId: string) {
  const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  return row.name;
}
