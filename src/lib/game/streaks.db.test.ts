import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { achievements, announcements, cards, notifications, packCards, packOpenings, packState } from '@/db/schema';
import { AnnouncementError, currentAnnouncement, endAnnouncement, publishAnnouncement } from '@/lib/announcements';
import { testCard } from '@/lib/catalog/testing';
import { featuredBadgesOf, playerBadges, setFeaturedBadge } from './badges';
import { coinBalance } from './coins';
import { GameError } from './game-error';
import { openingHistory } from './history';
import { getReserve, openPack } from './packs';
import { getStreak, remindStreaks, repairPlayerStreak, setStreakReminder } from './streaks';
import { createTestCollection, createTestPlayer, deleteTestData, type TestCollection } from './testing';

// The daily streak's repair and evening reminder, the openings' history, the
// badges and the announcements, against the database.

const CARDS = [testCard(1), testCard(2), testCard(3), testCard(7, { rarity: 'rare' })];
const ODDS = { legendary: 0, ultra: 0, super: 0, rare: 500_000, uncommon: 0, common: 500_000 };

// Tuesday 20 October 2026, 14:00 in Paris (summer time): days(n) is n days later, same time
const t0 = new Date('2026-10-20T12:00:00Z');
const days = (n: number) => new Date(t0.getTime() + n * 24 * 3_600_000);
// 20:00 in Paris, n days after t0
const evening = (n: number) => new Date(days(n).getTime() + 6 * 3_600_000);

let repairable: TestCollection;
let pricey: TestCollection;
const players: string[] = [];
const announcementIds: number[] = [];

beforeAll(async () => {
  // 10 coins an opening; a third day in a row is worth two bonus packs
  repairable = await createTestCollection(CARDS, { odds: ODDS, rules: { coinsPerOpening: 10 }, streak: [{ days: 3, packs: 2 }] });
  pricey = await createTestCollection(CARDS, { odds: ODDS, rules: { coinsPerOpening: 10, streakRepairCoinsPerDay: 100 } });
});

afterAll(async () => {
  if (announcementIds.length > 0) await db.delete(announcements).where(inArray(announcements.id, announcementIds));
  await deleteTestData([repairable.id, pricey.id], players);
});

async function newPlayer() {
  const id = await createTestPlayer();
  players.push(id);
  return id;
}

const open = (userId: string, now: Date, collection = repairable) =>
  openPack(db, { userId, collectionId: collection.id, idempotencyKey: randomUUID(), now });

const repair = (userId: string, now: Date, collection = repairable) =>
  repairPlayerStreak(db, { userId, collectionId: collection.id, now });

const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error) => (error instanceof GameError || error instanceof AnnouncementError ? error.code : error),
  );

describe('the streak repair', () => {
  it('brings back a streak on the day it broke, before its first pack, for coins', async () => {
    const player = await newPlayer();
    // Tuesday and Wednesday: 2 days, 20 coins and 5 for the first pack's achievement
    await open(player, days(0));
    await open(player, days(1));
    // Thursday forgiven, Friday missed too: broken on Saturday
    expect((await getStreak(player, repairable.id, days(3))).repair).toBeNull();
    const saturday = await getStreak(player, repairable.id, days(4));
    expect(saturday).toMatchObject({ days: 0, repair: { days: 2, coins: 20, affordable: true } });

    expect(await repair(player, days(4))).toEqual({ coins: 20, repeated: false, bonusPacks: 0 });
    expect(await coinBalance(db, player)).toBe(5);
    const repaired = await getStreak(player, repairable.id, days(4));
    expect(repaired).toMatchObject({ days: 2, playedToday: false, repair: null });
    expect(repaired.week.map((day) => day.mark)).toEqual(['open', 'played', 'played', 'graced', 'frozen', 'open', 'open']);
    // Sent twice: repaired once
    expect(await repair(player, days(4.1))).toEqual({ coins: 20, repeated: true, bonusPacks: 0 });
    expect(await coinBalance(db, player)).toBe(5);

    // Saturday's pack carries it on to a milestone
    expect((await open(player, days(4))).streak).toEqual({ counted: true, before: 2, bonusPacks: 2 });
  });

  it("joins the streak a pack started today to the broken one, with a milestone's bonus packs", async () => {
    const player = await newPlayer();
    await open(player, days(0));
    await open(player, days(1));
    expect((await open(player, days(4))).streak).toEqual({ counted: true, before: 0, bonusPacks: 0 });
    expect(await getStreak(player, repairable.id, days(4))).toMatchObject({ days: 1, repair: { days: 2, coins: 20 } });

    const before = (await getReserve(player, repairable.id, days(4))).packs;
    expect(await repair(player, days(4))).toEqual({ coins: 20, repeated: false, bonusPacks: 2 });
    expect((await getReserve(player, repairable.id, days(4))).packs).toBe(before + 2);
    const repaired = await getStreak(player, repairable.id, days(4));
    expect(repaired).toMatchObject({ days: 3, playedToday: true, repair: null });
    expect(repaired.week.map((day) => day.mark)).toEqual(['open', 'played', 'played', 'graced', 'frozen', 'played', 'open']);
    // Sunday carries the repaired streak on
    expect((await open(player, days(5))).streak).toMatchObject({ counted: true, before: 3 });
  });

  it('needs the coins, and the day the streak broke', async () => {
    const player = await newPlayer();
    await open(player, days(0), pricey);
    await open(player, days(1), pricey);
    expect((await getStreak(player, pricey.id, days(4))).repair).toEqual({ days: 2, coins: 200, affordable: false });
    expect(await rejection(repair(player, days(4), pricey))).toBe('notEnoughCoins');
    expect(await coinBalance(db, player)).toBe(25);
    // Sunday is too late
    expect(await rejection(repair(player, days(5), pricey))).toBe('nothingToRepair');
    // A streak still going has nothing to repair
    const going = await newPlayer();
    await open(going, days(0));
    expect(await rejection(repair(going, days(1)))).toBe('nothingToRepair');
  });
});

describe('the evening reminder', () => {
  const reminders = (userId: string) =>
    db
      .select({ data: notifications.data })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.kind, 'streak_reminder')));

  it('tells the players whose streak breaks at midnight, once a day', async () => {
    const [lapsing, played, quiet, short] = [await newPlayer(), await newPlayer(), await newPlayer(), await newPlayer()];
    for (const player of [lapsing, played, quiet]) {
      await open(player, days(0));
      await open(player, days(1));
    }
    await open(short, days(1));
    await open(played, days(3));
    await setStreakReminder(quiet, repairable.id, false);

    // Thursday evening: missing Thursday would be forgiven
    await remindStreaks(db, evening(2));
    expect(await reminders(lapsing)).toEqual([]);
    // Friday evening: Thursday forgiven, missing Friday breaks it
    await remindStreaks(db, evening(3));
    await remindStreaks(db, evening(3));
    expect(await reminders(lapsing)).toEqual([{ data: { days: 2 } }]);
    // Played today, turned off, or a single day
    expect(await reminders(played)).toEqual([]);
    expect(await reminders(quiet)).toEqual([]);
    expect(await reminders(short)).toEqual([]);
    const [row] = await db
      .select({ remindedOn: packState.streakRemindedOn })
      .from(packState)
      .where(and(eq(packState.userId, lapsing), eq(packState.collectionId, repairable.id)));
    expect(row.remindedOn).toBe('2026-10-23');
  });
});

describe('the openings history', () => {
  it('lists the openings newest first, with their cards, a hidden one without its page', async () => {
    const player = await newPlayer();
    for (const n of [0, 1, 2]) await open(player, days(n));
    const { openings, total } = await openingHistory(player, repairable.id, 1);
    expect(total).toBe(3);
    expect(openings.map((opening) => opening.openedAt)).toEqual([days(2), days(1), days(0)]);
    expect(openings[0].cards.map((card) => card.position)).toEqual([1, 2, 3, 4, 5]);
    expect(openings.at(-1)!.cards[0].isNew).toBe(true);

    // A card hidden since keeps its name and rarity, without its page or photo
    const [first] = await db
      .select({ cardId: packCards.cardId })
      .from(packCards)
      .innerJoin(packOpenings, eq(packOpenings.id, packCards.openingId))
      .where(and(eq(packOpenings.userId, player), eq(packCards.position, 1)))
      .limit(1);
    await db.update(cards).set({ hiddenReason: 'admin' }).where(eq(cards.id, first.cardId));
    const hidden = (await openingHistory(player, repairable.id, 1)).openings
      .flatMap((opening) => opening.cards)
      .filter((card) => card.slug === null);
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.every((card) => card.photoImage === null && card.name.length > 0)).toBe(true);
    await db.update(cards).set({ hiddenReason: null }).where(eq(cards.id, first.cardId));
  });
});

describe('the badges', () => {
  it("shows the player's achievements as badges, one of them beside the pseudo", async () => {
    const player = await newPlayer();
    await open(player, days(0));
    const badges = await playerBadges(player, repairable.id);
    expect(badges.map((badge) => [badge.threshold, badge.tier, Boolean(badge.obtainedAt), badge.featured])).toEqual([
      [1, 'ultra', true, false],
      [3, 'legendary', false, false],
    ]);
    const [first, third] = badges;
    // Only one the player has
    expect(await setFeaturedBadge(player, repairable.id, third.id)).toBe(false);
    expect(await setFeaturedBadge(player, repairable.id, first.id)).toBe(true);
    expect((await featuredBadgesOf(repairable.id, [player])).get(player)).toMatchObject({ id: first.id, tier: 'ultra' });
    expect((await playerBadges(player, repairable.id))[0].featured).toBe(true);
    expect(await setFeaturedBadge(player, repairable.id, null)).toBe(true);
    expect((await featuredBadgesOf(repairable.id, [player])).size).toBe(0);
  });

  it('colours the badges again when the achievements change', async () => {
    const player = await newPlayer();
    await open(player, days(0));
    const [first] = await playerBadges(player, repairable.id);
    await setFeaturedBadge(player, repairable.id, first.id);
    // A third achievement, reached by nobody: the first one stays
    await db
      .insert(achievements)
      .values({ collectionId: repairable.id, code: 'packs-5', kind: 'packs_opened', threshold: 5, rewardCoins: 1, position: 3 });
    expect((await featuredBadgesOf(repairable.id, [player])).get(player)?.tier).toBe('super');
  });
});

describe('the announcements', () => {
  it('shows the latest one started, until withdrawn, logged', async () => {
    const admin = await newPlayer();
    const now = new Date();
    const base = { linkLabel: null, tone: 'info' as const, endsAt: null };
    expect(
      await rejection(
        publishAnnouncement(db, admin, { ...base, message: 'x', linkUrl: 'javascript:alert(1)', startsAt: now }),
      ),
    ).toBe('link');
    expect(
      await rejection(
        publishAnnouncement(db, admin, { ...base, message: 'x', linkUrl: null, startsAt: now, endsAt: new Date(now.getTime() - 1) }),
      ),
    ).toBe('dates');

    const id = await publishAnnouncement(db, admin, {
      ...base,
      message: 'Maintenance ce soir',
      linkUrl: '/rules',
      startsAt: new Date(now.getTime() - 60_000),
    });
    announcementIds.push(id);
    const later = await publishAnnouncement(db, admin, {
      ...base,
      message: 'Demain',
      linkUrl: null,
      startsAt: new Date(now.getTime() + 86_400_000),
    });
    announcementIds.push(later);
    expect(await currentAnnouncement()).toMatchObject({ id, message: 'Maintenance ce soir', linkUrl: '/rules' });

    await endAnnouncement(db, admin, id, new Date());
    expect((await currentAnnouncement())?.id).not.toBe(id);
    expect(await rejection(endAnnouncement(db, admin, id, new Date()))).toBe('over');
    // Withdrawn before it starts: it never shows
    await endAnnouncement(db, admin, later, new Date());
    const [row] = await db.select().from(announcements).where(eq(announcements.id, later));
    expect(row.endsAt?.getTime()).toBe(row.startsAt.getTime());
  });
});
