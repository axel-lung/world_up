import type { Catalog, CatalogCard } from './export-format';

// Small exports for the catalogue tests.

// A photo file name prefix: hex digits from the seed, padded to 20.
const sha1 = (seed: string) => (seed.replace(/[^0-9a-f]/g, '') + 'a'.repeat(20)).slice(0, 20);

export function testCard(id: number, overrides: Partial<CatalogCard> & { image?: string } = {}): CatalogCard {
  const { image: seed, ...rest } = overrides;
  const image = sha1(seed ?? String(id));
  return {
    wikidata_id: `Q${id}`,
    slug: `monument-${id}`,
    name: `monument ${id}`,
    rank: id,
    rarity: 'common',
    protection: 'classe',
    unesco: false,
    endangered: false,
    family: 'Châteaux & forteresses',
    department_code: '41',
    department: 'Loir-et-Cher',
    region: 'Centre-Val de Loire',
    inception: 1519,
    architect_death: null,
    excerpt: `Le monument ${id}.`,
    article: { title: `Monument ${id}`, revision: 1000 + id },
    photo: {
      commons_file: `Monument ${id}.jpg`,
      width: 4000,
      height: 3000,
      author: 'Jean Photo',
      license: 'CC BY-SA 4.0',
      license_url: 'https://creativecommons.org/licenses/by-sa/4.0',
      files: { '400': `${image}-400.webp`, '800': `${image}-800.webp` },
    },
    photo_problem: null,
    memorial: false,
    commercial: false,
    twentieth_century: false,
    hidden_reason: null,
    series: ['centre-val-de-loire'],
    ...rest,
  };
}

export function testCatalog(cards: CatalogCard[], collection = 'heritage'): Catalog {
  return {
    format: 1,
    collection,
    generated_at: '2026-10-20T12:00:00+00:00',
    rarity_shares: { legendary: 0.0025, ultra: 0.025, super: 0.07, rare: 0.2, uncommon: 0.2, common: 0.5025 },
    series: [
      { slug: 'centre-val-de-loire', type: 'region', name: 'Centre-Val de Loire' },
      { slug: 'chateaux-forteresses', type: 'family', name: 'Châteaux & forteresses' },
    ],
    cards,
  };
}
