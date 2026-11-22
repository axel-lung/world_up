import { inArray } from 'drizzle-orm';
// The pool stays open: Playwright runs the next test files in the same worker
import { db } from '@/db';
import { users } from '@/db/schema';
import { testCard } from '@/lib/catalog/testing';
import { createTestCollection, deleteTestData, type TestCollection } from '@/lib/game/testing';
import { expect, newPlayer, type Player, signUpAndVerify, test } from './helpers';

// The wishlist (decided on 2026-11-22): the heart on a card the player lacks,
// the list and where to find each card. Its rules are in
// src/lib/game/wishlist.db.test.ts.
let collection: TestCollection;
const players: Player[] = [];

test.beforeAll(async () => {
  collection = await createTestCollection([testCard(1, { name: 'château de Test' }), testCard(2), testCard(3)], {
    odds: { legendary: 0, ultra: 0, super: 0, rare: 0, uncommon: 0, common: 1_000_000 },
  });
});

test.afterAll(async () => {
  const ids = players.length
    ? (await db.select({ id: users.id }).from(users).where(inArray(users.email, players.map((p) => p.email)))).map((u) => u.id)
    : [];
  await deleteTestData([collection.id], ids);
});

async function signedInPlayer(page: import('@playwright/test').Page) {
  const player = newPlayer();
  players.push(player);
  await signUpAndVerify(page, player);
  return player;
}

const HEART = 'Château de Test dans ma liste de souhaits';

test('a player wishes for a card they lack, finds it on their list and takes it off', async ({ page }) => {
  test.slow();
  await signedInPlayer(page);
  const home = `/c/${collection.slug}`;

  // The cards they lack wear a heart
  await page.goto(`${home}/collection?tab=missing`);
  const heart = page.getByRole('button', { name: HEART });
  await expect(heart).toHaveAttribute('aria-pressed', 'false');
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');
  // Said once the server has it
  await expect(page.getByRole('status').filter({ hasText: 'Ajoutée à votre liste de souhaits.' })).toBeAttached();
  // Drawn again by the server: still on
  await page.reload();
  await expect(page.getByRole('button', { name: HEART })).toHaveAttribute('aria-pressed', 'true');

  await page.goto(`${home}/collection`);
  await page.getByRole('link', { name: 'Ma liste de souhaits · 1' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ma liste de souhaits');
  await expect(page.getByText('1 carte sur 100 au plus')).toBeVisible();
  await expect(page.getByRole('article', { name: /^Château de Test, Commune/ })).toBeVisible();
  await expect(page.getByText("Ni en vente ni chez vos amis pour l'instant.")).toBeVisible();

  // Taken off from the list itself
  await page.getByRole('button', { name: HEART }).click();
  await expect(page.getByText('Votre liste est vide.', { exact: false })).toBeVisible();
});

test("a card's page puts the card on the wishlist", async ({ page }) => {
  await signedInPlayer(page);
  await page.goto(`/c/${collection.slug}/cards/monument-2`);
  await page.getByRole('button', { name: 'Ajouter à ma liste de souhaits' }).click();
  await expect(page.getByRole('button', { name: 'Retirer de ma liste de souhaits' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Ajoutée à votre liste de souhaits.' })).toBeAttached();

  await page.goto(`/c/${collection.slug}/wishlist`);
  await expect(page.getByRole('article', { name: /^Monument 2, Commune/ })).toBeVisible();
});
