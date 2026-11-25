import type { WeekDay } from '@/lib/game/streak';

/** How a day of the week shows, beside the streak's own marks. */
export type DayState = 'played' | 'graced' | 'frozen' | 'today' | 'pending' | 'future' | 'missed';

/** A day's state: today played or still pending, a day to come, a day missed, or its mark. */
export function dayState(day: WeekDay, today: string): DayState {
  if (day.today) return day.mark === 'played' ? 'today' : 'pending';
  if (day.mark === 'open') return day.day > today ? 'future' : 'missed';
  return day.mark;
}

/** Noon of a Paris day ("2026-11-25"), to format its weekday in any time zone. */
export const noon = (day: string) => new Date(`${day}T12:00:00Z`);
