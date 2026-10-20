import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { inArray } from 'drizzle-orm';
// The pool stays open: Playwright runs the next test files in the same worker
import { db } from '@/db';
import { cards, collections, series } from '@/db/schema';
import { importCatalog } from '@/lib/catalog/import';
import { testCard, testCatalog } from '@/lib/catalog/testing';

// A throwaway collection with one visible card and one hidden card.
const collection = `e2e-${randomUUID().slice(0, 8)}`;
let collectionId: number;

test.beforeAll(async () => {
  const [row] = await db.insert(collections).values({ slug: collection, name: 'Patrimoine de France', active: true }).returning();
  collectionId = row.id;
  await importCatalog(
    db,
    testCatalog(
      [
        testCard(1, { name: 'château de Test', article: { title: 'Château de Test', revision: 1 } }),
        testCard(2, { memorial: true, hidden_reason: 'memorial' }),
      ],
      collection,
    ),
  );
});

test.afterAll(async () => {
  await db.delete(cards).where(inArray(cards.collectionId, [collectionId]));
  await db.delete(series).where(inArray(series.collectionId, [collectionId]));
  await db.delete(collections).where(inArray(collections.id, [collectionId]));
});

test('a card page credits the photo and the text, and loads nothing from Wikimedia', async ({ page }) => {
  const wikimedia: string[] = [];
  page.on('request', (request) => {
    if (/wikimedia\.org|wikipedia\.org/.test(new URL(request.url()).hostname)) wikimedia.push(request.url());
  });

  await page.goto(`/c/${collection}/cards/monument-1`);
  await expect(page).toHaveTitle(/^Château de Test · /);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Château de Test');

  const photo = page.getByRole('region', { name: 'La photo' });
  await expect(photo).toContainText('Jean Photo · CC BY-SA 4.0');
  await expect(photo.getByRole('link', { name: 'fichier sur Wikimedia Commons' })).toHaveAttribute(
    'href',
    'https://commons.wikimedia.org/wiki/File:Monument_1.jpg',
  );
  const about = page.getByRole('region', { name: 'Le monument' });
  await expect(about.getByRole('link', { name: "Lire l'article sur Wikipédia" })).toHaveAttribute(
    'href',
    'https://fr.wikipedia.org/wiki/Ch%C3%A2teau_de_Test',
  );

  // The back of the card: excerpt, article link and text licence. The flip
  // button is for keyboards and screen readers (a mouse clicks the card).
  await page.getByRole('button', { name: 'Voir le verso' }).press('Enter');
  const card = page.getByRole('region', { name: 'La carte' });
  await expect(card.getByText('Le monument 1.')).toBeVisible();
  await expect(card.getByText('Texte : Wikipédia, licence CC BY-SA 4.0')).toBeVisible();
  await expect(card.getByRole('link', { name: "Lire l'article sur Wikipédia" })).toBeVisible();
  await expect(card.getByRole('link', { name: 'Fichier sur Wikimedia Commons' })).toBeVisible();

  expect(wikimedia).toEqual([]);
});

test('a hidden card has no page', async ({ page }) => {
  const response = await page.goto(`/c/${collection}/cards/monument-2`);
  expect(response?.status()).toBe(404);
});
