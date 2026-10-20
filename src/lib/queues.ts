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
} satisfies Record<string, { name: string; options: QueueOptions }>;

export async function createQueues(boss: PgBoss): Promise<void> {
  for (const queue of Object.values(queues)) {
    await boss.createQueue(queue.name, queue.options);
  }
}
