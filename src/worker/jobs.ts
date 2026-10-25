import type { PgBoss, WorkHandler, WorkOptions } from 'pg-boss';
import { queues } from '@/lib/queues';
import { createRetentionJob } from './account-retention';
import { createMarketJob } from './settle-market';
import { createEmailJob } from './send-email';
import { createPushJob } from './send-push';

export interface JobDefinition {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each job types its own payload
  handler: WorkHandler<any>;
  /** How the worker fetches the queue's jobs: one at a time, every 2 s, by default. */
  options?: WorkOptions;
}

// Handlers of the queues declared in src/lib/queues.ts. Built at startup, so a
// missing setting stops the worker instead of failing every job.
export function createJobs(boss: PgBoss): JobDefinition[] {
  return [
    createEmailJob(),
    createRetentionJob(async (job) => {
      await boss.send(queues.email.name, job);
    }),
    createMarketJob(),
    createPushJob(),
  ];
}
