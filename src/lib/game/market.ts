import { and, asc, count, desc, eq, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db';
import { auctions, bids, cards, userCards, users } from '@/db/schema';
import { cardColumns } from '@/lib/catalog/cards';
import type { Rarity } from '@/lib/rarity';
import { type AuctionState, auctionState, isLive } from './auctions';
import { minimumBid } from './bidding';
import { reservedCopies } from './holds';
import { getMarketPrices, getMarketRules } from './rules';

// The auction house as the pages show it: the running auctions, one auction
// with what the viewer can do on it, a player's sales and bids. The leader's
// maximum is never shown to anyone but them, and bidders stay anonymous.

const seller = alias(users, 'seller');

const auctionColumns = {
  id: auctions.id,
  cardId: auctions.cardId,
  sellerId: auctions.sellerId,
  sellerPseudo: seller.name,
  startPrice: auctions.startPrice,
  buyoutPrice: auctions.buyoutPrice,
  currentPrice: auctions.currentPrice,
  leaderId: auctions.leaderId,
  bidCount: auctions.bidCount,
  status: auctions.status,
  createdAt: auctions.createdAt,
  endsAt: auctions.endsAt,
  settledAt: auctions.settledAt,
};

/** Whether `userId` has bid on the auction. */
const hasBid = (userId: string | null) =>
  userId
    ? sql<boolean>`EXISTS (SELECT 1 FROM bids AS b WHERE b.auction_id = ${auctions.id} AND b.bidder_id = ${userId})`
    : sql<boolean>`false`;

function selectAuctions(viewerId: string | null) {
  return db
    .select({ ...auctionColumns, viewerBid: hasBid(viewerId), card: cardColumns })
    .from(auctions)
    .innerJoin(cards, eq(cards.id, auctions.cardId))
    .leftJoin(seller, eq(seller.id, auctions.sellerId));
}

type SelectedAuction = Awaited<ReturnType<typeof selectAuctions>>[number];

/** An auction seen by a player: never the leader's maximum, unless it is theirs. */
export interface AuctionView {
  id: number;
  state: AuctionState;
  card: SelectedAuction['card'];
  /** The seller's pseudo; null once their account is deleted. */
  seller: string | null;
  startPrice: number;
  buyoutPrice: number | null;
  currentPrice: number;
  bidCount: number;
  createdAt: Date;
  endsAt: Date;
  settledAt: Date | null;
  /** The viewer's part: seller, leader, a bidder behind, or none. */
  viewer: 'seller' | 'leading' | 'outbid' | null;
}

function toView(row: SelectedAuction, viewerId: string | null, now: Date): AuctionView {
  const viewer =
    viewerId && row.sellerId === viewerId
      ? 'seller'
      : viewerId && row.leaderId === viewerId
        ? 'leading'
        : row.viewerBid
          ? 'outbid'
          : null;
  return {
    id: row.id,
    state: auctionState(row, now),
    card: row.card,
    seller: row.sellerPseudo,
    startPrice: row.startPrice,
    buyoutPrice: row.buyoutPrice,
    currentPrice: row.currentPrice,
    bidCount: row.bidCount,
    createdAt: row.createdAt,
    endsAt: row.endsAt,
    settledAt: row.settledAt,
    viewer,
  };
}

export const MARKET_SORTS = ['ending', 'newest', 'price'] as const;
export type MarketSort = (typeof MARKET_SORTS)[number];
export const MARKET_PAGE_SIZE = 24;

export interface MarketFilters {
  collectionId: number;
  viewerId: string;
  rarity?: Rarity | null;
  seriesId?: number | null;
  /** Only the cards the viewer doesn't own. */
  missing?: boolean;
  cardId?: number | null;
  sort: MarketSort;
  page: number;
  now: Date;
}

function marketConditions(filters: MarketFilters): (SQL | undefined)[] {
  return [
    eq(auctions.collectionId, filters.collectionId),
    isLive(filters.now),
    isNull(cards.hiddenReason),
    filters.rarity ? eq(cards.rarity, filters.rarity) : undefined,
    filters.cardId ? eq(auctions.cardId, filters.cardId) : undefined,
    filters.seriesId
      ? sql`EXISTS (SELECT 1 FROM card_series AS cs WHERE cs.card_id = ${auctions.cardId} AND cs.series_id = ${filters.seriesId})`
      : undefined,
    filters.missing
      ? sql`NOT EXISTS (SELECT 1 FROM user_cards AS mine WHERE mine.card_id = ${auctions.cardId} AND mine.user_id = ${filters.viewerId})`
      : undefined,
  ];
}

const MARKET_ORDER: Record<MarketSort, SQL[]> = {
  ending: [asc(auctions.endsAt), asc(auctions.id)],
  newest: [desc(auctions.createdAt), desc(auctions.id)],
  price: [asc(auctions.currentPrice), asc(auctions.endsAt), asc(auctions.id)],
};

/** One page of the running auctions of a collection, and how many there are under the filters. */
export async function listMarket(filters: MarketFilters): Promise<{ auctions: AuctionView[]; total: number }> {
  const where = and(...marketConditions(filters));
  const [rows, [{ total }]] = await Promise.all([
    selectAuctions(filters.viewerId)
      .where(where)
      .orderBy(...MARKET_ORDER[filters.sort])
      .limit(MARKET_PAGE_SIZE)
      .offset((filters.page - 1) * MARKET_PAGE_SIZE),
    db.select({ total: count() }).from(auctions).innerJoin(cards, eq(cards.id, auctions.cardId)).where(where),
  ]);
  return { auctions: rows.map((row) => toView(row, filters.viewerId, filters.now)), total };
}

/** One auction of the collection, with what the viewer can do on it. */
export async function getAuction(collectionId: number, auctionId: number, viewerId: string, now: Date) {
  const [row] = await db
    .select({ ...auctionColumns, viewerBid: hasBid(viewerId), card: cardColumns, leaderMax: auctions.leaderMax })
    .from(auctions)
    .innerJoin(cards, eq(cards.id, auctions.cardId))
    .leftJoin(seller, eq(seller.id, auctions.sellerId))
    .where(and(eq(auctions.id, auctionId), eq(auctions.collectionId, collectionId)));
  if (!row) return null;
  const view = toView(row, viewerId, now);
  const rules = await getMarketRules(db, collectionId);
  return {
    ...view,
    /** The viewer's own maximum, while they lead. */
    viewerMax: view.viewer === 'leading' ? row.leaderMax : null,
    /** The lowest maximum the viewer may enter now. */
    minimumBid: minimumBid(row, viewerId, rules),
    /** The highest: the rarity's ceiling. */
    maximumBid: (await getMarketPrices(db, collectionId))[row.card.rarity].max,
    auctionsEnabled: rules.auctionsEnabled,
  };
}

export type AuctionDetail = NonNullable<Awaited<ReturnType<typeof getAuction>>>;

export const MARKET_HISTORY_SIZE = 30;

/** The player's sales and bids in a collection: running ones, then the latest finished. */
export async function listMyAuctions(userId: string, collectionId: number, now: Date) {
  const mine = and(eq(auctions.collectionId, collectionId), or(eq(auctions.sellerId, userId), hasBid(userId)));
  const [running, finished] = await Promise.all([
    selectAuctions(userId)
      .where(and(mine, eq(auctions.status, 'active')))
      .orderBy(asc(auctions.endsAt)),
    selectAuctions(userId)
      .where(and(mine, ne(auctions.status, 'active')))
      .orderBy(desc(auctions.settledAt), desc(auctions.id))
      .limit(MARKET_HISTORY_SIZE),
  ]);
  const views = (rows: SelectedAuction[]) => rows.map((row) => toView(row, userId, now));
  const open = views(running);
  return {
    selling: open.filter((auction) => auction.viewer === 'seller'),
    bidding: open.filter((auction) => auction.viewer !== 'seller'),
    history: views(finished),
  };
}

/** A visible card of the collection by its slug, for the market's card filter. */
export async function marketCard(collectionId: number, slug: string) {
  const [card] = await db
    .select({ id: cards.id, slug: cards.slug, name: cards.name })
    .from(cards)
    .where(and(eq(cards.collectionId, collectionId), eq(cards.slug, slug), isNull(cards.hiddenReason)));
  return card ?? null;
}

/** Running auctions of one card, for its page. */
export async function liveAuctionsOfCard(cardId: number, now: Date): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(auctions)
    .where(and(eq(auctions.cardId, cardId), isLive(now)));
  return total;
}

/** Copies of a card the player can still put up for sale: owned, less the reserved ones. */
export async function sellableCopies(userId: string, cardId: number, now: Date): Promise<number> {
  const [[row], reserved] = await Promise.all([
    db
      .select({ quantity: userCards.quantity })
      .from(userCards)
      .where(and(eq(userCards.userId, userId), eq(userCards.cardId, cardId))),
    reservedCopies(db, userId, now, [cardId]),
  ]);
  return Math.max(0, (row?.quantity ?? 0) - (reserved.get(cardId) ?? 0));
}

/** The player's sales and bids, for the account export. */
export async function playerAuctions(userId: string) {
  const now = new Date();
  const [sales, placed] = await Promise.all([
    db
      .select({ ...auctionColumns, card: cards.name })
      .from(auctions)
      .innerJoin(cards, eq(cards.id, auctions.cardId))
      .leftJoin(seller, eq(seller.id, auctions.sellerId))
      .where(eq(auctions.sellerId, userId))
      .orderBy(asc(auctions.createdAt)),
    db
      .select({
        card: cards.name,
        maxAmount: bids.maxAmount,
        createdAt: bids.createdAt,
        won: sql<boolean>`${auctions.status} = 'sold' AND ${auctions.leaderId} = ${userId}`,
      })
      .from(bids)
      .innerJoin(auctions, eq(auctions.id, bids.auctionId))
      .innerJoin(cards, eq(cards.id, auctions.cardId))
      .where(eq(bids.bidderId, userId))
      .orderBy(asc(bids.createdAt)),
  ]);
  return {
    sales: sales.map((row) => ({
      card: row.card,
      startPrice: row.startPrice,
      buyoutPrice: row.buyoutPrice,
      price: row.currentPrice,
      bids: row.bidCount,
      state: auctionState(row, now),
      createdAt: row.createdAt,
      endsAt: row.endsAt,
      settledAt: row.settledAt,
    })),
    bids: placed,
  };
}
