// The daily streak (decided on 2026-11-21): the days in a row, in Paris time,
// on which the player opened at least one pack. One missed day a week (Monday
// to Sunday) doesn't break it: that day doesn't count, but the streak goes on.
// A second missed day in the same week starts it again from the next pack.
// Reaching a milestone (streak_rewards) adds bonus packs to the reserve.
// Pure functions of the stored state and the day, which the callers pass in.

export interface StoredStreak {
  days: number;
  /** The last Paris day a pack was opened ("2026-11-21"); null before the first. */
  lastDay: string | null;
  /** The last missed day the streak forgave: one a week at most. */
  graceDay: string | null;
}

export const NO_STREAK: StoredStreak = { days: 0, lastDay: null, graceDay: null };

/** A milestone: so many days in a row give so many bonus packs. */
export interface StreakReward {
  days: number;
  packs: number;
}

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

/**
 * Whether a pack opened on `today` carries the streak on, and the last
 * forgiven day it then leaves; null when there is no streak to carry on.
 * Today comes after the last day played.
 */
function carriedOn(stored: StoredStreak, today: string): { graceDay: string | null } | null {
  if (stored.lastDay === null || stored.days === 0) return null;
  const last = dayNumber(stored.lastDay);
  const next = dayNumber(today);
  // Three days in a row always hold two of the same week
  if (next - last - 1 > 2) return null;
  let grace = stored.graceDay === null ? null : dayNumber(stored.graceDay);
  for (let day = last + 1; day < next; day++) {
    if (grace !== null && weekOf(grace) === weekOf(day)) return null;
    grace = day;
  }
  return { graceDay: grace === null ? null : dayString(grace) };
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
  const kept = carriedOn(stored, today);
  if (kept) return { streak: { days: stored.days + 1, lastDay: today, graceDay: kept.graceDay }, counted: true, before: stored.days };
  // A new streak. The week's forgiven day stays spent.
  return { streak: { days: 1, lastDay: today, graceDay: stored.graceDay }, counted: true, before: 0 };
}

/** The days the streak shows on `today`: 0 once it can't be carried on any more. */
export function streakDays(stored: StoredStreak, today: string): { days: number; playedToday: boolean } {
  if (stored.lastDay !== null && today <= stored.lastDay) return { days: stored.days, playedToday: true };
  return { days: carriedOn(stored, today) ? stored.days : 0, playedToday: false };
}

/** played: a day of the streak; graced: the missed day it forgave; open: neither. */
export type DayMark = 'played' | 'graced' | 'open';

export interface WeekDay {
  day: string;
  mark: DayMark;
  today: boolean;
}

/**
 * Monday to Sunday of the week of `today`, with the streak's days marked. The
 * walk goes back from the last day played: every day is a played one, but for
 * the forgiven day (one a week, the latest of them in the current week).
 */
export function streakWeek(stored: StoredStreak, today: string): WeekDay[] {
  const now = dayNumber(today);
  const monday = now - ((((now + 3) % 7) + 7) % 7);
  const marks = new Map<number, DayMark>();
  if (stored.lastDay !== null) {
    const grace = stored.graceDay === null ? null : dayNumber(stored.graceDay);
    let left = stored.days;
    for (let day = dayNumber(stored.lastDay); day >= monday && left > 0; day--) {
      if (day === grace) {
        marks.set(day, 'graced');
      } else {
        marks.set(day, 'played');
        left--;
      }
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
}

export function streakView(
  stored: StoredStreak,
  today: string,
  rewards: StreakReward[],
  opening?: { counted: boolean; before: number; bonusPacks: number },
): StreakView {
  const { days, playedToday } = streakDays(stored, today);
  const counted = opening?.counted ?? false;
  return {
    days,
    before: counted && opening ? opening.before : days,
    playedToday,
    counted,
    bonusPacks: counted && opening ? opening.bonusPacks : 0,
    week: streakWeek(stored, today),
    graceUsed: stored.graceDay !== null && weekOf(dayNumber(stored.graceDay)) === weekOf(dayNumber(today)),
    next: nextReward(rewards, days),
  };
}
