import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, not, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { type Database, db, type Transaction } from '@/db';
import { cards, tradeItems, trades, userCards, users } from '@/db/schema';
import { notify } from '@/lib/notifications/notifications';
import { areFriends } from '@/lib/social/friends';
import { type AwardedAchievement, awardAchievements } from './achievements';
import { GameError } from './game-error';
import { openTrade, reservedCopies } from './holds';
import { getMarketRules } from './rules';
import { lockCopies, moveCard, ownerKey } from './transfer';

// Trades between friends: cards for cards, free, any card (even the last
// copy). The proposer's cards are reserved until the answer; the recipient's
// are checked again when they accept. An offer expires after the collection's
// trade_expiry_hours (48 by default): past that it counts as expired, and the
// worker's market-settle job marks it and tells the proposer.

type Executor = Database | Transaction;

/** Open offers a player may have sent at once: anti-abuse, not a game rule. */
export const MAX_OPEN_TRADES = 10;

export type TradeSide = (typeof tradeItems.$inferSelect)['side'];

export interface TradeCard {
  cardId: number;
  quantity: number;
}

/** The same card twice on a side counts once, with the copies added up. */
function merge(list: TradeCard[]): TradeCard[] {
  const copies = new Map<number, number>();
  for (const { cardId, quantity } of list) {
    if (!Number.isInteger(quantity) || quantity < 1) throw new GameError('tradeEmpty');
    copies.set(cardId, (copies.get(cardId) ?? 0) + quantity);
  }
  return [...copies].map(([cardId, quantity]) => ({ cardId, quantity }));
}

const total = (list: TradeCard[]) => list.reduce((sum, card) => sum + card.quantity, 0);

/** Every card visible and of the collection: hidden cards never change hands. */
async function checkCards(executor: Executor, collectionId: number, cardIds: number[]) {
  const found = await executor
    .select({ id: cards.id })
    .from(cards)
    .where(and(inArray(cards.id, cardIds), eq(cards.collectionId, collectionId), isNull(cards.hiddenReason)));
  if (found.length !== new Set(cardIds).size) throw new GameError('tradeUnavailable');
}

/** Whether the player can spare these copies: owned, less the ones promised elsewhere. */
async function canSpare(
  executor: Executor,
  input: { userId: string; list: TradeCard[]; owned: (cardId: number) => number; now: Date; exceptTrade?: number },
) {
  const reserved = await reservedCopies(
    executor,
    input.userId,
    input.now,
    input.list.map((card) => card.cardId),
    { exceptTrade: input.exceptTrade },
  );
  return input.list.every((card) => input.owned(card.cardId) - (reserved.get(card.cardId) ?? 0) >= card.quantity);
}

/**
 * Offers a trade to a friend: `gives` the proposer's cards, `wants` the
 * friend's. The proposer's cards are reserved at once. The same form sent
 * twice (same key) creates one offer.
 */
export async function proposeTrade(
  database: Database,
  input: {
    userId: string;
    recipientId: string;
    collectionId: number;
    gives: TradeCard[];
    wants: TradeCard[];
    idempotencyKey: string;
    now: Date;
  },
): Promise<{ tradeId: number; repeated: boolean }> {
  const { userId, recipientId, collectionId, idempotencyKey, now } = input;
  const gives = merge(input.gives);
  const wants = merge(input.wants);
  return database.transaction(async (tx) => {
    const rules = await getMarketRules(tx, collectionId);
    if (!rules.tradesEnabled) throw new GameError('tradesClosed');
    if (gives.length === 0 || wants.length === 0) throw new GameError('tradeEmpty');
    if (total(gives) > rules.tradeMaxCards || total(wants) > rules.tradeMaxCards) throw new GameError('tradeTooBig');
    if (recipientId === userId || !(await areFriends(tx, userId, recipientId))) throw new GameError('notFriends');

    // The proposer's copies first: a second request with the same key waits here
    const mine = await lockCopies(tx, gives.map(({ cardId }) => ({ userId, cardId })));
    const [previous] = await tx
      .select({ id: trades.id })
      .from(trades)
      .where(and(eq(trades.proposerId, userId), eq(trades.idempotencyKey, idempotencyKey)));
    if (previous) return { tradeId: previous.id, repeated: true };

    await checkCards(tx, collectionId, [...gives, ...wants].map((card) => card.cardId));
    const owned = (player: string, copies: Map<string, number>) => (cardId: number) =>
      copies.get(ownerKey({ userId: player, cardId })) ?? 0;
    if (!(await canSpare(tx, { userId, list: gives, owned: owned(userId, mine), now }))) {
      throw new GameError('tradeUnavailable');
    }
    // The friend's cards aren't reserved: they have promised nothing yet
    const theirs = await tx
      .select({ cardId: userCards.cardId, quantity: userCards.quantity })
      .from(userCards)
      .where(and(eq(userCards.userId, recipientId), inArray(userCards.cardId, wants.map((card) => card.cardId))));
    const theirCopies = new Map(theirs.map((row) => [ownerKey({ userId: recipientId, cardId: row.cardId }), row.quantity]));
    if (!(await canSpare(tx, { userId: recipientId, list: wants, owned: owned(recipientId, theirCopies), now }))) {
      throw new GameError('tradeUnavailable');
    }

    const [{ open }] = (
      await tx.execute<{ open: number }>(sql`
        SELECT count(*)::int AS open FROM trades AS t WHERE t.proposer_id = ${userId} AND ${openTrade(now)}`)
    ).rows;
    if (open >= MAX_OPEN_TRADES) throw new GameError('tooManyOffers');

    const [trade] = await tx
      .insert(trades)
      .values({
        collectionId,
        proposerId: userId,
        recipientId,
        idempotencyKey,
        createdAt: now,
        expiresAt: new Date(now.getTime() + rules.tradeExpiryHours * 60 * 60 * 1000),
      })
      .returning({ id: trades.id });
    await tx.insert(tradeItems).values([
      ...gives.map((card) => ({ tradeId: trade.id, side: 'proposer' as const, ...card })),
      ...wants.map((card) => ({ tradeId: trade.id, side: 'recipient' as const, ...card })),
    ]);
    await notify(tx, { userId: recipientId, kind: 'trade_received', collectionId, data: { userId, tradeId: trade.id }, now });
    return { tradeId: trade.id, repeated: false };
  });
}

/** The offer, locked, if it is still open and `userId` is the side that answers it. */
async function lockOpenTrade(tx: Transaction, input: { tradeId: number; userId: string; as: 'proposer' | 'recipient'; now: Date }) {
  const [trade] = await tx
    .select()
    .from(trades)
    .where(
      and(
        eq(trades.id, input.tradeId),
        eq(input.as === 'proposer' ? trades.proposerId : trades.recipientId, input.userId),
      ),
    )
    .for('update');
  if (!trade) throw new GameError('tradeOver');
  const open = trade.status === 'pending' && trade.expiresAt > input.now && trade.proposerId && trade.recipientId;
  if (!open) throw new GameError('tradeOver');
  return { ...trade, proposerId: trade.proposerId!, recipientId: trade.recipientId! };
}

/**
 * The recipient accepts: both sides' cards change hands in one transaction,
 * if both players can still spare them. Otherwise the offer stays open.
 */
export async function acceptTrade(
  database: Database,
  input: { userId: string; tradeId: number; now: Date },
): Promise<{ achievements: AwardedAchievement[] }> {
  const { now } = input;
  return database.transaction(async (tx) => {
    const trade = await lockOpenTrade(tx, { tradeId: input.tradeId, userId: input.userId, as: 'recipient', now });
    const { proposerId, recipientId, collectionId } = trade;
    if (!(await getMarketRules(tx, collectionId)).tradesEnabled) throw new GameError('tradesClosed');
    if (!(await areFriends(tx, proposerId, recipientId))) throw new GameError('notFriends');

    const items = await tx
      .select({ side: tradeItems.side, cardId: tradeItems.cardId, quantity: tradeItems.quantity })
      .from(tradeItems)
      .where(eq(tradeItems.tradeId, trade.id));
    const gives = items.filter((item) => item.side === 'proposer');
    const wants = items.filter((item) => item.side === 'recipient');
    // Both players' rows for every card of the offer: the ones that give, and the ones that grow
    const allCards = items.map((item) => item.cardId);
    const copies = await lockCopies(tx, [
      ...allCards.map((cardId) => ({ userId: proposerId, cardId })),
      ...allCards.map((cardId) => ({ userId: recipientId, cardId })),
    ]);
    await checkCards(tx, collectionId, allCards);
    const owned = (player: string) => (cardId: number) => copies.get(ownerKey({ userId: player, cardId })) ?? 0;
    const spare =
      (await canSpare(tx, { userId: proposerId, list: gives, owned: owned(proposerId), now, exceptTrade: trade.id })) &&
      (await canSpare(tx, { userId: recipientId, list: wants, owned: owned(recipientId), now }));
    if (!spare) throw new GameError('tradeUnavailable');

    for (const card of gives) await moveCard(tx, { from: proposerId, to: recipientId, ...card, collectionId, now });
    for (const card of wants) await moveCard(tx, { from: recipientId, to: proposerId, ...card, collectionId, now });
    await tx.update(trades).set({ status: 'accepted', respondedAt: now }).where(eq(trades.id, trade.id));

    // Each player received cards: the achievements count them now
    const achievements = await awardAchievements(tx, recipientId, collectionId, now);
    await awardAchievements(tx, proposerId, collectionId, now);
    await notify(tx, { userId: proposerId, kind: 'trade_accepted', collectionId, data: { userId: recipientId, tradeId: trade.id }, now });
    return { achievements };
  });
}

/** The recipient refuses; the proposer is told. */
export async function declineTrade(database: Database, input: { userId: string; tradeId: number; now: Date }) {
  await database.transaction(async (tx) => {
    const trade = await lockOpenTrade(tx, { ...input, as: 'recipient' });
    await tx.update(trades).set({ status: 'declined', respondedAt: input.now }).where(eq(trades.id, trade.id));
    await notify(tx, {
      userId: trade.proposerId,
      kind: 'trade_declined',
      collectionId: trade.collectionId,
      data: { userId: trade.recipientId, tradeId: trade.id },
      now: input.now,
    });
  });
}

/** The proposer withdraws the offer. */
export async function cancelTrade(database: Database, input: { userId: string; tradeId: number; now: Date }) {
  await database.transaction(async (tx) => {
    const trade = await lockOpenTrade(tx, { ...input, as: 'proposer' });
    await tx.update(trades).set({ status: 'cancelled', respondedAt: input.now }).where(eq(trades.id, trade.id));
  });
}

/**
 * Marks the offers past their expiry and tells their proposers (the worker's
 * market-settle job). They already counted as expired: this only records it.
 */
export async function expireTrades(database: Database, now: Date, limit = 500): Promise<number> {
  return database.transaction(async (tx) => {
    const expired = await tx.execute<{ id: number; proposer_id: string | null; recipient_id: string | null; collection_id: number }>(sql`
      UPDATE trades SET status = 'expired', responded_at = expires_at
      WHERE id IN (
        SELECT id FROM trades
        WHERE status = 'pending' AND expires_at <= ${now} AND proposer_id IS NOT NULL AND recipient_id IS NOT NULL
        ORDER BY expires_at LIMIT ${limit} FOR UPDATE SKIP LOCKED
      )
      RETURNING id, proposer_id, recipient_id, collection_id`);
    for (const trade of expired.rows) {
      await notify(tx, {
        userId: trade.proposer_id!,
        kind: 'trade_expired',
        collectionId: trade.collection_id,
        data: { userId: trade.recipient_id!, tradeId: trade.id },
        now,
      });
    }
    return expired.rows.length;
  });
}

/**
 * Marks as cancelled the pending offers a deleted player was part of. They
 * already count as cancelled (their player is set null): this records it.
 */
export async function cancelOrphanTrades(executor: Executor, now: Date): Promise<number> {
  const cancelled = await executor
    .update(trades)
    .set({ status: 'cancelled', respondedAt: now })
    .where(and(eq(trades.status, 'pending'), or(isNull(trades.proposerId), isNull(trades.recipientId))))
    .returning({ id: trades.id });
  return cancelled.length;
}

export type TradeState = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';

/** The offer's state as players see it: pending past its expiry is expired, an offer with a player gone is cancelled. */
export function tradeState(
  trade: { status: TradeState; expiresAt: Date; proposerId: string | null; recipientId: string | null },
  now: Date,
): TradeState {
  if (trade.status !== 'pending') return trade.status;
  if (!trade.proposerId || !trade.recipientId) return 'cancelled';
  return trade.expiresAt > now ? 'pending' : 'expired';
}

const proposer = alias(users, 'proposer');
const recipient = alias(users, 'recipient');

/** holds.ts's openTrade, for the query builder. */
const isOpen = (now: Date) =>
  and(eq(trades.status, 'pending'), gt(trades.expiresAt, now), isNotNull(trades.proposerId), isNotNull(trades.recipientId));

const tradeColumns = {
  id: trades.id,
  status: trades.status,
  proposerId: trades.proposerId,
  recipientId: trades.recipientId,
  proposerPseudo: proposer.name,
  recipientPseudo: recipient.name,
  createdAt: trades.createdAt,
  expiresAt: trades.expiresAt,
  respondedAt: trades.respondedAt,
};

export interface TradeItem {
  side: TradeSide;
  cardId: number;
  quantity: number;
  name: string;
  slug: string;
  rarity: (typeof cards.$inferSelect)['rarity'];
}

async function itemsOf(tradeIds: number[]): Promise<Map<number, TradeItem[]>> {
  if (tradeIds.length === 0) return new Map();
  const rows = await db
    .select({
      tradeId: tradeItems.tradeId,
      side: tradeItems.side,
      cardId: tradeItems.cardId,
      quantity: tradeItems.quantity,
      name: cards.name,
      slug: cards.slug,
      rarity: cards.rarity,
    })
    .from(tradeItems)
    .innerJoin(cards, eq(cards.id, tradeItems.cardId))
    .where(inArray(tradeItems.tradeId, tradeIds))
    .orderBy(asc(cards.rarity), asc(cards.rank));
  const byTrade = new Map<number, TradeItem[]>();
  for (const { tradeId, ...item } of rows) byTrade.set(tradeId, [...(byTrade.get(tradeId) ?? []), item]);
  return byTrade;
}

/** An offer seen by one of its players: what they give, what they get, with whom. */
export interface TradeView {
  id: number;
  state: TradeState;
  /** The player is the one who proposed it. */
  mine: boolean;
  /** The other player's pseudo; null once their account is deleted. */
  other: string | null;
  gives: TradeItem[];
  gets: TradeItem[];
  createdAt: Date;
  expiresAt: Date;
  respondedAt: Date | null;
}

function toView(
  userId: string,
  row: Awaited<ReturnType<typeof selectTrades>>[number],
  items: TradeItem[],
  now: Date,
): TradeView {
  const mine = row.proposerId === userId;
  const mySide: TradeSide = mine ? 'proposer' : 'recipient';
  return {
    id: row.id,
    state: tradeState(row, now),
    mine,
    other: mine ? row.recipientPseudo : row.proposerPseudo,
    gives: items.filter((item) => item.side === mySide),
    gets: items.filter((item) => item.side !== mySide),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    respondedAt: row.respondedAt,
  };
}

function selectTrades() {
  return db
    .select(tradeColumns)
    .from(trades)
    .leftJoin(proposer, eq(proposer.id, trades.proposerId))
    .leftJoin(recipient, eq(recipient.id, trades.recipientId));
}

export const TRADE_HISTORY_SIZE = 30;

/** The player's offers in a collection: open ones received and sent, then the latest closed ones. */
export async function listTrades(userId: string, collectionId: number, now: Date) {
  const involved = and(eq(trades.collectionId, collectionId), or(eq(trades.proposerId, userId), eq(trades.recipientId, userId)));
  const [open, closed] = await Promise.all([
    selectTrades()
      .where(and(involved, isOpen(now)))
      .orderBy(asc(trades.expiresAt)),
    selectTrades()
      .where(and(involved, not(isOpen(now)!)))
      .orderBy(desc(sql`coalesce(${trades.respondedAt}, ${trades.expiresAt})`), desc(trades.id))
      .limit(TRADE_HISTORY_SIZE),
  ]);
  const items = await itemsOf([...open, ...closed].map((row) => row.id));
  const views = (rows: typeof open) => rows.map((row) => toView(userId, row, items.get(row.id) ?? [], now));
  const openViews = views(open);
  return {
    received: openViews.filter((trade) => !trade.mine),
    sent: openViews.filter((trade) => trade.mine),
    history: views(closed),
  };
}

/** One offer of the collection, if the player is one of its two sides. */
export async function getTrade(userId: string, collectionId: number, tradeId: number, now: Date): Promise<TradeView | null> {
  const [row] = await selectTrades().where(
    and(
      eq(trades.id, tradeId),
      eq(trades.collectionId, collectionId),
      or(eq(trades.proposerId, userId), eq(trades.recipientId, userId)),
    ),
  );
  if (!row) return null;
  return toView(userId, row, (await itemsOf([row.id])).get(row.id) ?? [], now);
}

/** Offers waiting for the player's answer, for the friends page and the game's home. */
export async function receivedOffers(userId: string, collectionId: number, now: Date): Promise<number> {
  const result = await db.execute<{ open: number }>(sql`
    SELECT count(*)::int AS open FROM trades AS t
    WHERE t.recipient_id = ${userId} AND t.collection_id = ${collectionId} AND ${openTrade(now)}`);
  return result.rows[0].open;
}

export interface TradeableCard {
  id: number;
  name: string;
  rarity: TradeItem['rarity'];
  region: string | null;
  /** Copies the owner can still promise: owned, less the reserved ones. */
  available: number;
  /** Owned copies, reserved ones included. */
  quantity: number;
  /** Whether the viewer already owns the card (the friend's side). */
  viewerOwns: boolean;
}

/**
 * The visible cards a player can put in an offer, rarest first, with the
 * copies they can still promise. With `viewerId`, whether the viewer owns each.
 */
export async function tradeableCards(
  ownerId: string,
  collectionId: number,
  now: Date,
  viewerId?: string,
): Promise<TradeableCard[]> {
  const viewerOwns = viewerId
    ? sql<boolean>`EXISTS (SELECT 1 FROM user_cards AS mine WHERE mine.card_id = ${cards.id} AND mine.user_id = ${viewerId})`
    : sql<boolean>`false`;
  const [rows, reserved] = await Promise.all([
    db
      .select({
        id: cards.id,
        name: cards.name,
        rarity: cards.rarity,
        region: cards.region,
        quantity: userCards.quantity,
        viewerOwns,
      })
      .from(userCards)
      .innerJoin(cards, eq(cards.id, userCards.cardId))
      .where(and(eq(userCards.userId, ownerId), eq(userCards.collectionId, collectionId), isNull(cards.hiddenReason)))
      .orderBy(asc(cards.rarity), asc(cards.rank)),
    reservedCopies(db, ownerId, now),
  ]);
  return rows
    .map((row) => ({ ...row, available: row.quantity - (reserved.get(row.id) ?? 0) }))
    .filter((row) => row.available > 0);
}

/** The player's trades, for the account export. */
export async function playerTrades(userId: string) {
  const rows = await selectTrades()
    .where(or(eq(trades.proposerId, userId), eq(trades.recipientId, userId)))
    .orderBy(asc(trades.createdAt));
  const items = await itemsOf(rows.map((row) => row.id));
  const now = new Date();
  return rows.map((row) => {
    const view = toView(userId, row, items.get(row.id) ?? [], now);
    const card = (item: TradeItem) => ({ name: item.name, quantity: item.quantity });
    return {
      proposedByMe: view.mine,
      with: view.other,
      state: view.state,
      gave: view.gives.map(card),
      got: view.gets.map(card),
      createdAt: view.createdAt,
      respondedAt: view.respondedAt,
    };
  });
}

