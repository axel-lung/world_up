import { and, eq, gte, isNull, lt, or, sql } from 'drizzle-orm';
import { type Database, db } from '@/db';
import { coinLedger, collections, packState, users } from '@/db/schema';
import { notify } from '@/lib/notifications/notifications';
import { addCoins, availableCoins, lockWallets } from './coins';
import { GameError } from './game-error';
import { refill } from './refill';
import { type GameRules, getGameRules, getStreakRewards } from './rules';
import {
  brokenStreak,
  NO_STREAK,
  needsReminder,
  parisDay,
  REMINDER_MIN_DAYS,
  type RepairPrice,
  repairCost,
  repairStreak,
  rewardFor,
  type StoredStreak,
  streakView,
  type StreakView,
} from './streak';

// The daily streak as stored in pack_state (the rules are in streak.ts): read
// for its screen, repaired with coins on the day it breaks, and the evening
// reminder of the worker's streak-reminder job. Every write holds the reserve's
// row lock, as the opening that moves the streak on does.

/** The streak's columns of pack_state, for a select. */
export const streakColumns = {
  streakDays: packState.streakDays,
  streakLastDay: packState.streakLastDay,
  streakGraceDay: packState.streakGraceDay,
  streakFrozenDays: packState.streakFrozenDays,
  streakLostDays: packState.streakLostDays,
  streakLostLastDay: packState.streakLostLastDay,
};

type StreakRow = {
  streakDays: number;
  streakLastDay: string | null;
  streakGraceDay: string | null;
  streakFrozenDays: string[];
  streakLostDays: number | null;
  streakLostLastDay: string | null;
};

export function streakOf(row: StreakRow): StoredStreak {
  return {
    days: row.streakDays,
    lastDay: row.streakLastDay,
    graceDay: row.streakGraceDay,
    frozen: row.streakFrozenDays,
    lost:
      row.streakLostDays !== null && row.streakLostLastDay !== null
        ? { days: row.streakLostDays, lastDay: row.streakLostLastDay }
        : null,
  };
}

/** The pack_state values of a streak, for an update. */
export function streakValues(streak: StoredStreak): StreakRow {
  return {
    streakDays: streak.days,
    streakLastDay: streak.lastDay,
    streakGraceDay: streak.graceDay,
    streakFrozenDays: streak.frozen,
    streakLostDays: streak.lost?.days ?? null,
    streakLostLastDay: streak.lost?.lastDay ?? null,
  };
}

export const repairPrice = (rules: Pick<GameRules, 'streakRepairCoinsPerDay' | 'streakRepairMaxCoins'>): RepairPrice => ({
  coinsPerDay: rules.streakRepairCoinsPerDay,
  maxCoins: rules.streakRepairMaxCoins,
});

/**
 * The player's daily streak as it stands, for its screen, with the repair
 * the player can still make today; after an opening, with what that opening
 * did to it.
 */
export async function getStreak(
  userId: string,
  collectionId: number,
  now: Date,
  opening?: { counted: boolean; before: number; bonusPacks: number },
): Promise<StreakView> {
  const [[row], rewards, rules, coins] = await Promise.all([
    db
      .select(streakColumns)
      .from(packState)
      .where(and(eq(packState.userId, userId), eq(packState.collectionId, collectionId))),
    getStreakRewards(db, collectionId),
    getGameRules(db, collectionId),
    availableCoins(db, userId),
  ]);
  return streakView(row ? streakOf(row) : NO_STREAK, parisDay(now), rewards, opening, {
    price: repairPrice(rules),
    coins,
  });
}

export interface StreakRepair {
  /** Coins the repair cost. */
  coins: number;
  /** The same request had repaired it already (a form sent twice). */
  repeated: boolean;
  /** A milestone the repaired streak reached: its bonus packs, added to the reserve. */
  bonusPacks: number;
}

/**
 * Repairs the streak that broke today, for coins: so many per day of the
 * broken streak, up to the ceiling (game_rules). One transaction holding the
 * reserve's row, then the wallet: the coins of a leading bid stay reserved.
 * Once a pack opened today, the streak it started joins the repaired one,
 * which can reach a milestone and its bonus packs.
 */
export async function repairPlayerStreak(
  database: Database,
  input: { userId: string; collectionId: number; now: Date },
): Promise<StreakRepair> {
  const { userId, collectionId, now } = input;
  const today = parisDay(now);
  const reference = `${collectionId}:${today}`;
  return database.transaction(async (tx) => {
    const rules = await getGameRules(tx, collectionId);
    const [row] = await tx
      .select({
        ...streakColumns,
        packs: packState.packs,
        lastRefill: packState.lastRefill,
        notifyWhenFull: packState.notifyWhenFull,
      })
      .from(packState)
      .where(and(eq(packState.userId, userId), eq(packState.collectionId, collectionId)))
      .for('update');
    const stored = row ? streakOf(row) : NO_STREAK;
    const broken = brokenStreak(stored, today);
    const repaired = repairStreak(stored, today);
    if (!row || !broken || !repaired) {
      // A form sent twice finds the first one's repair
      const [done] = await tx
        .select({ amount: coinLedger.amount })
        .from(coinLedger)
        .where(
          and(eq(coinLedger.userId, userId), eq(coinLedger.reason, 'streak_repair'), eq(coinLedger.reference, reference)),
        );
      if (done) return { coins: -done.amount, repeated: true, bonusPacks: 0 };
      throw new GameError('nothingToRepair');
    }

    const cost = repairCost(repairPrice(rules), broken.days);
    await lockWallets(tx, [userId]);
    if ((await availableCoins(tx, userId)) < cost) throw new GameError('notEnoughCoins');
    await addCoins(tx, {
      userId,
      collectionId,
      amount: -cost,
      reason: 'streak_repair',
      reference,
      details: { days: broken.days },
      now,
    });

    // Joined to the streak a pack started today, it is a day longer than it was
    const bonusPacks =
      repaired.days !== stored.days ? rewardFor(await getStreakRewards(tx, collectionId), repaired.days) : 0;
    const reserve = bonusPacks > 0 ? refill(row, rules, now) : null;
    await tx
      .update(packState)
      .set({
        ...streakValues(repaired),
        ...(reserve && {
          // Beyond the maximum if need be: the timer then waits, as for a full reserve
          packs: reserve.packs + bonusPacks,
          lastRefill: reserve.lastRefill,
          notifyWhenFull: row.notifyWhenFull && reserve.packs + bonusPacks < rules.maxReserve,
        }),
      })
      .where(and(eq(packState.userId, userId), eq(packState.collectionId, collectionId)));
    return { coins: cost, repeated: false, bonusPacks };
  });
}

/** Whether the player gets the evening reminder of a streak about to break. */
export async function streakReminderOn(userId: string, collectionId: number): Promise<boolean | null> {
  const [row] = await db
    .select({ on: packState.streakReminder })
    .from(packState)
    .where(and(eq(packState.userId, userId), eq(packState.collectionId, collectionId)));
  return row?.on ?? null;
}

export async function setStreakReminder(userId: string, collectionId: number, on: boolean): Promise<void> {
  await db
    .update(packState)
    .set({ streakReminder: on })
    .where(and(eq(packState.userId, userId), eq(packState.collectionId, collectionId)));
}

/**
 * The evening reminder (the worker's streak-reminder job, at 20:00 in Paris):
 * tells the players whose streak would break tomorrow unless they open a pack
 * today (needsReminder). Each row is looked at once a day, under the lock an
 * opening takes; a row an opening holds is looked at by the next batch. Banned
 * players and an inactive collection's are left out.
 */
export async function remindStreaks(database: Database, now: Date, limit = 500): Promise<number> {
  const today = parisDay(now);
  // A streak still alive today was played within the last days
  const since = sql`${today}::date - 7`;
  let reminded = 0;
  for (;;) {
    const { looked, told } = await database.transaction(async (tx) => {
      const rows = await tx
        .select({ userId: packState.userId, collectionId: packState.collectionId, ...streakColumns })
        .from(packState)
        .innerJoin(collections, and(eq(collections.id, packState.collectionId), eq(collections.active, true)))
        .innerJoin(users, and(eq(users.id, packState.userId), isNull(users.bannedAt)))
        .where(
          and(
            eq(packState.streakReminder, true),
            gte(packState.streakDays, REMINDER_MIN_DAYS),
            lt(packState.streakLastDay, today),
            gte(packState.streakLastDay, since),
            or(isNull(packState.streakRemindedOn), lt(packState.streakRemindedOn, today)),
          ),
        )
        .limit(limit)
        .for('update', { of: packState, skipLocked: true });
      let count = 0;
      for (const row of rows) {
        await tx
          .update(packState)
          .set({ streakRemindedOn: today })
          .where(and(eq(packState.userId, row.userId), eq(packState.collectionId, row.collectionId)));
        if (!needsReminder(streakOf(row), today)) continue;
        await notify(tx, {
          userId: row.userId,
          kind: 'streak_reminder',
          collectionId: row.collectionId,
          data: { days: row.streakDays },
          now,
        });
        count++;
      }
      return { looked: rows.length, told: count };
    });
    reminded += told;
    if (looked < limit) return reminded;
  }
}
