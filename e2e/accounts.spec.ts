import { countEmails, expect, linkFromEmail, logIn, newPlayer, signUp, signUpAndVerify, test } from './helpers';

test('a player signs up, confirms the address, edits the profile, exports and deletes the account', async ({ page }) => {
  const player = newPlayer();
  await signUpAndVerify(page, player);

  await page.getByRole('link', { name: 'Accéder à mon compte' }).click();
  await expect(page.getByRole('heading', { name: 'Mon compte', exact: true })).toBeVisible();
  await expect(page.getByText(player.email)).toBeVisible();
  await expect(page.getByText('31 mai 1990')).toBeVisible();

  const newPseudo = `${player.pseudo}x`.slice(-20);
  await page.getByLabel('Pseudo').fill(newPseudo);
  await page.getByRole('button', { name: 'Enregistrer le pseudo' }).click();
  await expect(page.getByText('Pseudo enregistré.')).toBeVisible();

  const response = await page.request.get('/account/export');
  expect(response.headers()['content-disposition']).toContain('attachment');
  const data = await response.json();
  expect(data.account).toMatchObject({ pseudo: newPseudo, email: player.email, birthDate: '1990-05-31', emailVerified: true });
  expect(data.consents).toEqual([expect.objectContaining({ document: 'terms', version: expect.any(String) })]);

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('link', { name: 'Se connecter' })).toBeVisible();
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);

  await logIn(page, player.email, player.password);
  await expect(page.getByRole('heading', { name: 'Mon compte', exact: true })).toBeVisible();

  const deletion = page.getByRole('region', { name: 'Supprimer mon compte' });
  await deletion.getByLabel('Mot de passe').fill(player.password);
  await deletion.getByRole('button', { name: 'Supprimer définitivement mon compte' }).click();
  await expect(page.getByText('Votre compte et ses données ont été supprimés.')).toBeVisible();

  await logIn(page, player.email, player.password);
  await expect(page.getByText('Adresse e-mail ou mot de passe incorrect.')).toBeVisible();
});

test('signup is refused under 18', async ({ page }) => {
  const player = newPlayer();
  const today = new Date();
  const seventeen = `${today.getFullYear() - 17}-01-01`;
  await signUp(page, player, seventeen);

  await expect(page.getByText('Le jeu est réservé aux personnes de 18 ans et plus.')).toBeVisible();
  await expect(page.getByLabel('Date de naissance')).toBeFocused();
  // Nothing created, nothing sent.
  expect(await countEmails(page.request, player.email)).toBe(0);
});

test('a pseudo is taken whatever its case', async ({ page }) => {
  const first = newPlayer();
  await signUp(page, first);
  await expect(page.getByRole('heading', { name: 'Confirmez votre adresse e-mail' })).toBeVisible();

  await signUp(page, { ...newPlayer(), pseudo: first.pseudo.toUpperCase() });
  await expect(page.getByText('Ce pseudo est déjà pris.')).toBeVisible();
});

test('signing up again with a known address reveals nothing and warns its owner', async ({ page }) => {
  const player = newPlayer();
  await signUp(page, player);
  await expect(page.getByRole('heading', { name: 'Confirmez votre adresse e-mail' })).toBeVisible();

  await signUp(page, { ...newPlayer(), email: player.email });
  await expect(page.getByRole('heading', { name: 'Confirmez votre adresse e-mail' })).toBeVisible();
  await linkFromEmail(page.request, player.email, 'Votre adresse a servi à une inscription');
});

test('signing in before confirming sends a new link', async ({ page }) => {
  const player = newPlayer();
  await signUp(page, player);
  await expect(page.getByRole('heading', { name: 'Confirmez votre adresse e-mail' })).toBeVisible();
  await linkFromEmail(page.request, player.email, 'Confirmez votre adresse e-mail');

  await logIn(page, player.email, player.password);
  await expect(page.getByText("Votre adresse e-mail n'est pas encore confirmée.")).toBeVisible();
  await expect.poll(() => countEmails(page.request, player.email, 'Confirmez votre adresse e-mail')).toBe(2);

  // The new link signs the player in and leads to the page they were going to.
  await page.goto(await linkFromEmail(page.request, player.email, 'Confirmez votre adresse e-mail'));
  await expect(page.getByRole('heading', { name: 'Mon compte', exact: true })).toBeVisible();
});

test('a forgotten password is reset through the e-mailed link', async ({ page }) => {
  const player = newPlayer();
  await signUpAndVerify(page, player);
  await page.context().clearCookies();

  await page.goto('/login');
  await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click();
  await expect(page.getByRole('heading', { name: 'Mot de passe oublié' })).toBeVisible();
  await page.getByLabel('Adresse e-mail').fill(player.email);
  await page.getByRole('button', { name: 'Recevoir le lien' }).click();
  await expect(page.getByText(`Si un compte existe pour ${player.email}`)).toBeVisible();

  const link = await linkFromEmail(page.request, player.email, 'Choisissez un nouveau mot de passe');
  await page.goto(link);
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  const newPassword = 'nouveau-mot-de-passe-2026';
  await page.getByLabel('Nouveau mot de passe').fill(newPassword);
  await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
  await expect(page.getByText('Votre mot de passe est modifié')).toBeVisible();

  // The link works once.
  await page.goto(link);
  await expect(page.getByText("Ce lien n'est plus valable")).toBeVisible();

  await logIn(page, player.email, newPassword);
  await expect(page.getByRole('heading', { name: 'Mon compte', exact: true })).toBeVisible();
});

test('login attempts are rate limited', async ({ page }) => {
  // Better Auth only limits in production: CI runs the tests against `next start`.
  test.skip(!process.env.CI, 'rate limits are off in development');
  const player = newPlayer();
  for (let attempt = 1; attempt <= 10; attempt++) {
    await logIn(page, player.email, 'wrong-password-123');
    await expect(page.getByText('Adresse e-mail ou mot de passe incorrect.')).toBeVisible();
  }
  await logIn(page, player.email, 'wrong-password-123');
  await expect(page.getByText('Trop de tentatives. Patientez quelques minutes avant de réessayer.')).toBeVisible();
});
