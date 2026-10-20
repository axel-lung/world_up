import { and, count, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { type Database, db } from '@/db';
import { auditLog, cards, reports, users } from '@/db/schema';
import type { ReportType } from './report-rules';

// Players' reports about a card, and their handling in the back-office.

// Reports a player may send in 24 hours
const DAILY_LIMIT = 10;

export class ReportError extends Error {
  constructor(readonly code: 'tooMany' | 'notFound' | 'closed') {
    super(code);
  }
}

/** Files a report on a visible card; refused past the daily limit. */
export async function createReport(
  database: Database,
  userId: string,
  cardId: number,
  type: ReportType,
  message: string,
): Promise<void> {
  const [card] = await database
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.id, cardId), isNull(cards.hiddenReason)));
  if (!card) throw new ReportError('notFound');
  const [{ sent }] = await database
    .select({ sent: count() })
    .from(reports)
    .where(and(eq(reports.userId, userId), gt(reports.createdAt, sql`now() - interval '1 day'`)));
  if (sent >= DAILY_LIMIT) throw new ReportError('tooMany');
  await database.insert(reports).values({ userId, cardId, type, message });
}

export async function countOpenReports(): Promise<number> {
  const [{ open }] = await db.select({ open: count() }).from(reports).where(eq(reports.status, 'open'));
  return open;
}

export async function listReports({ open, limit }: { open: boolean; limit: number }) {
  return db
    .select({
      id: reports.id,
      type: reports.type,
      message: reports.message,
      status: reports.status,
      createdAt: reports.createdAt,
      cardId: cards.id,
      cardName: cards.name,
      player: users.name,
    })
    .from(reports)
    .innerJoin(cards, eq(cards.id, reports.cardId))
    .leftJoin(users, eq(users.id, reports.userId))
    .where(open ? eq(reports.status, 'open') : inArray(reports.status, ['resolved', 'dismissed']))
    .orderBy(open ? reports.createdAt : desc(reports.closedAt))
    .limit(limit);
}

/** A player's own reports, for the data export. */
export async function playerReports(userId: string) {
  return db
    .select({ card: cards.slug, type: reports.type, message: reports.message, status: reports.status, createdAt: reports.createdAt })
    .from(reports)
    .innerJoin(cards, eq(cards.id, reports.cardId))
    .where(eq(reports.userId, userId))
    .orderBy(reports.createdAt);
}

/** Marks an open report handled or dismissed, and logs it. */
export async function closeReport(
  database: Database,
  adminId: string,
  reportId: number,
  status: 'resolved' | 'dismissed',
): Promise<void> {
  await database.transaction(async (tx) => {
    const [report] = await tx.select().from(reports).where(eq(reports.id, reportId)).for('update');
    if (!report) throw new ReportError('notFound');
    if (report.status !== 'open') throw new ReportError('closed');
    await tx.update(reports).set({ status, closedAt: sql`now()` }).where(eq(reports.id, reportId));
    await tx.insert(auditLog).values({
      adminId,
      action: status === 'resolved' ? 'report.resolve' : 'report.dismiss',
      targetType: 'report',
      targetId: String(reportId),
      details: { card: report.cardId, from: 'open', to: status },
    });
  });
}
