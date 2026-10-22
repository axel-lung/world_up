import { eq, inArray } from 'drizzle-orm';
// The pool stays open: Playwright runs the next test files in the same worker
import { db } from '@/db';
import { consents, users } from '@/db/schema';
import { testCard } from '@/lib/catalog/testing';
import { createTestCollection, deleteTestData, type TestCollection } from '@/lib/game/testing';
import { expect, newPlayer, type Player, signUpAndVerify, test } from './helpers';

let collection: TestCollection;
const players: Player[] = [];

test.beforeAll(async () => {
  collection = await createTestCollection([testCard(1), testCard(2)], {
    odds: { legendary: 0, ultra: 0, super: 0, rare: 0, uncommon: 0, common: 1_000_000 },
  });
});

test.afterAll(async () => {
  const ids = players.length
    ? (await db.select({ id: users.id }).from(users).where(inArray(users.email, players.map((p) => p.email)))).map((u) => u.id)
    : [];
  await deleteTestData([collection.id], ids);
});

test('the legal pages are linked from the footer, and the signup says what the data is for', async ({ page }) => {
  await page.goto('/rules');
  for (const [link, heading] of [
    ["Conditions d'utilisation", "Conditions générales d'utilisation"],
    ['Confidentialité', 'Politique de confidentialité'],
    ['Mentions légales', 'Mentions légales'],
  ]) {
    await page.getByRole('contentinfo').getByRole('link', { name: link, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Hébergeur' })).toBeVisible();

  await page.goto('/signup');
  await expect(page.getByRole('link', { name: 'politique de confidentialité' })).toHaveAttribute('href', '/privacy');
  await expect(page.getByRole('link', { name: "conditions générales d'utilisation" })).toHaveAttribute('href', '/terms');
});

test('a player accepts new terms before playing again, and can still reach the account', async ({ page }) => {
  const player = newPlayer();
  players.push(player);
  await signUpAndVerify(page, player);
  // The player accepted an older version of the terms
  const [{ id }] = await db.select({ id: users.id }).from(users).where(eq(users.email, player.email));
  await db.update(consents).set({ version: '2000-01-01' }).where(eq(consents.userId, id));

  const home = `/c/${collection.slug}`;
  await page.goto(home);
  await expect(page.getByRole('heading', { name: "Conditions d'utilisation" })).toBeVisible();
  await expect(page).toHaveURL(/\/accept-terms\?next=/);

  // Refusing them leaves the data export and the account deletion within reach
  await page.getByRole('link', { name: 'Mon compte' }).last().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mon compte' })).toBeVisible();

  await page.goto(home);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page).toHaveURL(new RegExp(`${home}$`));
});
