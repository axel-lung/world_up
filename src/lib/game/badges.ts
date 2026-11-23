import { and, asc, eq, inArray } from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/db';
import { achievements, featuredBadges, userAchievements } from '@/db/schema';
import { RARITIES, type Rarity } from '@/lib/rarity';
import type { Achievement } from './achievements';
import { isVisitKind } from './visit';

// Badges (decided on 2026-11-22): each achievement a player has is a badge,
// shown on their profile and to their friends; they pick one to show beside
// their pseudo (the leaderboard, the friends lists, a friend's collection).
// A badge's color is its tier: its rank among the achievements of its kind,
// laid on the rarity ladder so that each kind's last one is legendary; an
// achievement for a rarity takes that rarity's color.

export type BadgeAchievement = Pick<Achievement, 'id' | 'kind' | 'threshold' | 'rarity'>;

export interface Badge extends BadgeAchievement {
  /** The rarity whose color the badge takes. */
  tier: Rarity;
}

// Common first
const LADDER = [...RARITIES].reverse();

/** Each achievement's tier, by its rank among those of its kind (thresholds ascending). */
export function badgeTiers(list: BadgeAchievement[]): Map<number, Rarity> {
  const tiers = new Map<number, Rarity>();
  const kinds = new Map<Achievement['kind'], BadgeAchievement[]>();
  for (const achievement of list) {
    if (achievement.kind === 'rarity_owned' && achievement.rarity) {
      tiers.set(achievement.id, achievement.rarity);
      continue;
    }
    kinds.set(achievement.kind, [...(kinds.get(achievement.kind) ?? []), achievement]);
  }
  for (const ofKind of kinds.values()) {
    const sorted = [...ofKind].sort((a, b) => a.threshold - b.threshold || a.id - b.id);
    const steps = LADDER.length;
    sorted.forEach((achievement, rank) => {
      // Few tiers end the ladder (ultra, legendary); more spread over the whole of it
      const index =
        sorted.length <= steps
          ? steps - sorted.length + rank
          : Math.round((rank * (steps - 1)) / (sorted.length - 1));
      tiers.set(achievement.id, LADDER[index]);
    });
  }
  return tiers;
}

/** The collection's achievements with their tiers, read once per request. */
const collectionBadges = cache(async (collectionId: number): Promise<Map<number, Badge>> => {
  const list = await db
    .select({ id: achievements.id, kind: achievements.kind, threshold: achievements.threshold, rarity: achievements.rarity })
    .from(achievements)
    .where(eq(achievements.collectionId, collectionId))
    .orderBy(asc(achievements.position));
  const tiers = badgeTiers(list);
  return new Map(list.map((achievement) => [achievement.id, { ...achievement, tier: tiers.get(achievement.id) ?? 'common' }]));
});

/** The badge each of these players shows beside their pseudo, if any. */
export async function featuredBadgesOf(collectionId: number, userIds: string[]): Promise<Map<string, Badge>> {
  if (userIds.length === 0) return new Map();
  const [rows, badges] = await Promise.all([
    db
      .select({ userId: featuredBadges.userId, achievementId: featuredBadges.achievementId })
      .from(featuredBadges)
      .where(and(eq(featuredBadges.collectionId, collectionId), inArray(featuredBadges.userId, [...new Set(userIds)]))),
    collectionBadges(collectionId),
  ]);
  const featured = new Map<string, Badge>();
  for (const row of rows) {
    const badge = badges.get(row.achievementId);
    if (badge) featured.set(row.userId, badge);
  }
  return featured;
}

export interface PlayerBadge extends Badge {
  obtainedAt: Date | null;
  featured: boolean;
}

/** Every badge of the collection, in the achievements' order, with the player's and the one they show. */
export async function playerBadges(userId: string, collectionId: number): Promise<PlayerBadge[]> {
  const [owned, featured, badges] = await Promise.all([
    db
      .select({ achievementId: userAchievements.achievementId, obtainedAt: userAchievements.obtainedAt })
      .from(userAchievements)
      .innerJoin(achievements, eq(achievements.id, userAchievements.achievementId))
      .where(and(eq(userAchievements.userId, userId), eq(achievements.collectionId, collectionId))),
    featuredBadgesOf(collectionId, [userId]),
    collectionBadges(collectionId),
  ]);
  const obtained = new Map(owned.map((row) => [row.achievementId, row.obtainedAt]));
  const shown = featured.get(userId)?.id ?? null;
  return [...badges.values()].map((badge) => ({
    ...badge,
    obtainedAt: obtained.get(badge.id) ?? null,
    featured: badge.id === shown,
  }));
}

/**
 * The badge the player shows beside their pseudo: one of their achievements,
 * or none (null). False when they don't have that achievement, or it is one of
 * the visits, which stay private.
 */
export async function setFeaturedBadge(userId: string, collectionId: number, achievementId: number | null): Promise<boolean> {
  if (achievementId === null) {
    await db.delete(featuredBadges).where(and(eq(featuredBadges.userId, userId), eq(featuredBadges.collectionId, collectionId)));
    return true;
  }
  const [owned] = await db
    .select({ id: userAchievements.achievementId, kind: achievements.kind })
    .from(userAchievements)
    .innerJoin(achievements, eq(achievements.id, userAchievements.achievementId))
    .where(
      and(
        eq(userAchievements.userId, userId),
        eq(userAchievements.achievementId, achievementId),
        eq(achievements.collectionId, collectionId),
      ),
    );
  if (!owned || isVisitKind(owned.kind)) return false;
  await db
    .insert(featuredBadges)
    .values({ userId, collectionId, achievementId })
    .onConflictDoUpdate({ target: [featuredBadges.userId, featuredBadges.collectionId], set: { achievementId } });
  return true;
}
