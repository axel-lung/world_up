import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { cards, userCards } from '@/db/schema';
import { testCard } from '@/lib/catalog/testing';
import { createTestCollection, createTestPlayer, deleteTestData, type TestCollection } from '@/lib/game/testing';
import { departmentProgress, listMonuments, monumentDetails, monumentsVersion, ownedCardIds } from './monuments';

// Q1 and Q2 in Loir-et-Cher (41), Q3 in Paris (75) as a rare, Q4 in Paris
// without a point, Q5 hidden: the map shows Q1, Q2 and Q3.
const ODDS = { legendary: 0, ultra: 0, super: 0, rare: 0, uncommon: 0, common: 1_000_000 };
const PARIS = { department_code: '75', department: 'Paris', region: 'Île-de-France' };
let collection: TestCollection;
let player: string;
const ids = new Map<string, number>();

beforeAll(async () => {
  collection = await createTestCollection(
    [
      testCard(1),
      testCard(2, { coordinates: { lat: 47.586092, lon: 1.336502, precision: null } }),
      testCard(3, { ...PARIS, rarity: 'rare', name: 'cathédrale Notre-Dame de Paris', coordinates: { lat: 48.852968, lon: 2.349902, precision: 1 } }),
      testCard(4, { ...PARIS, coordinates: null }),
      testCard(5, { memorial: true, hidden_reason: 'memorial' }),
    ],
    { odds: ODDS },
  );
  for (const row of await db.select({ id: cards.id, wikidataId: cards.wikidataId }).from(cards).where(eq(cards.collectionId, collection.id))) {
    ids.set(row.wikidataId, row.id);
  }
  player = await createTestPlayer();
  await db.insert(userCards).values(
    ['Q1', 'Q4', 'Q5'].map((q) => ({ userId: player, collectionId: collection.id, cardId: ids.get(q)!, quantity: q === 'Q1' ? 3 : 1, firstObtainedAt: new Date() })),
  );
});

afterAll(async () => {
  await deleteTestData([collection.id], [player]);
});

describe('the map', () => {
  it('lists the visible cards with a point: position, rarity, name and department', async () => {
    expect(await listMonuments(collection.id)).toEqual([
      [ids.get('Q1'), 47.61611, 1.51722, 5, 'monument 1', '41'],
      [ids.get('Q2'), 47.58609, 1.3365, 5, 'monument 2', '41'],
      [ids.get('Q3'), 48.85297, 2.3499, 3, 'cathédrale Notre-Dame de Paris', '75'],
    ]);
  });

  it('versions the list, which changes when a monument does', async () => {
    const before = await monumentsVersion(collection.id);
    expect(before).toMatch(/^[0-9a-f]{16}$/);
    expect(await monumentsVersion(collection.id)).toBe(before);
    await db.update(cards).set({ hiddenReason: 'memorial' }).where(eq(cards.id, ids.get('Q2')!));
    const hidden = await monumentsVersion(collection.id);
    expect(hidden).not.toBe(before);
    await db.update(cards).set({ hiddenReason: null }).where(eq(cards.id, ids.get('Q2')!));
    await db.update(cards).set({ latitude: 47.6 }).where(eq(cards.id, ids.get('Q2')!));
    expect(await monumentsVersion(collection.id)).not.toBe(before);
    await db.update(cards).set({ latitude: 47.586092 }).where(eq(cards.id, ids.get('Q2')!));
    expect(await monumentsVersion(collection.id)).toBe(before);
  });

  it("gives the player's visible cards, with a point or not", async () => {
    expect(await ownedCardIds(player, collection.id)).toEqual([ids.get('Q1'), ids.get('Q4')]);
  });

  it("measures the player's progress in each department, hidden cards left out", async () => {
    expect(await departmentProgress(player, collection.id)).toEqual([
      { code: '41', total: 2, owned: 1, region: 'Centre-Val de Loire' },
      { code: '75', total: 2, owned: 1, region: 'Île-de-France' },
    ]);
  });

  it("shows an owned card's page and photo, and nothing of a lacking one", async () => {
    expect(await monumentDetails(player, collection, ids.get('Q1')!)).toEqual({
      owned: true,
      href: `/c/${collection.slug}/cards/monument-1`,
      image: '/uploads/cards/1aaaaaaaaaaaaaaaaaaa-400.webp',
      copies: 3,
    });
    expect(await monumentDetails(player, collection, ids.get('Q3')!)).toEqual({ owned: false });
    // Hidden, or of another collection: nothing
    expect(await monumentDetails(player, collection, ids.get('Q5')!)).toBeNull();
    expect(await monumentDetails(player, { id: collection.id + 1_000_000, slug: 'other' }, ids.get('Q1')!)).toBeNull();
  });
});
