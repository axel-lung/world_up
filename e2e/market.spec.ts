import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
// The pool stays open: Playwright runs the next test files in the same worker
import { db } from '@/db';
import { auctions, cards, coinLedger, userCards, users } from '@/db/schema';
import { testCard } from '@/lib/catalog/testing';
import { placeBid } from '@/lib/game/auctions';
import { coinBalance } from '@/lib/game/coins';
import { createTestCollection, createTestPlayer, deleteTestData, type TestCollection } from '@/lib/game/testing';
import { expect, newPlayer, type Player, signUpAndVerify, test } from './helpers';

// The auction house: a sale from the card page, a bid from the market, an
// outbid told in /activity, then a buyout that moves the card and the coins.
// A throwaway collection, whose commons sell from 2 to 200 coins.
let collection: TestCollection;
const players: Player[] = [];
const created: string[] = [];

test.beforeAll(async () => {
  collection = await createTestCollection([testCard(1), testCard(2)], {
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

async function cardId(wikidataId: string) {
  const [card] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.collectionId, collection.id), eq(cards.wikidataId, wikidataId)));
  return card.id;
}

async function giveCard(id: string, wikidataId: string) {
  await db.insert(userCards).values({ userId: id, collectionId: collection.id, cardId: await cardId(wikidataId), quantity: 1, firstObtainedAt: new Date() });
}

async function giveCoins(id: string, amount: number) {
  await db.insert(coinLedger).values({ userId: id, collectionId: collection.id, amount, reason: 'achievement', reference: randomUUID() });
}

test('a card sold at auction: bid, outbid, then bought at once', async ({ page, browser, baseURL }) => {
  // Two signups, then a dozen pages: more than the default 30 s under load
  test.slow();
  const alice = await signedInPlayer(page);
  const byte = () => Math.floor(Math.random() * 254) + 1;
  const other = await browser.newContext({
    baseURL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    extraHTTPHeaders: { 'x-forwarded-for': `10.${byte()}.${byte()}.${byte()}` },
  });
  const pageB = await other.newPage();
  const bruno = await signedInPlayer(pageB);
  await giveCard(await userId(alice.email), 'Q1');
  await giveCoins(await userId(bruno.email), 150);

  // Alice puts her only copy up for sale, from the card's page
  await page.goto(`/c/${collection.slug}/cards/monument-1`);
  await page.getByRole('link', { name: 'Mettre aux enchères' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vendre Monument 1');
  await expect(page.getByText("C'est votre seul exemplaire", { exact: false })).toBeVisible();
  await page.getByLabel('Mise de départ').fill('10');
  await page.getByLabel("Prix d'achat immédiat (facultatif)").fill('100');
  await page.getByLabel('48 heures').check();
  await page.getByRole('button', { name: 'Mettre en vente' }).click();
  await expect(page.getByText('Votre carte est en vente.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Monument 1');
  const auctionId = Number(new URL(page.url()).pathname.split('/').pop());

  // Bruno finds it in the market and bids up to 30
  await pageB.goto(`/c/${collection.slug}/market`);
  await expect(pageB.getByText('1 vente en cours')).toBeVisible();
  await pageB.getByRole('link', { name: 'Monument 1', exact: true }).click();
  await expect(pageB.getByText(`Vendue par ${alice.pseudo}`)).toBeVisible();
  await pageB.getByLabel('Votre mise maximale').fill('30');
  await pageB.getByRole('button', { name: 'Enchérir' }).click();
  await expect(pageB.getByText('Enchère placée : vous menez.')).toBeVisible();
  await expect(pageB.getByText('Votre maximum : 30 pièces', { exact: false })).toBeVisible();

  // A third player bids more: Bruno is told
  const chloe = await createTestPlayer();
  created.push(chloe);
  await giveCoins(chloe, 80);
  await placeBid(db, { userId: chloe, collectionId: collection.id, auctionId, maxAmount: 60, idempotencyKey: randomUUID(), now: new Date() });
  await pageB.goto('/activity');
  await pageB.getByRole('link', { name: 'Votre enchère sur Monument 1 a été dépassée.' }).click();
  await expect(pageB.getByText('Un autre joueur a pris la tête', { exact: false })).toBeVisible();
  await expect(pageB.getByText('32 pièces').first()).toBeVisible();

  // ...and buys it at once
  await pageB.getByRole('button', { name: 'Acheter maintenant pour 100 pièces' }).click();
  await expect(pageB.getByText('Achat conclu : la carte est dans votre collection.')).toBeVisible();
  await expect(pageB.getByText('Vous avez remporté cette vente', { exact: false })).toBeVisible();

  const [sale] = await db.select().from(auctions).where(eq(auctions.id, auctionId));
  expect(sale).toMatchObject({ status: 'sold', currentPrice: 100 });
  const owner = async (email: string) =>
    (await db.select({ cardId: userCards.cardId }).from(userCards).where(eq(userCards.userId, await userId(email)))).length;
  expect(await owner(bruno.email)).toBe(1);
  expect(await owner(alice.email)).toBe(0);
  expect(await coinBalance(db, await userId(bruno.email))).toBe(50);
  // 100 less the 5 % fee
  expect(await coinBalance(db, await userId(alice.email))).toBe(95);

  await page.goto('/activity');
  await expect(page.getByRole('link', { name: 'Votre vente de Monument 1 est conclue.' })).toBeVisible();
  await other.close();
});

test('the market needs an account', async ({ page }) => {
  await page.goto(`/c/${collection.slug}/market`);
  await expect(page).toHaveURL(/\/login\?next=/);
});
