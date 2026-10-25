import { and, count, desc, eq, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { type Database, db, type Transaction } from '@/db';
import { cards, collections, notifications, users } from '@/db/schema';
import { enqueuePushes } from '@/lib/job-queue';
import { pushDeviceIds, pushPublicKey } from './push';

// What happened to a player: a friend request, a trade offer, an outbid... The
// row is written in the transaction of the event; the header's bell counts the
// unread ones, /activity lists them, and the worker pushes them to the devices
// where the player turned notifications on. `data` holds IDs only: the text
// comes from messages/fr.json (Notifications) when it is shown.

type Executor = Database | Transaction;

export type NotificationKind = (typeof notifications.$inferInsert)['kind'];

/** Notifications are deleted after this many days (/privacy says the same). */
export const NOTIFICATION_RETENTION_DAYS = 90;
export const ACTIVITY_SIZE = 50;

export interface NotificationData {
  /** The other player: who asked, accepted, offered... */
  userId?: string;
  tradeId?: number;
  auctionId?: number;
  cardId?: number;
}

export async function notify(
  executor: Executor,
  input: { userId: string; kind: NotificationKind; collectionId?: number; data: NotificationData; now: Date },
): Promise<number> {
  const [row] = await executor
    .insert(notifications)
    .values({
      userId: input.userId,
      kind: input.kind,
      collectionId: input.collectionId ?? null,
      data: input.data,
      createdAt: input.now,
    })
    .returning({ id: notifications.id });
  // The pushes commit with the notification: none for an event rolled back.
  const devices = pushPublicKey() ? await pushDeviceIds(executor, input.userId) : [];
  if (devices.length > 0) {
    await enqueuePushes(
      executor,
      devices.map((subscriptionId) => ({ notificationId: row.id, subscriptionId })),
    );
  }
  return row.id;
}

export async function unreadCount(userId: string): Promise<number> {
  const [{ unread }] = await db
    .select({ unread: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return unread;
}

/** The latest notifications, newest first, with the other player's pseudo, the card's name and the collection's slug. */
export async function listNotifications(userId: string, limit = ACTIVITY_SIZE) {
  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      data: notifications.data,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      collection: collections.slug,
    })
    .from(notifications)
    .leftJoin(collections, eq(collections.id, notifications.collectionId))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);
  return withNames(rows);
}

/** Adds the other player's pseudo and the card's name to notifications. */
async function withNames<Row extends { data: unknown }>(rows: Row[]) {
  const others = [...new Set(rows.map((row) => (row.data as NotificationData).userId).filter((id) => id !== undefined))];
  const cardIds = [...new Set(rows.map((row) => (row.data as NotificationData).cardId).filter((id) => id !== undefined))];
  const [pseudos, names] = await Promise.all([
    others.length
      ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, others))
      : [],
    cardIds.length ? db.select({ id: cards.id, name: cards.name }).from(cards).where(inArray(cards.id, cardIds)) : [],
  ]);
  const pseudoOf = new Map(pseudos.map((user) => [user.id, user.name]));
  const nameOf = new Map(names.map((card) => [card.id, card.name]));
  return rows.map((row) => {
    const data = row.data as NotificationData;
    return {
      ...row,
      data,
      // Null once the other player has deleted the account
      pseudo: data.userId ? (pseudoOf.get(data.userId) ?? null) : null,
      card: data.cardId ? (nameOf.get(data.cardId) ?? null) : null,
    };
  });
}

/**
 * A notification to push, with what its text needs; null once it is deleted
 * or read, or when its player is banned.
 */
export async function pushableNotification(id: number) {
  const [row] = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      kind: notifications.kind,
      data: notifications.data,
      readAt: notifications.readAt,
      bannedAt: users.bannedAt,
      collection: collections.slug,
    })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .leftJoin(collections, eq(collections.id, notifications.collectionId))
    .where(eq(notifications.id, id));
  if (!row || row.readAt !== null || row.bannedAt !== null) return null;
  const [named] = await withNames([row]);
  return named;
}

export type ActivityItem = Awaited<ReturnType<typeof listNotifications>>[number];

/** Marks as read every notification up to `upToId`: the ones the player has seen. */
export async function markRead(userId: string, upToId: number, now: Date): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), lte(notifications.id, upToId)));
}

/** Deletes the notifications older than the retention period; returns how many. */
export async function deleteOldNotifications(database: Database, now: Date): Promise<number> {
  const before = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await database
    .delete(notifications)
    .where(lt(notifications.createdAt, before))
    .returning({ id: notifications.id });
  return deleted.length;
}

/** The player's notifications, for the account export. */
export async function playerNotifications(userId: string) {
  return db
    .select({ kind: notifications.kind, data: notifications.data, readAt: notifications.readAt, createdAt: notifications.createdAt })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt));
}

/** Whether `sender` has notified `userId` of this kind since `since` (friend requests sent again). */
export async function notifiedSince(
  executor: Executor,
  input: { userId: string; kind: NotificationKind; sender: string; since: Date },
): Promise<boolean> {
  const [row] = await executor
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, input.userId),
        eq(notifications.kind, input.kind),
        sql`${notifications.data}->>'userId' = ${input.sender}`,
        sql`${notifications.createdAt} > ${input.since}`,
      ),
    )
    .limit(1);
  return row !== undefined;
}
