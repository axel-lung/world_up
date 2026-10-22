import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { cards, friendships, marketRules, notifications, trades, userCards, users } from '@/db/schema';
import { testCard } from '@/lib/catalog/testing';
import { resellDuplicates } from './coins';
import { GameError } from './game-error';
import { reservedCopies } from './holds';
import { createTestCollection, createTestPlayer, deleteTestData, type TestCollection } from './testing';
import {
  acceptTrade,
  cancelOrphanTrades,
  cancelTrade,
  declineTrade,
  expireTrades,
  getTrade,
  listTrades,
  proposeTrade,
  type TradeCard,
  tradeableCards,
} from './trades';

const t0 = new Date('2026-10-22T12:00:00Z');
const at = (hours: number) => new Date(t0.getTime() + hours * 60 * 60_000);

let collection: TestCollection;
const players: string[] = [];
const ids = new Map<string, number>();

beforeAll(async () => {
  collection = await createTestCollection(
    [testCard(1), testCard(2), testCard(3), testCard(4), testCard(5, { rarity: 'rare' }), testCard(6, { hidden_reason: 'memorial', memorial: true })],
    { odds: { legendary: 0, ultra: 0, super: 0, rare: 0, uncommon: 0, common: 1_000_000 } },
  );
  const rows = await db.select({ id: cards.id, wikidataId: cards.wikidataId }).from(cards).where(eq(cards.collectionId, collection.id));
  for (const row of rows) ids.set(row.wikidataId, row.id);
});

afterAll(async () => {
  await deleteTestData([collection.id], players);
});

async function newPlayer(copies: Record<string, number> = {}) {
  const id = await createTestPlayer();
  players.push(id);
  const owned = Object.entries(copies);
  if (owned.length) {
    await db.insert(userCards).values(
      owned.map(([q, quantity]) => ({ userId: id, collectionId: collection.id, cardId: ids.get(q)!, quantity, firstObtainedAt: t0 })),
    );
  }
  return id;
}

async function friends(a: string, b: string) {
  await db.insert(friendships).values({ requesterId: a, addresseeId: b, status: 'accepted', acceptedAt: t0 });
}

/** Two friends with these cards. */
async function pair(mine: Record<string, number>, theirs: Record<string, number>) {
  const [a, b] = [await newPlayer(mine), await newPlayer(theirs)];
  await friends(a, b);
  return [a, b] as const;
}

const cardsOf = (list: Record<string, number>): TradeCard[] =>
  Object.entries(list).map(([q, quantity]) => ({ cardId: ids.get(q)!, quantity }));

const propose = (from: string, to: string, gives: Record<string, number>, wants: Record<string, number>, options: { now?: Date; key?: string } = {}) =>
  proposeTrade(db, {
    userId: from,
    recipientId: to,
    collectionId: collection.id,
    gives: cardsOf(gives),
    wants: cardsOf(wants),
    idempotencyKey: options.key ?? randomUUID(),
    now: options.now ?? t0,
  });

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

describe('a trade', () => {
  it('moves the cards both ways once accepted, a last copy included, and tells each player', async () => {
    const [a, b] = await pair({ Q1: 1, Q2: 3 }, { Q3: 2 });
    const { tradeId } = await propose(a, b, { Q1: 1, Q2: 2 }, { Q3: 1 });
    expect(await kinds(b)).toEqual(['trade_received']);
    expect((await listTrades(b, collection.id, at(1))).received.map((trade) => trade.id)).toEqual([tradeId]);

    await acceptTrade(db, { userId: b, tradeId, now: at(1) });
    expect(await copies(a)).toEqual({ Q2: 1, Q3: 1 });
    expect(await copies(b)).toEqual({ Q1: 1, Q2: 2, Q3: 1 });
    expect(await kinds(a)).toEqual(['trade_accepted']);
    expect(await getTrade(a, collection.id, tradeId, at(1))).toMatchObject({ state: 'accepted', mine: true });
    expect(await rejection(acceptTrade(db, { userId: b, tradeId, now: at(1) }))).toBe('tradeOver');
  });

  it('is created once for a form sent twice', async () => {
    const [a, b] = await pair({ Q1: 1 }, { Q3: 1 });
    const key = randomUUID();
    const results = await Promise.all([propose(a, b, { Q1: 1 }, { Q3: 1 }, { key }), propose(a, b, { Q1: 1 }, { Q3: 1 }, { key })]);
    expect(results[0].tradeId).toBe(results[1].tradeId);
    expect(results.map((r) => r.repeated).sort()).toEqual([false, true]);
  });

  it('reserves the cards offered until it expires', async () => {
    const [a, b] = await pair({ Q1: 2 }, { Q3: 1 });
    await propose(a, b, { Q1: 2 }, { Q3: 1 });
    expect(await reservedCopies(db, a, at(1))).toEqual(new Map([[ids.get('Q1')!, 2]]));
    expect(await rejection(propose(a, b, { Q1: 1 }, { Q3: 1 }, { now: at(1) }))).toBe('tradeUnavailable');
    const resell = (now: Date) => resellDuplicates(db, { userId: a, collectionId: collection.id, idempotencyKey: randomUUID(), now });
    expect(await rejection(resell(at(1)))).toBe('noDuplicate');
    expect(await tradeableCards(a, collection.id, at(1))).toEqual([]);
    // 48 hours later the offer is over: the copies are free again
    expect(await reservedCopies(db, a, at(48))).toEqual(new Map());
    expect(await resell(at(48))).toMatchObject({ copies: 1 });
  });

  it('refuses the impossible offers', async () => {
    const [a, b] = await pair({ Q1: 1, Q2: 6 }, { Q3: 1 });
    const stranger = await newPlayer({ Q4: 1 });
    expect(await rejection(propose(a, stranger, { Q1: 1 }, { Q4: 1 }))).toBe('notFriends');
    expect(await rejection(propose(a, b, { Q1: 1 }, {}))).toBe('tradeEmpty');
    expect(await rejection(propose(a, b, { Q2: 6 }, { Q3: 1 }))).toBe('tradeTooBig');
    expect(await rejection(propose(a, b, { Q1: 1 }, { Q4: 1 }))).toBe('tradeUnavailable');
    expect(await rejection(propose(a, b, { Q1: 2 }, { Q3: 1 }))).toBe('tradeUnavailable');
    await db.insert(userCards).values({ userId: a, collectionId: collection.id, cardId: ids.get('Q6')!, quantity: 1, firstObtainedAt: t0 });
    expect(await rejection(propose(a, b, { Q6: 1 }, { Q3: 1 }))).toBe('tradeUnavailable');
  });

  it('stays open when the recipient no longer has the cards asked for', async () => {
    const [a, b] = await pair({ Q1: 1 }, { Q3: 1 });
    const c = await newPlayer({ Q4: 1 });
    await friends(b, c);
    const { tradeId } = await propose(a, b, { Q1: 1 }, { Q3: 1 });
    // b gives Q3 away to c first
    const other = await propose(b, c, { Q3: 1 }, { Q4: 1 });
    await acceptTrade(db, { userId: c, tradeId: other.tradeId, now: t0 });
    expect(await rejection(acceptTrade(db, { userId: b, tradeId, now: at(1) }))).toBe('tradeUnavailable');
    expect(await getTrade(b, collection.id, tradeId, at(1))).toMatchObject({ state: 'pending' });
    expect(await copies(a)).toEqual({ Q1: 1 });
  });

  it('is answered only by the right player, once', async () => {
    const [a, b] = await pair({ Q1: 3 }, { Q3: 1 });
    const first = await propose(a, b, { Q1: 1 }, { Q3: 1 });
    expect(await rejection(acceptTrade(db, { userId: a, tradeId: first.tradeId, now: t0 }))).toBe('tradeOver');
    await declineTrade(db, { userId: b, tradeId: first.tradeId, now: t0 });
    expect(await kinds(a)).toEqual(['trade_declined']);
    expect(await rejection(cancelTrade(db, { userId: a, tradeId: first.tradeId, now: t0 }))).toBe('tradeOver');

    const second = await propose(a, b, { Q1: 1 }, { Q3: 1 });
    expect(await rejection(cancelTrade(db, { userId: b, tradeId: second.tradeId, now: t0 }))).toBe('tradeOver');
    await cancelTrade(db, { userId: a, tradeId: second.tradeId, now: t0 });
    expect(await getTrade(b, collection.id, second.tradeId, t0)).toMatchObject({ state: 'cancelled' });
    expect(await reservedCopies(db, a, t0)).toEqual(new Map());
  });

  it('expires after 48 hours, and the proposer is told', async () => {
    const [a, b] = await pair({ Q1: 1 }, { Q3: 1 });
    const { tradeId } = await propose(a, b, { Q1: 1 }, { Q3: 1 });
    expect(await getTrade(a, collection.id, tradeId, at(48))).toMatchObject({ state: 'expired' });
    expect(await rejection(acceptTrade(db, { userId: b, tradeId, now: at(48) }))).toBe('tradeOver');
    expect(await expireTrades(db, at(48))).toBeGreaterThanOrEqual(1);
    const [row] = await db.select({ status: trades.status }).from(trades).where(eq(trades.id, tradeId));
    expect(row.status).toBe('expired');
    expect(await kinds(a)).toEqual(['trade_expired']);
  });

  it('cannot be offered or accepted while trades are switched off', async () => {
    const [a, b] = await pair({ Q1: 1 }, { Q3: 1 });
    const { tradeId } = await propose(a, b, { Q1: 1 }, { Q3: 1 });
    await db.update(marketRules).set({ tradesEnabled: false }).where(eq(marketRules.collectionId, collection.id));
    try {
      expect(await rejection(propose(a, b, { Q1: 1 }, { Q3: 1 }))).toBe('tradesClosed');
      expect(await rejection(acceptTrade(db, { userId: b, tradeId, now: t0 }))).toBe('tradesClosed');
    } finally {
      await db.update(marketRules).set({ tradesEnabled: true }).where(eq(marketRules.collectionId, collection.id));
    }
  });

  it('never takes more copies than there are when an acceptance and a resale cross', async () => {
    const [a, b] = await pair({ Q1: 1 }, { Q3: 2 });
    const { tradeId } = await propose(a, b, { Q1: 1 }, { Q3: 2 });
    const outcomes = await Promise.all([
      rejection(acceptTrade(db, { userId: b, tradeId, now: t0 })),
      rejection(resellDuplicates(db, { userId: b, collectionId: collection.id, idempotencyKey: randomUUID(), now: t0 })),
    ]);
    // One of them goes through, the other finds the copies gone
    if (outcomes[0] === null) {
      expect(outcomes[1]).toBe('noDuplicate');
      expect(await copies(b)).toEqual({ Q1: 1 });
      expect(await copies(a)).toEqual({ Q3: 2 });
    } else {
      expect(outcomes).toEqual(['tradeUnavailable', null]);
      expect(await copies(b)).toEqual({ Q3: 1 });
      expect(await copies(a)).toEqual({ Q1: 1 });
    }
  });

  it('is cancelled once one of its players deletes the account, freeing the cards', async () => {
    const [a, b] = await pair({ Q1: 1 }, { Q3: 1 });
    const { tradeId } = await propose(a, b, { Q1: 1 }, { Q3: 1 });
    await db.delete(users).where(eq(users.id, b));
    expect(await reservedCopies(db, a, t0)).toEqual(new Map());
    expect(await getTrade(a, collection.id, tradeId, t0)).toMatchObject({ state: 'cancelled', other: null });
    expect(await cancelOrphanTrades(db, t0)).toBeGreaterThanOrEqual(1);
    const [row] = await db.select({ status: trades.status }).from(trades).where(and(eq(trades.id, tradeId)));
    expect(row.status).toBe('cancelled');
  });
});
