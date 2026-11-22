import { and, count, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { cards, userCards } from '@/db/schema';
import { cardImageUrl, cardPath } from '@/lib/catalog/cards';
import { RARITIES } from '@/lib/rarity';

// The map's data (the "Carte" page). Every visible card with a point is on
// it, owned or not: its point, name and rarity, but neither its photo nor its
// address unless the player owns it (monumentDetails), as in the collection.

/**
 * One monument: [card ID, latitude, longitude, rarity (its index in RARITIES),
 * name (lowercase, as on the card), department code or null].
 */
export type MonumentRow = [number, number, number, number, string, string | null];

const visible = (collectionId: number) =>
  and(eq(cards.collectionId, collectionId), isNull(cards.hiddenReason), isNotNull(cards.latitude));

/**
 * Changes whenever the monuments do (a card shown, hidden, moved or renamed):
 * the list's address carries it, so that the browser keeps the list for a
 * year and asks again only then.
 */
export async function monumentsVersion(collectionId: number): Promise<string> {
  const [row] = await db
    .select({
      version: sql<string>`md5(coalesce(string_agg(concat_ws(':', ${cards.id}, ${cards.latitude}, ${cards.longitude},
        ${cards.rarity}, ${cards.name}, ${cards.departmentCode}), ',' ORDER BY ${cards.id}), ''))`,
    })
    .from(cards)
    .where(visible(collectionId));
  return row.version.slice(0, 16);
}

/** The visible cards with a point, in ID order. */
export async function listMonuments(collectionId: number): Promise<MonumentRow[]> {
  const rows = await db
    .select({
      id: cards.id,
      // About a metre: enough for a pin, and a shorter list
      lat: sql<number>`round(${cards.latitude}::numeric, 5)::float8`,
      lon: sql<number>`round(${cards.longitude}::numeric, 5)::float8`,
      rarity: cards.rarity,
      name: cards.name,
      department: cards.departmentCode,
    })
    .from(cards)
    .where(visible(collectionId))
    .orderBy(cards.id);
  return rows.map((row) => [row.id, row.lat, row.lon, RARITIES.indexOf(row.rarity), row.name, row.department]);
}

/** The visible cards the player owns, with or without a point, in ID order. */
export async function ownedCardIds(userId: string, collectionId: number): Promise<number[]> {
  const rows = await db
    .select({ id: cards.id })
    .from(userCards)
    .innerJoin(cards, eq(cards.id, userCards.cardId))
    .where(and(eq(userCards.userId, userId), eq(cards.collectionId, collectionId), isNull(cards.hiddenReason)))
    .orderBy(cards.id);
  return rows.map((row) => row.id);
}

export interface DepartmentProgress {
  code: string;
  /** Visible cards of the department, with a point or not. */
  total: number;
  owned: number;
  region: string | null;
}

/** The player's progress in each department that has visible cards. */
export async function departmentProgress(userId: string, collectionId: number): Promise<DepartmentProgress[]> {
  const rows = await db
    .select({
      code: cards.departmentCode,
      total: count(),
      owned: count(userCards.cardId),
      region: sql<string | null>`max(${cards.region})`,
    })
    .from(cards)
    .leftJoin(userCards, and(eq(userCards.cardId, cards.id), eq(userCards.userId, userId)))
    .where(and(eq(cards.collectionId, collectionId), isNull(cards.hiddenReason), isNotNull(cards.departmentCode)))
    .groupBy(cards.departmentCode)
    .orderBy(cards.departmentCode);
  return rows.map((row) => ({ code: row.code!, total: row.total, owned: row.owned, region: row.region }));
}

export type MonumentDetails =
  | { owned: true; href: string; image: string | null; copies: number }
  | { owned: false };

/**
 * What a monument's sheet shows beyond the list: for a card the player owns,
 * its address, its thumbnail and their copies. Null for a card that isn't
 * visible in the collection.
 */
export async function monumentDetails(
  userId: string,
  collection: { id: number; slug: string },
  cardId: number,
): Promise<MonumentDetails | null> {
  const [row] = await db
    .select({ slug: cards.slug, photoImage: cards.photoImage, copies: userCards.quantity })
    .from(cards)
    .leftJoin(userCards, and(eq(userCards.cardId, cards.id), eq(userCards.userId, userId)))
    .where(and(eq(cards.id, cardId), eq(cards.collectionId, collection.id), isNull(cards.hiddenReason)));
  if (!row) return null;
  if (row.copies === null) return { owned: false };
  return {
    owned: true,
    href: cardPath(collection.slug, row.slug),
    image: row.photoImage ? cardImageUrl(row.photoImage, 400) : null,
    copies: row.copies,
  };
}

