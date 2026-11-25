import { and, eq, inArray } from 'drizzle-orm';
// The pool stays open: Playwright runs the next test files in the same worker
import { db } from '@/db';
import { cards, userCards, users } from '@/db/schema';
import { testCard } from '@/lib/catalog/testing';
import { createTestCollection, deleteTestData, type TestCollection } from '@/lib/game/testing';
import { expect, newPlayer, type Player, signUpAndVerify, test } from './helpers';

// The map of the monuments: France by department, then the pins, their list
// and sheets. A throwaway collection: two monuments near Chambord (41), two in
// Paris (75), the player owning one of each.
let collection: TestCollection;
const players: Player[] = [];
const PARIS = { department_code: '75', department: 'Paris', region: 'Île-de-France' };

test.beforeAll(async () => {
  collection = await createTestCollection(
    [
      testCard(1, { name: 'château de Chambord' }),
      testCard(2, { name: 'église de Bracieux', coordinates: { lat: 47.5491, lon: 1.5409, precision: 31 } }),
      testCard(3, { ...PARIS, name: 'cathédrale Notre-Dame de Paris', rarity: 'legendary', coordinates: { lat: 48.853, lon: 2.3499, precision: 1 } }),
      testCard(4, { ...PARIS, name: 'Sainte-Chapelle', rarity: 'super', coordinates: { lat: 48.8554, lon: 2.345, precision: 1 } }),
    ],
    { odds: { legendary: 0, ultra: 0, super: 0, rare: 0, uncommon: 0, common: 1_000_000 } },
  );
});

test.afterAll(async () => {
  const ids = players.length
    ? (await db.select({ id: users.id }).from(users).where(inArray(users.email, players.map((p) => p.email)))).map((u) => u.id)
    : [];
  await deleteTestData([collection.id], ids);
});

/** A new player, signed in, owning Chambord and the Sainte-Chapelle. */
async function playerWithCards(page: Parameters<typeof signUpAndVerify>[0]) {
  const player = newPlayer();
  players.push(player);
  await signUpAndVerify(page, player);
  const [{ id }] = await db.select({ id: users.id }).from(users).where(eq(users.email, player.email));
  const owned = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.collectionId, collection.id), inArray(cards.wikidataId, ['Q1', 'Q4'])));
  await db
    .insert(userCards)
    .values(owned.map((card) => ({ userId: id, collectionId: collection.id, cardId: card.id, quantity: 1, firstObtainedAt: new Date() })));
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("France by department, a department's sheet and its cards", async ({ page }) => {
    await playerWithCards(page);
    await page.goto(`/c/${collection.slug}/map`);
    await expect(page.getByRole('heading', { name: 'Carte', level: 1 })).toBeVisible();
    await expect(page.getByText('2 / 4 monuments possédés')).toBeVisible();

    await page.getByRole('button', { name: 'Loir-et-Cher : 1 sur 2' }).click();
    const sheet = page.getByRole('dialog', { name: 'Département' });
    await expect(sheet.getByRole('heading', { name: 'Loir-et-Cher' })).toBeVisible();
    await expect(sheet.getByText('Centre-Val de Loire · 41')).toBeVisible();
    await expect(sheet.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');

    // Back closes it
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/c/${collection.slug}/map$`));

    // Its cards, in the collection
    await page.getByRole('button', { name: 'Paris : 1 sur 2' }).click();
    await page.getByRole('dialog', { name: 'Département' }).getByRole('link', { name: 'Voir les cartes' }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${collection.slug}/collection\\?tab=all&dept=75$`));
    await expect(page.getByText('Département : Paris')).toBeVisible();
    await expect(page.getByText('2 cartes', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Retirer le filtre Paris' }).click();
    await expect(page.getByText('4 cartes', { exact: true })).toBeVisible();
  });

  test('the pins of a department, their list, sheets and filter', async ({ page }) => {
    await playerWithCards(page);
    await page.goto(`/c/${collection.slug}/map?dept=75`);
    await page.getByRole('dialog', { name: 'Département' }).getByRole('button', { name: 'Zoomer' }).click();
    await expect(page.getByText(/Paris · 2/)).toBeVisible();

    // At the department's scale the two pins, 450 m apart, are one group
    await page.getByRole('button', { name: '2 monuments, dont 1 dans votre collection. Zoomer' }).click();
    // The pins: buttons named by the monument, its rarity and whether it is owned
    await expect(page.getByRole('button', { name: 'Sainte-Chapelle, Super rare, dans votre collection' })).toBeVisible();
    const notreDame = page.getByRole('button', { name: 'Cathédrale Notre-Dame de Paris, Légendaire, vous manque' });
    await expect(notreDame).toBeVisible();

    // A lacking monument's sheet: no card to see, the way to get it
    await notreDame.click();
    const sheet = page.getByRole('dialog', { name: 'Monument' });
    await expect(sheet.getByRole('heading', { name: 'Cathédrale Notre-Dame de Paris' })).toBeVisible();
    await expect(
      sheet.getByText('Cette carte vous manque. Trouvez-la dans un paquet, ou débloquez-la sur place, à moins de 200 m.'),
    ).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Itinéraire' })).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Voir la carte' })).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Fermer' }).click();
    await expect(sheet).toBeHidden();

    // The list of the area, and "Il me manque", which leaves the owned ones out
    await page.getByRole('button', { name: 'Afficher en liste' }).click();
    const list = page.getByRole('region', { name: /dans la zone/ });
    await expect(list.getByRole('heading', { name: '2 monuments dans la zone' })).toBeVisible();
    await page.getByRole('button', { name: 'Il me manque' }).click();
    await expect(list.getByRole('heading', { name: '1 monument dans la zone' })).toBeVisible();
    await expect(list.getByRole('button', { name: /Sainte-Chapelle/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Il me manque' }).click();

    // An owned monument's sheet leads to its card
    await list.getByRole('button', { name: /Sainte-Chapelle/ }).click();
    await expect(sheet.getByRole('heading', { name: 'Sainte-Chapelle' })).toBeVisible();
    await sheet.getByRole('link', { name: 'Voir la carte' }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${collection.slug}/cards/monument-4$`));
  });

  test('the map is one touch away: the home, the collection, a card', async ({ page }) => {
    await playerWithCards(page);
    await page.goto(`/c/${collection.slug}`);
    await page.getByRole('navigation', { name: 'Explorer' }).getByRole('link', { name: 'Carte' }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${collection.slug}/map$`));

    await page.goto(`/c/${collection.slug}/collection`);
    await page.getByRole('main').getByRole('link', { name: 'Carte', exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`/c/${collection.slug}/map$`));

    // From a card's page, the map opens on it, its sheet open
    await page.goto(`/c/${collection.slug}/cards/monument-1`);
    await page.getByRole('link', { name: 'Voir sur la carte' }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${collection.slug}/map\\?card=monument-1$`));
    await expect(page.getByRole('dialog', { name: 'Monument' }).getByRole('heading', { name: 'Château de Chambord' })).toBeVisible();
  });
});

// "Je suis ici": the browser's position is Playwright's, granted; its accuracy 30 m
test.describe('unlocking a monument on site', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    permissions: ['geolocation'],
    // In front of Notre-Dame, about 15 m from its point
    geolocation: { latitude: 48.8531, longitude: 2.3498, accuracy: 30 },
  });

  test('"Je suis ici" unlocks the card once, stamped, private', async ({ page }) => {
    await playerWithCards(page);
    await page.goto(`/c/${collection.slug}/map?card=monument-3`);
    const sheet = page.getByRole('dialog', { name: 'Monument' });
    await expect(sheet.getByRole('heading', { name: 'Cathédrale Notre-Dame de Paris' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Je suis ici' }).click();

    // The first time on this device, why the position
    const why = page.getByRole('dialog', { name: 'Êtes-vous devant le monument ?' });
    await expect(why.getByText('Elle n’est demandée qu’au moment où vous touchez « Je suis ici ».')).toBeVisible();
    await why.getByRole('button', { name: 'Continuer' }).click();

    // The card unlocked, over the whole screen
    const done = page.getByRole('dialog', { name: 'Ajoutée à votre collection' });
    await expect(done).toBeVisible();
    await expect(done.getByRole('article', { name: /^Cathédrale Notre-Dame de Paris, Légendaire, visité le / })).toBeVisible();
    await expect(done.getByText('Une nouvelle carte pour votre collection.', { exact: false })).toBeVisible();
    await expect(done.getByText('1 monument visité')).toBeVisible();
    await expect(done.getByText('Plus que 4 visites aujourd’hui')).toBeVisible();
    await done.getByRole('button', { name: 'Retour à la carte' }).click();
    await expect(done).toBeHidden();

    // The sheet now says when, and leads to the card
    await expect(sheet.getByText(/^Visité le \d+ \S+ \d{4}$/)).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Je suis ici' })).toHaveCount(0);
    await expect(sheet.getByRole('link', { name: 'Voir la carte' })).toBeVisible();

    // The collection's "Visitées"
    await page.goto(`/c/${collection.slug}/collection?tab=visited`);
    await expect(page.getByText('1 carte', { exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: /^Cathédrale Notre-Dame de Paris, Légendaire, visité le / })).toBeVisible();

    // The card's page: the day, for the player only, and no second "Je suis ici"
    await page.goto(`/c/${collection.slug}/cards/monument-3`);
    await expect(page.getByText('Visible par vous seul')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Je suis ici' })).toHaveCount(0);
  });

  test('too far: how far, the way there, and nothing unlocked', async ({ page }) => {
    await playerWithCards(page);
    // From its card's page: the map opens on it, "Je suis ici" started
    await page.goto(`/c/${collection.slug}/cards/monument-4`);
    await page.getByRole('link', { name: 'Je suis ici' }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${collection.slug}/map\\?card=monument-4&here=1$`));
    await page.getByRole('dialog', { name: 'Êtes-vous devant le monument ?' }).getByRole('button', { name: 'Continuer' }).click();

    // Notre-Dame is about 450 m from the Sainte-Chapelle
    const refusal = page.getByRole('dialog', { name: /^Encore \d+ m$/ });
    await expect(refusal).toBeVisible();
    await expect(refusal.getByText('Approchez-vous : il faut être à moins de 200 m du monument pour le débloquer.')).toBeVisible();
    await expect(refusal.getByRole('link', { name: 'Itinéraire' })).toBeVisible();
    await refusal.getByRole('button', { name: 'Fermer' }).click();
    await expect(refusal).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Monument' }).getByRole('button', { name: 'Je suis ici' })).toBeVisible();
  });
});

test('the monuments are for signed-in players', async ({ request }) => {
  expect((await request.get(`/c/${collection.slug}/map/monuments?v=x`)).status()).toBe(401);
  expect((await request.get(`/c/${collection.slug}/map/monuments/1`)).status()).toBe(401);
  expect((await request.get('/map/tiles/none/0/0/0.pbf')).status()).toBe(404);
});
