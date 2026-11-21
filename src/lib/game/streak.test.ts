import { describe, expect, it } from 'vitest';
import {
  NO_STREAK,
  nextReward,
  parisDay,
  playDay,
  rewardFor,
  type StoredStreak,
  streakDays,
  streakView,
  streakWeek,
} from './streak';

// 2026-11-16 is a Monday, 2026-11-22 a Sunday
const streak = (days: number, lastDay: string, graceDay: string | null = null): StoredStreak => ({ days, lastDay, graceDay });
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
    // Tuesday was forgiven already; Thursday is missed too
    expect(playDay(streak(6, '2026-11-18', '2026-11-17'), '2026-11-20')).toEqual({
      streak: streak(1, '2026-11-20', '2026-11-17'),
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
});
