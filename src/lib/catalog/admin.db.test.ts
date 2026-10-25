import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, pool } from '@/db';
import { auditLog, cards, cardSeries, collections, series, users } from '@/db/schema';
import { setCardPhoto, setCardRarity, setCardVisibility } from './admin';
import { importCatalog } from './import';
import { testCard, testCatalog } from './testing';

let adminId: string;
let collectionId: number;
let collectionSlug: string;
const created: number[] = [];

beforeAll(async () => {
  const id = randomUUID().slice(0, 8);
  const [admin] = await db
    .insert(users)
    .values({ name: `admin-${id}`, email: `admin-${id}@example.test`, birthDate: '1990-01-01' })
    .returning({ id: users.id });
  adminId = admin.id;
});

beforeEach(async () => {
  collectionSlug = `test-${randomUUID().slice(0, 8)}`;
  const [row] = await db.insert(collections).values({ slug: collectionSlug, name: 'Test' }).returning({ id: collections.id });
  collectionId = row.id;
  created.push(row.id);
  await importCatalog(db, testCatalog([testCard(1), testCard(2), testCard(3, { photo: null, hidden_reason: 'photo' })], collectionSlug));
});

afterAll(async () => {
  const ids = (await db.select({ id: cards.id }).from(cards).where(inArray(cards.collectionId, created))).map((c) => String(c.id));
  if (ids.length > 0) await db.delete(auditLog).where(and(eq(auditLog.targetType, 'card'), inArray(auditLog.targetId, ids)));
  await db.delete(cards).where(inArray(cards.collectionId, created));
  await db.delete(series).where(inArray(series.collectionId, created));
  await db.delete(collections).where(inArray(collections.id, created));
  await db.delete(users).where(eq(users.id, adminId));
  await pool.end();
});

async function card(wikidataId: string) {
  const [row] = await db
    .select()
    .from(cards)
    .where(and(eq(cards.collectionId, collectionId), eq(cards.wikidataId, wikidataId)));
  return row;
}

async function numbers() {
  const rows = await db
    .select({ wikidataId: cards.wikidataId, number: cardSeries.number, count: series.cardCount })
    .from(cardSeries)
    .innerJoin(cards, eq(cards.id, cardSeries.cardId))
    .innerJoin(series, eq(series.id, cardSeries.seriesId))
    .where(eq(cards.collectionId, collectionId));
  return { numbers: Object.fromEntries(rows.map((r) => [r.wikidataId, r.number])), count: rows[0].count };
}

const history = async (cardId: number) =>
  db
    .select({ action: auditLog.action, details: auditLog.details, adminId: auditLog.adminId })
    .from(auditLog)
    .where(and(eq(auditLog.targetType, 'card'), eq(auditLog.targetId, String(cardId))));

describe('back-office catalogue changes', () => {
  it('hides a card, renumbers its series and logs it', async () => {
    const first = await card('Q1');
    await setCardVisibility(db, adminId, first.id, 'admin', 'photo floue');
    expect((await card('Q1')).hiddenReason).toBe('admin');
    expect(await numbers()).toEqual({ numbers: { Q1: null, Q2: 1, Q3: null }, count: 1 });
    expect(await history(first.id)).toEqual([
      { action: 'card.hide', details: { from: null, to: 'admin', note: 'photo floue' }, adminId },
    ]);

    await setCardVisibility(db, adminId, first.id, null, null);
    expect(await numbers()).toEqual({ numbers: { Q1: 1, Q2: 2, Q3: null }, count: 2 });
    expect((await history(first.id)).map((h) => h.action).sort()).toEqual(['card.hide', 'card.show']);
  });

  it('never shows a card without a photo', async () => {
    const third = await card('Q3');
    await expect(setCardVisibility(db, adminId, third.id, null, null)).rejects.toMatchObject({ code: 'noPhoto' });
    expect((await card('Q3')).hiddenReason).toBe('photo');
    expect(await history(third.id)).toEqual([]);
  });

  it('keeps a 20th-century card it hid, even once the export clears it', async () => {
    const first = await card('Q1');
    await setCardVisibility(db, adminId, first.id, 'twentieth_century', 'architecte encore vivant');
    const cleared = { twentieth_century: true } as const;
    await importCatalog(db, testCatalog([testCard(1, cleared), testCard(2), testCard(3, { photo: null, hidden_reason: 'photo' })], collectionSlug));
    expect((await card('Q1')).hiddenReason).toBe('twentieth_century');
  });

  it('changes a rarity and logs the old and new ones', async () => {
    const first = await card('Q1');
    await setCardRarity(db, adminId, first.id, 'legendary');
    expect((await card('Q1')).rarity).toBe('legendary');
    expect(await history(first.id)).toEqual([
      { action: 'card.rarity', details: { from: 'common', to: 'legendary' }, adminId },
    ]);
    await expect(setCardRarity(db, adminId, first.id, 'legendary')).rejects.toMatchObject({ code: 'rarityUnchanged' });
  });

  it('replaces a photo, which the next import then keeps', async () => {
    const third = await card('Q3');
    const photo = {
      image: 'eeeeeeeeeeeeeeeeeeee',
      commonsFile: 'Choisie.jpg',
      width: 3000,
      height: 2000,
      author: 'Admin',
      license: 'CC0',
      licenseUrl: null,
    };
    await setCardPhoto(db, adminId, third.id, photo);
    await setCardVisibility(db, adminId, third.id, null, null);
    expect(await card('Q3')).toMatchObject({ photoImage: photo.image, photoLocked: true, photoProblem: null, hiddenReason: null });

    await importCatalog(db, testCatalog([testCard(1), testCard(2), testCard(3, { image: 'f3' })], collectionSlug));
    expect(await card('Q3')).toMatchObject({ photoImage: photo.image, photoAuthor: 'Admin', hiddenReason: null });
    expect((await history(third.id))[0]).toMatchObject({ details: { from: null, to: 'Choisie.jpg' } });
  });
});
