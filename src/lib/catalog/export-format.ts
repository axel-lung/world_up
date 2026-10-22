import { z } from 'zod';
import { RARITIES } from '@/lib/rarity';

// import/catalog.json, written by scripts/export.py (format described in
// scripts/README.md). Checked in full before the import touches anything.

export const CATALOG_FORMAT = 1;
export const IMAGE_WIDTHS = ['400', '800'] as const;

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const imageFile = z.string().regex(/^[0-9a-f]{20}-(400|800)\.webp$/);

const photoSchema = z.object({
  commons_file: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  author: z.string().nullable(),
  license: z.string().nullable(),
  license_url: z.string().nullable(),
  files: z.object({ '400': imageFile, '800': imageFile }),
});

const cardSchema = z.object({
  wikidata_id: z.string().regex(/^Q[1-9]\d*$/),
  slug,
  name: z.string().min(1),
  rank: z.number().int().positive(),
  rarity: z.enum(RARITIES),
  protection: z.enum(['classe', 'inscrit']).nullable(),
  unesco: z.boolean(),
  endangered: z.boolean(),
  family: z.string().nullable(),
  department_code: z.string().nullable(),
  department: z.string().nullable(),
  region: z.string().nullable(),
  // Year of construction and the last architect's death: the review of the
  // 20th-century cards depends on them
  inception: z.number().int().nullable(),
  architect_death: z.number().int().nullable(),
  excerpt: z.string().nullable(),
  article: z.object({ title: z.string().min(1), revision: z.number().int().positive().nullable() }),
  photo: photoSchema.nullable(),
  photo_problem: z.enum(['missing', 'too_small', 'license', 'download']).nullable(),
  memorial: z.boolean(),
  commercial: z.boolean(),
  national_domain: z.boolean(),
  twentieth_century: z.boolean(),
  hidden_reason: z.enum(['memorial', 'commercial', 'national_domain', 'twentieth_century', 'photo']).nullable(),
  series: z.array(slug),
});

const catalogSchema = z
  .object({
    format: z.literal(CATALOG_FORMAT),
    collection: slug,
    generated_at: z.string(),
    rarity_shares: z.record(z.enum(RARITIES), z.number().min(0).max(1)),
    series: z.array(z.object({ slug, type: z.enum(['region', 'family', 'unesco', 'endangered']), name: z.string().min(1) })),
    cards: z.array(cardSchema).min(1),
  })
  .superRefine((catalog, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    const duplicates = (values: string[]) => values.filter((value, index) => values.indexOf(value) !== index);
    const seriesSlugs = new Set(catalog.series.map((s) => s.slug));
    if (seriesSlugs.size !== catalog.series.length) issue(`duplicate series: ${duplicates(catalog.series.map((s) => s.slug)).join(', ')}`);
    const ids = catalog.cards.map((card) => card.wikidata_id);
    const slugs = catalog.cards.map((card) => card.slug);
    if (new Set(ids).size !== ids.length) issue(`duplicate Wikidata IDs: ${duplicates(ids).slice(0, 5).join(', ')}`);
    if (new Set(slugs).size !== slugs.length) issue(`duplicate slugs: ${duplicates(slugs).slice(0, 5).join(', ')}`);
    for (const card of catalog.cards) {
      // A card players can draw always has a photo
      if (!card.photo && !card.hidden_reason) issue(`${card.wikidata_id} is visible without a photo`);
      const unknown = card.series.filter((s) => !seriesSlugs.has(s));
      if (unknown.length > 0) issue(`${card.wikidata_id} is in unknown series ${unknown.join(', ')}`);
    }
  });

export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogCard = Catalog['cards'][number];

/** Parses catalog.json, or throws with the first problems found. */
export function parseCatalog(json: unknown): Catalog {
  const result = catalogSchema.safeParse(json);
  if (result.success) return result.data;
  const problems = result.error.issues.slice(0, 10).map((issue) => `${issue.path.join('.') || 'catalog'}: ${issue.message}`);
  throw new Error(`Invalid catalog.json:\n- ${problems.join('\n- ')}`);
}

export function photoFiles(card: CatalogCard): string[] {
  return card.photo ? IMAGE_WIDTHS.map((width) => card.photo!.files[width]) : [];
}
