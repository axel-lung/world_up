import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/db';
import { cards, cardSeries, collections, series } from '@/db/schema';

export const cardPath = (collection: string, slug: string) => `/c/${collection}/cards/${slug}`;
export const cardImageUrl = (image: string, width: 400 | 800) => `/uploads/cards/${image}-${width}.webp`;
export const articleUrl = (title: string) => `https://fr.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`;
export const commonsFileUrl = (file: string) =>
  `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replaceAll(' ', '_'))}`;

// Order of the series on a card page; the first one is printed on the card.
const SERIES_ORDER = ['region', 'family', 'unesco', 'endangered'];

const cardColumns = {
  id: cards.id,
  slug: cards.slug,
  name: cards.name,
  rarity: cards.rarity,
  protection: cards.protection,
  unesco: cards.unesco,
  endangered: cards.endangered,
  department: cards.department,
  region: cards.region,
  excerpt: cards.excerpt,
  articleTitle: cards.articleTitle,
  photoImage: cards.photoImage,
  photoCommonsFile: cards.photoCommonsFile,
  photoWidth: cards.photoWidth,
  photoHeight: cards.photoHeight,
  photoAuthor: cards.photoAuthor,
  photoLicense: cards.photoLicense,
  updatedAt: cards.updatedAt,
};

/**
 * A card of an active collection that players can see, with its series, or
 * null: hidden cards have no public page. Cached for the request, since the
 * page and its metadata both ask for it.
 */
export const getVisibleCard = cache(async (collectionSlug: string, slug: string) => {
  const [card] = await db
    .select({ ...cardColumns, collectionName: collections.name })
    .from(cards)
    .innerJoin(collections, eq(collections.id, cards.collectionId))
    .where(
      and(
        eq(collections.slug, collectionSlug),
        eq(collections.active, true),
        eq(cards.slug, slug),
        isNull(cards.hiddenReason),
        isNotNull(cards.photoImage),
      ),
    )
    .limit(1);
  if (!card) return null;

  const memberships = await db
    .select({ slug: series.slug, type: series.type, name: series.name, number: cardSeries.number, total: series.cardCount })
    .from(cardSeries)
    .innerJoin(series, eq(series.id, cardSeries.seriesId))
    .where(and(eq(cardSeries.cardId, card.id), isNotNull(cardSeries.number)));
  memberships.sort((a, b) => SERIES_ORDER.indexOf(a.type) - SERIES_ORDER.indexOf(b.type));
  return {
    ...card,
    photoImage: card.photoImage!,
    series: memberships.map((m) => ({ ...m, number: m.number! })),
  };
});

export type VisibleCard = NonNullable<Awaited<ReturnType<typeof getVisibleCard>>>;

/** Every public card page, for the sitemap. */
export async function listVisibleCards() {
  return db
    .select({ collection: collections.slug, slug: cards.slug, updatedAt: cards.updatedAt })
    .from(cards)
    .innerJoin(collections, eq(collections.id, cards.collectionId))
    .where(and(eq(collections.active, true), isNull(cards.hiddenReason), isNotNull(cards.photoImage)))
    .orderBy(cards.collectionId, cards.rank);
}
