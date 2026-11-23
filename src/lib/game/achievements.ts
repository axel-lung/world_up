import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { type Database, db, type Transaction } from '@/db';
import { achievements, cards, packOpenings, userAchievements, userCards } from '@/db/schema';
import { RARITIES, type Rarity } from '@/lib/rarity';
import { addCoins } from './coins';

// Achievements: each is a threshold on one of the player's counts, rewarded
// with coins once. They are checked after each pack opening, trade, auction
// won and on-site visit.

type Executor = Database | Transaction;

export type Achievement = typeof achievements.$inferSelect;

export interface PlayerCounts {
  /** Distinct visible cards owned. */
  distinct: number;
  packs: number;
  completedSeries: number;
  byRarity: Record<Rarity, number>;
  visits: VisitCounts;
}

export interface VisitCounts {
  monuments: number;
  departments: number;
  /** The most monuments visited in one day, in Paris. */
  bestDay: number;
  rarities: number;
  /** Monuments overseas (a three-character department code). */
  overseas: number;
}

/** What the visit achievements count, and the profile shows. */
export async function visitCounts(executor: Executor, userId: string, collectionId: number): Promise<VisitCounts> {
  const result = await executor.execute<{
    monuments: number;
    departments: number;
    best_day: number;
    rarities: number;
    overseas: number;
  }>(sql`
    SELECT count(*)::int AS monuments,
      count(DISTINCT c.department_code)::int AS departments,
      count(DISTINCT c.rarity)::int AS rarities,
      (count(*) FILTER (WHERE char_length(c.department_code) = 3))::int AS overseas,
      coalesce((
        SELECT max(n) FROM (
          SELECT count(*) AS n FROM card_visits AS d
          WHERE d.user_id = ${userId} AND d.collection_id = ${collectionId}
          GROUP BY (d.visited_at AT TIME ZONE 'Europe/Paris')::date
        ) AS days
      ), 0)::int AS best_day
    FROM card_visits AS v
    JOIN cards AS c ON c.id = v.card_id
    WHERE v.user_id = ${userId} AND v.collection_id = ${collectionId}`);
  const row = result.rows[0];
  return {
    monuments: row.monuments,
    departments: row.departments,
    bestDay: row.best_day,
    rarities: row.rarities,
    overseas: row.overseas,
  };
}

export async function playerCounts(executor: Executor, userId: string, collectionId: number): Promise<PlayerCounts> {
  const owned = await executor
    .select({ rarity: cards.rarity, count: count() })
    .from(userCards)
    .innerJoin(cards, eq(cards.id, userCards.cardId))
    .where(and(eq(userCards.userId, userId), eq(userCards.collectionId, collectionId), isNull(cards.hiddenReason)))
    .groupBy(cards.rarity);
  const byRarity = Object.fromEntries(RARITIES.map((rarity) => [rarity, 0])) as Record<Rarity, number>;
  for (const row of owned) byRarity[row.rarity] = row.count;

  const [{ packs }] = await executor
    .select({ packs: count() })
    .from(packOpenings)
    .where(and(eq(packOpenings.userId, userId), eq(packOpenings.collectionId, collectionId)));
  // A series is complete when the player owns each of its visible (numbered) cards
  const completed = await executor.execute<{ completed: number }>(sql`
    SELECT count(*)::int AS completed FROM series AS s
    WHERE s.collection_id = ${collectionId} AND s.card_count > 0 AND s.card_count = (
      SELECT count(*) FROM card_series AS cs
      JOIN user_cards AS uc ON uc.card_id = cs.card_id AND uc.user_id = ${userId}
      WHERE cs.series_id = s.id AND cs.number IS NOT NULL
    )`);

  return {
    distinct: owned.reduce((sum, row) => sum + row.count, 0),
    packs,
    completedSeries: completed.rows[0].completed,
    byRarity,
    visits: await visitCounts(executor, userId, collectionId),
  };
}

/** The player's count a visit achievement is measured on; 0 for another kind. */
export function visitProgress(kind: Achievement['kind'], visits: VisitCounts): number {
  switch (kind) {
    case 'monuments_visited':
      return visits.monuments;
    case 'departments_visited':
      return visits.departments;
    case 'visits_in_a_day':
      return visits.bestDay;
    case 'rarities_visited':
      return visits.rarities;
    case 'overseas_visited':
      return visits.overseas;
    default:
      return 0;
  }
}

/** The player's count an achievement is measured on. */
export function achievementProgress(achievement: Pick<Achievement, 'kind' | 'rarity'>, counts: PlayerCounts): number {
  switch (achievement.kind) {
    case 'distinct_cards':
      return counts.distinct;
    case 'packs_opened':
      return counts.packs;
    case 'rarity_owned':
      return achievement.rarity ? counts.byRarity[achievement.rarity] : 0;
    case 'series_completed':
      return counts.completedSeries;
    case 'monuments_visited':
    case 'departments_visited':
    case 'visits_in_a_day':
    case 'rarities_visited':
    case 'overseas_visited':
      return visitProgress(achievement.kind, counts.visits);
  }
}

export type AwardedAchievement = Pick<Achievement, 'code' | 'kind' | 'threshold' | 'rarity' | 'rewardCoins'>;

/** Grants every achievement the player has just reached, with its coins. */
export async function awardAchievements(
  tx: Transaction,
  userId: string,
  collectionId: number,
  now: Date,
): Promise<AwardedAchievement[]> {
  const pending = await tx
    .select({
      id: achievements.id,
      code: achievements.code,
      kind: achievements.kind,
      threshold: achievements.threshold,
      rarity: achievements.rarity,
      rewardCoins: achievements.rewardCoins,
    })
    .from(achievements)
    .leftJoin(
      userAchievements,
      and(eq(userAchievements.achievementId, achievements.id), eq(userAchievements.userId, userId)),
    )
    .where(and(eq(achievements.collectionId, collectionId), isNull(userAchievements.userId)))
    .orderBy(asc(achievements.position));
  if (pending.length === 0) return [];

  const counts = await playerCounts(tx, userId, collectionId);
  const awarded: AwardedAchievement[] = [];
  for (const { id, ...achievement } of pending) {
    if (achievementProgress(achievement, counts) < achievement.threshold) continue;
    const inserted = await tx
      .insert(userAchievements)
      .values({ userId, achievementId: id, obtainedAt: now })
      .onConflictDoNothing()
      .returning({ id: userAchievements.achievementId });
    if (inserted.length === 0) continue;
    await addCoins(tx, {
      userId,
      collectionId,
      amount: achievement.rewardCoins,
      reason: 'achievement',
      reference: String(id),
      details: { code: achievement.code },
      now,
    });
    awarded.push(achievement);
  }
  return awarded;
}

/** Every achievement of the collection, with the player's progress and when it was reached. */
export async function listAchievements(userId: string, collectionId: number) {
  const rows = await db
    .select({
      id: achievements.id,
      code: achievements.code,
      kind: achievements.kind,
      threshold: achievements.threshold,
      rarity: achievements.rarity,
      rewardCoins: achievements.rewardCoins,
      obtainedAt: userAchievements.obtainedAt,
    })
    .from(achievements)
    .leftJoin(
      userAchievements,
      and(eq(userAchievements.achievementId, achievements.id), eq(userAchievements.userId, userId)),
    )
    .where(eq(achievements.collectionId, collectionId))
    .orderBy(asc(achievements.position));
  const counts = await playerCounts(db, userId, collectionId);
  return rows.map((row) => ({ ...row, progress: Math.min(row.threshold, achievementProgress(row, counts)) }));
}
