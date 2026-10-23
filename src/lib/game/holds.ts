import { sql } from 'drizzle-orm';
import type { Database, Transaction } from '@/db';

// Reservations, computed on read like the pack refill: a card offered in a
// trade or put up for auction, and the coins of a leading bid, stay with their
// owner but can't be used anywhere else. Nothing moves when an offer expires or
// a bid is outbid, so nothing has to be given back.
//
// Lock order, for every write that takes cards or coins away: the trade or
// auction row first (FOR UPDATE), then the user_cards rows, sorted by player
// and card, then the wallet locks (addCoins), sorted by player.

type Executor = Database | Transaction;

/**
 * An offer still open: pending, not expired, both players still there. A
 * pending offer past its expiry counts as expired, marked or not.
 */
export const openTrade = (now: Date) =>
  sql`t.status = 'pending' AND t.expires_at > ${now} AND t.proposer_id IS NOT NULL AND t.recipient_id IS NOT NULL`;

/**
 * Copies of each card the player has promised: offered in an open trade, or
 * up for auction (an auction over but not settled yet still holds its card).
 * Only the cards in `cardIds` when given; `exceptTrade` leaves out the offer
 * being accepted, whose cards are the ones about to move.
 */
export async function reservedCopies(
  executor: Executor,
  userId: string,
  now: Date,
  cardIds?: number[],
  { exceptTrade }: { exceptTrade?: number } = {},
): Promise<Map<number, number>> {
  if (cardIds?.length === 0) return new Map();
  const only = cardIds ? sql`AND card_id IN (${sql.join(cardIds, sql`, `)})` : sql``;
  const except = exceptTrade === undefined ? sql`` : sql`AND t.id <> ${exceptTrade}`;
  const result = await executor.execute<{ card_id: number; copies: number }>(sql`
    SELECT card_id, sum(copies)::int AS copies FROM (
      SELECT ti.card_id, ti.quantity AS copies
      FROM trade_items AS ti JOIN trades AS t ON t.id = ti.trade_id
      WHERE ti.side = 'proposer' AND t.proposer_id = ${userId} AND ${openTrade(now)} ${except}
      UNION ALL
      SELECT a.card_id, 1 FROM auctions AS a WHERE a.seller_id = ${userId} AND a.status = 'active'
    ) AS reserved
    WHERE true ${only}
    GROUP BY card_id`);
  return new Map(result.rows.map((row) => [row.card_id, row.copies]));
}

/**
 * Coins held by the player's leading bids: the maximum of each auction they
 * lead (an auction over but not settled yet still holds them). An auction
 * whose seller is gone holds nothing: it is void.
 */
export async function heldCoins(executor: Executor, userId: string): Promise<number> {
  const result = await executor.execute<{ held: number }>(sql`
    SELECT coalesce(sum(leader_max), 0)::int AS held FROM auctions
    WHERE leader_id = ${userId} AND status = 'active' AND seller_id IS NOT NULL`);
  return result.rows[0].held;
}
