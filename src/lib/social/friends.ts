import { and, asc, count, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { type Database, db, type Transaction } from '@/db';
import { friendships, notifications, trades, users } from '@/db/schema';
import { normalizePseudo } from '@/lib/account-rules';
import { notifiedSince, notify } from '@/lib/notifications/notifications';

// Friends: one friendships row per pair, pending until the other player
// accepts. Friendship holds for the whole game, not one collection. Only
// friends see each other's collection and trade cards.

type Executor = Database | Transaction;

// Anti-abuse limits, like OPENINGS_PER_MINUTE: not game rules.
export const MAX_FRIENDS = 200;
export const MAX_PENDING_REQUESTS = 30;
export const REQUESTS_PER_HOUR = 20;
// A request sent again (after a refusal, say) notifies its recipient once a day at most
const RENOTIFY_AFTER_MS = 24 * 60 * 60 * 1000;

export type FriendErrorCode =
  | 'unknownPlayer'
  | 'self'
  | 'alreadyFriends'
  | 'alreadyRequested'
  | 'tooManyFriends'
  | 'theirFriendsFull'
  | 'tooManyRequests'
  | 'tooFast'
  | 'noRequest';

// A refusal the player can act on; the pages map each code to a message in
// messages/fr.json (Friends.errors).
export class FriendError extends Error {
  constructor(readonly code: FriendErrorCode) {
    super(code);
  }
}

/** The pair's row, in either direction. */
function pair(a: string, b: string) {
  return or(
    and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
    and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
  );
}

/** A player by pseudo, whatever the case. A banned player is not found, except by the back-office. */
export async function findPlayer(executor: Executor, pseudo: string, { banned = false }: { banned?: boolean } = {}) {
  const [player] = await executor
    .select({ id: users.id, pseudo: users.name })
    .from(users)
    .where(
      and(
        eq(sql`lower(${users.name})`, normalizePseudo(pseudo).toLowerCase()),
        eq(users.emailVerified, true),
        banned ? undefined : isNull(users.bannedAt),
      ),
    );
  return player ?? null;
}

async function friendCount(executor: Executor, userId: string): Promise<number> {
  const [{ total }] = await executor
    .select({ total: count() })
    .from(friendships)
    .where(
      and(
        or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
        eq(friendships.status, 'accepted'),
      ),
    );
  return total;
}

export async function areFriends(executor: Executor, a: string, b: string): Promise<boolean> {
  const [row] = await executor
    .select({ id: friendships.id })
    .from(friendships)
    .where(and(pair(a, b), eq(friendships.status, 'accepted')));
  return row !== undefined;
}

/** Locks both players' friendships, in ID order, so two requests between them don't cross. */
async function lockPair(tx: Transaction, a: string, b: string) {
  for (const id of [a, b].sort()) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`friends:${id}`}, 0))`);
  }
}

async function accept(tx: Transaction, requesterId: string, addresseeId: string, now: Date) {
  if ((await friendCount(tx, addresseeId)) >= MAX_FRIENDS) throw new FriendError('tooManyFriends');
  if ((await friendCount(tx, requesterId)) >= MAX_FRIENDS) throw new FriendError('theirFriendsFull');
  await tx
    .update(friendships)
    .set({ status: 'accepted', acceptedAt: now })
    .where(and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, addresseeId)));
  await notify(tx, { userId: requesterId, kind: 'friend_accepted', data: { userId: addresseeId }, now });
}

/**
 * Asks `pseudo` to be the player's friend. A request already received from
 * them is accepted instead.
 */
export async function requestFriend(
  database: Database,
  input: { userId: string; pseudo: string; now: Date },
): Promise<{ outcome: 'requested' | 'accepted'; pseudo: string }> {
  const { userId, now } = input;
  return database.transaction(async (tx) => {
    const target = await findPlayer(tx, input.pseudo);
    if (!target) throw new FriendError('unknownPlayer');
    if (target.id === userId) throw new FriendError('self');
    await lockPair(tx, userId, target.id);

    const [existing] = await tx
      .select({ requesterId: friendships.requesterId, status: friendships.status })
      .from(friendships)
      .where(pair(userId, target.id));
    if (existing?.status === 'accepted') throw new FriendError('alreadyFriends');
    if (existing?.requesterId === userId) throw new FriendError('alreadyRequested');
    if (existing) {
      await accept(tx, target.id, userId, now);
      return { outcome: 'accepted', pseudo: target.pseudo };
    }

    if ((await friendCount(tx, userId)) >= MAX_FRIENDS) throw new FriendError('tooManyFriends');
    const [{ pending }] = await tx
      .select({ pending: count() })
      .from(friendships)
      .where(and(eq(friendships.requesterId, userId), eq(friendships.status, 'pending')));
    if (pending >= MAX_PENDING_REQUESTS) throw new FriendError('tooManyRequests');
    // Requests are deleted when refused: count the notifications they sent instead
    const [{ recent }] = await tx
      .select({ recent: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.kind, 'friend_request'),
          sql`${notifications.data}->>'userId' = ${userId}`,
          sql`${notifications.createdAt} > ${new Date(now.getTime() - 60 * 60 * 1000)}`,
        ),
      );
    if (recent >= REQUESTS_PER_HOUR) throw new FriendError('tooFast');

    await tx.insert(friendships).values({ requesterId: userId, addresseeId: target.id, createdAt: now });
    const since = new Date(now.getTime() - RENOTIFY_AFTER_MS);
    if (!(await notifiedSince(tx, { userId: target.id, kind: 'friend_request', sender: userId, since }))) {
      await notify(tx, { userId: target.id, kind: 'friend_request', data: { userId }, now });
    }
    return { outcome: 'requested', pseudo: target.pseudo };
  });
}

/** Accepts the request `requesterId` sent the player. */
export async function acceptFriend(database: Database, input: { userId: string; requesterId: string; now: Date }) {
  await database.transaction(async (tx) => {
    await lockPair(tx, input.userId, input.requesterId);
    const [request] = await tx
      .select({ id: friendships.id })
      .from(friendships)
      .where(
        and(
          eq(friendships.requesterId, input.requesterId),
          eq(friendships.addresseeId, input.userId),
          eq(friendships.status, 'pending'),
        ),
      );
    if (!request) throw new FriendError('noRequest');
    await accept(tx, input.requesterId, input.userId, input.now);
  });
}

/**
 * Ends the pair's friendship or request, whoever asked: refusing a request,
 * withdrawing one, removing a friend. The requester is not told of a refusal.
 * Pending trades between them are cancelled.
 */
export async function endFriendship(database: Database, input: { userId: string; otherId: string; now: Date }) {
  await database.transaction(async (tx) => {
    await lockPair(tx, input.userId, input.otherId);
    await tx.delete(friendships).where(pair(input.userId, input.otherId));
    await tx
      .update(trades)
      .set({ status: 'cancelled', respondedAt: input.now })
      .where(
        and(
          eq(trades.status, 'pending'),
          or(
            and(eq(trades.proposerId, input.userId), eq(trades.recipientId, input.otherId)),
            and(eq(trades.proposerId, input.otherId), eq(trades.recipientId, input.userId)),
          ),
        ),
      );
  });
}

/** The player's friends, by pseudo; banned ones are left out while they are. */
export async function listFriends(userId: string) {
  const other = sql<string>`CASE WHEN ${friendships.requesterId} = ${userId} THEN ${friendships.addresseeId} ELSE ${friendships.requesterId} END`;
  return db
    .select({ id: users.id, pseudo: users.name, since: friendships.acceptedAt })
    .from(friendships)
    .innerJoin(users, eq(users.id, other))
    .where(
      and(
        or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
        eq(friendships.status, 'accepted'),
        isNull(users.bannedAt),
      ),
    )
    .orderBy(asc(sql`lower(${users.name})`));
}

/** Requests waiting for an answer: received by the player, and sent by them (banned players left out). */
export async function listFriendRequests(userId: string) {
  const [received, sent] = await Promise.all([
    db
      .select({ id: users.id, pseudo: users.name, at: friendships.createdAt })
      .from(friendships)
      .innerJoin(users, eq(users.id, friendships.requesterId))
      .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, 'pending'), isNull(users.bannedAt)))
      .orderBy(asc(friendships.createdAt)),
    db
      .select({ id: users.id, pseudo: users.name, at: friendships.createdAt })
      .from(friendships)
      .innerJoin(users, eq(users.id, friendships.addresseeId))
      .where(and(eq(friendships.requesterId, userId), eq(friendships.status, 'pending'), isNull(users.bannedAt)))
      .orderBy(asc(friendships.createdAt)),
  ]);
  return { received, sent };
}

export type FriendState = 'friends' | 'sent' | 'received';

/** Where the player stands with each of `others` (absent: no link), for the leaderboard. */
export async function friendStates(userId: string, others: string[]): Promise<Map<string, FriendState>> {
  if (others.length === 0) return new Map();
  const rows = await db
    .select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId, status: friendships.status })
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, userId), inArray(friendships.addresseeId, others)),
        and(eq(friendships.addresseeId, userId), inArray(friendships.requesterId, others)),
      ),
    );
  return new Map(
    rows.map((row) => {
      const mine = row.requesterId === userId;
      const state: FriendState = row.status === 'accepted' ? 'friends' : mine ? 'sent' : 'received';
      return [mine ? row.addresseeId : row.requesterId, state];
    }),
  );
}

/** A friend of the player by pseudo, or null (not a player, or not a friend). */
export async function getFriend(userId: string, pseudo: string) {
  const player = await findPlayer(db, pseudo);
  if (!player || player.id === userId || !(await areFriends(db, userId, player.id))) return null;
  return player;
}

/** The player's friends and requests, for the account export. */
export async function playerFriendships(userId: string) {
  const other = sql<string>`CASE WHEN ${friendships.requesterId} = ${userId} THEN ${friendships.addresseeId} ELSE ${friendships.requesterId} END`;
  return db
    .select({
      pseudo: users.name,
      status: friendships.status,
      requestedByMe: sql<boolean>`${friendships.requesterId} = ${userId}`,
      createdAt: friendships.createdAt,
      acceptedAt: friendships.acceptedAt,
    })
    .from(friendships)
    .innerJoin(users, eq(users.id, other))
    .where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)))
    .orderBy(asc(friendships.createdAt));
}
