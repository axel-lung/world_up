import { z } from 'zod';
import { COLLECTION_TABS } from '@/lib/game/collection';
import { RARITIES } from '@/lib/rarity';

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// Unknown or malformed parameters fall back to their default
const gridSchema = z.object({
  tab: z.enum(COLLECTION_TABS).catch('all'),
  rarity: z.enum(RARITIES).nullable().catch(null),
  series: z.string().max(100).nullable().catch(null),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export function parseGridParams(params: SearchParams) {
  return gridSchema.parse({
    tab: one(params.tab) ?? 'all',
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
