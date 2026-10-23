import { and, asc, count, eq, gt, isNotNull, isNull, lte, or } from 'drizzle-orm';
import type { Database, Transaction } from '@/db';
import { auctions, auditLog, bids, cards } from '@/db/schema';
import { notify } from '@/lib/notifications/notifications';
import { awardAchievements } from './achievements';
import { type BidOutcome, resolveBid } from './bidding';
import { addCoins, coinBalance, lockWallets } from './coins';
import { GameError } from './game-error';
import { heldCoins, reservedCopies } from './holds';
import { getMarketPrices, getMarketRules } from './rules';
import { lockCopies, moveCard, ownerKey } from './transfer';

// The auction house: any player sells a card for coins, any other bids on it
// (src/lib/game/bidding.ts has the mechanism). The card stays the seller's but
// is reserved until the end; a leader's maximum stays theirs but is held. An
// auction is over at ends_at, settled or not; it is settled when a page shows
// it, or by the worker's market-settle job within the minute. The buyer pays
// the price, the seller gets it less the fee, which is destroyed: otherwise
// coins only ever grow.
//
// Turning auctions off stops new sales and bids; the ones running still end
// and settle, so that no card or coin stays held.

type Executor = Database | Transaction;

type AuctionRow = typeof auctions.$inferSelect;

export type AuctionState = 'active' | 'ended' | 'sold' | 'unsold' | 'cancelled';

/**
 * The auction's state as players see it: active past its end is "ended" until
 * settled; one whose seller is gone, or whose leader is, is cancelled.
 */
export function auctionState(
  auction: Pick<AuctionRow, 'status' | 'endsAt' | 'sellerId' | 'leaderId' | 'bidCount'>,
  now: Date,
): AuctionState {
  if (auction.status !== 'active') return auction.status;
  if (!auction.sellerId || (!auction.leaderId && auction.bidCount > 0)) return 'cancelled';
  return auction.endsAt > now ? 'active' : 'ended';
}

/** auctionState() === 'active', for the query builder. */
export const isLive = (now: Date) =>
  and(
    eq(auctions.status, 'active'),
    gt(auctions.endsAt, now),
    isNotNull(auctions.sellerId),
    or(isNotNull(auctions.leaderId), eq(auctions.bidCount, 0)),
  );

/** Whole coins, within the rarity's range; a buyout price, if any, from the starting price up. */
export function validPrices(range: { min: number; max: number }, startPrice: number, buyoutPrice: number | null): boolean {
  const within = (price: number, min: number) => Number.isInteger(price) && price >= min && price <= range.max;
  return within(startPrice, range.min) && (buyoutPrice === null || within(buyoutPrice, startPrice));
}

/** What the seller keeps of a sale: the price less the fee, rounded up in the fee's favour. */
export function sellerShare(price: number, feePercent: number): { fee: number; share: number } {
  const fee = Math.ceil((price * feePercent) / 100);
  return { fee, share: price - fee };
}

/**
 * Puts one copy of a card up for auction. The copy is reserved at once: it
 * can't be resold, offered or sold twice. The same form sent twice (same key)
 * creates one auction.
 */
export async function createAuction(
  database: Database,
  input: {
    userId: string;
    collectionId: number;
    cardId: number;
    startPrice: number;
    buyoutPrice: number | null;
    durationHours: number;
    idempotencyKey: string;
    now: Date;
  },
): Promise<{ auctionId: number; repeated: boolean }> {
  const { userId, collectionId, cardId, startPrice, buyoutPrice, durationHours, idempotencyKey, now } = input;
  return database.transaction(async (tx) => {
    const rules = await getMarketRules(tx, collectionId);
    if (!rules.auctionsEnabled) throw new GameError('auctionsClosed');
    if (!rules.auctionDurationsHours.includes(durationHours)) throw new GameError('auctionDuration');

    // The seller's copies first: a second request with the same key waits here
    const copies = await lockCopies(tx, [{ userId, cardId }]);
    const [previous] = await tx
      .select({ id: auctions.id })
      .from(auctions)
      .where(and(eq(auctions.sellerId, userId), eq(auctions.idempotencyKey, idempotencyKey)));
    if (previous) return { auctionId: previous.id, repeated: true };

    const [card] = await tx
      .select({ rarity: cards.rarity })
      .from(cards)
      .where(and(eq(cards.id, cardId), eq(cards.collectionId, collectionId), isNull(cards.hiddenReason)));
    if (!card) throw new GameError('auctionUnavailable');
    const reserved = (await reservedCopies(tx, userId, now, [cardId])).get(cardId) ?? 0;
    if ((copies.get(ownerKey({ userId, cardId })) ?? 0) - reserved < 1) throw new GameError('auctionUnavailable');
    const range = (await getMarketPrices(tx, collectionId))[card.rarity];
    if (!validPrices(range, startPrice, buyoutPrice)) throw new GameError('auctionPrice');

    const [{ running }] = await tx
      .select({ running: count() })
      .from(auctions)
      .where(and(eq(auctions.sellerId, userId), eq(auctions.status, 'active'), gt(auctions.endsAt, now)));
    if (running >= rules.maxActiveAuctions) throw new GameError('tooManyAuctions');

    const [auction] = await tx
      .insert(auctions)
      .values({
        collectionId,
        sellerId: userId,
        cardId,
        startPrice,
        buyoutPrice,
        currentPrice: startPrice,
        idempotencyKey,
        createdAt: now,
        endsAt: new Date(now.getTime() + durationHours * 60 * 60 * 1000),
      })
      .returning({ id: auctions.id });
    return { auctionId: auction.id, repeated: false };
  });
}

/** The auction of the collection, locked: the first lock of any change to it. */
async function lockAuction(tx: Transaction, auctionId: number, collectionId?: number): Promise<AuctionRow | null> {
  const [auction] = await tx
    .select()
    .from(auctions)
    .where(and(eq(auctions.id, auctionId), collectionId === undefined ? undefined : eq(auctions.collectionId, collectionId)))
    .for('update');
  return auction ?? null;
}

async function close(tx: Transaction, auctionId: number, status: 'sold' | 'unsold' | 'cancelled', now: Date) {
  await tx.update(auctions).set({ status, settledAt: now }).where(eq(auctions.id, auctionId));
}

/** Tells the seller and the leader, those still there, that the auction is cancelled. */
async function notifyCancelled(executor: Executor, auction: Pick<AuctionRow, 'id' | 'collectionId' | 'cardId' | 'sellerId' | 'leaderId'>, now: Date) {
  for (const userId of [auction.sellerId, auction.leaderId]) {
    if (!userId) continue;
    await notify(executor, {
      userId,
      kind: 'auction_cancelled',
      collectionId: auction.collectionId,
      data: { auctionId: auction.id, cardId: auction.cardId },
      now,
    });
  }
}

/**
 * Settles an auction whose row is locked and whose state is final: sold to its
 * leader, unsold, or cancelled when its seller or leader is gone or its card
 * was hidden meanwhile. Lock order: the auction (held), the card's rows, then
 * the wallets.
 */
async function settleLocked(tx: Transaction, auction: AuctionRow, now: Date): Promise<'sold' | 'unsold' | 'cancelled'> {
  const { id, collectionId, cardId, sellerId, leaderId } = auction;
  const data = { auctionId: id, cardId };
  const [card] = await tx.select({ hiddenReason: cards.hiddenReason }).from(cards).where(eq(cards.id, cardId));
  if (auctionState(auction, now) === 'cancelled' || card.hiddenReason) {
    await close(tx, id, 'cancelled', now);
    await notifyCancelled(tx, auction, now);
    return 'cancelled';
  }
  if (!leaderId) {
    await close(tx, id, 'unsold', now);
    await notify(tx, { userId: sellerId!, kind: 'auction_unsold', collectionId, data, now });
    return 'unsold';
  }

  const seller = sellerId!;
  const price = auction.currentPrice;
  const { fee, share } = sellerShare(price, (await getMarketRules(tx, collectionId)).auctionFeePercent);
  await lockCopies(tx, [
    { userId: seller, cardId },
    { userId: leaderId, cardId },
  ]);
  await lockWallets(tx, [seller, leaderId]);
  // The auction's ID as reference: an auction pays once
  const reference = String(id);
  await addCoins(tx, {
    userId: leaderId,
    collectionId,
    amount: -price,
    reason: 'auction_purchase',
    reference,
    details: { auctionId: id, cardId, price },
    now,
  });
  await addCoins(tx, {
    userId: seller,
    collectionId,
    amount: share,
    reason: 'auction_sale',
    reference,
    details: { auctionId: id, cardId, price, fee },
    now,
  });
  await moveCard(tx, { from: seller, to: leaderId, cardId, quantity: 1, collectionId, now });
  await close(tx, id, 'sold', now);
  await awardAchievements(tx, leaderId, collectionId, now);
  await notify(tx, { userId: leaderId, kind: 'auction_won', collectionId, data, now });
  await notify(tx, { userId: seller, kind: 'auction_sold', collectionId, data, now });
  return 'sold';
}

/** What a bid did, as the bidder sees it. */
export type BidResult = BidOutcome['result'];

/**
 * Bids up to `maxAmount` coins. The bid needs as many available coins (the
 * balance, less what the player's other leading bids hold); a leader raising
 * their maximum counts their current one as available. A bid at or above the
 * buyout price buys the card at once. The same form sent twice (same key)
 * bids once.
 */
export async function placeBid(
  database: Database,
  input: { userId: string; collectionId: number; auctionId: number; maxAmount: number; idempotencyKey: string; now: Date },
): Promise<{ result: BidResult; repeated: boolean }> {
  const { userId, auctionId, maxAmount, idempotencyKey, now } = input;
  return database.transaction(async (tx) => {
    const auction = await lockAuction(tx, auctionId, input.collectionId);
    if (!auction) throw new GameError('auctionOver');
    const [previous] = await tx
      .select({ id: bids.id })
      .from(bids)
      .where(and(eq(bids.bidderId, userId), eq(bids.idempotencyKey, idempotencyKey)));
    if (previous) {
      const result = auction.leaderId !== userId ? 'outbid' : auction.status === 'sold' ? 'bought' : 'leading';
      return { result, repeated: true };
    }

    const { collectionId, cardId } = auction;
    const rules = await getMarketRules(tx, collectionId);
    if (!rules.auctionsEnabled) throw new GameError('auctionsClosed');
    if (auctionState(auction, now) !== 'active') throw new GameError('auctionOver');
    const [card] = await tx.select({ rarity: cards.rarity, hiddenReason: cards.hiddenReason }).from(cards).where(eq(cards.id, cardId));
    if (card.hiddenReason) throw new GameError('auctionOver');
    const maxPrice = (await getMarketPrices(tx, collectionId))[card.rarity].max;
    const { state, outcome } = resolveBid(auction, { bidderId: userId, maxAmount, now }, { ...rules, maxPrice });

    // A buyout moves the card: its rows before the wallets
    const bought = outcome.result === 'bought';
    if (bought) {
      await lockCopies(tx, [
        { userId: auction.sellerId!, cardId },
        { userId, cardId },
      ]);
    }
    await lockWallets(tx, bought ? [userId, auction.sellerId!] : [userId]);
    const cost = bought ? state.currentPrice : maxAmount;
    const ownMax = auction.leaderId === userId ? auction.leaderMax! : 0;
    const available = (await coinBalance(tx, userId)) - (await heldCoins(tx, userId)) + ownMax;
    if (cost > available) throw new GameError('bidOverCoins');

    await tx.insert(bids).values({ auctionId, bidderId: userId, maxAmount: cost, idempotencyKey, createdAt: now });
    const [updated] = await tx
      .update(auctions)
      .set({
        currentPrice: state.currentPrice,
        leaderId: state.leaderId,
        leaderMax: state.leaderMax,
        bidCount: state.bidCount,
        endsAt: state.endsAt,
      })
      .where(eq(auctions.id, auctionId))
      .returning();
    if ((outcome.result === 'leading' || outcome.result === 'bought') && outcome.previousLeader) {
      await notify(tx, { userId: outcome.previousLeader, kind: 'auction_outbid', collectionId, data: { auctionId, cardId }, now });
    }
    if (bought) await settleLocked(tx, updated, now);
    return { result: outcome.result, repeated: false };
  });
}

/** The seller withdraws an auction nobody has bid on yet. */
export async function cancelAuction(
  database: Database,
  input: { userId: string; collectionId: number; auctionId: number; now: Date },
): Promise<void> {
  await database.transaction(async (tx) => {
    const auction = await lockAuction(tx, input.auctionId, input.collectionId);
    if (!auction || auction.sellerId !== input.userId || auctionState(auction, input.now) !== 'active') {
      throw new GameError('auctionOver');
    }
    if (auction.bidCount > 0) throw new GameError('auctionHasBids');
    await close(tx, auction.id, 'cancelled', input.now);
  });
}

/**
 * The back-office cancels a running auction (fraud, an anomaly): the card
 * stays the seller's, the leader's coins are free again, both are told.
 */
export async function cancelAuctionAsAdmin(
  database: Database,
  input: { adminId: string; auctionId: number; note: string | null; now: Date },
): Promise<void> {
  await database.transaction(async (tx) => {
    const auction = await lockAuction(tx, input.auctionId);
    if (!auction || auction.status !== 'active') throw new GameError('auctionOver');
    await close(tx, auction.id, 'cancelled', input.now);
    await tx.insert(auditLog).values({
      adminId: input.adminId,
      action: 'auction.cancel',
      targetType: 'auction',
      targetId: String(auction.id),
      details: { cardId: auction.cardId, price: auction.currentPrice, bids: auction.bidCount, ...(input.note ? { note: input.note } : {}) },
    });
    await notifyCancelled(tx, auction, input.now);
  });
}

/** Settles the auction if it is over and not settled yet; returns how it ended, or null. */
export async function settleAuction(database: Database, auctionId: number, now: Date) {
  return database.transaction(async (tx) => {
    const auction = await lockAuction(tx, auctionId);
    if (!auction || auction.status !== 'active' || auction.endsAt > now) return null;
    return settleLocked(tx, auction, now);
  });
}

/** Settles the auctions of the list that are over: the read side of settlement. Returns whether any was. */
export async function settleOver(database: Database, list: { id: number; state: AuctionState }[], now: Date): Promise<boolean> {
  const over = list.filter((auction) => auction.state === 'ended');
  for (const auction of over) await settleAuction(database, auction.id, now);
  return over.length > 0;
}

/**
 * Settles the auctions over, oldest first (the worker's market-settle job),
 * each in its own transaction. Returns how many ended each way.
 */
export async function settleEndedAuctions(database: Database, now: Date, limit = 200) {
  const ended = await database
    .select({ id: auctions.id })
    .from(auctions)
    .where(and(eq(auctions.status, 'active'), lte(auctions.endsAt, now)))
    .orderBy(asc(auctions.endsAt))
    .limit(limit);
  const settled = { sold: 0, unsold: 0, cancelled: 0 };
  for (const { id } of ended) {
    const result = await settleAuction(database, id, now);
    if (result) settled[result] += 1;
  }
  return settled;
}

/**
 * Cancels the running auctions a deleted player was the seller or the leader
 * of, and tells the other one. They are void already (their player is set
 * null): this records it, and frees the card or the coins at once.
 */
export async function cancelOrphanAuctions(executor: Executor, now: Date): Promise<number> {
  const cancelled = await executor
    .update(auctions)
    .set({ status: 'cancelled', settledAt: now })
    .where(
      and(
        eq(auctions.status, 'active'),
        or(isNull(auctions.sellerId), and(isNull(auctions.leaderId), gt(auctions.bidCount, 0))),
      ),
    )
    .returning();
  for (const auction of cancelled) await notifyCancelled(executor, auction, now);
  return cancelled.length;
}
