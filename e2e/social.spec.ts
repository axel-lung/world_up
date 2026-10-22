import { eq, inArray } from 'drizzle-orm';
// The pool stays open: Playwright runs the next test files in the same worker
import { db } from '@/db';
import { cards, friendships, userCards, users } from '@/db/schema';
import { testCard } from '@/lib/catalog/testing';
import { createTestCollection, createTestPlayer, deleteTestData, type TestCollection } from '@/lib/game/testing';
import { expect, newPlayer, type Player, signUpAndVerify, test } from './helpers';

// Friends: a request, its notification, the acceptance, then each other's
// collection and a trade. A throwaway collection of three commons.
let collection: TestCollection;
const players: Player[] = [];
const created: string[] = [];

test.beforeAll(async () => {
  collection = await createTestCollection([testCard(1), testCard(2), testCard(3)], {
    odds: { legendary: 0, ultra: 0, super: 0, rare: 0, uncommon: 0, common: 1_000_000 },
  });
});

test.afterAll(async () => {
  const ids = players.length
    ? (await db.select({ id: users.id }).from(users).where(inArray(users.email, players.map((p) => p.email)))).map((u) => u.id)
    : [];
  await deleteTestData([collection.id], [...ids, ...created]);
});

async function signedInPlayer(page: import('@playwright/test').Page) {
  const player = newPlayer();
  players.push(player);
  await signUpAndVerify(page, player);
  return player;
}

const userId = async (email: string) => (await db.select({ id: users.id }).from(users).where(eq(users.email, email)))[0].id;

/** Gives the player these cards of the throwaway collection: Wikidata ID to copies. */
async function giveCards(email: string, copies: Record<string, number>) {
  const id = await userId(email);
  const rows = await db
    .select({ id: cards.id, wikidataId: cards.wikidataId })
    .from(cards)
    .where(eq(cards.collectionId, collection.id));
  await db.insert(userCards).values(
    rows
      .filter((card) => copies[card.wikidataId])
      .map((card) => ({
        userId: id,
        collectionId: collection.id,
        cardId: card.id,
        quantity: copies[card.wikidataId],
        firstObtainedAt: new Date(),
      })),
  );
}

/** A second player's browser, from another address. */
async function secondBrowser(browser: import('@playwright/test').Browser, baseURL: string | undefined) {
  const byte = () => Math.floor(Math.random() * 254) + 1;
  return browser.newContext({
    baseURL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    extraHTTPHeaders: { 'x-forwarded-for': `10.${byte()}.${byte()}.${byte()}` },
  });
}

test('two players become friends and see each other’s collection', async ({ page, browser, baseURL }) => {
  const alice = await signedInPlayer(page);
  const other = await secondBrowser(browser, baseURL);
  const pageB = await other.newPage();
  const bruno = await signedInPlayer(pageB);
  await giveCards(alice.email, { Q1: 1 });
  await giveCards(bruno.email, { Q1: 1, Q2: 2 });

  await page.goto('/friends');
  await page.getByLabel('Pseudo').fill(bruno.pseudo.toUpperCase());
  await page.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(page.getByText(`Demande envoyée à ${bruno.pseudo}.`)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Demandes envoyées' })).toContainText(bruno.pseudo);

  // The request reaches the other player's bell, then their activity page
  await pageB.goto('/leaderboard');
  await pageB.getByRole('link', { name: 'Activité, 1 non lue' }).click();
  await expect(pageB.getByRole('link', { name: `${alice.pseudo} vous demande en ami.` })).toBeVisible();
  await expect(pageB.getByRole('link', { name: 'Activité', exact: true })).toBeVisible();

  await pageB.getByRole('link', { name: `${alice.pseudo} vous demande en ami.` }).click();
  await pageB.getByRole('button', { name: `Accepter : ${alice.pseudo}` }).click();
  await expect(pageB.getByText(`${alice.pseudo} et vous êtes maintenant amis.`)).toBeVisible();
  await expect(pageB.getByRole('region', { name: 'Vos amis' })).toContainText(alice.pseudo);

  // Each sees the other's collection, and the cards they lack
  await page.goto(`/c/${collection.slug}/friends/${encodeURIComponent(bruno.pseudo)}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Collection de ${bruno.pseudo}`);
  await expect(page.getByRole('link', { name: /^Ses cartes/ })).toContainText('2');
  const card = (name: string) => page.getByRole('link', { name, exact: true });
  await expect(card('Monument 1')).toBeVisible();
  await page.getByRole('link', { name: /^Il vous manque/ }).click();
  await expect(card('Monument 2')).toBeVisible();
  await expect(card('Monument 1')).toHaveCount(0);
  // A friend's collection has no resale
  await page.getByRole('link', { name: /^Ses doublons/ }).click();
  await expect(card('Monument 2')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Revendre/ })).toHaveCount(0);

  await other.close();
});

test('only friends see a collection', async ({ page }) => {
  await signedInPlayer(page);
  const stranger = await createTestPlayer();
  created.push(stranger);
  const [{ name }] = await db.select({ name: users.name }).from(users).where(eq(users.id, stranger));
  const response = await page.goto(`/c/${collection.slug}/friends/${encodeURIComponent(name)}`);
  expect(response?.status()).toBe(404);
});

test('two friends trade cards, a last copy included', async ({ page, browser, baseURL }) => {
  const alice = await signedInPlayer(page);
  const other = await secondBrowser(browser, baseURL);
  const pageB = await other.newPage();
  const bruno = await signedInPlayer(pageB);
  await giveCards(alice.email, { Q1: 1 });
  await giveCards(bruno.email, { Q2: 2 });
  await db.insert(friendships).values({
    requesterId: await userId(alice.email),
    addresseeId: await userId(bruno.email),
    status: 'accepted',
    acceptedAt: new Date(),
  });

  await page.goto(`/c/${collection.slug}/friends/${encodeURIComponent(bruno.pseudo)}`);
  await page.getByRole('link', { name: 'Proposer un échange' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Échange avec ${bruno.pseudo}`);
  const gives = page.getByRole('region', { name: 'Vous donnez' });
  const gets = page.getByRole('region', { name: 'Vous recevez' });
  await expect(gives.getByText('votre dernier exemplaire', { exact: false })).toBeVisible();
  await gives.getByRole('button', { name: 'Ajouter : Monument 1' }).click();
  await gets.getByRole('button', { name: 'Ajouter : Monument 2' }).click();
  await expect(gets.getByText('1 carte choisie sur 5')).toBeVisible();
  await page.getByRole('button', { name: "Envoyer l'offre" }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Offre à ${bruno.pseudo}`);
  await expect(page.getByText(`Offre envoyée à ${bruno.pseudo}.`, { exact: false })).toBeVisible();

  // Bruno answers from the notification
  await pageB.goto('/activity');
  await pageB.getByRole('link', { name: `${alice.pseudo} vous propose un échange.` }).click();
  await expect(pageB.getByRole('heading', { level: 1 })).toHaveText(`Offre de ${alice.pseudo}`);
  await expect(pageB.getByRole('region', { name: 'Vous recevez' }).getByRole('link', { name: 'Monument 1', exact: true })).toBeVisible();
  await pageB.getByRole('button', { name: "Accepter l'échange" }).click();
  await expect(pageB.getByText('Échange conclu : les cartes sont dans votre collection.')).toBeVisible();

  const owned = async (email: string) =>
    Object.fromEntries(
      (
        await db
          .select({ wikidataId: cards.wikidataId, quantity: userCards.quantity })
          .from(userCards)
          .innerJoin(cards, eq(cards.id, userCards.cardId))
          .where(eq(userCards.userId, await userId(email)))
      ).map((row) => [row.wikidataId, row.quantity]),
    );
  expect(await owned(alice.email)).toEqual({ Q2: 1 });
  expect(await owned(bruno.email)).toEqual({ Q1: 1, Q2: 1 });

  await page.goto('/activity');
  await expect(page.getByRole('link', { name: `${bruno.pseudo} a accepté votre offre d'échange.` })).toBeVisible();
  await other.close();
});
