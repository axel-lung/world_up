import { describe, expect, it } from 'vitest';
import {
  breakDay,
  brokenStreak,
  NO_STREAK,
  needsReminder,
  nextReward,
  parisDay,
  playDay,
  repairCost,
  repairStreak,
  rewardFor,
  type StoredStreak,
  streakDays,
  streakView,
  streakWeek,
} from './streak';

// 2026-11-16 is a Monday, 2026-11-22 a Sunday
const streak = (
  days: number,
  lastDay: string,
  graceDay: string | null = null,
  more: Partial<Pick<StoredStreak, 'frozen' | 'lost'>> = {},
): StoredStreak => ({ days, lastDay, graceDay, frozen: [], lost: null, ...more });
const PRICE = { coinsPerDay: 10, maxCoins: 1000 };
const REWARDS = [
  { days: 7, packs: 1 },
  { days: 3, packs: 1 },
  { days: 14, packs: 2 },
];

describe('parisDay', () => {
  it('reads the day on a clock in Paris, summer and winter time alike', () => {
    expect(parisDay(new Date('2026-11-21T22:59:00Z'))).toBe('2026-11-21');
    expect(parisDay(new Date('2026-11-21T23:00:00Z'))).toBe('2026-11-22');
    expect(parisDay(new Date('2026-07-14T21:59:00Z'))).toBe('2026-07-14');
    expect(parisDay(new Date('2026-07-14T22:00:00Z'))).toBe('2026-07-15');
  });
});

describe('playDay', () => {
  it('starts a streak with the first pack', () => {
    expect(playDay(NO_STREAK, '2026-11-18')).toEqual({ streak: streak(1, '2026-11-18'), counted: true, before: 0 });
  });

  it('counts a day once, however many packs it opens', () => {
    expect(playDay(streak(4, '2026-11-18'), '2026-11-18')).toEqual({ streak: streak(4, '2026-11-18'), counted: false, before: 4 });
  });

  it('adds the next day', () => {
    expect(playDay(streak(4, '2026-11-18'), '2026-11-19').streak).toEqual(streak(5, '2026-11-19'));
  });

  it('forgives one missed day a week, which does not count', () => {
    expect(playDay(streak(4, '2026-11-18'), '2026-11-20')).toEqual({
      streak: streak(5, '2026-11-20', '2026-11-19'),
      counted: true,
      before: 4,
    });
  });

  it('breaks on a second missed day in the same week', () => {
    // Tuesday was forgiven already; Thursday is missed too. It broke today: still repairable today.
    expect(playDay(streak(6, '2026-11-18', '2026-11-17'), '2026-11-20')).toEqual({
      streak: streak(1, '2026-11-20', '2026-11-17', { lost: { days: 6, lastDay: '2026-11-18' } }),
      counted: true,
      before: 0,
    });
    // Two days in a row in the same week
    expect(playDay(streak(6, '2026-11-17'), '2026-11-20').streak.days).toBe(1);
  });

  it('forgives a missed day of last week and one of this week', () => {
    // Sunday 22 and Monday 23 missed, a week each: carried on
    expect(playDay(streak(9, '2026-11-21', '2026-11-10'), '2026-11-24').streak).toEqual(
      streak(10, '2026-11-24', '2026-11-23'),
    );
    // Unless the Sunday's week had forgiven a day already
    expect(playDay(streak(9, '2026-11-21', '2026-11-17'), '2026-11-24').streak.days).toBe(1);
  });

  it('breaks after three missed days, whatever the weeks', () => {
    expect(playDay(streak(9, '2026-11-20'), '2026-11-24').streak).toEqual(streak(1, '2026-11-24'));
    expect(playDay(streak(9, '2026-08-01'), '2026-11-24').streak.days).toBe(1);
  });

  it('ignores a clock set back', () => {
    expect(playDay(streak(3, '2026-11-20'), '2026-11-19').counted).toBe(false);
  });

  it('skips the days a repair froze, and keeps only the recent ones', () => {
    // Tuesday forgiven, Wednesday and Thursday frozen: Friday carries it on
    const frozen = streak(6, '2026-11-17', '2026-11-11', { frozen: ['2026-10-01', '2026-11-19', '2026-11-20'] });
    expect(playDay(frozen, '2026-11-21').streak).toEqual(
      streak(7, '2026-11-21', '2026-11-18', { frozen: ['2026-11-19', '2026-11-20'] }),
    );
  });
});

describe('breakDay', () => {
  it('is the first day a pack no longer carries the streak on', () => {
    // Missing Thursday is forgiven; missing Friday too breaks it on Saturday
    expect(breakDay(streak(5, '2026-11-18'))).toBe('2026-11-21');
    // The week's grace is spent: missing Thursday breaks it on Friday
    expect(breakDay(streak(5, '2026-11-18', '2026-11-16'))).toBe('2026-11-20');
    // Sunday and Monday are forgiven, a week each
    expect(breakDay(streak(5, '2026-11-21'))).toBe('2026-11-25');
    expect(breakDay(NO_STREAK)).toBeNull();
  });
});

describe('repair', () => {
  // Monday forgiven; Wednesday played; Thursday missed: broken on Friday
  const broken = streak(12, '2026-11-18', '2026-11-16');

  it('is offered on the day the streak breaks only', () => {
    expect(brokenStreak(broken, '2026-11-19')).toBeNull();
    expect(brokenStreak(broken, '2026-11-20')).toEqual({ days: 12, lastDay: '2026-11-18' });
    expect(brokenStreak(broken, '2026-11-21')).toBeNull();
    expect(brokenStreak(streak(12, '2026-11-20'), '2026-11-20')).toBeNull();
  });

  it('freezes the missed days the grace cannot forgive, before the first pack of the day', () => {
    const repaired = repairStreak(broken, '2026-11-20');
    expect(repaired).toEqual(streak(12, '2026-11-18', '2026-11-16', { frozen: ['2026-11-19'] }));
    expect(streakDays(repaired!, '2026-11-20')).toEqual({ days: 12, playedToday: false });
    expect(brokenStreak(repaired!, '2026-11-20')).toBeNull();
    // Today's pack carries it on
    expect(playDay(repaired!, '2026-11-20').streak.days).toBe(13);
  });

  it('brings back the streak a pack replaced today', () => {
    const opened = playDay(broken, '2026-11-20').streak;
    expect(opened.days).toBe(1);
    expect(brokenStreak(opened, '2026-11-20')).toEqual({ days: 12, lastDay: '2026-11-18' });
    expect(repairStreak(opened, '2026-11-20')).toEqual(streak(13, '2026-11-20', '2026-11-16', { frozen: ['2026-11-19'] }));
    // The next day is too late
    expect(repairStreak(opened, '2026-11-21')).toBeNull();
  });

  it('lets the grace forgive what it can', () => {
    // Played Saturday, missed Sunday, Monday and Tuesday: broken on Wednesday.
    // Sunday and Monday are forgiven (a week each), Tuesday is frozen.
    const repaired = repairStreak(streak(9, '2026-11-21'), '2026-11-25');
    expect(repaired).toEqual(streak(9, '2026-11-21', '2026-11-23', { frozen: ['2026-11-24'] }));
    expect(streakWeek(repaired!, '2026-11-25').map((day) => day.mark)).toEqual([
      'graced',
      'frozen',
      'open',
      'open',
      'open',
      'open',
      'open',
    ]);
    expect(playDay(repaired!, '2026-11-25').streak).toEqual(
      streak(10, '2026-11-25', '2026-11-23', { frozen: ['2026-11-24'] }),
    );
  });

  it('costs so many coins a day, up to the ceiling', () => {
    expect(repairCost(PRICE, 12)).toBe(120);
    expect(repairCost(PRICE, 365)).toBe(1000);
  });
});

describe('needsReminder', () => {
  it('speaks for a streak lost tomorrow unless a pack opens today', () => {
    // The week's grace is spent: missing Thursday would break it
    expect(needsReminder(streak(5, '2026-11-18', '2026-11-16'), '2026-11-19')).toBe(true);
    // Yesterday was forgiven: today is the last chance
    expect(needsReminder(streak(5, '2026-11-17'), '2026-11-19')).toBe(true);
  });

  it('stays quiet otherwise', () => {
    // Missing today would be forgiven
    expect(needsReminder(streak(5, '2026-11-18'), '2026-11-19')).toBe(false);
    // Played today, too short, or broken already
    expect(needsReminder(streak(5, '2026-11-19', '2026-11-16'), '2026-11-19')).toBe(false);
    expect(needsReminder(streak(1, '2026-11-18', '2026-11-16'), '2026-11-19')).toBe(false);
    expect(needsReminder(streak(5, '2026-11-17', '2026-11-16'), '2026-11-19')).toBe(false);
  });
});

describe('streakDays', () => {
  it('keeps the streak while a pack today would carry it on', () => {
    expect(streakDays(streak(5, '2026-11-20'), '2026-11-20')).toEqual({ days: 5, playedToday: true });
    expect(streakDays(streak(5, '2026-11-20'), '2026-11-21')).toEqual({ days: 5, playedToday: false });
    // Yesterday missed, still forgivable today
    expect(streakDays(streak(5, '2026-11-19'), '2026-11-21')).toEqual({ days: 5, playedToday: false });
  });

  it('shows 0 once the streak is lost', () => {
    expect(streakDays(streak(5, '2026-11-19', '2026-11-17'), '2026-11-21').days).toBe(0);
    expect(streakDays(streak(5, '2026-11-17'), '2026-11-21').days).toBe(0);
    expect(streakDays(NO_STREAK, '2026-11-21').days).toBe(0);
  });
});

describe('streakWeek', () => {
  it('marks this week from Monday to Sunday, the forgiven day apart', () => {
    // Played Monday, Tuesday, Thursday and Friday; Wednesday forgiven; today Saturday, not played yet
    const week = streakWeek(streak(12, '2026-11-20', '2026-11-18'), '2026-11-21');
    expect(week.map((day) => day.day)).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);
    expect(week.map((day) => day.mark)).toEqual(['played', 'played', 'graced', 'played', 'played', 'open', 'open']);
    expect(week.map((day) => day.today)).toEqual([false, false, false, false, false, true, false]);
  });

  it('marks the current streak only', () => {
    // A streak of 2 started on Thursday; the forgiven Tuesday was an older streak's
    const week = streakWeek(streak(2, '2026-11-20', '2026-11-17'), '2026-11-20');
    expect(week.map((day) => day.mark)).toEqual(['open', 'open', 'open', 'played', 'played', 'open', 'open']);
  });

  it('marks the frozen days', () => {
    // Repaired on Friday before its first pack: Thursday frozen, Monday forgiven
    const week = streakWeek(streak(12, '2026-11-18', '2026-11-16', { frozen: ['2026-11-19'] }), '2026-11-20');
    expect(week.map((day) => day.mark)).toEqual(['graced', 'played', 'played', 'frozen', 'open', 'open', 'open']);
    const played = streakWeek(streak(13, '2026-11-20', '2026-11-16', { frozen: ['2026-11-19'] }), '2026-11-20');
    expect(played.map((day) => day.mark)).toEqual(['graced', 'played', 'played', 'frozen', 'played', 'open', 'open']);
  });

  it('starts on Monday, today being Sunday or Monday', () => {
    expect(streakWeek(NO_STREAK, '2026-11-22')[0].day).toBe('2026-11-16');
    expect(streakWeek(NO_STREAK, '2026-11-23')[0].day).toBe('2026-11-23');
  });
});

describe('rewards', () => {
  it('finds the milestone reached and the next one', () => {
    expect(rewardFor(REWARDS, 14)).toBe(2);
    expect(rewardFor(REWARDS, 13)).toBe(0);
    expect(nextReward(REWARDS, 0)).toEqual({ days: 3, packs: 1, progress: 0 });
    expect(nextReward(REWARDS, 5)).toEqual({ days: 7, packs: 1, progress: 0.5 });
    expect(nextReward(REWARDS, 7)).toEqual({ days: 14, packs: 2, progress: 0 });
    expect(nextReward(REWARDS, 14)).toBeNull();
  });
});

describe('streakView', () => {
  it('celebrates the opening that counted today', () => {
    const view = streakView(streak(3, '2026-11-21'), '2026-11-21', REWARDS, { counted: true, before: 2, bonusPacks: 1 });
    expect(view).toMatchObject({ days: 3, before: 2, playedToday: true, counted: true, bonusPacks: 1, graceUsed: false });
    expect(view.next).toEqual({ days: 7, packs: 1, progress: 0 });
  });

  it('shows the streak as it stands otherwise', () => {
    const view = streakView(streak(4, '2026-11-19', '2026-11-17'), '2026-11-21', REWARDS);
    expect(view).toMatchObject({ days: 0, before: 0, playedToday: false, counted: false, bonusPacks: 0, graceUsed: true });
  });

  it('offers the repair on the day the streak broke, with its price', () => {
    const broken = streak(12, '2026-11-18', '2026-11-16');
    expect(streakView(broken, '2026-11-20', REWARDS, undefined, { price: PRICE, coins: 500 }).repair).toEqual({
      days: 12,
      coins: 120,
      affordable: true,
    });
    expect(streakView(broken, '2026-11-20', REWARDS, undefined, { price: PRICE, coins: 100 }).repair?.affordable).toBe(false);
    expect(streakView(broken, '2026-11-21', REWARDS, undefined, { price: PRICE, coins: 500 }).repair).toBeNull();
  });
});
