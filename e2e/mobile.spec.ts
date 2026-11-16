import { devices } from '@playwright/test';
import { expect, newPlayer, signUpAndVerify, test } from './helpers';

// A phone: the Android app's WebView is this wide
const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices['Pixel 7'];
test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent });

test('on a phone, a player moves around with the tab bar', async ({ page }) => {
  const player = newPlayer();
  await signUpAndVerify(page, player);
  await page.goto('/c/heritage');

  // The header's links make way for the tab bar: one navigation shows, at the bottom
  const tabs = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(tabs).toHaveCount(1);
  await expect(tabs.getByRole('link')).toHaveCount(5);
  await expect(tabs.getByRole('link', { name: 'Accueil' })).toHaveAttribute('aria-current', 'page');
  await expect(tabs.getByRole('link', { name: /^Ouvrir\s*, 10 paquets disponibles$/ })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeHidden();

  // The header stays in sight down the page
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByRole('link', { name: /^Activité/ })).toBeInViewport();

  await tabs.getByRole('link', { name: 'Collection' }).click();
  await expect(page).toHaveURL(/\/c\/heritage\/collection$/);
  await expect(tabs.getByRole('link', { name: 'Collection' })).toHaveAttribute('aria-current', 'page');

  // Friends stands for the trades and the leaderboard too, behind their own tabs
  await tabs.getByRole('link', { name: 'Amis' }).click();
  await expect(page).toHaveURL(/\/friends$/);
  const social = page.getByRole('navigation', { name: 'Amis, échanges et classement' });
  await social.getByRole('link', { name: 'Échanges' }).click();
  await expect(page).toHaveURL(/\/c\/heritage\/trades$/);
  await expect(social.getByRole('link', { name: 'Échanges' })).toHaveAttribute('aria-current', 'page');
  await expect(tabs.getByRole('link', { name: 'Amis' })).toHaveAttribute('aria-current', 'page');
  await social.getByRole('link', { name: 'Classement' }).click();
  await expect(page).toHaveURL(/\/leaderboard$/);
  await expect(tabs.getByRole('link', { name: 'Amis' })).toHaveAttribute('aria-current', 'page');

  // The keyboard up, the bar steps aside
  await page.goto('/friends');
  await page.getByLabel('Pseudo').focus();
  await expect(tabs).toBeHidden();
  await page.getByLabel('Pseudo').blur();
  await expect(tabs).toBeVisible();

  // The footer's theme and links are on the account page
  await page.goto('/account');
  await expect(page.getByRole('radiogroup', { name: 'Thème' })).toBeVisible();
  await page.getByRole('link', { name: 'Mentions légales' }).click();
  await expect(page).toHaveURL(/\/legal-notice$/);

  // The opening fills the screen, without the bar
  await tabs.getByRole('link', { name: /^Ouvrir/ }).click();
  await expect(page).toHaveURL(/\/c\/heritage\/open$/);
  await expect(page.getByRole('button', { name: 'Ouvrir le paquet' })).toBeVisible();
  await expect(tabs).toHaveCount(0);

  // A wider screen gets the header's links and the footer back
  await page.goto('/c/heritage');
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(tabs).toHaveCount(1);
  await expect(tabs.getByRole('link', { name: 'Règles du jeu' })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
});
