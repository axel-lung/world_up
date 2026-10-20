import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { collections } from '@/db/schema';
import { type CollectionTheme, collectionThemeCss, parseCollectionTheme } from './collection-theme';

// The launch collection. Its theme also dresses the pages outside /c/<slug>
// (home, shop, account).
export const DEFAULT_COLLECTION_SLUG = 'heritage';

// Themes only change from the back-office: cache them for a minute per process.
const THEME_TTL_MS = 60_000;
const themeCache = new Map<string, { expires: number; theme: CollectionTheme | null }>();

export async function getCollectionTheme(slug: string): Promise<CollectionTheme | null> {
  const cached = themeCache.get(slug);
  if (cached && cached.expires > Date.now()) return cached.theme;

  const [row] = await db
    .select({ theme: collections.theme })
    .from(collections)
    .where(eq(collections.slug, slug))
    .limit(1);
  const theme = row ? parseCollectionTheme(row.theme) : null;
  themeCache.set(slug, { expires: Date.now() + THEME_TTL_MS, theme });
  return theme;
}

/**
 * CSS for the default collection's theme, or null when it can't be read: the
 * page then renders with the base theme rather than failing.
 */
export async function getDefaultThemeCss(): Promise<string | null> {
  try {
    const theme = await getCollectionTheme(DEFAULT_COLLECTION_SLUG);
    return theme ? collectionThemeCss(theme) : null;
  } catch (error) {
    console.error('Collection theme unavailable:', error instanceof Error ? error.message : error);
    return null;
  }
}
