import { expect, test } from './helpers';

test('the theme chosen in the footer applies to every page and outlasts a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/rules');
  const html = page.locator('html');
  const body = page.locator('body');
  const theme = page.getByRole('radiogroup', { name: 'Thème' });
  await expect(theme.getByRole('radio', { name: 'Auto' })).toBeChecked();
  await expect(html).not.toHaveAttribute('data-theme');
  await expect(body).toHaveCSS('background-color', 'rgb(245, 234, 216)');

  await theme.getByText('Sombre').click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(body).toHaveCSS('background-color', 'rgb(32, 30, 29)');

  // Rendered by the server in the chosen theme, footer or not
  await page.goto('/login');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.goto('/odds');
  await expect(theme.getByRole('radio', { name: 'Sombre' })).toBeChecked();

  // Light overrides a dark device...
  await page.emulateMedia({ colorScheme: 'dark' });
  await theme.getByText('Clair').click();
  await expect(body).toHaveCSS('background-color', 'rgb(245, 234, 216)');

  // ...and Auto follows it again
  await theme.getByText('Auto').click();
  await page.reload();
  await expect(html).not.toHaveAttribute('data-theme');
  await expect(theme.getByRole('radio', { name: 'Auto' })).toBeChecked();
  await expect(body).toHaveCSS('background-color', 'rgb(32, 30, 29)');
});
