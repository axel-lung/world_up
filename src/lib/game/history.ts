import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { cards, packCards, packOpenings } from '@/db/schema';
import type { Rarity } from '@/lib/rarity';

// The player's pack openings, newest first (/c/[collection]/packs/history).
// The account export has them all; the page shows the latest ones only.

export const HISTORY_PAGE_SIZE = 10;
export const HISTORY_MAX_PAGES = 20;

export interface HistoryCard {
  position: number;
  isNew: boolean;
  name: string;
  rarity: Rarity;
  /** The card's slug and photo; null once the card is hidden (it leads nowhere, and shows no photo). */
  slug: string | null;
  photoImage: string | null;
}

export interface HistoryOpening {
  id: number;
  openedAt: Date;
  cards: HistoryCard[];
}

/** The latest `pages` pages of the player's openings, with their cards, and how many there are. */
export async function openingHistory(
  userId: string,
  collectionId: number,
  pages: number,
): Promise<{ openings: HistoryOpening[]; total: number }> {
  const mine = and(eq(packOpenings.userId, userId), eq(packOpenings.collectionId, collectionId));
  const [[{ total }], openings] = await Promise.all([
    db.select({ total: count() }).from(packOpenings).where(mine),
    db
      .select({ id: packOpenings.id, openedAt: packOpenings.createdAt })
      .from(packOpenings)
      .where(mine)
      .orderBy(desc(packOpenings.createdAt), desc(packOpenings.id))
      .limit(Math.min(pages, HISTORY_MAX_PAGES) * HISTORY_PAGE_SIZE),
  ]);
  if (openings.length === 0) return { openings: [], total };

  const drawn = await db
    .select({
      openingId: packCards.openingId,
      position: packCards.position,
      isNew: packCards.isNew,
      name: cards.name,
      rarity: cards.rarity,
      slug: cards.slug,
      hidden: cards.hiddenReason,
      photoImage: cards.photoImage,
    })
    .from(packCards)
    .innerJoin(cards, eq(cards.id, packCards.cardId))
    .where(inArray(packCards.openingId, openings.map((opening) => opening.id)))
    .orderBy(asc(packCards.openingId), asc(packCards.position));
  const byOpening = new Map<number, HistoryCard[]>();
  for (const { openingId, hidden, slug, photoImage, ...card } of drawn) {
    const list = byOpening.get(openingId) ?? [];
    list.push({ ...card, slug: hidden ? null : slug, photoImage: hidden ? null : photoImage });
    byOpening.set(openingId, list);
  }
  return {
    openings: openings.map((opening) => ({ ...opening, cards: byOpening.get(opening.id) ?? [] })),
    total,
  };
}
