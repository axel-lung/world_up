import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { auctions, cards, coinLedger, notifications, userCards, users } from '@/db/schema';
import { testCard } from '@/lib/catalog/testing';
import {
  cancelAuction,
  cancelOrphanAuctions,
  createAuction,
  placeBid,
  settleAuction,
} from './auctions';
import { availableCoins, coinBalance } from './coins';
import { GameError } from './game-error';
import { getAuction, listMarket } from './market';
import { createTestCollection, createTestPlayer, deleteTestData, type TestCollection } from './testing';

// Commons sell from 2 to 200 coins in the test collection, rares from 10 to
// 1,000; the default rules: 5 % steps and fee, 5 minutes of extension.
const t0 = new Date('2026-10-23T12:00:00Z');
const at = (hours: number) => new Date(t0.getTime() + hours * 60 * 60_000);

let collection: TestCollection;
const players: string[] = [];
const ids = new Map<string, number>();

beforeAll(async () => {
  collection = await createTestCollection(
    [testCard(1), testCard(2), testCard(3), testCard(4), testCard(5, { rarity: 'rare' })],
    { odds: { legendary: 0, ultra: 0, super: 0, rare: 0, uncommon: 0, common: 1_000_000 } },
  );
  const rows = await db.select({ id: cards.id, wikidataId: cards.wikidataId }).from(cards).where(eq(cards.collectionId, collection.id));
  for (const row of rows) ids.set(row.wikidataId, row.id);
});

afterAll(async () => {
  await deleteTestData([collection.id], players);
});

/** A player with these cards (Wikidata ID to copies) and coins. */
async function newPlayer(copies: Record<string, number> = {}, coins = 0) {
  const id = await createTestPlayer();
  players.push(id);
  const owned = Object.entries(copies);
  if (owned.length) {
    await db.insert(userCards).values(
      owned.map(([q, quantity]) => ({ userId: id, collectionId: collection.id, cardId: ids.get(q)!, quantity, firstObtainedAt: t0 })),
    );
  }
  if (coins) {
    await db
      .insert(coinLedger)
      .values({ userId: id, collectionId: collection.id, amount: coins, reason: 'achievement', reference: randomUUID(), createdAt: t0 });
  }
  return id;
}

const sell = (
  seller: string,
  card: string,
  options: { start?: number; buyout?: number | null; hours?: number; key?: string; now?: Date } = {},
) =>
  createAuction(db, {
    userId: seller,
    collectionId: collection.id,
    cardId: ids.get(card)!,
    startPrice: options.start ?? 10,
    buyoutPrice: options.buyout ?? null,
    durationHours: options.hours ?? 24,
    idempotencyKey: options.key ?? randomUUID(),
    now: options.now ?? t0,
  });

const bid = (bidder: string, auctionId: number, maxAmount: number, options: { now?: Date; key?: string } = {}) =>
  placeBid(db, {
    userId: bidder,
    collectionId: collection.id,
    auctionId,
    maxAmount,
    idempotencyKey: options.key ?? randomUUID(),
    now: options.now ?? at(1),
  });

async function auction(id: number) {
  const [row] = await db.select().from(auctions).where(eq(auctions.id, id));
  return row;
}

async function copies(userId: string) {
  const rows = await db
    .select({ wikidataId: cards.wikidataId, quantity: userCards.quantity })
    .from(userCards)
    .innerJoin(cards, eq(cards.id, userCards.cardId))
    .where(eq(userCards.userId, userId));
  return Object.fromEntries(rows.map((row) => [row.wikidataId, row.quantity]));
}

const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error) => (error instanceof GameError ? error.code : error),
  );

async function kinds(userId: string) {
  const rows = await db.select({ kind: notifications.kind }).from(notifications).where(eq(notifications.userId, userId));
  return rows.map((row) => row.kind).sort();
}

describe('an auction', () => {
  it('goes to the highest maximum, at the second one plus a step, less the fee for the seller', async () => {
    const seller = await newPlayer({ Q1: 1 });
    const [anna, bruno] = [await newPlayer({}, 100), await newPlayer({}, 100)];
    const { auctionId } = await sell(seller, 'Q1', { start: 10 });

    expect(await bid(anna, auctionId, 50)).toEqual({ result: 'leading', repeated: false });
    expect(await bid(bruno, auctionId, 30)).toMatchObject({ result: 'outbid' });
    expect(await auction(auctionId)).toMatchObject({ leaderId: anna, currentPrice: 32, bidCount: 2 });
    expect(await bid(bruno, auctionId, 60)).toMatchObject({ result: 'leading' });
    expect(await auction(auctionId)).toMatchObject({ leaderId: bruno, leaderMax: 60, currentPrice: 53 });
    expect(await kinds(anna)).toEqual(['auction_outbid']);
    // Bruno's maximum is held, Anna's coins are free again
    expect(await availableCoins(db, bruno)).toBe(40);
    expect(await availableCoins(db, anna)).toBe(100);
    // Nobody but the leader sees their maximum
    expect((await getAuction(collection.id, auctionId, anna, at(2)))?.viewerMax).toBeNull();
    expect((await getAuction(collection.id, auctionId, bruno, at(2)))?.viewerMax).toBe(60);

    // No settlement before the end
    expect(await settleAuction(db, auctionId, at(23))).toBeNull();
    expect(await settleAuction(db, auctionId, at(24))).toBe('sold');
    expect(await coinBalance(db, bruno)).toBe(47);
    // 53 less a fee of 5 %, rounded up: 3
    expect(await coinBalance(db, seller)).toBe(50);
    expect(await copies(seller)).toEqual({});
    expect(await copies(bruno)).toEqual({ Q1: 1 });
    expect(await kinds(bruno)).toEqual(['auction_won']);
    expect(await kinds(seller)).toEqual(['auction_sold']);

    // Settled once
    expect(await settleAuction(db, auctionId, at(25))).toBeNull();
    const entries = await db.select().from(coinLedger).where(eq(coinLedger.reference, String(auctionId)));
    expect(entries.map((entry) => entry.amount).sort((a, b) => a - b)).toEqual([-53, 50]);
    expect(await rejection(bid(anna, auctionId, 90, { now: at(25) }))).toBe('auctionOver');
  });

  it('holds the leading maximums: no bid beyond the coins still available', async () => {
    const [seller, other] = [await newPlayer({ Q1: 1, Q2: 1 }), await newPlayer({}, 500)];
    const anna = await newPlayer({}, 100);
    const { auctionId: x } = await sell(seller, 'Q1');
    const { auctionId: y } = await sell(seller, 'Q2');
    await bid(anna, x, 60);
    expect(await rejection(bid(anna, y, 50))).toBe('bidOverCoins');
    await bid(anna, y, 40);
    // Raising counts the current maximum as available, not the other auction's
    expect(await rejection(bid(anna, x, 61))).toBe('bidOverCoins');
    // Outbid on y: those coins are free again
    await bid(other, y, 150);
    expect(await bid(anna, x, 100)).toMatchObject({ result: 'raised' });
    expect(await auction(x)).toMatchObject({ leaderMax: 100, currentPrice: 10 });
  });

  it('never lets two bids at once spend the same coins', async () => {
    const seller = await newPlayer({ Q1: 1, Q2: 1 });
    const anna = await newPlayer({}, 100);
    const [{ auctionId: x }, { auctionId: y }] = [await sell(seller, 'Q1'), await sell(seller, 'Q2')];
    const results = await Promise.all([rejection(bid(anna, x, 80)), rejection(bid(anna, y, 80))]);
    expect(results.sort()).toEqual(['bidOverCoins', null].sort());
    expect(await availableCoins(db, anna)).toBe(20);
  });

  it('is refused on one’s own sale, below the minimum and above the rarity’s ceiling', async () => {
    const seller = await newPlayer({ Q1: 1 }, 1000);
    const anna = await newPlayer({}, 1000);
    const { auctionId } = await sell(seller, 'Q1', { start: 10 });
    expect(await rejection(bid(seller, auctionId, 20))).toBe('ownAuction');
    expect(await rejection(bid(anna, auctionId, 9))).toBe('bidTooLow');
    expect(await rejection(bid(anna, auctionId, 201))).toBe('bidTooHigh');
  });

  it('is pushed back by a bid in its last minutes', async () => {
    const seller = await newPlayer({ Q1: 1 });
    const anna = await newPlayer({}, 100);
    const { auctionId } = await sell(seller, 'Q1');
    const late = new Date(at(24).getTime() - 2 * 60_000);
    await bid(anna, auctionId, 20, { now: late });
    expect((await auction(auctionId)).endsAt).toEqual(new Date(late.getTime() + 5 * 60_000));
    expect(await settleAuction(db, auctionId, at(24))).toBeNull();
  });

  it('sells at once at the buyout price', async () => {
    const seller = await newPlayer({ Q5: 2 });
    const [anna, bruno] = [await newPlayer({}, 100), await newPlayer({}, 100)];
    const { auctionId } = await sell(seller, 'Q5', { start: 10, buyout: 40 });
    await bid(anna, auctionId, 20);
    expect(await bid(bruno, auctionId, 90)).toMatchObject({ result: 'bought' });
    expect(await auction(auctionId)).toMatchObject({ status: 'sold', leaderId: bruno, currentPrice: 40 });
    expect(await coinBalance(db, bruno)).toBe(60);
    expect(await coinBalance(db, seller)).toBe(38);
    expect(await copies(seller)).toEqual({ Q5: 1 });
    expect(await copies(bruno)).toEqual({ Q5: 1 });
    expect(await kinds(anna)).toEqual(['auction_outbid']);
    expect(await kinds(bruno)).toEqual(['auction_won']);
  });

  it('reserves the copy on sale: it can’t be put up twice', async () => {
    const seller = await newPlayer({ Q1: 1 });
    await sell(seller, 'Q1');
    expect(await rejection(sell(seller, 'Q1'))).toBe('auctionUnavailable');
  });

  it('checks the prices and the duration', async () => {
    const seller = await newPlayer({ Q1: 1 });
    expect(await rejection(sell(seller, 'Q1', { start: 1 }))).toBe('auctionPrice');
    expect(await rejection(sell(seller, 'Q1', { start: 201 }))).toBe('auctionPrice');
    expect(await rejection(sell(seller, 'Q1', { start: 20, buyout: 19 }))).toBe('auctionPrice');
    expect(await rejection(sell(seller, 'Q1', { hours: 12 }))).toBe('auctionDuration');
  });

  it('is created once, and bid on once, for a form sent twice', async () => {
    const seller = await newPlayer({ Q1: 1 });
    const anna = await newPlayer({}, 100);
    const key = randomUUID();
    const created = await Promise.all([sell(seller, 'Q1', { key }), sell(seller, 'Q1', { key })]);
    expect(created[0].auctionId).toBe(created[1].auctionId);
    const bidKey = randomUUID();
    await Promise.all([bid(anna, created[0].auctionId, 30, { key: bidKey }), bid(anna, created[0].auctionId, 30, { key: bidKey })]);
    expect(await auction(created[0].auctionId)).toMatchObject({ bidCount: 1, leaderId: anna });
  });

  it('can be withdrawn by its seller until someone bids', async () => {
    const seller = await newPlayer({ Q1: 1, Q2: 1 });
    const anna = await newPlayer({}, 100);
    const { auctionId: free } = await sell(seller, 'Q1');
    await cancelAuction(db, { userId: seller, collectionId: collection.id, auctionId: free, now: at(1) });
    expect(await auction(free)).toMatchObject({ status: 'cancelled' });
    // The card can go up for sale again
    await sell(seller, 'Q1', { now: at(1) });

    const { auctionId } = await sell(seller, 'Q2');
    await bid(anna, auctionId, 20);
    expect(await rejection(cancelAuction(db, { userId: seller, collectionId: collection.id, auctionId, now: at(2) }))).toBe(
      'auctionHasBids',
    );
    expect(await rejection(cancelAuction(db, { userId: anna, collectionId: collection.id, auctionId, now: at(2) }))).toBe(
      'auctionOver',
    );
  });

  it('ends unsold without a bid, the card staying with its seller', async () => {
    const seller = await newPlayer({ Q1: 1 });
    const { auctionId } = await sell(seller, 'Q1');
    expect(await settleAuction(db, auctionId, at(24))).toBe('unsold');
    expect(await auction(auctionId)).toMatchObject({ status: 'unsold' });
    expect(await copies(seller)).toEqual({ Q1: 1 });
    expect(await kinds(seller)).toEqual(['auction_unsold']);
  });

  it('is cancelled when its card is hidden meanwhile, and the leader pays nothing', async () => {
    const seller = await newPlayer({ Q3: 1 });
    const anna = await newPlayer({}, 100);
    const { auctionId } = await sell(seller, 'Q3');
    await bid(anna, auctionId, 30);
    await db.update(cards).set({ hiddenReason: 'admin' }).where(eq(cards.id, ids.get('Q3')!));
    try {
      expect(await rejection(bid(await newPlayer({}, 100), auctionId, 50))).toBe('auctionOver');
      expect(await settleAuction(db, auctionId, at(24))).toBe('cancelled');
      expect(await coinBalance(db, anna)).toBe(100);
      expect(await copies(seller)).toEqual({ Q3: 1 });
      expect(await kinds(anna)).toEqual(['auction_cancelled']);
    } finally {
      await db.update(cards).set({ hiddenReason: null }).where(eq(cards.id, ids.get('Q3')!));
    }
  });

  it('is cancelled when its leader’s account is deleted, the seller keeping the card and told', async () => {
    const seller = await newPlayer({ Q1: 1 });
    const anna = await newPlayer({}, 100);
    const { auctionId } = await sell(seller, 'Q1');
    await bid(anna, auctionId, 30);
    await db.delete(users).where(eq(users.id, anna));
    expect((await getAuction(collection.id, auctionId, seller, at(2)))?.state).toBe('cancelled');
    expect(await cancelOrphanAuctions(db, at(2))).toBeGreaterThanOrEqual(1);
    expect(await auction(auctionId)).toMatchObject({ status: 'cancelled' });
    expect(await copies(seller)).toEqual({ Q1: 1 });
    expect(await kinds(seller)).toEqual(['auction_cancelled']);
  });

  it('shows in the market while it runs, with the viewer’s part', async () => {
    const seller = await newPlayer({ Q4: 1 });
    const anna = await newPlayer({}, 100);
    const { auctionId } = await sell(seller, 'Q4');
    await bid(anna, auctionId, 30);
    const market = (viewerId: string, now = at(2)) =>
      listMarket({ collectionId: collection.id, viewerId, cardId: ids.get('Q4')!, sort: 'ending', page: 1, now });
    expect((await market(anna)).auctions.map((a) => [a.id, a.viewer])).toEqual([[auctionId, 'leading']]);
    expect((await market(seller)).auctions[0].viewer).toBe('seller');
    // Missing only: Anna doesn't own Q4, the seller does
    const missing = (viewerId: string) =>
      listMarket({ collectionId: collection.id, viewerId, cardId: ids.get('Q4')!, missing: true, sort: 'ending', page: 1, now: at(2) });
    expect((await missing(anna)).total).toBe(1);
    expect((await missing(seller)).total).toBe(0);
    expect((await market(anna, at(24))).total).toBe(0);
  });
});
