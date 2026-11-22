import { and, asc, count, eq, gt, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { CardData } from '@/components/card/Card';
import { db } from '@/db';
import { cards, cardSeries, series, userCards } from '@/db/schema';
import { photoLicenseLabel, toCardData } from '@/lib/catalog/card-data';
import { cardColumns, cardPath, type PrintedSeries, printedSeries } from '@/lib/catalog/cards';
import { RARITIES, type Rarity } from '@/lib/rarity';
import { getOpeningCards } from './packs';

// A player's collection: the visible cards of a collection, owned or not.
// Hidden cards stay out, even the ones the player already has. A card not owned
// shows its name and rarity only. A friend's collection shows the cards they
// own, and those the viewer lacks.

// The first tab is the default: the cards a player has, rather than the
// thousands they lack.
export const COLLECTION_TABS = ['owned', 'all', 'missing', 'duplicates'] as const;
export const FRIEND_TABS = ['owned', 'duplicates', 'youLack'] as const;
export type CollectionTab = (typeof COLLECTION_TABS)[number] | (typeof FRIEND_TABS)[number];
// The grid shows a page, then one more each time the player asks ("Voir plus"),
// up to a cap past which the filters narrow it down: every page shown is sent again.
export const COLLECTION_PAGE_SIZE = 48;
export const COLLECTION_MAX_PAGES = 10;

export interface CollectionFilters {
  /** Whose collection: the player's own, or a friend's. */
  userId: string;
  collectionId: number;
  rarity?: Rarity | null;
  seriesId?: number | null;
  /** A department's cards, by its code. */
  departmentCode?: string | null;
  /** The player looking at a friend's collection, for the "youLack" tab. */
  viewerId?: string | null;
}

function owned(userId: string) {
  return and(eq(userCards.cardId, cards.id), eq(userCards.userId, userId));
}

function filterConditions({ collectionId, rarity, seriesId, departmentCode }: CollectionFilters): (SQL | undefined)[] {
  return [
    eq(cards.collectionId, collectionId),
    isNull(cards.hiddenReason),
    rarity ? eq(cards.rarity, rarity) : undefined,
    departmentCode ? eq(cards.departmentCode, departmentCode) : undefined,
    seriesId
      ? sql`EXISTS (SELECT 1 FROM card_series AS cs WHERE cs.card_id = "cards"."id" AND cs.series_id = ${seriesId})`
      : undefined,
  ];
}

/** Owned by the friend, not by the viewer. */
function viewerLacks(viewerId: string | null | undefined): SQL {
  if (!viewerId) return sql`false`;
  return sql`${userCards.cardId} IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM user_cards AS mine WHERE mine.card_id = "cards"."id" AND mine.user_id = ${viewerId}
  )`;
}

function tabCondition(tab: CollectionTab, viewerId: string | null | undefined): SQL | undefined {
  switch (tab) {
    case 'all':
      return undefined;
    case 'owned':
      return isNotNull(userCards.cardId);
    case 'missing':
      return isNull(userCards.cardId);
    case 'duplicates':
      return gt(userCards.quantity, 1);
    case 'youLack':
      return viewerLacks(viewerId);
  }
}

/** Cards per tab, under the rarity and series filters. */
export async function collectionCounts(filters: CollectionFilters): Promise<Record<CollectionTab, number>> {
  const [row] = await db
    .select({
      all: count(),
      owned: count(userCards.cardId),
      duplicates: sql<number>`count(*) FILTER (WHERE ${userCards.quantity} > 1)::int`,
      youLack: sql<number>`count(*) FILTER (WHERE ${viewerLacks(filters.viewerId)})::int`,
    })
    .from(cards)
    .leftJoin(userCards, owned(filters.userId))
    .where(and(...filterConditions(filters)));
  return { all: row.all, owned: row.owned, missing: row.all - row.owned, duplicates: row.duplicates, youLack: row.youLack };
}

/** Cards owned of each rarity, under the series filter (the rarity filter's choices). */
export async function ownedByRarity(filters: CollectionFilters): Promise<Record<Rarity, number>> {
  const rows = await db
    .select({ rarity: cards.rarity, owned: count() })
    .from(cards)
    .innerJoin(userCards, owned(filters.userId))
    .where(and(...filterConditions({ ...filters, rarity: null })))
    .groupBy(cards.rarity);
  return Object.fromEntries(RARITIES.map((rarity) => [rarity, rows.find((row) => row.rarity === rarity)?.owned ?? 0])) as Record<
    Rarity,
    number
  >;
}

export interface CardNeighbours {
  /** From 1. */
  position: number;
  total: number;
  previous: string;
  next: string;
}

/**
 * Where an owned card stands among the owned cards of a list (the collection
 * or a series, under its filters), in the list's order, and the slugs of the
 * cards before and after it, looping: the card page's arrows. Null when the
 * card isn't in the list.
 */
export async function ownedNeighbours(
  filters: CollectionFilters & { tab: CollectionTab },
  cardId: number,
): Promise<CardNeighbours | null> {
  const order = filters.seriesId ? sql`${cardSeries.number}` : sql`${cards.rank}, ${cards.id}`;
  const query = db
    .select({
      id: cards.id,
      slug: cards.slug,
      n: sql<number>`(row_number() OVER (ORDER BY ${order}))::int`.as('n'),
      total: sql<number>`(count(*) OVER ())::int`.as('total'),
    })
    .from(cards)
    .innerJoin(userCards, owned(filters.userId));
  const where = and(...filterConditions(filters), tabCondition(filters.tab, null));
  const list = db.$with('list').as(
    filters.seriesId
      ? query.innerJoin(cardSeries, and(eq(cardSeries.cardId, cards.id), eq(cardSeries.seriesId, filters.seriesId))).where(where)
      : query.where(where),
  );
  const [card] = await db.with(list).select({ n: list.n, total: list.total }).from(list).where(eq(list.id, cardId));
  if (!card) return null;
  const before = card.n === 1 ? card.total : card.n - 1;
  const after = card.n === card.total ? 1 : card.n + 1;
  const around = await db
    .with(list)
    .select({ n: list.n, slug: list.slug })
    .from(list)
    .where(inArray(list.n, [before, after]));
  const slugAt = (n: number) => around.find((row) => row.n === n)?.slug ?? '';
  return { position: card.n, total: card.total, previous: slugAt(before), next: slugAt(after) };
}

/**
 * A tab's first `pages` pages: by rank, or by number within the series when
 * filtering on one. Each card says whether the player looking (the viewer on a
 * friend's collection) wishes for it, and on a friend's whether the viewer owns it.
 */
export async function listCollectionCards(filters: CollectionFilters & { tab: CollectionTab; pages: number }) {
  const where = and(...filterConditions(filters), tabCondition(filters.tab, filters.viewerId));
  const looking = filters.viewerId ?? filters.userId;
  const query = db
    .select({
      ...cardColumns,
      quantity: userCards.quantity,
      wished: sql<boolean>`EXISTS (
        SELECT 1 FROM wishlist_items AS wish WHERE wish.card_id = "cards"."id" AND wish.user_id = ${looking}
      )`,
      viewerOwns: filters.viewerId
        ? sql<boolean | null>`EXISTS (
            SELECT 1 FROM user_cards AS mine WHERE mine.card_id = "cards"."id" AND mine.user_id = ${filters.viewerId}
          )`
        : sql<boolean | null>`NULL::boolean`,
    })
    .from(cards)
    .leftJoin(userCards, owned(filters.userId));
  const ordered = filters.seriesId
    ? query
        .innerJoin(cardSeries, and(eq(cardSeries.cardId, cards.id), eq(cardSeries.seriesId, filters.seriesId)))
        .where(where)
        .orderBy(asc(cardSeries.number))
    : query.where(where).orderBy(asc(cards.rank), asc(cards.id));
  return ordered.limit(Math.min(filters.pages, COLLECTION_MAX_PAGES) * COLLECTION_PAGE_SIZE);
}

export type CollectionRow = Awaited<ReturnType<typeof listCollectionCards>>[number];

export interface CollectionCard {
  id: number;
  /** The card page; null for a card not owned, which the grid shows greyed and doesn't link. */
  href: string | null;
  state: 'owned' | 'missing';
  copies: number;
  data: CardData;
  /**
   * The wishlist's heart: whether the player looking wishes for the card; null
   * when they own it (their own owned cards, a friend's card they have too).
   */
  wish: boolean | null;
}

export interface LicenseLabels {
  publicDomain: string;
  unknownLicense: string;
}

/**
 * What the grid shows of a card. A card not owned carries its name, rarity and
 * place in its series only (decided on 2026-11-17, Legendaries included): its
 * photo, its place on the map and its address never reach the browser.
 */
export function toCollectionCard(
  row: Pick<CollectionRow, keyof typeof cardColumns | 'quantity'>,
  printed: PrintedSeries | null,
  collectionSlug: string,
  labels: LicenseLabels,
): CollectionCard {
  const copies = row.quantity ?? 0;
  if (copies === 0) {
    return {
      id: row.id,
      href: null,
      state: 'missing',
      copies,
      wish: null,
      data: {
        name: row.name,
        rarity: row.rarity,
        department: null,
        region: null,
        protection: null,
        unesco: false,
        series: printed,
        photo: { src: '', author: null, license: '', fileUrl: '' },
      },
    };
  }
  return {
    id: row.id,
    href: cardPath(collectionSlug, row.slug),
    state: 'owned',
    copies,
    wish: null,
    data: toCardData({ ...row, photoImage: row.photoImage! }, printed, photoLicenseLabel(row.photoLicense, labels)),
  };
}

/** The rows as grid cards, with the series printed on each and the wishlist's heart where it belongs. */
export async function toCollectionCards(rows: CollectionRow[], collectionSlug: string, labels: LicenseLabels) {
  const printed = await printedSeries(rows.map((row) => row.id));
  return rows.map((row): CollectionCard => {
    const card = toCollectionCard(row, printed.get(row.id) ?? null, collectionSlug, labels);
    // The player's own collection: on the cards they lack; a friend's: on the cards the viewer lacks
    const lacking = row.viewerOwns === null ? card.state === 'missing' : !row.viewerOwns;
    return { ...card, wish: lacking ? row.wished : null };
  });
}

export interface SeriesProgress {
  id: number;
  slug: string;
  name: string;
  type: (typeof series.$inferSelect)['type'];
  owned: number;
  total: number;
}

const SERIES_TYPE_ORDER = sql.raw(`ARRAY['region', 'family', 'unesco', 'endangered']::series_type[]`);

/** Distinct visible cards owned in each series of the collection, out of its visible cards. */
export async function seriesProgress(userId: string, collectionId: number): Promise<SeriesProgress[]> {
  return db
    .select({
      id: series.id,
      slug: series.slug,
      name: series.name,
      type: series.type,
      // Aliased: in a one-table query, Drizzle leaves column names unqualified
      owned: sql<number>`(
        SELECT count(*) FROM card_series AS cs
        JOIN user_cards AS uc ON uc.card_id = cs.card_id AND uc.user_id = ${userId}
        WHERE cs.series_id = "series"."id" AND cs.number IS NOT NULL
      )::int`,
      total: series.cardCount,
    })
    .from(series)
    .where(and(eq(series.collectionId, collectionId), gt(series.cardCount, 0)))
    .orderBy(sql`array_position(${SERIES_TYPE_ORDER}, ${series.type})`, asc(series.name));
}

export async function getSeries(collectionId: number, slug: string) {
  const [row] = await db
    .select({ id: series.id, slug: series.slug, name: series.name, type: series.type, total: series.cardCount })
    .from(series)
    .where(and(eq(series.collectionId, collectionId), eq(series.slug, slug), gt(series.cardCount, 0)));
  return row ?? null;
}

/** The cards of a pack just opened, as the grid shows them, in reveal order. */
export async function openingCards(userId: string, openingId: number, collectionSlug: string, labels: LicenseLabels) {
  const drawn = await getOpeningCards(userId, openingId);
  if (drawn.length === 0) return [];
  const rows = await db
    .select(cardColumns)
    .from(cards)
    .where(inArray(cards.id, drawn.map((card) => card.cardId)));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const printed = await printedSeries(rows.map((row) => row.id));
  return drawn.map(({ position, isNew, wished, cardId, quantity }) => ({
    position,
    isNew,
    /** The card was on the player's wishlist. */
    wished,
    card: toCollectionCard({ ...byId.get(cardId)!, quantity: quantity ?? 1 }, printed.get(cardId) ?? null, collectionSlug, labels),
  }));
}

export type OpenedCard = Awaited<ReturnType<typeof openingCards>>[number];

/** Copies the player owns of one card (0 when none). */
export async function ownedCopies(userId: string, cardId: number): Promise<number> {
  const [row] = await db
    .select({ quantity: userCards.quantity })
    .from(userCards)
    .where(and(eq(userCards.userId, userId), eq(userCards.cardId, cardId)));
  return row?.quantity ?? 0;
}

/** The player's cards, for the account export. */
export async function playerCards(userId: string) {
  return db
    .select({
      card: cards.wikidataId,
      name: cards.name,
      quantity: userCards.quantity,
      firstObtainedAt: userCards.firstObtainedAt,
    })
    .from(userCards)
    .innerJoin(cards, eq(cards.id, userCards.cardId))
    .where(eq(userCards.userId, userId))
    .orderBy(asc(userCards.firstObtainedAt));
}
