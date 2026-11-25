import { expect, test } from './helpers';

// One theme, the dark vitrail (decided on 2026-11-25): whatever the device's
// setting, every page is drawn on the stone, and nothing offers another theme.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`every page is drawn in the vitrail on a ${colorScheme} device`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    for (const path of ['/rules', '/login']) {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(24, 24, 27)');
    }
    await expect(page.getByRole('radiogroup', { name: 'Thème' })).toHaveCount(0);
  });
}
