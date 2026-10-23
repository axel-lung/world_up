import { and, asc, count, desc, eq, ilike, isNotNull, ne, or, type SQL, sql } from 'drizzle-orm';
import { type Database, db, type Transaction } from '@/db';
import { auditLog, sessions, users } from '@/db/schema';
import { isAdminEmail } from '@/lib/admin';
import { cancelAuctionsOf } from '@/lib/game/auctions';
import { openTrade } from '@/lib/game/holds';
import { cancelTradesOf } from '@/lib/game/trades';

// The back-office's players: search, an account's file, and banning (spec,
// "Anti-abus"). A banned player keeps their cards and coins but can't sign in
// (src/lib/auth.ts), and other players no longer see them: leaderboard, friends,
// search by pseudo. Multi-account detection uses the normalised e-mail only
// (users.email_normalized): no device fingerprinting.

export const PLAYERS_PAGE_SIZE = 50;

export const PLAYER_FILTERS = ['all', 'banned', 'linked', 'unverified'] as const;
export type PlayerFilter = (typeof PLAYER_FILTERS)[number];

export class PlayerError extends Error {
  constructor(readonly code: 'notFound' | 'adminAccount' | 'alreadyBanned' | 'notBanned') {
    super(code);
  }
}

// Written out rather than interpolated: in a select from users alone, Drizzle
// leaves its columns unqualified, and they would name the subquery's own row.
const LINKED_COUNT = sql<number>`(
  SELECT count(*)::int FROM users AS other
  WHERE other.email_normalized = users.email_normalized AND other.id <> users.id
)`;

export async function searchPlayers({ query, filter, page }: { query: string; filter: PlayerFilter; page: number }) {
  const conditions: (SQL | undefined)[] = [
    filter === 'banned' ? isNotNull(users.bannedAt) : undefined,
    filter === 'linked' ? sql`${LINKED_COUNT} > 0` : undefined,
    filter === 'unverified' ? eq(users.emailVerified, false) : undefined,
  ];
  const text = query.trim();
  if (text) {
    const like = `%${text.replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push(or(ilike(users.name, like), ilike(users.email, like)));
  }
  const where = and(...conditions);
  const [{ total }] = await db.select({ total: count() }).from(users).where(where);
  const rows = await db
    .select({
      id: users.id,
      pseudo: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      lastActiveAt: users.lastActiveAt,
      bannedAt: users.bannedAt,
      linked: LINKED_COUNT,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(PLAYERS_PAGE_SIZE)
    .offset((page - 1) * PLAYERS_PAGE_SIZE);
  return { total, rows };
}

type CollectionRow = { id: number; name: string; distinct_cards: number; copies: number; packs_opened: number; coins: number };
type PartnerRow = { id: string; pseudo: string; trades: number; sold: number; sold_coins: number; bought: number; bought_coins: number };

/**
 * An account's file: its details, its game in each collection it entered, the
 * other accounts on the same mailbox, the players it traded or dealt with most,
 * and what a ban would cancel.
 */
export async function getAdminPlayer(id: string, now: Date) {
  const [player] = await db
    .select({
      id: users.id,
      pseudo: users.name,
      email: users.email,
      emailNormalized: users.emailNormalized,
      emailVerified: users.emailVerified,
      birthDate: users.birthDate,
      createdAt: users.createdAt,
      lastActiveAt: users.lastActiveAt,
      bannedAt: users.bannedAt,
    })
    .from(users)
    .where(eq(users.id, id));
  if (!player) return null;

  const [linked, collections, partners, open] = await Promise.all([
    db
      .select({ id: users.id, pseudo: users.name, email: users.email, createdAt: users.createdAt, bannedAt: users.bannedAt })
      .from(users)
      .where(and(eq(users.emailNormalized, player.emailNormalized), ne(users.id, id)))
      .orderBy(asc(users.createdAt)),
    db.execute<CollectionRow>(sql`
      SELECT c.id, c.name,
        (SELECT count(*)::int FROM user_cards AS uc WHERE uc.user_id = ${id} AND uc.collection_id = c.id) AS distinct_cards,
        (SELECT coalesce(sum(uc.quantity), 0)::int FROM user_cards AS uc WHERE uc.user_id = ${id} AND uc.collection_id = c.id) AS copies,
        (SELECT count(*)::int FROM pack_openings AS po WHERE po.user_id = ${id} AND po.collection_id = c.id) AS packs_opened,
        (SELECT coalesce(sum(cl.amount), 0)::int FROM coin_ledger AS cl WHERE cl.user_id = ${id} AND cl.collection_id = c.id) AS coins
      FROM collections AS c
      WHERE EXISTS (SELECT 1 FROM pack_state AS ps WHERE ps.user_id = ${id} AND ps.collection_id = c.id)
        OR EXISTS (SELECT 1 FROM user_cards AS uc WHERE uc.user_id = ${id} AND uc.collection_id = c.id)
      ORDER BY c.id`),
    // Accepted trades, and auctions sold to or bought from each other player
    db.execute<PartnerRow>(sql`
      WITH deals AS (
        SELECT CASE WHEN t.proposer_id = ${id} THEN t.recipient_id ELSE t.proposer_id END AS other, 'trade' AS kind, 0 AS coins
        FROM trades AS t
        WHERE t.status = 'accepted' AND (t.proposer_id = ${id} OR t.recipient_id = ${id})
        UNION ALL
        SELECT CASE WHEN a.seller_id = ${id} THEN a.leader_id ELSE a.seller_id END,
          CASE WHEN a.seller_id = ${id} THEN 'sold' ELSE 'bought' END, a.current_price
        FROM auctions AS a
        WHERE a.status = 'sold' AND (a.seller_id = ${id} OR a.leader_id = ${id})
      )
      SELECT u.id, u.name AS pseudo,
        count(*) FILTER (WHERE d.kind = 'trade')::int AS trades,
        count(*) FILTER (WHERE d.kind = 'sold')::int AS sold,
        coalesce(sum(d.coins) FILTER (WHERE d.kind = 'sold'), 0)::int AS sold_coins,
        count(*) FILTER (WHERE d.kind = 'bought')::int AS bought,
        coalesce(sum(d.coins) FILTER (WHERE d.kind = 'bought'), 0)::int AS bought_coins
      FROM deals AS d
      JOIN users AS u ON u.id = d.other
      GROUP BY u.id, u.name
      ORDER BY count(*) DESC, sum(d.coins) DESC, u.name
      LIMIT 20`),
    // What a ban would cancel (cancelTradesOf, cancelAuctionsOf)
    db.execute<{ trades: number; auctions: number }>(sql`
      SELECT
        (SELECT count(*)::int FROM trades AS t WHERE ${openTrade(now)} AND (t.proposer_id = ${id} OR t.recipient_id = ${id})) AS trades,
        (SELECT count(*)::int FROM auctions AS a WHERE a.status = 'active' AND (a.seller_id = ${id} OR a.leader_id = ${id})) AS auctions`),
  ]);

  return {
    player: { ...player, isAdmin: isAdminEmail(player.email) },
    linked,
    collections: collections.rows.map((row) => ({
      id: row.id,
      name: row.name,
      distinct: row.distinct_cards,
      copies: row.copies,
      packsOpened: row.packs_opened,
      coins: row.coins,
    })),
    partners: partners.rows.map((row) => ({
      id: row.id,
      pseudo: row.pseudo,
      trades: row.trades,
      sold: { count: row.sold, coins: row.sold_coins },
      bought: { count: row.bought, coins: row.bought_coins },
    })),
    open: open.rows[0],
  };
}

/** The account, locked for the rest of the transaction. */
async function lockPlayer(tx: Transaction, userId: string) {
  const [player] = await tx
    .select({ email: users.email, bannedAt: users.bannedAt })
    .from(users)
    .where(eq(users.id, userId))
    .for('update');
  if (!player) throw new PlayerError('notFound');
  return player;
}

/**
 * Bans a player: signs them out everywhere, cancels their open trades and the
 * auctions they sell or lead, and logs it with the reason, which the caller
 * e-mails them (the terms promise it). Returns their address and what was
 * cancelled. The back-office account can't be banned.
 */
export async function banPlayer(
  database: Database,
  input: { adminId: string; userId: string; reason: string; now: Date },
): Promise<{ email: string; trades: number; auctions: number }> {
  const { adminId, userId, reason, now } = input;
  return database.transaction(async (tx) => {
    const player = await lockPlayer(tx, userId);
    if (isAdminEmail(player.email)) throw new PlayerError('adminAccount');
    if (player.bannedAt) throw new PlayerError('alreadyBanned');
    await tx.update(users).set({ bannedAt: now }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    const cancelled = { trades: await cancelTradesOf(tx, userId, now), auctions: await cancelAuctionsOf(tx, userId, now) };
    await tx.insert(auditLog).values({
      adminId,
      action: 'user.ban',
      targetType: 'user',
      targetId: userId,
      details: { note: reason, ...cancelled },
    });
    return { email: player.email, ...cancelled };
  });
}

/** Lifts a ban: the player can sign in again. What the ban cancelled stays cancelled. */
export async function unbanPlayer(
  database: Database,
  input: { adminId: string; userId: string; note: string | null },
): Promise<{ email: string }> {
  const { adminId, userId, note } = input;
  return database.transaction(async (tx) => {
    const player = await lockPlayer(tx, userId);
    if (!player.bannedAt) throw new PlayerError('notBanned');
    await tx.update(users).set({ bannedAt: null }).where(eq(users.id, userId));
    await tx.insert(auditLog).values({
      adminId,
      action: 'user.unban',
      targetType: 'user',
      targetId: userId,
      details: { bannedAt: player.bannedAt.toISOString(), ...(note ? { note } : {}) },
    });
    return { email: player.email };
  });
}
