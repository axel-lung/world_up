import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { cardPath, listVisibleCards } from '@/lib/catalog/cards';
import { requireEnv } from '@/lib/env';

// The public pages and every card page (about 25,000, under the 50,000 URLs a
// sitemap may hold). Built at request time: the catalogue lives in the database.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = requireEnv('APP_URL');
  const cards = await listVisibleCards();
  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/credits`, changeFrequency: 'yearly', priority: 0.3 },
    ...['/terms', '/privacy', '/legal-notice'].map((path) => ({
      url: `${base}${path}`,
      changeFrequency: 'yearly' as const,
      priority: 0.1,
    })),
    ...cards.map((card) => ({
      url: `${base}${cardPath(card.collection, card.slug)}`,
      lastModified: card.updatedAt,
      changeFrequency: 'monthly' as const,
    })),
  ];
}
