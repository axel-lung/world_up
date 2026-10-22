import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inArray } from 'drizzle-orm';
// The pool stays open: Playwright runs the next test files in the same worker
import { db } from '@/db';
import { cards, collections, series } from '@/db/schema';
import { importCatalog } from '@/lib/catalog/import';
import { testCard, testCatalog } from '@/lib/catalog/testing';
import { CARD_IMAGES_DIR } from '@/lib/uploads';
import { expect, newPlayer, signUpAndVerify, test } from './helpers';

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
  // The CC 2.0 and 3.0 licences want their text linked from each copy
  await expect(photo.getByRole('link', { name: 'CC BY-SA 4.0' })).toHaveAttribute(
    'href',
    'https://creativecommons.org/licenses/by-sa/4.0',
  );
  const about = page.getByRole('region', { name: 'Le monument' });
  await expect(about.getByRole('link', { name: "Lire l'article sur Wikipédia" })).toHaveAttribute(
    'href',
    'https://fr.wikipedia.org/wiki/Ch%C3%A2teau_de_Test',
  );
  await expect(about.getByRole('link', { name: 'CC BY-SA 4.0' })).toHaveAttribute(
    'href',
    'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
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
  // Reporting a problem needs an account
  await expect(page.getByText('Signaler un problème sur cette carte')).toHaveCount(0);
});

test('a signed-in player reports a problem with a card', async ({ page }) => {
  await signUpAndVerify(page, newPlayer());
  await page.goto(`/c/${collection}/cards/monument-1`);
  await page.getByText('Signaler un problème sur cette carte').click();
  await page.getByLabel('Le texte').check();
  await page.getByLabel('Votre message').fill('La date de construction est fausse.');
  await page.getByRole('button', { name: 'Envoyer le signalement' }).click();
  await expect(page.getByText('Merci : votre signalement a été transmis.')).toBeVisible();
});

// The server runs from the same folder as the tests: they share ./uploads
test('serves a card photo from the uploads folder, cached for good', async ({ request }) => {
  const name = `${randomUUID().replaceAll('-', '').slice(0, 20)}-400.webp`;
  const file = path.join(CARD_IMAGES_DIR, name);
  await mkdir(CARD_IMAGES_DIR, { recursive: true });
  await writeFile(file, 'une photo de test');
  try {
    const response = await request.get(`/uploads/cards/${name}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/webp');
    expect(response.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
    expect((await request.get('/uploads/cards/absente-400.webp')).status()).toBe(404);
  } finally {
    await rm(file);
  }
});

test('a hidden card has no page', async ({ page }) => {
  const response = await page.goto(`/c/${collection}/cards/monument-2`);
  expect(response?.status()).toBe(404);
});
