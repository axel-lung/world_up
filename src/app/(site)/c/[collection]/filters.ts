import { z } from 'zod';
import { COLLECTION_TABS, type CollectionTab } from '@/lib/game/collection';
import { RARITIES } from '@/lib/rarity';

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// Unknown or malformed parameters fall back to their default
const gridSchema = z.object({
  rarity: z.enum(RARITIES).nullable().catch(null),
  series: z.string().max(100).nullable().catch(null),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

/** The grid's filters; `tabs` are the page's tabs, the first one being the default. */
export function parseGridParams(
  params: SearchParams,
  tabs: readonly [CollectionTab, ...CollectionTab[]] = COLLECTION_TABS,
) {
  return gridSchema.extend({ tab: z.enum(tabs).catch(tabs[0]) }).parse({
    tab: one(params.tab) ?? tabs[0],
    rarity: one(params.rarity) || null,
    series: one(params.series) || null,
    page: one(params.page) ?? 1,
  });
}

const resaleSchema = z.object({
  sold: z.coerce.number().int().min(0).nullable().catch(null),
  coins: z.coerce.number().int().min(0).catch(0),
  error: z.enum(['noDuplicate', 'notEnoughCoins']).nullable().catch(null),
});

/** The outcome of a resale, which resellAction puts in the address it returns to. */
export function parseResaleParams(params: SearchParams) {
  return resaleSchema.parse({
    sold: one(params.sold) ?? null,
    coins: one(params.coins) ?? 0,
    error: one(params.error) ?? null,
  });
}
