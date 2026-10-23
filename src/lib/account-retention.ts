import { and, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { type Database, db } from '@/db';
import { users } from '@/db/schema';
import type { EmailJob } from './email';
import { cancelOrphanAuctions } from './game/auctions';
import { cancelOrphanTrades } from './game/trades';
import { deleteOldNotifications } from './notifications/notifications';

// How long accounts are kept (spec, "Données personnelles"; /privacy says the
// same): run once a day by the worker (src/worker/account-retention.ts).

/** An address never confirmed: the signup is dropped after this many days. */
export const UNVERIFIED_DAYS = 30;
/** No sign-in for this many years: the account is deleted... */
export const INACTIVE_YEARS = 3;
/** ...this many days after the e-mail that warns its owner. */
export const NOTICE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A sign-in or a session refresh: the account is active again, and any warning is void. */
export async function markActive(userId: string, database: Database = db): Promise<void> {
  await database
    .update(users)
    .set({ lastActiveAt: sql`now()`, inactivityNoticeAt: null })
    .where(eq(users.id, userId));
}

export interface RetentionReport {
  unverifiedDeleted: number;
  warned: number;
  inactiveDeleted: number;
  notificationsDeleted: number;
}

/**
 * Deletes the signups never confirmed, warns the accounts about to reach 3
 * years without activity, and deletes those warned 30 days ago that have not
 * come back. Deleting a user deletes the player's data with it (foreign keys
 * cascade; reports are kept, detached). Also deletes the notifications older
 * than 90 days.
 */
export async function applyRetention(
  now: Date,
  sendEmail: (job: EmailJob) => Promise<void>,
  appUrl: string,
  database: Database = db,
): Promise<RetentionReport> {
  const unverified = await database
    .delete(users)
    .where(and(eq(users.emailVerified, false), lt(users.createdAt, new Date(now.getTime() - UNVERIFIED_DAYS * DAY_MS))))
    .returning({ id: users.id });

  const inactiveSince = new Date(now);
  inactiveSince.setUTCFullYear(inactiveSince.getUTCFullYear() - INACTIVE_YEARS);
  const warnBefore = new Date(inactiveSince.getTime() + NOTICE_DAYS * DAY_MS);
  const toWarn = await database
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.emailVerified, true), isNull(users.inactivityNoticeAt), lt(users.lastActiveAt, warnBefore)));
  for (const user of toWarn) {
    // Queued first: a failure leaves the account unwarned, so it is tried again tomorrow
    await sendEmail({ template: 'inactiveAccount', to: user.email, url: `${appUrl}/login` });
    await database.update(users).set({ inactivityNoticeAt: now }).where(eq(users.id, user.id));
  }

  const inactive = await database
    .delete(users)
    .where(
      and(
        isNotNull(users.inactivityNoticeAt),
        lt(users.inactivityNoticeAt, new Date(now.getTime() - NOTICE_DAYS * DAY_MS)),
        lt(users.lastActiveAt, users.inactivityNoticeAt),
      ),
    )
    .returning({ id: users.id });

  // The deleted players' open offers and auctions are void: record it
  await cancelOrphanTrades(database, now);
  await cancelOrphanAuctions(database, now);
  const notificationsDeleted = await deleteOldNotifications(database, now);

  return {
    unverifiedDeleted: unverified.length,
    warned: toWarn.length,
    inactiveDeleted: inactive.length,
    notificationsDeleted,
  };
}
