import { describe, expect, it } from 'vitest';
import { parseCatalog } from './export-format';
import { testCard, testCatalog } from './testing';

describe('parseCatalog', () => {
  it('accepts an export from the pipeline', () => {
    const catalog = parseCatalog(
      testCatalog([testCard(1), testCard(2, { photo: null, hidden_reason: 'photo' }), testCard(3, { coordinates: null })]),
    );
    expect(catalog.cards).toHaveLength(3);
  });

  it.each([
    ['an export from before the coordinates', { ...testCatalog([testCard(1)]), format: 1 }],
    ['a card without its coordinates field', testCatalog([{ ...testCard(1), coordinates: undefined as never }])],
    ['a latitude out of range', testCatalog([testCard(1, { coordinates: { lat: 91, lon: 2, precision: null } })])],
    ['a negative precision', testCatalog([testCard(1, { coordinates: { lat: 48, lon: 2, precision: -1 } })])],
    ['no cards', testCatalog([])],
    ['a visible card without a photo', testCatalog([testCard(1, { photo: null })])],
    ['a duplicate Wikidata ID', testCatalog([testCard(1), testCard(1, { slug: 'other' })])],
    ['a duplicate slug', testCatalog([testCard(1), testCard(2, { slug: 'monument-1' })])],
    ['an unknown series', testCatalog([testCard(1, { series: ['bretagne'] })])],
    ['an unknown rarity', testCatalog([testCard(1, { rarity: 'mythic' as never })])],
    ['a hidden reason only the back-office sets', testCatalog([testCard(1, { hidden_reason: 'admin' as never })])],
  ])('rejects %s', (_, catalog) => {
    expect(() => parseCatalog(catalog)).toThrow('Invalid catalog.json');
  });

  it.each(['../../etc/passwd', 'a/b-400.webp', 'ABCDEF0123456789abcd-400.webp'])('rejects the photo file name %s', (file) => {
    const card = testCard(1);
    card.photo!.files['400'] = file;
    expect(() => parseCatalog(testCatalog([card]))).toThrow('photo.files.400');
  });
});
