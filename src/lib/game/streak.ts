// The daily streak (decided on 2026-11-21): the days in a row, in Paris time,
// on which the player opened at least one pack. One missed day a week (Monday
// to Sunday) doesn't break it: that day doesn't count, but the streak goes on.
// A second missed day in the same week breaks it. On the day it breaks, the
// player can repair it with coins (decided on 2026-11-22): the missed days the
// week's grace can't forgive are frozen, and the streak goes on as if they
// had been forgiven. Reaching a milestone (streak_rewards) adds bonus packs to
// the reserve. Pure functions of the stored state and the day, which the
// callers pass in.

export interface StoredStreak {
  days: number;
  /** The last Paris day a pack was opened ("2026-11-21"); null before the first. */
  lastDay: string | null;
  /** The last missed day the streak forgave: one a week at most. */
  graceDay: string | null;
  /** The missed days repairs covered, recent ones only: they neither count nor break the streak. */
  frozen: string[];
  /** The streak an opening replaced on the day it broke: a repair brings it back that day. */
  lost: LostStreak | null;
}

export interface LostStreak {
  days: number;
  lastDay: string;
}

export const NO_STREAK: StoredStreak = { days: 0, lastDay: null, graceDay: null, frozen: [], lost: null };

/** A milestone: so many days in a row give so many bonus packs. */
export interface StreakReward {
  days: number;
  packs: number;
}

/** What a repair costs: so many coins per day of the streak, up to a ceiling (game_rules). */
export interface RepairPrice {
  coinsPerDay: number;
  maxCoins: number;
}

/** The streaks the evening reminder speaks for: shorter ones aren't worth a notification. */
export const REMINDER_MIN_DAYS = 2;

const PARIS_DAY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The day it is in Paris at this instant: "2026-11-21". */
export function parisDay(now: Date): string {
  const parts = PARIS_DAY.formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const DAY_MS = 86_400_000;
// Days since 1970-01-01, and back
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / DAY_MS;
const dayString = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
// Weeks from Monday to Sunday: 1970-01-01 was a Thursday
const weekOf = (n: number) => Math.floor((n + 3) / 7);
const mondayOf = (n: number) => n - ((((n + 3) % 7) + 7) % 7);

/** The day after `day`. */
export const nextDay = (day: string) => dayString(dayNumber(day) + 1);

/**
 * Walks the missed days between the last day played and `today`, as the
 * week's grace takes them: a frozen day is skipped, the first missed day of a
 * week is forgiven, and a second one in the same week is `stuck` (the streak
 * breaks there, unless a repair freezes it). The forgiven day it leaves is
 * the latest. A repair made before the day's first pack has already
 * forgiven a day of the gap (the stored one): the walk skips it too.
 */
function walkGap(stored: StoredStreak, from: string, today: string) {
  const frozen = new Set(stored.frozen);
  const forgiven = stored.graceDay === null ? null : dayNumber(stored.graceDay);
  let grace = forgiven;
  const stuck: string[] = [];
  for (let day = dayNumber(from) + 1; day < dayNumber(today); day++) {
    if (frozen.has(dayString(day)) || day === forgiven) continue;
    if (grace !== null && weekOf(grace) === weekOf(day)) {
      stuck.push(dayString(day));
      // Past two weeks of missed days nothing more is needed: it is broken
      if (stuck.length > 14) break;
    } else {
      grace = grace === null ? day : Math.max(grace, day);
    }
  }
  return { graceDay: grace === null ? null : dayString(grace), stuck };
}

/**
 * Whether a pack opened on `today` carries the streak on, and the last
 * forgiven day it then leaves; null when there is no streak to carry on.
 * Today comes after the last day played.
 */
function carriedOn(stored: StoredStreak, today: string): { graceDay: string | null } | null {
  if (stored.lastDay === null || stored.days === 0) return null;
  const walk = walkGap(stored, stored.lastDay, today);
  return walk.stuck.length === 0 ? { graceDay: walk.graceDay } : null;
}

/** The first day a pack can no longer carry the streak on; null without a streak. */
export function breakDay(stored: StoredStreak): string | null {
  if (stored.lastDay === null || stored.days === 0) return null;
  // The day after the last one always carries it on; a few weeks always break it
  for (let day = dayNumber(stored.lastDay) + 2, end = day + 60; day < end; day++) {
    if (!carriedOn(stored, dayString(day))) return dayString(day);
  }
  return null;
}

// Frozen days only matter for this week's marks and the days after the last one played
function recentFrozen(frozen: string[], today: string): string[] {
  const since = dayString(mondayOf(dayNumber(today)) - 7);
  return [...new Set(frozen)].filter((day) => day >= since).sort();
}

export interface PlayedDay {
  streak: StoredStreak;
  /** Today wasn't counted yet: this opening counted it. */
  counted: boolean;
  /** The days the streak showed before this opening (0 once broken). */
  before: number;
}

/** The streak after a pack opened on `today` (a Paris day). */
export function playDay(stored: StoredStreak, today: string): PlayedDay {
  // Counted already, or a clock set back
  if (stored.lastDay !== null && today <= stored.lastDay) return { streak: stored, counted: false, before: stored.days };
  const frozen = recentFrozen(stored.frozen, today);
  const kept = carriedOn(stored, today);
  if (kept) {
    return {
      streak: { days: stored.days + 1, lastDay: today, graceDay: kept.graceDay, frozen, lost: null },
      counted: true,
      before: stored.days,
    };
  }
  // A new streak. The week's forgiven day stays spent. The one it replaces, if
  // it broke today, can still be repaired today.
  const lost = stored.lastDay !== null && breakDay(stored) === today ? { days: stored.days, lastDay: stored.lastDay } : null;
  return { streak: { days: 1, lastDay: today, graceDay: stored.graceDay, frozen, lost }, counted: true, before: 0 };
}

/** The days the streak shows on `today`: 0 once it can't be carried on any more. */
export function streakDays(stored: StoredStreak, today: string): { days: number; playedToday: boolean } {
  if (stored.lastDay !== null && today <= stored.lastDay) return { days: stored.days, playedToday: true };
  return { days: carriedOn(stored, today) ? stored.days : 0, playedToday: false };
}

/**
 * The streak that broke today, which a repair can still bring back: the one
 * stored, if today is the first day a pack can't carry it on, or the one an
 * opening today replaced. Null otherwise: a streak can only be repaired on
 * the day it breaks.
 */
export function brokenStreak(stored: StoredStreak, today: string): LostStreak | null {
  if (stored.lastDay === null) return null;
  if (today > stored.lastDay) {
    return stored.days > 0 && breakDay(stored) === today ? { days: stored.days, lastDay: stored.lastDay } : null;
  }
  // An opening today started a new streak over it (that opening left the grace as it was)
  if (today === stored.lastDay && stored.lost && breakDay({ ...stored, ...stored.lost, lost: null }) === today) {
    return stored.lost;
  }
  return null;
}

/** What repairing a streak of `days` costs. */
export function repairCost(price: RepairPrice, days: number): number {
  return Math.min(price.maxCoins, price.coinsPerDay * days);
}

/**
 * The streak once repaired on `today`, or null when there is nothing to
 * repair. The missed days the week's grace can't forgive are frozen. Before
 * today's first pack, the streak is then carried on by it; after it, the
 * streak that pack started joins the broken one.
 */
export function repairStreak(stored: StoredStreak, today: string): StoredStreak | null {
  const broken = brokenStreak(stored, today);
  if (!broken || stored.lastDay === null) return null;
  const walk = walkGap(stored, broken.lastDay, today);
  const frozen = recentFrozen([...stored.frozen, ...walk.stuck], today);
  // The next pack walks the same days again, and forgives the same ones
  if (today > stored.lastDay) return { ...stored, graceDay: walk.graceDay, frozen, lost: null };
  return { days: broken.days + stored.days, lastDay: today, graceDay: walk.graceDay, frozen, lost: null };
}

/**
 * Whether the evening reminder should speak for this streak on `today`: long
 * enough, not played today, and lost tomorrow unless a pack opens today.
 */
export function needsReminder(stored: StoredStreak, today: string): boolean {
  if (stored.lastDay === null || today <= stored.lastDay || stored.days < REMINDER_MIN_DAYS) return false;
  return breakDay(stored) === nextDay(today);
}

/** played: a day of the streak; graced: the missed day it forgave; frozen: a missed day a repair covered; open: none. */
export type DayMark = 'played' | 'graced' | 'frozen' | 'open';

export interface WeekDay {
  day: string;
  mark: DayMark;
  today: boolean;
}

/**
 * Monday to Sunday of the week of `today`, with the streak's days marked. The
 * walk goes back from the last day played: every day is a played one, but for
 * the forgiven day (one a week, the latest of them in the current week) and
 * the frozen ones.
 */
export function streakWeek(stored: StoredStreak, today: string): WeekDay[] {
  const now = dayNumber(today);
  const monday = mondayOf(now);
  const marks = new Map<number, DayMark>();
  const frozen = new Set(stored.frozen.map(dayNumber));
  if (stored.lastDay !== null) {
    const last = dayNumber(stored.lastDay);
    const grace = stored.graceDay === null ? null : dayNumber(stored.graceDay);
    let left = stored.days;
    for (let day = last; day >= monday && left > 0; day--) {
      if (frozen.has(day)) {
        marks.set(day, 'frozen');
      } else if (day === grace) {
        marks.set(day, 'graced');
      } else {
        marks.set(day, 'played');
        left--;
      }
    }
    // A repair before today's pack froze or forgave days after the last one played
    if (stored.days > 0) {
      for (const day of frozen) if (day > last && day >= monday) marks.set(day, 'frozen');
      if (grace !== null && grace > last && grace >= monday) marks.set(grace, 'graced');
    }
  }
  return Array.from({ length: 7 }, (_, i) => ({
    day: dayString(monday + i),
    mark: marks.get(monday + i) ?? 'open',
    today: monday + i === now,
  }));
}

/** The bonus packs for reaching `days`, 0 when it's no milestone. */
export function rewardFor(rewards: StreakReward[], days: number): number {
  return rewards.find((reward) => reward.days === days)?.packs ?? 0;
}

/** The next milestone, and how far along the way from the previous one (0 to 1). */
export function nextReward(rewards: StreakReward[], days: number): (StreakReward & { progress: number }) | null {
  const sorted = [...rewards].sort((a, b) => a.days - b.days);
  const next = sorted.find((reward) => reward.days > days);
  if (!next) return null;
  const previous = sorted.findLast((reward) => reward.days <= days)?.days ?? 0;
  return { ...next, progress: (days - previous) / (next.days - previous) };
}

/** What the streak screen shows, as plain values the browser can receive. */
export interface StreakView {
  days: number;
  /** What it showed before the opening that counted today; `days` otherwise. */
  before: number;
  playedToday: boolean;
  /** The opening just counted today: the screen celebrates it. */
  counted: boolean;
  /** Bonus packs that opening added to the reserve. */
  bonusPacks: number;
  week: WeekDay[];
  /** This week's forgiven day is spent. */
  graceUsed: boolean;
  next: (StreakReward & { progress: number }) | null;
  /** The streak that broke today, which the player can repair until midnight, and its price. */
  repair: { days: number; coins: number; affordable: boolean } | null;
}

export function streakView(
  stored: StoredStreak,
  today: string,
  rewards: StreakReward[],
  opening?: { counted: boolean; before: number; bonusPacks: number },
  repair?: { price: RepairPrice; coins: number },
): StreakView {
  const { days, playedToday } = streakDays(stored, today);
  const counted = opening?.counted ?? false;
  const broken = repair ? brokenStreak(stored, today) : null;
  const cost = broken && repair ? repairCost(repair.price, broken.days) : 0;
  return {
    days,
    before: counted && opening ? opening.before : days,
    playedToday,
    counted,
    bonusPacks: counted && opening ? opening.bonusPacks : 0,
    week: streakWeek(stored, today),
    graceUsed: stored.graceDay !== null && weekOf(dayNumber(stored.graceDay)) === weekOf(dayNumber(today)),
    next: nextReward(rewards, days),
    repair: broken && repair ? { days: broken.days, coins: cost, affordable: repair.coins >= cost } : null,
  };
}
