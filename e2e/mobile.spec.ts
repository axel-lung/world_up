import { devices } from '@playwright/test';
import { expect, newPlayer, signUpAndVerify, test } from './helpers';

// A phone: the Android app's WebView is this wide
const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices['Pixel 7'];
test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent });

test('on a phone, a player moves around with the tab bar', async ({ page }) => {
  const player = newPlayer();
  await signUpAndVerify(page, player);
  await page.goto('/c/heritage');

  // No header or footer: the tab bar is the one navigation, and each page heads itself
  const tabs = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(tabs).toHaveCount(1);
  await expect(tabs.getByRole('link')).toHaveCount(5);
  await expect(tabs.getByRole('link', { name: 'Accueil' })).toHaveAttribute('aria-current', 'page');
  await expect(tabs.getByRole('link', { name: /^Paquets\s*, 10 paquets disponibles$/ })).toBeVisible();
  await expect(page.getByRole('banner')).toBeHidden();
  await expect(page.getByRole('contentinfo')).toBeHidden();

  // The home has the bell, the reserve and its button
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Bonjour ${player.pseudo}`);
  await expect(page.locator('main > header').getByRole('link', { name: /^Activité/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Vos paquets' })).toContainText('10 paquets');
  await expect(page.getByRole('region', { name: 'Vos paquets' }).getByRole('link', { name: 'Ouvrir un paquet' })).toBeVisible();

  // Then the menu to every part of the game ("Explorer"): three families of
  // four tiles, and four pills. Tiles are links, or open their sheet or
  // screen in place (the achievements, the streak), which Back closes.
  const menu = page.getByRole('navigation', { name: 'Explorer' });
  await expect(menu.getByRole('heading', { level: 3 })).toHaveText(['Ma collection', 'Échanger', 'Jouer']);
  await expect(menu.getByRole('listitem')).toHaveCount(16);
  await expect(menu.getByRole('link', { name: 'Carte' })).toHaveAttribute('href', '/c/heritage/map');
  await expect(menu.getByRole('link', { name: 'Collection', exact: true })).toHaveAttribute('href', '/c/heritage/collection');
  await menu.getByRole('button', { name: /^Succès/ }).click();
  await expect(page.getByRole('dialog', { name: 'Succès' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Succès' })).toBeHidden();
  await menu.getByRole('button', { name: /^Série de jours/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.locator('main > header').getByRole('button', { name: /^Série de jours/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeHidden();
  await menu.getByRole('link', { name: 'Chances' }).click();
  await expect(page).toHaveURL(/\/odds$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/c\/heritage$/);

  // The collection's tabs are chips, its rarity and series in the "Filtres"
  // sheet: a choice applies and closes it
  await tabs.getByRole('link', { name: 'Collection' }).click();
  await expect(page).toHaveURL(/\/c\/heritage\/collection$/);
  await expect(tabs.getByRole('link', { name: 'Collection' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: 'Cartes affichées' }).getByRole('link', { name: 'Possédées' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('button', { name: 'Filtres' }).click();
  const filters = page.getByRole('dialog', { name: 'Filtres' });
  await expect(filters).toBeVisible();
  await filters.getByRole('link', { name: /^Légendaire/ }).click();
  await expect(page).toHaveURL(/rarity=legendary/);
  await expect(filters).toBeHidden();
  await expect(page.getByRole('button', { name: 'Filtres : Légendaire' })).toBeVisible();
  // Back closes a sheet rather than leave the page
  await page.getByRole('button', { name: 'Filtres : Légendaire' }).click();
  await expect(filters).toBeVisible();
  await page.goBack();
  await expect(filters).toBeHidden();
  await expect(page).toHaveURL(/rarity=legendary/);

  // The packs, then the opening, which fills the screen and comes back to them
  await tabs.getByRole('link', { name: /^Paquets/ }).click();
  await expect(page).toHaveURL(/\/c\/heritage\/packs$/);
  await expect(tabs.getByRole('link', { name: /^Paquets/ })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Ouvrir un paquet' }).click();
  await expect(page).toHaveURL(/\/c\/heritage\/open$/);
  await expect(page.getByRole('button', { name: 'Ouvrir le paquet' })).toBeVisible();
  await expect(tabs).toHaveCount(0);
  await page.getByRole('link', { name: 'Fermer' }).click();
  await expect(page).toHaveURL(/\/c\/heritage\/packs$/);

  // The trades stand for the friends and the leaderboard too, behind their own tabs
  await tabs.getByRole('link', { name: 'Échanges' }).click();
  await expect(page).toHaveURL(/\/c\/heritage\/trades$/);
  const social = page.getByRole('navigation', { name: 'Amis, échanges et classement' });
  await expect(social.getByRole('link', { name: 'Offres' })).toHaveAttribute('aria-current', 'page');
  await social.getByRole('link', { name: 'Amis' }).click();
  await expect(page).toHaveURL(/\/friends$/);
  await expect(tabs.getByRole('link', { name: 'Échanges' })).toHaveAttribute('aria-current', 'page');
  await social.getByRole('link', { name: 'Classement' }).click();
  await expect(page).toHaveURL(/\/leaderboard$/);
  await expect(tabs.getByRole('link', { name: 'Échanges' })).toHaveAttribute('aria-current', 'page');

  // Adding a friend opens a sheet; the keyboard up, the bar steps aside; Escape closes it
  await page.goto('/friends');
  await page.getByRole('button', { name: 'Ajouter un ami' }).click();
  await page.getByLabel('Pseudo').focus();
  await expect(tabs).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Ajouter un ami' })).toBeHidden();
  await expect(tabs).toBeVisible();
  await expect(page).toHaveURL(/\/friends$/);

  // The profile has the footer's links
  await tabs.getByRole('link', { name: 'Profil' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Profil');
  await page.getByText('Aide et informations').click();
  await page.getByRole('link', { name: 'Mentions légales' }).click();
  await expect(page).toHaveURL(/\/legal-notice$/);

  // A wider screen gets the header's links and the footer back
  await page.goto('/c/heritage');
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(tabs).toHaveCount(1);
  await expect(tabs.getByRole('link', { name: 'Règles du jeu' })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
});
