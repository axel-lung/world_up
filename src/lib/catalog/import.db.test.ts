import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, pool } from '@/db';
import { cards, cardSeries, collections, series } from '@/db/schema';
import type { CatalogCard } from './export-format';
import { importCatalog } from './import';
import { testCard, testCatalog } from './testing';

// Each test imports into its own throwaway collection.
let collectionId: number;
let collectionSlug: string;
const created: number[] = [];

beforeEach(async () => {
  collectionSlug = `test-${randomUUID().slice(0, 8)}`;
  const [row] = await db.insert(collections).values({ slug: collectionSlug, name: 'Test' }).returning({ id: collections.id });
  collectionId = row.id;
  created.push(row.id);
});

afterAll(async () => {
  // card_series rows go with their cards
  await db.delete(cards).where(inArray(cards.collectionId, created));
  await db.delete(series).where(inArray(series.collectionId, created));
  await db.delete(collections).where(inArray(collections.id, created));
  await pool.end();
});

const load = (list: CatalogCard[]) => importCatalog(db, testCatalog(list, collectionSlug));

async function cardRows() {
  const rows = await db.select().from(cards).where(eq(cards.collectionId, collectionId));
  return new Map(rows.map((row) => [row.wikidataId, row]));
}

/** Numbers of the cards in a series, by Wikidata ID, and its visible card count. */
async function seriesNumbers(slug: string) {
  const [s] = await db
    .select()
    .from(series)
    .where(and(eq(series.collectionId, collectionId), eq(series.slug, slug)));
  const rows = await db
    .select({ wikidataId: cards.wikidataId, number: cardSeries.number })
    .from(cardSeries)
    .innerJoin(cards, eq(cards.id, cardSeries.cardId))
    .where(eq(cardSeries.seriesId, s.id));
  return { numbers: Object.fromEntries(rows.map((row) => [row.wikidataId, row.number])), count: s.cardCount };
}

describe('importCatalog', () => {
  it('imports the cards and numbers the visible ones in each series', async () => {
    const report = await load([
      testCard(1),
      testCard(2, { memorial: true, hidden_reason: 'memorial' }),
      testCard(3, { series: ['centre-val-de-loire', 'chateaux-forteresses'] }),
    ]);
    expect(report).toMatchObject({ inserted: 3, updated: 0, series: 2, hidden: { memorial: 1 } });
    expect(await seriesNumbers('centre-val-de-loire')).toEqual({ numbers: { Q1: 1, Q2: null, Q3: 2 }, count: 2 });
    expect(await seriesNumbers('chateaux-forteresses')).toEqual({ numbers: { Q3: 1 }, count: 1 });
    expect((await cardRows()).get('Q1')).toMatchObject({
      slug: 'monument-1',
      photoImage: '1aaaaaaaaaaaaaaaaaaa',
      hiddenReason: null,
      inceptionYear: 1519,
      architectDeathYear: null,
    });
  });

  it('changes nothing when run again with the same export', async () => {
    const list = [testCard(1), testCard(2, { photo: null, photo_problem: 'too_small', hidden_reason: 'photo' }), testCard(3)];
    await load(list);
    const before = await cardRows();
    const report = await load(list);
    const after = await cardRows();
    expect(report).toMatchObject({ inserted: 0, updated: 3 });
    expect(after.size).toBe(3);
    for (const [id, row] of after) expect({ ...row, updatedAt: null }).toEqual({ ...before.get(id), updatedAt: null });
    expect(await seriesNumbers('centre-val-de-loire')).toEqual({ numbers: { Q1: 1, Q2: null, Q3: 2 }, count: 2 });
  });

  it('keeps the rarity, rank and slug of a card already imported', async () => {
    await load([testCard(1, { rarity: 'legendary' })]);
    await load([testCard(1, { rarity: 'common', rank: 50, slug: 'renamed', name: 'nouveau nom' })]);
    expect((await cardRows()).get('Q1')).toMatchObject({ rarity: 'legendary', rank: 1, slug: 'monument-1', name: 'nouveau nom' });
  });

  it('gives a new card a free slug', async () => {
    await load([testCard(1)]);
    await load([testCard(1, { slug: 'monument-9' }), testCard(9, { slug: 'monument-1' })]);
    const rows = await cardRows();
    expect([rows.get('Q1')?.slug, rows.get('Q9')?.slug]).toEqual(['monument-1', 'monument-1-q9']);
  });

  it('shows a card hidden for want of a photo once the export has one', async () => {
    await load([testCard(1), testCard(2, { photo: null, photo_problem: 'missing', hidden_reason: 'photo' })]);
    await load([testCard(1), testCard(2)]);
    expect((await cardRows()).get('Q2')).toMatchObject({ hiddenReason: null, photoProblem: null, photoImage: '2aaaaaaaaaaaaaaaaaaa' });
    expect((await seriesNumbers('centre-val-de-loire')).numbers).toEqual({ Q1: 1, Q2: 2 });
  });

  it('keeps what the back-office decided', async () => {
    await load([testCard(1), testCard(2), testCard(3)]);
    const rows = await cardRows();
    await db.update(cards).set({ hiddenReason: 'admin' }).where(eq(cards.id, rows.get('Q1')!.id));
    await db
      .update(cards)
      .set({ photoLocked: true, photoImage: 'bbbbbbbbbbbbbbbbbbbb', photoAuthor: 'Choisie' })
      .where(eq(cards.id, rows.get('Q2')!.id));
    await db.update(cards).set({ hiddenReason: null }).where(eq(cards.id, rows.get('Q3')!.id));

    await load([testCard(1), testCard(2, { image: 'c2' }), testCard(3, { twentieth_century: true, hidden_reason: 'twentieth_century' })]);
    const after = await cardRows();
    expect(after.get('Q1')?.hiddenReason).toBe('admin');
    expect(after.get('Q2')).toMatchObject({ photoImage: 'bbbbbbbbbbbbbbbbbbbb', photoAuthor: 'Choisie' });
    expect(after.get('Q3')).toMatchObject({ hiddenReason: null, twentiethCentury: true });
  });

  it('hides a visible card the export newly places in a national domain, once', async () => {
    await load([testCard(1), testCard(2)]);
    const domain = { national_domain: true, hidden_reason: 'national_domain' } as const;
    await load([testCard(1, domain), testCard(2)]);
    expect((await cardRows()).get('Q1')).toMatchObject({ hiddenReason: 'national_domain', nationalDomain: true });
    expect(await seriesNumbers('centre-val-de-loire')).toEqual({ numbers: { Q1: null, Q2: 1 }, count: 1 });

    // Shown again in the back-office (authorisation obtained): the next import keeps it visible
    await db.update(cards).set({ hiddenReason: null }).where(eq(cards.id, (await cardRows()).get('Q1')!.id));
    await load([testCard(1, domain), testCard(2)]);
    expect((await cardRows()).get('Q1')?.hiddenReason).toBeNull();
  });

  it('hides a visible card whose photo the export now refuses for its licence, unless chosen in the back-office', async () => {
    await load([testCard(1), testCard(2)]);
    await db.update(cards).set({ photoLocked: true }).where(eq(cards.id, (await cardRows()).get('Q2')!.id));
    const refused = { photo: null, photo_problem: 'license', hidden_reason: 'photo' } as const;
    await load([testCard(1, refused), testCard(2, refused)]);
    const rows = await cardRows();
    expect(rows.get('Q1')).toMatchObject({ hiddenReason: 'photo', photoProblem: 'license' });
    expect(rows.get('Q2')).toMatchObject({ hiddenReason: null, photoProblem: null });
  });

  it('adds new cards at the end of their series', async () => {
    await load([testCard(5), testCard(6)]);
    await load([testCard(1), testCard(5), testCard(6)]);
    expect((await seriesNumbers('centre-val-de-loire')).numbers).toEqual({ Q5: 1, Q6: 2, Q1: 3 });
  });

  it('takes a card out of a series the export no longer puts it in', async () => {
    await load([testCard(1, { series: ['centre-val-de-loire', 'chateaux-forteresses'] })]);
    await load([testCard(1)]);
    expect(await seriesNumbers('chateaux-forteresses')).toEqual({ numbers: {}, count: 0 });
  });

  it('leaves the cards missing from the export as they are', async () => {
    await load([testCard(1), testCard(2)]);
    expect(await load([testCard(1)])).toMatchObject({ notInExport: 1, updated: 1 });
    expect((await cardRows()).has('Q2')).toBe(true);
  });
});
