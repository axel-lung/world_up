import { and, desc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import { cache } from 'react';
import { type Database, db } from '@/db';
import { announcements, auditLog } from '@/db/schema';
import { isSafeLink } from './announcement-shared';

// The banner over the site's pages (decided on 2026-11-22), written at
// /admin/announcements: a short message, a link if need be, from a date and
// until another one (or until withdrawn). Each publication is a row, kept for
// the history; the banner shows the latest one already started and not ended.
// A visitor who closes it doesn't see that one again on this device
// (announcement-shared.ts).

export type Announcement = typeof announcements.$inferSelect;
export type AnnouncementTone = Announcement['tone'];

/** The announcement shown now, if any; read once per request (the layout and the page). */
export const currentAnnouncement = cache(async (): Promise<Announcement | null> => {
  const now = new Date();
  const [row] = await db
    .select()
    .from(announcements)
    .where(and(lte(announcements.startsAt, now), or(isNull(announcements.endsAt), gt(announcements.endsAt, now))))
    .orderBy(desc(announcements.startsAt), desc(announcements.id))
    .limit(1);
  return row ?? null;
});

/** The latest announcements, newest first, for the back-office. */
export async function listAnnouncements(limit = 20): Promise<Announcement[]> {
  return db.select().from(announcements).orderBy(desc(announcements.startsAt), desc(announcements.id)).limit(limit);
}

export interface AnnouncementInput {
  message: string;
  linkUrl: string | null;
  linkLabel: string | null;
  tone: AnnouncementTone;
  startsAt: Date;
  endsAt: Date | null;
}

export class AnnouncementError extends Error {
  constructor(readonly code: 'link' | 'dates' | 'over') {
    super(code);
  }
}

/** Publishes an announcement, from `startsAt` (now or later) until `endsAt` or its withdrawal. */
export async function publishAnnouncement(database: Database, adminId: string, input: AnnouncementInput): Promise<number> {
  if (input.linkUrl && !isSafeLink(input.linkUrl)) throw new AnnouncementError('link');
  if (input.endsAt && input.endsAt <= input.startsAt) throw new AnnouncementError('dates');
  return database.transaction(async (tx) => {
    const [row] = await tx
      .insert(announcements)
      .values({ ...input, linkLabel: input.linkUrl ? input.linkLabel : null })
      .returning({ id: announcements.id });
    await tx.insert(auditLog).values({
      adminId,
      action: 'announcement.publish',
      targetType: 'announcement',
      targetId: String(row.id),
      details: { to: input.message },
    });
    return row.id;
  });
}

/** Withdraws an announcement at once: shown now, it goes; to come, it never shows. */
export async function endAnnouncement(database: Database, adminId: string, id: number, now: Date): Promise<void> {
  await database.transaction(async (tx) => {
    const [row] = await tx
      .update(announcements)
      .set({ endsAt: sql`greatest(${now}::timestamptz, ${announcements.startsAt})` })
      .where(and(eq(announcements.id, id), or(isNull(announcements.endsAt), gt(announcements.endsAt, now))))
      .returning({ message: announcements.message });
    if (!row) throw new AnnouncementError('over');
    await tx.insert(auditLog).values({
      adminId,
      action: 'announcement.end',
      targetType: 'announcement',
      targetId: String(id),
      details: { from: row.message },
    });
  });
}
