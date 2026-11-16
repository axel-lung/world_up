import { eq, inArray } from 'drizzle-orm';
// The pool stays open: Playwright runs the next test files in the same worker
import { db } from '@/db';
import { cards, userCards, users } from '@/db/schema';
import { testCard } from '@/lib/catalog/testing';
import { createTestCollection, deleteTestData, type TestCollection } from '@/lib/game/testing';
import { expect, newPlayer, type Player, signUpAndVerify, test } from './helpers';

// The collection's grid: the cards owned first, the filters that apply at
// once, the list view and "Voir plus". A throwaway collection of 60 commons,
// more than a page of 48.
let collection: TestCollection;
const players: Player[] = [];

test.beforeAll(async () => {
  collection = await createTestCollection(
    Array.from({ length: 60 }, (_, index) => testCard(index + 1)),
    { odds: { legendary: 0, ultra: 0, super: 0, rare: 0, uncommon: 0, common: 1_000_000 } },
  );
});

test.afterAll(async () => {
  const ids = players.length
    ? (await db.select({ id: users.id }).from(users).where(inArray(users.email, players.map((p) => p.email)))).map((u) => u.id)
    : [];
  await deleteTestData([collection.id], ids);
});

/** Gives the player the first `count` cards of the collection, by rank, one copy each. */
async function giveCards(email: string, count: number) {
  const [{ id }] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  const rows = await db.select({ id: cards.id }).from(cards).where(eq(cards.collectionId, collection.id)).orderBy(cards.rank).limit(count);
  await db.insert(userCards).values(
    rows.map((card) => ({ userId: id, collectionId: collection.id, cardId: card.id, quantity: 1, firstObtainedAt: new Date() })),
  );
}

test('the collection opens on the cards owned, as a grid or a list, a page at a time', async ({ page }) => {
  const player = newPlayer();
  players.push(player);
  await signUpAndVerify(page, player);
  await giveCards(player.email, 50);

  await page.goto(`/c/${collection.slug}/collection`);
  const tabs = page.getByRole('navigation', { name: 'Cartes affichées' });
  await expect(tabs.getByRole('link', { name: /^Possédées/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('50 cartes', { exact: true })).toBeVisible();
  const grid = page.getByRole('main').getByRole('list').last();
  await expect(grid.getByRole('article')).toHaveCount(48);
  await expect(page.getByText('48 cartes affichées sur 50')).toBeVisible();

  // The list view, which the next visit keeps
  await page.getByRole('radiogroup', { name: 'Affichage' }).getByText('Liste').click();
  await expect(grid.getByText('Photo : Jean Photo', { exact: true })).toHaveCount(48);
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Liste' })).toBeChecked();
  await expect(grid.getByRole('link', { name: 'Monument 1', exact: true })).toBeVisible();

  // One more page, and the focus on the first card it brings
  await page.getByRole('link', { name: 'Voir plus' }).click();
  await expect(grid.getByRole('article')).toHaveCount(50);
  await expect(page).toHaveURL(/[?&]page=2$/);
  await expect(grid.getByRole('listitem').nth(48)).toBeFocused();
  await expect(page.getByRole('link', { name: 'Voir plus' })).toHaveCount(0);

  // The filters apply at once: a rarity chip, then a series
  await page.getByRole('navigation', { name: 'Rareté' }).getByRole('link', { name: 'Légendaire' }).click();
  await expect(page).toHaveURL(/rarity=legendary/);
  await expect(page.getByText("Vous n'avez encore aucune carte ici : ouvrez un paquet !")).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Ouvrir un paquet' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Rareté' }).getByRole('link', { name: 'Toutes', exact: true }).click();
  await expect(page).not.toHaveURL(/rarity=/);
  await page.getByLabel('Série').selectOption({ label: 'Centre-Val de Loire' });
  await expect(page).toHaveURL(/series=[a-z-]+/);
  await expect(page.getByText('50 cartes', { exact: true })).toBeVisible();

  // The cards still missing, in that series
  await tabs.getByRole('link', { name: /^Manquantes/ }).click();
  await expect(page.getByText('10 cartes', { exact: true })).toBeVisible();
});
