import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
// The pool stays open: Playwright runs the next test files in the same worker
import { db } from '@/db';
import { auditLog, cards, collections, reports, series, users } from '@/db/schema';
import { importCatalog } from '@/lib/catalog/import';
import { createReport } from '@/lib/catalog/reports';
import { testCard, testCatalog } from '@/lib/catalog/testing';
import { countEmails, expect, linkFromEmail, logIn, newPlayer, signUp, signUpAndVerify, test, totp } from './helpers';

// ADMIN_EMAIL comes from .env, as for the web server
const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
const collection = `e2e-${randomUUID().slice(0, 8)}`;
// Each worker runs beforeAll: its own collection, and its own report
const reportMessage = `La photo est floue (${collection}).`;
let collectionId: number;

test.describe('back-office', () => {
  test.skip(!adminEmail, 'ADMIN_EMAIL is not set');

  test.beforeAll(async () => {
    const [row] = await db.insert(collections).values({ slug: collection, name: 'Patrimoine de France', active: true }).returning();
    collectionId = row.id;
    await importCatalog(
      db,
      testCatalog(
        [
          testCard(1, { name: 'château de Test' }),
          // A 20th-century card to review: its architect died in 1945
          testCard(2, { name: `villa ${collection}`, twentieth_century: true, hidden_reason: 'twentieth_century', architect_death: 1945 }),
        ],
        collection,
      ),
    );
    // A player's report for the admin to handle
    const id = randomUUID().slice(0, 8);
    const [player] = await db
      .insert(users)
      .values({ name: `e2e_${id}`, email: `${id}@example.test`, emailVerified: true, birthDate: '1990-01-01' })
      .returning();
    const [card] = await db.select().from(cards).where(and(eq(cards.collectionId, collectionId), eq(cards.wikidataId, 'Q1')));
    await createReport(db, player.id, card.id, 'photo', reportMessage);
  });

  test.afterAll(async () => {
    const ids = (await db.select({ id: cards.id }).from(cards).where(eq(cards.collectionId, collectionId))).map((c) => String(c.id));
    if (ids.length > 0) await db.delete(auditLog).where(and(eq(auditLog.targetType, 'card'), inArray(auditLog.targetId, ids)));
    const reportIds = (
      await db.select({ id: reports.id }).from(reports).innerJoin(cards, eq(cards.id, reports.cardId)).where(eq(cards.collectionId, collectionId))
    ).map((r) => String(r.id));
    if (reportIds.length > 0) {
      await db.delete(auditLog).where(and(eq(auditLog.targetType, 'report'), inArray(auditLog.targetId, reportIds)));
    }
    await db.delete(cards).where(eq(cards.collectionId, collectionId));
    await db.delete(series).where(eq(series.collectionId, collectionId));
    await db.delete(collections).where(eq(collections.id, collectionId));
  });

  test('the admin sets up an authenticator app, signs in with a code and hides a card', async ({ page, browser, baseURL }) => {
    // One walk through the whole back-office, with e-mails to wait for: three times the usual timeout
    test.slow();
    // A fresh admin account at each run
    await db.delete(users).where(eq(users.email, adminEmail!));
    const admin = { ...newPlayer(), email: adminEmail! };
    await signUpAndVerify(page, admin);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/two-factor$/);
    await page.getByLabel('Mot de passe du compte').fill(admin.password);
    await page.getByRole('button', { name: 'Activer la double authentification' }).click();
    await expect(page.getByRole('heading', { name: 'Codes de secours' })).toBeVisible();
    const key = (await page.locator('p', { hasText: 'Clé de configuration' }).locator('span').textContent())!;
    await page.getByLabel("Code affiché par l'application").fill(totp(key));
    await page.getByRole('button', { name: 'Confirmer et ouvrir le back-office' }).click();
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();

    // Signing in again asks for the code before any session exists
    await page.context().clearCookies();
    await logIn(page, admin.email, admin.password);
    await page.getByLabel('Code à 6 chiffres').fill('000000');
    await page.getByRole('button', { name: 'Vérifier' }).click();
    await expect(page.getByText('Code incorrect.')).toBeVisible();
    await page.getByLabel('Code à 6 chiffres').fill(totp(key));
    await page.getByRole('button', { name: 'Vérifier' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Bonjour ${admin.pseudo}`);

    // Hiding a card takes its public page away and goes to the log
    const [card] = await db.select().from(cards).where(and(eq(cards.collectionId, collectionId), eq(cards.wikidataId, 'Q1')));
    await page.goto(`/admin/cards/${card.id}`);
    await expect(page.getByRole('heading', { name: 'Château de Test', level: 1 })).toBeVisible();
    await page.getByLabel('Motif').selectOption('admin');
    await page.getByLabel('Note pour le journal (facultative)').fill('photo floue');
    await page.getByRole('button', { name: 'Masquer la carte' }).click();
    await expect(page.getByText('Modification enregistrée.')).toBeVisible();
    await expect(page.getByText('Cette carte est masquée (masquée à la main).')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Visible → masquée à la main · photo floue' })).toBeVisible();
    expect((await page.request.get(`/c/${collection}/cards/${card.slug}`)).status()).toBe(404);

    // The review of the 20th-century cards, with the architect's death year, in bulk
    await page.goto(`/admin/cards?status=review&q=${collection}`);
    const villa = page.getByRole('row').filter({ hasText: `Villa ${collection}` });
    await expect(villa).toContainText('† 1945');
    await villa.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Rendre visibles les cartes choisies' }).click();
    await expect(page.getByText('1 carte rendue visible.')).toBeVisible();
    expect((await page.request.get(`/c/${collection}/cards/monument-2`)).status()).toBe(200);

    // The player's report: handled, it moves to the closed list
    await page.getByRole('link', { name: 'Signalements' }).click();
    const open = page.getByRole('region', { name: 'À traiter' });
    await open.getByRole('row').filter({ hasText: reportMessage }).getByRole('button', { name: 'Traité' }).click();
    const closed = page.getByRole('region', { name: 'Traités récemment' });
    await expect(closed.getByRole('row').filter({ hasText: reportMessage })).toContainText('traité');

    // The game rules: odds must sum to 100 %, and a resale value change is logged
    await page.getByRole('link', { name: 'Règles du jeu' }).click();
    const odds = page.getByRole('region', { name: 'Probabilités' });
    await odds.getByLabel('Légendaire (%)').fill('1');
    await odds.getByRole('button', { name: 'Publier ces probabilités' }).click();
    await expect(odds.getByText('Les probabilités doivent faire 100 % en tout.')).toBeVisible();

    const resale = page.getByRole('region', { name: 'Revente des doublons' });
    const common = resale.getByLabel('Commune', { exact: true });
    const before = await common.inputValue();
    await resale.getByRole('button', { name: 'Enregistrer les valeurs' }).click();
    await expect(resale.getByText("Aucune valeur n'a changé.")).toBeVisible();
    const after = String(Number(before) + 1);
    await common.fill(after);
    await resale.getByRole('button', { name: 'Enregistrer les valeurs' }).click();
    await expect(resale.getByText("C'est enregistré.")).toBeVisible();
    await expect(page.getByRole('cell', { name: `Commune : ${before} → ${after}` })).toBeVisible();
    // Back to the value the other tests read on /rules
    await common.fill(before);
    await resale.getByRole('button', { name: 'Enregistrer les valeurs' }).click();
    await expect(page.getByRole('cell', { name: `Commune : ${after} → ${before}` })).toBeVisible();

    // A banned player is signed out, told why by e-mail, and can't sign in until the ban is lifted
    const byte = () => Math.floor(Math.random() * 254) + 1;
    const playerContext = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': `10.${byte()}.${byte()}.${byte()}` } });
    const playerPage = await playerContext.newPage();
    const cheat = newPlayer();
    await signUp(playerPage, cheat);
    await expect(playerPage.getByRole('heading', { name: 'Confirmez votre adresse e-mail' })).toBeVisible();
    // Confirmed here rather than by its link: the other tests' e-mails fill the queue
    await db.update(users).set({ emailVerified: true }).where(eq(users.email, cheat.email));
    await logIn(playerPage, cheat.email, cheat.password);
    await expect(playerPage.getByRole('heading', { level: 1 })).toHaveText(`Bonjour ${cheat.pseudo}`);
    await page.getByRole('link', { name: 'Joueurs' }).click();
    await page.getByLabel('Pseudo ou adresse e-mail').fill(cheat.email);
    await page.getByRole('button', { name: 'Filtrer' }).click();
    await page.getByRole('link', { name: cheat.pseudo }).click();
    await expect(page.getByRole('heading', { name: cheat.pseudo, level: 1 })).toBeVisible();
    await page.getByLabel('Motif, envoyé au joueur par e-mail').fill('Comptes multiples');
    await page.getByRole('button', { name: 'Bannir ce joueur' }).click();
    await expect(page.getByText('Joueur banni : il est déconnecté')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Comptes multiples · aucun échange annulé, aucune enchère annulée' })).toBeVisible();

    await playerPage.goto('/account');
    await expect(playerPage).toHaveURL(/\/login\?next=%2Faccount$/);
    await logIn(playerPage, cheat.email, cheat.password);
    await expect(playerPage.getByText('Ce compte est suspendu.')).toBeVisible();

    await page.getByRole('button', { name: 'Lever le bannissement' }).click();
    await expect(page.getByText('Bannissement levé : il peut de nouveau se connecter.')).toBeVisible();
    await logIn(playerPage, cheat.email, cheat.password);
    await expect(playerPage.getByRole('heading', { level: 1 })).toHaveText(`Bonjour ${cheat.pseudo}`);
    await playerContext.close();
    // Queued meanwhile, behind the other tests' e-mails
    const suspended = 'Votre compte World Up est suspendu';
    await expect.poll(() => countEmails(page.request, cheat.email, suspended), { timeout: 45_000 }).toBe(1);
    expect(await linkFromEmail(page.request, cheat.email, suspended)).toMatch(/\/terms$/);
    await expect.poll(() => countEmails(page.request, cheat.email, 'Votre compte World Up est rétabli'), { timeout: 45_000 }).toBe(1);

    const [account] = await db.select({ id: users.id }).from(users).where(eq(users.email, adminEmail!));
    await db.delete(auditLog).where(and(eq(auditLog.adminId, account.id), inArray(auditLog.targetType, ['collection', 'user'])));
  });

  test('is a 404 for players', async ({ page }) => {
    await signUpAndVerify(page, newPlayer());
    expect((await page.goto('/admin'))?.status()).toBe(404);
    expect((await page.goto('/admin/two-factor'))?.status()).toBe(404);
  });
});
