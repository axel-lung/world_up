import type { PgBoss, Queue } from 'pg-boss';

type QueueOptions = Omit<Queue, 'name'>;

// Every pg-boss queue. migrate.js creates them, so the web app can send jobs
// before the worker has ever run; src/worker/jobs.ts registers their handlers.
export const queues = {
  // Transactional e-mails. The payload holds an address and a one-time link:
  // keep finished jobs one day only.
  email: {
    name: 'send-email',
    options: { retryLimit: 5, retryDelay: 30, retryBackoff: true, expireInSeconds: 60, deleteAfterSeconds: 86_400 },
  },
  // Deletes the accounts the privacy policy no longer keeps (src/lib/account-retention.ts).
  accountRetention: {
    name: 'account-retention',
    options: { retryLimit: 3, retryDelay: 600, expireInSeconds: 300, deleteAfterSeconds: 7 * 86_400 },
  },
  // Settles the auctions over and marks the expired trade offers, telling their
  // players (src/lib/game/auctions.ts, trades.ts).
  // Every minute; a run missed is caught up by the next, so no retries.
  marketSettle: {
    name: 'market-settle',
    options: { retryLimit: 0, expireInSeconds: 50, deleteAfterSeconds: 3_600 },
  },
} satisfies Record<string, { name: string; options: QueueOptions }>;

// Recurring jobs, stored by migrate.js with the queues; the worker sends them.
// A day missed while the worker was down is caught up once.
const schedules = [
  { queue: queues.accountRetention.name, cron: '30 4 * * *' },
  { queue: queues.marketSettle.name, cron: '* * * * *' },
];

export async function createQueues(boss: PgBoss): Promise<void> {
  for (const queue of Object.values(queues)) {
    await boss.createQueue(queue.name, queue.options);
  }
  for (const { queue, cron } of schedules) {
    await boss.schedule(queue, cron, null, { tz: 'Europe/Paris', missed: 'once' });
  }
}
