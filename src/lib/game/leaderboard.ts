import { sql } from 'drizzle-orm';
import { db } from '@/db';

// The leaderboard of a collection: distinct visible cards owned; ties go to
// the rarer cards (legendary first, then ultra, and so on), and players with
// the same counts share a rank, listed by who got there first.

export const LEADERBOARD_SIZE = 100;

export interface LeaderboardRow {
  rank: number;
  userId: string;
  pseudo: string;
  distinct: number;
  legendary: number;
  ultra: number;
  super: number;
}

function ranked(collectionId: number) {
  return sql`
    WITH scores AS (
      SELECT uc.user_id,
        count(*)::int AS distinct_cards,
        count(*) FILTER (WHERE c.rarity = 'legendary')::int AS legendary,
        count(*) FILTER (WHERE c.rarity = 'ultra')::int AS ultra,
        count(*) FILTER (WHERE c.rarity = 'super')::int AS super,
        count(*) FILTER (WHERE c.rarity = 'rare')::int AS rare,
        count(*) FILTER (WHERE c.rarity = 'uncommon')::int AS uncommon,
        max(uc.first_obtained_at) AS reached_at
      FROM user_cards AS uc
      JOIN cards AS c ON c.id = uc.card_id AND c.hidden_reason IS NULL
      WHERE uc.collection_id = ${collectionId}
      GROUP BY uc.user_id
    ), ranked AS (
      SELECT s.*, u.name AS pseudo,
        rank() OVER (ORDER BY distinct_cards DESC, legendary DESC, ultra DESC, super DESC, rare DESC, uncommon DESC)::int AS rank
      FROM scores AS s
      JOIN users AS u ON u.id = s.user_id
    )`;
}

type Row = {
  rank: number;
  user_id: string;
  pseudo: string;
  distinct_cards: number;
  legendary: number;
  ultra: number;
  super: number;
};

const toRow = (row: Row): LeaderboardRow => ({
  rank: row.rank,
  userId: row.user_id,
  pseudo: row.pseudo,
  distinct: row.distinct_cards,
  legendary: row.legendary,
  ultra: row.ultra,
  super: row.super,
});

/** The top of the leaderboard, and the given player's row when it is further down. */
export async function leaderboard(collectionId: number, userId?: string) {
  const top = await db.execute<Row>(sql`${ranked(collectionId)}
    SELECT rank, user_id, pseudo, distinct_cards, legendary, ultra, super FROM ranked
    ORDER BY rank, reached_at, user_id
    LIMIT ${LEADERBOARD_SIZE}`);
  const rows = top.rows.map(toRow);
  let player: LeaderboardRow | null = rows.find((row) => row.userId === userId) ?? null;
  if (userId && !player) {
    const mine = await db.execute<Row>(sql`${ranked(collectionId)}
      SELECT rank, user_id, pseudo, distinct_cards, legendary, ultra, super FROM ranked WHERE user_id = ${userId}`);
    player = mine.rows[0] ? toRow(mine.rows[0]) : null;
  }
  return { rows, player };
}
