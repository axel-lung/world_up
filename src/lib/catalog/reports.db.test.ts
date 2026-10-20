import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '@/db';
import { auditLog, cards, collections, reports, series, users } from '@/db/schema';
import { importCatalog } from './import';
import { closeReport, createReport, playerReports } from './reports';
import { testCard, testCatalog } from './testing';

let collectionId: number;
let visibleId: number;
let hiddenId: number;
const userIds: string[] = [];

async function newUser(prefix: string) {
  const id = randomUUID().slice(0, 8);
  const [user] = await db
    .insert(users)
    .values({ name: `${prefix}-${id}`, email: `${prefix}-${id}@example.test`, birthDate: '1990-01-01' })
    .returning({ id: users.id });
  userIds.push(user.id);
  return user.id;
}

beforeAll(async () => {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const [row] = await db.insert(collections).values({ slug, name: 'Test' }).returning({ id: collections.id });
  collectionId = row.id;
  await importCatalog(db, testCatalog([testCard(1), testCard(2, { memorial: true, hidden_reason: 'memorial' })], slug));
  const rows = await db.select().from(cards).where(eq(cards.collectionId, collectionId));
  visibleId = rows.find((c) => c.wikidataId === 'Q1')!.id;
  hiddenId = rows.find((c) => c.wikidataId === 'Q2')!.id;
});

afterAll(async () => {
  // Only this test's log entries: the reports of its cards
  const ids = (await db.select({ id: reports.id }).from(reports).where(inArray(reports.cardId, [visibleId, hiddenId]))).map(
    (r) => String(r.id),
  );
  if (ids.length > 0) await db.delete(auditLog).where(and(eq(auditLog.targetType, 'report'), inArray(auditLog.targetId, ids)));
  await db.delete(cards).where(eq(cards.collectionId, collectionId));
  await db.delete(series).where(eq(series.collectionId, collectionId));
  await db.delete(collections).where(eq(collections.id, collectionId));
  await db.delete(users).where(inArray(users.id, userIds));
  await pool.end();
});

describe('reports', () => {
  it('are filed on visible cards only, ten a day per player', async () => {
    const player = await newUser('player');
    await createReport(db, player, visibleId, 'photo', 'La photo est floue.');
    await expect(createReport(db, player, hiddenId, 'text', 'Le texte est faux.')).rejects.toMatchObject({ code: 'notFound' });
    for (let i = 1; i < 10; i += 1) await createReport(db, player, visibleId, 'text', `Remarque numéro ${i}.`);
    await expect(createReport(db, player, visibleId, 'other', 'Une de trop ici.')).rejects.toMatchObject({ code: 'tooMany' });
    expect(await playerReports(player)).toHaveLength(10);
  });

  it('are closed once, with a log entry', async () => {
    const [admin, player] = [await newUser('admin'), await newUser('player')];
    await createReport(db, player, visibleId, 'photo', 'Photo de nuit, interdite ?');
    const [report] = await db.select().from(reports).where(eq(reports.userId, player));
    await closeReport(db, admin, report.id, 'resolved');
    await expect(closeReport(db, admin, report.id, 'dismissed')).rejects.toMatchObject({ code: 'closed' });
    const [after] = await db.select().from(reports).where(eq(reports.id, report.id));
    expect(after.status).toBe('resolved');
    expect(after.closedAt).not.toBeNull();
    const log = await db
      .select({ action: auditLog.action, details: auditLog.details })
      .from(auditLog)
      .where(and(eq(auditLog.targetType, 'report'), eq(auditLog.targetId, String(report.id))));
    expect(log).toEqual([{ action: 'report.resolve', details: { card: visibleId, from: 'open', to: 'resolved' } }]);
  });

  it('stay, anonymous, when the player deletes the account', async () => {
    const player = await newUser('player');
    await createReport(db, player, visibleId, 'text', 'Une date est fausse.');
    const [report] = await db.select().from(reports).where(eq(reports.userId, player));
    await db.delete(users).where(eq(users.id, player));
    const [after] = await db.select().from(reports).where(eq(reports.id, report.id));
    expect(after).toMatchObject({ userId: null, message: 'Une date est fausse.' });
  });
});
