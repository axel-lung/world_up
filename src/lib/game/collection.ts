import { and, asc, count, eq, gt, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { CardData } from '@/components/card/Card';
import { db } from '@/db';
import { cards, cardSeries, series, userCards } from '@/db/schema';
import { photoLicenseLabel, toCardData } from '@/lib/catalog/card-data';
import { cardColumns, cardPath, type PrintedSeries, printedSeries } from '@/lib/catalog/cards';
import type { Rarity } from '@/lib/rarity';
import { getOpeningCards } from './packs';

// A player's collection: the visible cards of a collection, owned or not.
// Hidden cards stay out, even the ones the player already has.

export const COLLECTION_TABS = ['all', 'owned', 'missing', 'duplicates'] as const;
export type CollectionTab = (typeof COLLECTION_TABS)[number];
export const COLLECTION_PAGE_SIZE = 48;

// Missing cards of these rarities keep their surprise: no name, no photo
export const MASKED_RARITIES: readonly Rarity[] = ['legendary', 'ultra'];

export interface CollectionFilters {
  userId: string;
  collectionId: number;
  rarity?: Rarity | null;
  seriesId?: number | null;
}

function owned(userId: string) {
  return and(eq(userCards.cardId, cards.id), eq(userCards.userId, userId));
}

function filterConditions({ collectionId, rarity, seriesId }: CollectionFilters): (SQL | undefined)[] {
  return [
    eq(cards.collectionId, collectionId),
    isNull(cards.hiddenReason),
    rarity ? eq(cards.rarity, rarity) : undefined,
    seriesId
      ? sql`EXISTS (SELECT 1 FROM card_series AS cs WHERE cs.card_id = "cards"."id" AND cs.series_id = ${seriesId})`
      : undefined,
  ];
}

const tabCondition: Record<CollectionTab, SQL | undefined> = {
  all: undefined,
  owned: isNotNull(userCards.cardId),
  missing: isNull(userCards.cardId),
  duplicates: gt(userCards.quantity, 1),
};

/** Cards per tab, under the rarity and series filters. */
export async function collectionCounts(filters: CollectionFilters): Promise<Record<CollectionTab, number>> {
  const [row] = await db
    .select({
      all: count(),
      owned: count(userCards.cardId),
      duplicates: sql<number>`count(*) FILTER (WHERE ${userCards.quantity} > 1)::int`,
    })
    .from(cards)
    .leftJoin(userCards, owned(filters.userId))
    .where(and(...filterConditions(filters)));
  return { all: row.all, owned: row.owned, missing: row.all - row.owned, duplicates: row.duplicates };
}

/** One page of a tab: by rank, or by number within the series when filtering on one. */
export async function listCollectionCards(filters: CollectionFilters & { tab: CollectionTab; page: number }) {
  const where = and(...filterConditions(filters), tabCondition[filters.tab]);
  const query = db
    .select({ ...cardColumns, quantity: userCards.quantity })
    .from(cards)
    .leftJoin(userCards, owned(filters.userId));
  const ordered = filters.seriesId
    ? query
        .innerJoin(cardSeries, and(eq(cardSeries.cardId, cards.id), eq(cardSeries.seriesId, filters.seriesId)))
        .where(where)
        .orderBy(asc(cardSeries.number))
    : query.where(where).orderBy(asc(cards.rank), asc(cards.id));
  return ordered.limit(COLLECTION_PAGE_SIZE).offset((filters.page - 1) * COLLECTION_PAGE_SIZE);
}

export type CollectionRow = Awaited<ReturnType<typeof listCollectionCards>>[number];

export interface CollectionCard {
  id: number;
  /** The card page; null for a masked card, whose address would give its name away. */
  href: string | null;
  state: 'owned' | 'missing' | 'masked';
  copies: number;
  data: CardData;
}

export interface LicenseLabels {
  publicDomain: string;
  unknownLicense: string;
}

/**
 * What the grid shows of a card. A masked card carries its rarity, place and
 * series only: its name and photo never reach the browser.
 */
export function toCollectionCard(
  row: Pick<CollectionRow, keyof typeof cardColumns | 'quantity'>,
  printed: PrintedSeries | null,
  collectionSlug: string,
  labels: LicenseLabels,
): CollectionCard {
  const copies = row.quantity ?? 0;
  const state = copies > 0 ? 'owned' : MASKED_RARITIES.includes(row.rarity) ? 'masked' : 'missing';
  if (state === 'masked') {
    return {
      id: row.id,
      href: null,
      state,
      copies,
      data: {
        name: '',
        rarity: row.rarity,
        department: row.department,
        region: row.region,
        protection: row.protection,
        unesco: row.unesco,
        series: printed,
        photo: { src: '', author: null, license: '', fileUrl: '' },
      },
    };
  }
  return {
    id: row.id,
    href: cardPath(collectionSlug, row.slug),
    state,
    copies,
    data: toCardData({ ...row, photoImage: row.photoImage! }, printed, photoLicenseLabel(row.photoLicense, labels)),
  };
}

/** The rows as grid cards, with the series printed on each. */
export async function toCollectionCards(rows: CollectionRow[], collectionSlug: string, labels: LicenseLabels) {
  const printed = await printedSeries(rows.map((row) => row.id));
  return rows.map((row) => toCollectionCard(row, printed.get(row.id) ?? null, collectionSlug, labels));
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
  return drawn.map(({ position, isNew, cardId, quantity }) => ({
    position,
    isNew,
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
