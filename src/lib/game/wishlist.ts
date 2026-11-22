import { and, asc, count, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { type Database, db, type Transaction } from '@/db';
import { cards, userCards, users, wishlistItems } from '@/db/schema';
import { cardColumns } from '@/lib/catalog/cards';
import { notify } from '@/lib/notifications/notifications';
import { listFriends } from '@/lib/social/friends';
import { GameError } from './game-error';

// A player's wishlist (decided on 2026-11-22): visible cards they lack and
// want, at most WISHLIST_MAX a collection. A card obtained leaves the list in
// the transaction that brings it (a pack, a trade, an auction): fulfilWishes().
// An auction of a wished card tells the players who wish for it, once a day
// per card at most. Friends see each other's list: the trade composer puts the
// cards a friend wishes for first. A wish counts on read only while its card is
// visible and still lacking, so a card hidden since stays out of everything.
//
// The auctions of wished cards are read in market.ts, which auctions.ts (and
// its wisher notification) doesn't depend on.

type Executor = Database | Transaction;

/** Cards a player can wish for at once in a collection: an anti-abuse limit, like MAX_FRIENDS. */
export const WISHLIST_MAX = 100;
/** A player hears of the auctions of one wished card at most once in this many hours. */
export const WISHED_AUCTION_NOTICE_HOURS = 24;

/** The wish's card is visible and the player still lacks it (wishlist_items and cards in the query). */
const stillWished = and(
  isNull(cards.hiddenReason),
  sql`NOT EXISTS (
    SELECT 1 FROM user_cards AS uc WHERE uc.user_id = "wishlist_items"."user_id" AND uc.card_id = "wishlist_items"."card_id"
  )`,
);

/** The player's wishes in the collection, as they count. */
export async function wishCount(executor: Executor, userId: string, collectionId: number): Promise<number> {
  const [{ wishes }] = await executor
    .select({ wishes: count() })
    .from(wishlistItems)
    .innerJoin(cards, eq(cards.id, wishlistItems.cardId))
    .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.collectionId, collectionId), stillWished));
  return wishes;
}

/**
 * Adds a card to the player's wishlist: a visible card of the collection they
 * lack, while the list has room. A card already on it stays, without error.
 */
export async function addWish(
  database: Database,
  input: { userId: string; collectionId: number; cardId: number; now: Date },
): Promise<void> {
  const { userId, collectionId, cardId, now } = input;
  await database.transaction(async (tx) => {
    // One player's wishes one at a time: two at once can't both pass the limit
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`wishlist:${userId}`}, 0))`);
    const [card] = await tx
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.id, cardId), eq(cards.collectionId, collectionId), isNull(cards.hiddenReason)));
    if (!card) throw new GameError('wishUnavailable');
    const [owned] = await tx
      .select({ cardId: userCards.cardId })
      .from(userCards)
      .where(and(eq(userCards.userId, userId), eq(userCards.cardId, cardId)));
    if (owned) throw new GameError('wishOwned');
    const [already] = await tx
      .select({ cardId: wishlistItems.cardId })
      .from(wishlistItems)
      .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.cardId, cardId)));
    if (already) return;
    if ((await wishCount(tx, userId, collectionId)) >= WISHLIST_MAX) throw new GameError('wishFull');
    await tx.insert(wishlistItems).values({ userId, collectionId, cardId, createdAt: now }).onConflictDoNothing();
  });
}

/** Takes a card off the player's wishlist; nothing happens when it isn't there. */
export async function removeWish(database: Database, input: { userId: string; cardId: number }): Promise<void> {
  await database
    .delete(wishlistItems)
    .where(and(eq(wishlistItems.userId, input.userId), eq(wishlistItems.cardId, input.cardId)));
}

/**
 * Takes the cards a player has just obtained off their wishlist, in the
 * transaction that brings them; returns those that were on it.
 */
export async function fulfilWishes(tx: Transaction, userId: string, cardIds: number[]): Promise<Set<number>> {
  if (cardIds.length === 0) return new Set();
  const rows = await tx
    .delete(wishlistItems)
    .where(and(eq(wishlistItems.userId, userId), inArray(wishlistItems.cardId, cardIds)))
    .returning({ cardId: wishlistItems.cardId });
  return new Set(rows.map((row) => row.cardId));
}

/**
 * Tells the players who wish for the card that it is up for auction, in the
 * auction's transaction: not the seller, nor a banned player, nor one told of
 * this card in the last WISHED_AUCTION_NOTICE_HOURS (a seller who withdraws
 * and puts it up again doesn't ring them twice). Returns how many were told.
 */
export async function notifyWishers(
  tx: Transaction,
  auction: { id: number; collectionId: number; cardId: number; sellerId: string },
  now: Date,
): Promise<number> {
  const since = new Date(now.getTime() - WISHED_AUCTION_NOTICE_HOURS * 60 * 60 * 1000);
  const wishers = await tx
    .select({ userId: wishlistItems.userId })
    .from(wishlistItems)
    .innerJoin(cards, eq(cards.id, wishlistItems.cardId))
    .innerJoin(users, eq(users.id, wishlistItems.userId))
    .where(
      and(
        eq(wishlistItems.cardId, auction.cardId),
        ne(wishlistItems.userId, auction.sellerId),
        isNull(users.bannedAt),
        stillWished,
        sql`NOT EXISTS (
          SELECT 1 FROM notifications AS n
          WHERE n.user_id = "wishlist_items"."user_id" AND n.kind = 'auction_wished'
            AND n.data->>'cardId' = ${String(auction.cardId)} AND n.created_at > ${since}
        )`,
      ),
    )
    .orderBy(asc(wishlistItems.userId));
  for (const { userId } of wishers) {
    await notify(tx, {
      userId,
      kind: 'auction_wished',
      collectionId: auction.collectionId,
      data: { auctionId: auction.id, cardId: auction.cardId },
      now,
    });
  }
  return wishers.length;
}

/** Whether the player wishes for the card (the card page's heart). */
export async function isWished(userId: string, cardId: number): Promise<boolean> {
  const [row] = await db
    .select({ cardId: wishlistItems.cardId })
    .from(wishlistItems)
    .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.cardId, cardId)));
  return row !== undefined;
}

/** The player's wishes in a collection, the latest first, with the friends who own each card. */
export async function listWishlist(userId: string, collectionId: number) {
  const [rows, friends] = await Promise.all([
    db
      .select({ ...cardColumns, addedAt: wishlistItems.createdAt })
      .from(wishlistItems)
      .innerJoin(cards, eq(cards.id, wishlistItems.cardId))
      .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.collectionId, collectionId), stillWished))
      .orderBy(desc(wishlistItems.createdAt), asc(cards.rank)),
    listFriends(userId),
  ]);
  const owners = new Map<number, string[]>();
  if (rows.length > 0 && friends.length > 0) {
    const pseudoOf = new Map(friends.map((friend) => [friend.id, friend.pseudo]));
    const copies = await db
      .select({ cardId: userCards.cardId, userId: userCards.userId })
      .from(userCards)
      .where(
        and(
          inArray(userCards.userId, [...pseudoOf.keys()]),
          inArray(
            userCards.cardId,
            rows.map((row) => row.id),
          ),
        ),
      )
      // The friends with the most copies first: the likeliest to part with one
      .orderBy(desc(userCards.quantity));
    for (const { cardId, userId: owner } of copies) owners.set(cardId, [...(owners.get(cardId) ?? []), pseudoOf.get(owner)!]);
  }
  return rows.map((row) => ({ ...row, friends: owners.get(row.id) ?? [] }));
}

export type WishlistEntry = Awaited<ReturnType<typeof listWishlist>>[number];

/** How many cards a friend wishes for that the viewer owns (the friend's page). */
export async function wishesViewerOwns(friendId: string, viewerId: string, collectionId: number): Promise<number> {
  const [{ wishes }] = await db
    .select({ wishes: count() })
    .from(wishlistItems)
    .innerJoin(cards, eq(cards.id, wishlistItems.cardId))
    .innerJoin(userCards, and(eq(userCards.cardId, wishlistItems.cardId), eq(userCards.userId, viewerId)))
    .where(and(eq(wishlistItems.userId, friendId), eq(wishlistItems.collectionId, collectionId), stillWished));
  return wishes;
}

/** The player's wishlist, for the account export. */
export async function playerWishlist(userId: string) {
  return db
    .select({ card: cards.wikidataId, name: cards.name, addedAt: wishlistItems.createdAt })
    .from(wishlistItems)
    .innerJoin(cards, eq(cards.id, wishlistItems.cardId))
    .where(eq(wishlistItems.userId, userId))
    .orderBy(asc(wishlistItems.createdAt));
}
