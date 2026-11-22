import { eq, inArray } from 'drizzle-orm';
// The pool stays open: Playwright runs the next test files in the same worker
import { db } from '@/db';
import { announcements, users } from '@/db/schema';
import { publishAnnouncement } from '@/lib/announcements';
import { testCard } from '@/lib/catalog/testing';
import { createTestCollection, deleteTestData, type TestCollection } from '@/lib/game/testing';
import { expect, newPlayer, type Player, signUpAndVerify, test } from './helpers';

// The history of a player's openings, the sounds' switch and the
// announcement banner (decided on 2026-11-22).
let collection: TestCollection;
const players: Player[] = [];
const announcementIds: number[] = [];

test.beforeAll(async () => {
  collection = await createTestCollection([testCard(1, { name: 'château de Test' }), testCard(2), testCard(3), testCard(4)], {
    odds: { legendary: 0, ultra: 0, super: 0, rare: 0, uncommon: 0, common: 1_000_000 },
  });
});

test.afterAll(async () => {
  if (announcementIds.length > 0) await db.delete(announcements).where(inArray(announcements.id, announcementIds));
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

test('a player turns the sounds off, opens a pack and finds it in the history', async ({ page }) => {
  test.slow();
  await signedInPlayer(page);
  const home = `/c/${collection.slug}`;

  await page.goto(`${home}/open`);
  // The stage's switch, kept on this device
  const sounds = page.getByRole('button', { name: 'Sons et vibrations' });
  await expect(sounds).toHaveAttribute('aria-pressed', 'true');
  await sounds.click();
  await expect(sounds).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sons et vibrations' })).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Ouvrir le paquet' }).click();
  await page.getByRole('button', { name: 'Tout révéler' }).click();
  await page.getByRole('dialog', { name: '1 jour de série !' }).getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByRole('heading', { name: /^Paquet ouvert/ })).toBeFocused();

  await page.goto(`${home}/packs`);
  await page.getByRole('link', { name: 'Historique de mes ouvertures' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes ouvertures');
  await expect(page.getByText('1 paquet ouvert, le plus récent en premier.')).toBeVisible();
  await expect(page.getByRole('region', { name: "Aujourd'hui" })).toContainText('1 paquet');
  const cards = page.getByRole('list', { name: /^Cartes du paquet de / }).getByRole('link');
  await expect(cards).toHaveCount(5);
  // The first card of a first pack is new, and leads to its page
  await expect(cards.first()).toHaveAccessibleName(/, Commune, nouvelle carte$/);
  await cards.first().click();
  await expect(page).toHaveURL(new RegExp(`/c/${collection.slug}/cards/`));
});

test('the announcement shows over the pages until the visitor closes it', async ({ page }) => {
  const player = await signedInPlayer(page);
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, player.email));
  const message = `Annonce d'essai ${player.pseudo}`;
  announcementIds.push(
    await publishAnnouncement(db, admin.id, {
      message,
      linkUrl: null,
      linkLabel: null,
      tone: 'important',
      startsAt: new Date(Date.now() - 60_000),
      // Over the other tests' pages too: a short while only
      endsAt: new Date(Date.now() + 2 * 60_000),
    }),
  );

  await page.goto('/rules');
  const banner = page.getByRole('complementary', { name: 'Annonce' });
  await expect(banner).toContainText(message);
  await banner.getByRole('button', { name: "Fermer l'annonce" }).click();
  await expect(banner).toBeHidden();
  // Closed for good on this device, server side too
  await page.goto('/leaderboard');
  await expect(page.getByText(message)).toBeHidden();
});
