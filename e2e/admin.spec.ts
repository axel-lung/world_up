import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
// The pool stays open: Playwright runs the next test files in the same worker
import { db } from '@/db';
import { auditLog, cards, collections, reports, series, users } from '@/db/schema';
import { importCatalog } from '@/lib/catalog/import';
import { createReport } from '@/lib/catalog/reports';
import { testCard, testCatalog } from '@/lib/catalog/testing';
import { expect, logIn, newPlayer, signUpAndVerify, test, totp } from './helpers';

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
    await importCatalog(db, testCatalog([testCard(1, { name: 'château de Test' })], collection));
    // A player's report for the admin to handle
    const id = randomUUID().slice(0, 8);
    const [player] = await db
      .insert(users)
      .values({ name: `e2e_${id}`, email: `${id}@example.test`, emailVerified: true, birthDate: '1990-01-01' })
      .returning();
    const [card] = await db.select().from(cards).where(eq(cards.collectionId, collectionId));
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

  test('the admin sets up an authenticator app, signs in with a code and hides a card', async ({ page }) => {
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
    await expect(page.getByRole('heading', { name: 'Mon compte', exact: true })).toBeVisible();

    // Hiding a card takes its public page away and goes to the log
    const [card] = await db.select().from(cards).where(eq(cards.collectionId, collectionId));
    await page.goto(`/admin/cards/${card.id}`);
    await expect(page.getByRole('heading', { name: 'Château de Test', level: 1 })).toBeVisible();
    await page.getByLabel('Motif').selectOption('admin');
    await page.getByLabel('Note pour le journal (facultative)').fill('photo floue');
    await page.getByRole('button', { name: 'Masquer la carte' }).click();
    await expect(page.getByText('Modification enregistrée.')).toBeVisible();
    await expect(page.getByText('Cette carte est masquée (masquée à la main).')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Visible → masquée à la main · photo floue' })).toBeVisible();
    expect((await page.request.get(`/c/${collection}/cards/${card.slug}`)).status()).toBe(404);

    // The player's report: handled, it moves to the closed list
    await page.getByRole('link', { name: 'Signalements' }).click();
    const open = page.getByRole('region', { name: 'À traiter' });
    await open.getByRole('row').filter({ hasText: reportMessage }).getByRole('button', { name: 'Traité' }).click();
    const closed = page.getByRole('region', { name: 'Traités récemment' });
    await expect(closed.getByRole('row').filter({ hasText: reportMessage })).toContainText('traité');
  });

  test('is a 404 for players', async ({ page }) => {
    await signUpAndVerify(page, newPlayer());
    expect((await page.goto('/admin'))?.status()).toBe(404);
    expect((await page.goto('/admin/two-factor'))?.status()).toBe(404);
  });
});
