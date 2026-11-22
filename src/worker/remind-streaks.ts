import { db } from '@/db';
import { remindStreaks } from '@/lib/game/streaks';
import { queues } from '@/lib/queues';
import type { JobDefinition } from './jobs';

const PARIS_HOUR = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' });

/** The hour it is in Paris (0 to 23). */
export const parisHour = (now: Date) => Number(PARIS_HOUR.format(now));

/** The evening's reminder hour (the queue's schedule, src/lib/queues.ts). */
export const REMINDER_HOUR = 20;

/**
 * At 20:00 in Paris: the players whose daily streak would break tomorrow,
 * unless they open a pack today, are told. A run caught up after midnight
 * would speak for the wrong day: it does nothing.
 */
export function createStreakReminderJob(): JobDefinition {
  return {
    name: queues.streakReminder.name,
    handler: async () => {
      const now = new Date();
      if (parisHour(now) < REMINDER_HOUR) return;
      const told = await remindStreaks(db, now);
      if (told > 0) console.log('Streak reminders:', told);
    },
  };
}
