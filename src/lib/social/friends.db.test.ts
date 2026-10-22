import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { friendships, notifications, trades, users } from '@/db/schema';
import { testCard } from '@/lib/catalog/testing';
import { createTestCollection, createTestPlayer, deleteTestData, type TestCollection } from '@/lib/game/testing';
import { deleteOldNotifications, listNotifications, notify, unreadCount } from '@/lib/notifications/notifications';
import {
  acceptFriend,
  areFriends,
  endFriendship,
  FriendError,
  friendStates,
  listFriendRequests,
  listFriends,
  REQUESTS_PER_HOUR,
  requestFriend,
} from './friends';

const t0 = new Date('2026-10-22T12:00:00Z');
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);

let collection: TestCollection;
const players: string[] = [];
const pseudos = new Map<string, string>();

beforeAll(async () => {
  collection = await createTestCollection([testCard(1)], {
    odds: { legendary: 0, ultra: 0, super: 0, rare: 0, uncommon: 0, common: 1_000_000 },
  });
});

afterAll(async () => {
  await deleteTestData([collection.id], players);
});

async function newPlayer() {
  const id = await createTestPlayer();
  players.push(id);
  const [{ name }] = await db.select({ name: users.name }).from(users).where(eq(users.id, id));
  pseudos.set(id, name);
  return id;
}

const request = (from: string, to: string, now = t0) => requestFriend(db, { userId: from, pseudo: pseudos.get(to)!, now });

const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error) => (error instanceof FriendError ? error.code : error),
  );

async function kinds(userId: string) {
  return (await listNotifications(userId)).map((item) => item.kind);
}

describe('friend requests', () => {
  it('makes two players friends once the other accepts, and tells each of them', async () => {
    const [a, b] = [await newPlayer(), await newPlayer()];
    expect(await request(a, b)).toEqual({ outcome: 'requested', pseudo: pseudos.get(b) });
    expect(await areFriends(db, a, b)).toBe(false);
    expect(await kinds(b)).toEqual(['friend_request']);
    expect((await listFriendRequests(b)).received.map((r) => r.id)).toEqual([a]);
    expect((await listFriendRequests(a)).sent.map((r) => r.id)).toEqual([b]);

    await acceptFriend(db, { userId: b, requesterId: a, now: at(1) });
    expect(await areFriends(db, b, a)).toBe(true);
    expect(await kinds(a)).toEqual(['friend_accepted']);
    expect((await listFriends(a)).map((f) => f.id)).toEqual([b]);
    expect(await friendStates(a, [b])).toEqual(new Map([[b, 'friends']]));
  });

  it('finds the pseudo whatever the case, and refuses the impossible requests', async () => {
    const [a, b] = [await newPlayer(), await newPlayer()];
    expect(await requestFriend(db, { userId: a, pseudo: pseudos.get(b)!.toUpperCase(), now: t0 })).toMatchObject({
      outcome: 'requested',
    });
    expect(await rejection(request(a, b))).toBe('alreadyRequested');
    expect(await rejection(request(a, a))).toBe('self');
    expect(await rejection(requestFriend(db, { userId: a, pseudo: 'personne-ici', now: t0 }))).toBe('unknownPlayer');
    expect(await rejection(acceptFriend(db, { userId: a, requesterId: b, now: t0 }))).toBe('noRequest');
    await acceptFriend(db, { userId: b, requesterId: a, now: t0 });
    expect(await rejection(request(b, a))).toBe('alreadyFriends');
  });

  it('turns a request to someone who already asked into an acceptance, even sent at the same time', async () => {
    const [a, b] = [await newPlayer(), await newPlayer()];
    const outcomes = await Promise.all([request(a, b), request(b, a)]);
    expect(outcomes.map((o) => o.outcome).sort()).toEqual(['accepted', 'requested']);
    expect(await areFriends(db, a, b)).toBe(true);
    const rows = await db.select().from(friendships).where(eq(friendships.requesterId, a));
    const reverse = await db.select().from(friendships).where(eq(friendships.requesterId, b));
    expect(rows.length + reverse.length).toBe(1);
  });

  it('does not tell the requester of a refusal, nor notify the same request twice in a day', async () => {
    const [a, b] = [await newPlayer(), await newPlayer()];
    await request(a, b);
    await endFriendship(db, { userId: b, otherId: a, now: at(1) });
    expect((await listFriendRequests(a)).sent).toEqual([]);
    expect(await kinds(a)).toEqual([]);
    await request(a, b, at(2));
    expect(await kinds(b)).toEqual(['friend_request']);
    await endFriendship(db, { userId: b, otherId: a, now: at(3) });
    await request(a, b, at(24 * 60 + 2));
    expect(await kinds(b)).toEqual(['friend_request', 'friend_request']);
  });

  it(`refuses more than ${REQUESTS_PER_HOUR} requests an hour`, async () => {
    const a = await newPlayer();
    for (let i = 0; i < REQUESTS_PER_HOUR; i++) await request(a, await newPlayer(), at(i));
    expect(await rejection(request(a, await newPlayer(), at(30)))).toBe('tooFast');
    await request(a, await newPlayer(), at(61));
  });
});

describe('removing a friend', () => {
  it('ends the friendship and cancels the pending trades between them', async () => {
    const [a, b, c] = [await newPlayer(), await newPlayer(), await newPlayer()];
    await request(a, b);
    await acceptFriend(db, { userId: b, requesterId: a, now: t0 });
    const offer = (proposerId: string, recipientId: string) =>
      db
        .insert(trades)
        .values({ collectionId: collection.id, proposerId, recipientId, idempotencyKey: randomUUID(), expiresAt: at(60) })
        .returning({ id: trades.id })
        .then(([row]) => row.id);
    const [ab, ba, ac] = [await offer(a, b), await offer(b, a), await offer(a, c)];

    await endFriendship(db, { userId: b, otherId: a, now: at(1) });
    expect(await areFriends(db, a, b)).toBe(false);
    const status = async (id: number) => (await db.select({ status: trades.status }).from(trades).where(eq(trades.id, id)))[0].status;
    expect([await status(ab), await status(ba), await status(ac)]).toEqual(['cancelled', 'cancelled', 'pending']);
  });
});

describe('notifications', () => {
  it('counts the unread ones and deletes them after 90 days', async () => {
    const player = await newPlayer();
    const old = await notify(db, { userId: player, kind: 'friend_accepted', data: {}, now: new Date('2026-01-01T00:00:00Z') });
    await notify(db, { userId: player, kind: 'friend_accepted', data: {}, now: t0 });
    expect(await unreadCount(player)).toBe(2);
    expect(await deleteOldNotifications(db, t0)).toBeGreaterThanOrEqual(1);
    const left = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, player)));
    expect(left.map((row) => row.id)).not.toContain(old);
    expect(left).toHaveLength(1);
  });
});
