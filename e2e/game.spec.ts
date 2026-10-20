import { inArray } from 'drizzle-orm';
// The pool stays open: Playwright runs the next test files in the same worker
import { db } from '@/db';
import { users } from '@/db/schema';
import { testCard } from '@/lib/catalog/testing';
import { createTestCollection, deleteTestData, type TestCollection } from '@/lib/game/testing';
import { expect, newPlayer, type Player, signUpAndVerify, test } from './helpers';

// A throwaway collection with its own rules: five cards packs can draw (four
// commons, one rare), a legendary that never comes out (its odds are zero)
// and a hidden card.
let collection: TestCollection;
const players: Player[] = [];

test.beforeAll(async () => {
  collection = await createTestCollection(
    [
      testCard(1, { name: 'château de Test' }),
      testCard(2),
      testCard(3),
      testCard(4),
      testCard(5, { rarity: 'rare' }),
      testCard(6, { rarity: 'legendary', name: 'trésor caché', image: 'f6' }),
      testCard(7, { memorial: true, hidden_reason: 'memorial' }),
    ],
    { odds: { legendary: 0, ultra: 0, super: 0, rare: 200_000, uncommon: 0, common: 800_000 } },
  );
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

test('a new player opens packs, collects the cards and resells the duplicates', async ({ page }) => {
  const player = await signedInPlayer(page);
  const home = `/c/${collection.slug}`;

  await page.goto(home);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Bonjour ${player.pseudo}`);
  await expect(page.getByRole('region', { name: 'Vos paquets' })).toContainText('10/10');

  await page.goto(`${home}/open`);
  const open = page.getByRole('button', { name: 'Ouvrir un paquet' });
  // A double click opens one pack: the reserve goes from 10 to 9
  await open.dblclick();
  const result = page.getByRole('region', { name: 'Votre paquet Test' });
  await expect(result.getByText(/^5 cartes, dont (aucune nouvelle|\d nouvelles?)\.$/)).toBeVisible();
  await expect(result.getByRole('article')).toHaveCount(5);
  await expect(page.getByText('9/10')).toBeVisible();
  await expect(result).toContainText('Succès obtenu : Ouvrir votre premier paquet · +5 pièces');

  // Ten cards out of five possible: there are duplicates to resell
  await page.getByRole('button', { name: 'Ouvrir un autre paquet' }).click();
  await expect(page.getByText('8/10')).toBeVisible();

  await page.goto(`${home}/collection?tab=duplicates`);
  const resell = page.getByRole('button', { name: /^Revendre (un doublon|les \d+ doublons) pour \d+ pièces$/ });
  await expect(resell).toBeVisible();
  await resell.click();
  await expect(page.getByText(/^\d+ doublons? revendus? : \+\d+ pièces\.$/)).toBeVisible();
  await expect(page.getByText("Aucun doublon pour l'instant.")).toBeVisible();
});

test('a missing legendary keeps its surprise, and hidden cards never show', async ({ page }) => {
  await signedInPlayer(page);
  await page.goto(`/c/${collection.slug}/collection?tab=missing&rarity=legendary`);
  const grid = page.getByRole('main').getByRole('list').last();
  await expect(grid.getByRole('article')).toHaveCount(1);
  await expect(grid.getByRole('article')).toHaveAccessibleName('Carte manquante, Légendaire');
  // Neither its name nor its photo reaches the browser
  const html = await page.content();
  expect(html).not.toContain('trésor caché');
  expect(html).not.toContain('f6aaaaaaaaaaaaaaaaaa');

  await page.goto(`/c/${collection.slug}/collection`);
  await expect(page.getByRole('link', { name: /Toutes\s*6/ })).toBeVisible();
});

test('the odds and the rules are public', async ({ page }) => {
  await page.goto('/odds');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Probabilités');
  const current = page.getByRole('region', { name: 'Probabilités en vigueur' });
  await expect(current.getByRole('row', { name: /Légendaire/ })).toContainText('0,25 %');

  await page.goto('/rules');
  await expect(page.getByRole('region', { name: 'Les paquets' })).toContainText(
    "Un paquet gratuit s'ajoute à votre réserve toutes les 10 minutes, jusqu'à 10 paquets.",
  );
});
