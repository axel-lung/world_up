import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { auctions, auditLog, cards, friendships, notifications, sessions, trades, userCards, users } from '@/db/schema';
import { testCard } from '@/lib/catalog/testing';
import { leaderboard } from '@/lib/game/leaderboard';
import { createTestCollection, createTestPlayer, deleteTestData, type TestCollection } from '@/lib/game/testing';
import { findPlayer, listFriends } from '@/lib/social/friends';
import { banPlayer, getAdminPlayer, PlayerError, searchPlayers, unbanPlayer } from './admin';

const t0 = new Date('2026-10-24T12:00:00Z');
const at = (hours: number) => new Date(t0.getTime() + hours * 60 * 60_000);

let collection: TestCollection;
let cardId: number;
let admin: string;
const players: string[] = [];

beforeAll(async () => {
  collection = await createTestCollection([testCard(1)], {
    odds: { legendary: 0, ultra: 0, super: 0, rare: 0, uncommon: 0, common: 1_000_000 },
  });
  [{ id: cardId }] = await db.select({ id: cards.id }).from(cards).where(eq(cards.collectionId, collection.id));
  admin = await newPlayer();
});

afterAll(async () => {
  await db.delete(auditLog).where(and(eq(auditLog.targetType, 'user'), inArray(auditLog.targetId, players)));
  await deleteTestData([collection.id], players);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function newPlayer(email?: string) {
  const id = email
    ? (
        await db
          .insert(users)
          .values({ name: `joueur-${randomUUID().slice(0, 12)}`, email, emailVerified: true, birthDate: '1990-01-01' })
          .returning({ id: users.id })
      )[0].id
    : await createTestPlayer();
  players.push(id);
  return id;
}

const pseudoOf = async (id: string) => (await db.select({ name: users.name }).from(users).where(eq(users.id, id)))[0].name;

const offer = (proposerId: string, recipientId: string, status: 'pending' | 'accepted' = 'pending', expiresAt = at(48)) =>
  db
    .insert(trades)
    .values({ collectionId: collection.id, proposerId, recipientId, status, idempotencyKey: randomUUID(), createdAt: t0, expiresAt })
    .returning({ id: trades.id })
    .then(([row]) => row.id);

const sale = (sellerId: string, leaderId: string | null, options: { status?: 'active' | 'sold'; price?: number; endsAt?: Date } = {}) =>
  db
    .insert(auctions)
    .values({
      collectionId: collection.id,
      sellerId,
      cardId,
      startPrice: 10,
      currentPrice: options.price ?? 10,
      leaderId,
      leaderMax: leaderId ? 50 : null,
      bidCount: leaderId ? 1 : 0,
      status: options.status ?? 'active',
      idempotencyKey: randomUUID(),
      createdAt: t0,
      endsAt: options.endsAt ?? at(24),
    })
    .returning({ id: auctions.id })
    .then(([row]) => row.id);

const statusOf = async (table: typeof trades | typeof auctions, id: number) =>
  (await db.select({ status: table.status }).from(table).where(eq(table.id, id)))[0].status;

async function kinds(userId: string) {
  const rows = await db.select({ kind: notifications.kind }).from(notifications).where(eq(notifications.userId, userId));
  return rows.map((row) => row.kind);
}

const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error) => (error instanceof PlayerError ? error.code : error),
  );

const ban = (userId: string, now = at(1)) => banPlayer(db, { adminId: admin, userId, reason: 'Comptes multiples', now });

describe('banning a player', () => {
  it('signs them out, cancels their open trades and auctions, tells the others and logs it', async () => {
    const [cheat, friend, seller, buyer] = [await newPlayer(), await newPlayer(), await newPlayer(), await newPlayer()];
    await db.insert(sessions).values({ userId: cheat, token: randomUUID(), expiresAt: at(720) });
    const sent = await offer(cheat, friend);
    const received = await offer(friend, cheat);
    const expired = await offer(cheat, friend, 'pending', at(0.5));
    const done = await offer(cheat, friend, 'accepted');
    const selling = await sale(cheat, buyer);
    const leading = await sale(seller, cheat);
    // Over but not settled: the sale to them doesn't go through either
    const over = await sale(seller, cheat, { endsAt: at(0.5) });
    const elsewhere = await sale(seller, buyer);

    expect(await ban(cheat)).toEqual({ email: expect.stringContaining('@'), trades: 2, auctions: 3 });

    expect((await db.select().from(users).where(eq(users.id, cheat)))[0].bannedAt).toEqual(at(1));
    expect(await db.select().from(sessions).where(eq(sessions.userId, cheat))).toEqual([]);
    expect(await statusOf(trades, sent)).toBe('cancelled');
    expect(await statusOf(trades, received)).toBe('cancelled');
    // Left for the worker to mark expired, and history kept
    expect(await statusOf(trades, expired)).toBe('pending');
    expect(await statusOf(trades, done)).toBe('accepted');
    for (const id of [selling, leading, over]) expect(await statusOf(auctions, id)).toBe('cancelled');
    expect(await statusOf(auctions, elsewhere)).toBe('active');
    // The other player of each auction is told, the banned one isn't
    expect(await kinds(buyer)).toEqual(['auction_cancelled']);
    expect(await kinds(seller)).toEqual(['auction_cancelled', 'auction_cancelled']);
    expect(await kinds(cheat)).toEqual([]);

    const [log] = await db.select().from(auditLog).where(and(eq(auditLog.targetType, 'user'), eq(auditLog.targetId, cheat)));
    expect(log).toMatchObject({ adminId: admin, action: 'user.ban', details: { note: 'Comptes multiples', trades: 2, auctions: 3 } });
  });

  it('refuses the back-office account, and a player banned already', async () => {
    const owner = await newPlayer(`admin-${randomUUID().slice(0, 8)}@example.test`);
    const [{ email }] = await db.select({ email: users.email }).from(users).where(eq(users.id, owner));
    vi.stubEnv('ADMIN_EMAIL', email.toUpperCase());
    expect(await rejection(ban(owner))).toBe('adminAccount');

    const player = await newPlayer();
    await ban(player);
    expect(await rejection(ban(player))).toBe('alreadyBanned');
    expect(await rejection(ban(randomUUID()))).toBe('notFound');
  });

  it('hides them from other players until the ban is lifted', async () => {
    const [cheat, friend] = [await newPlayer(), await newPlayer()];
    await db.insert(friendships).values({ requesterId: cheat, addresseeId: friend, status: 'accepted', acceptedAt: t0 });
    await db.insert(userCards).values({ userId: cheat, collectionId: collection.id, cardId, quantity: 1, firstObtainedAt: t0 });
    const pseudo = await pseudoOf(cheat);
    const onLeaderboard = async () => (await leaderboard(collection.id)).rows.some((row) => row.userId === cheat);
    expect(await onLeaderboard()).toBe(true);

    await ban(cheat);
    expect(await findPlayer(db, pseudo)).toBeNull();
    expect(await findPlayer(db, pseudo, { banned: true })).toMatchObject({ id: cheat });
    expect((await listFriends(friend)).map((row) => row.id)).toEqual([]);
    expect(await onLeaderboard()).toBe(false);

    expect(await unbanPlayer(db, { adminId: admin, userId: cheat, note: null })).toEqual({ email: expect.any(String) });
    expect(await findPlayer(db, pseudo)).toMatchObject({ id: cheat });
    expect((await listFriends(friend)).map((row) => row.id)).toEqual([cheat]);
    expect(await onLeaderboard()).toBe(true);
    expect(await rejection(unbanPlayer(db, { adminId: admin, userId: cheat, note: null }))).toBe('notBanned');
    const logs = await db.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.targetId, cheat));
    expect(logs.map((row) => row.action).sort()).toEqual(['user.ban', 'user.unban']);
  });
});

describe("a player's file", () => {
  it('links the accounts of one mailbox: "+tags" dropped, and dots for Gmail', async () => {
    const tag = randomUUID().slice(0, 8);
    const first = await newPlayer(`jean.dupont.${tag}@gmail.com`);
    const second = await newPlayer(`jeandupont${tag}+jeu@googlemail.com`);
    const third = await newPlayer(`jean.dupont.${tag}+bis@example.test`);
    const other = await newPlayer(`jeandupont${tag}@example.test`);

    const file = await getAdminPlayer(first, t0);
    expect(file?.player.emailNormalized).toBe(`jeandupont${tag}@gmail.com`);
    expect(file?.linked.map((row) => row.id)).toEqual([second]);
    // Elsewhere than Gmail, dots count
    expect((await getAdminPlayer(third, t0))?.linked).toEqual([]);
    expect((await getAdminPlayer(other, t0))?.linked).toEqual([]);

    const { rows } = await searchPlayers({ query: tag, filter: 'linked', page: 1 });
    expect(rows.map((row) => row.id).sort()).toEqual([first, second].sort());
    expect(rows.every((row) => row.linked === 1)).toBe(true);
    expect(await getAdminPlayer(randomUUID(), t0)).toBeNull();
  });

  it('counts its game, the players it dealt with, and what a ban would cancel', async () => {
    const [player, partner] = [await newPlayer(), await newPlayer()];
    await db.insert(userCards).values({ userId: player, collectionId: collection.id, cardId, quantity: 3, firstObtainedAt: t0 });
    await offer(player, partner, 'accepted');
    await sale(player, partner, { status: 'sold', price: 40 });
    await sale(partner, player, { status: 'sold', price: 25 });
    await offer(partner, player);
    await sale(player, null);

    const file = await getAdminPlayer(player, t0);
    expect(file?.collections).toEqual([{ id: collection.id, name: 'Test', distinct: 1, copies: 3, packsOpened: 0, coins: 0 }]);
    expect(file?.partners).toEqual([
      { id: partner, pseudo: await pseudoOf(partner), trades: 1, sold: { count: 1, coins: 40 }, bought: { count: 1, coins: 25 } },
    ]);
    expect(file?.open).toEqual({ trades: 1, auctions: 1 });
  });
});
