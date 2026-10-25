import { sql } from 'drizzle-orm';
import { fromDrizzle, PgBoss } from 'pg-boss';
import { type Database, pool, type Transaction } from '@/db';
import { type EmailJob } from './email';
import { queues } from './queues';

// The web app only sends jobs: no polling, no maintenance, and it shares the
// app's connection pool. migrate.js installs the pg-boss schema beforehand.
const globalForQueue = globalThis as typeof globalThis & { jobQueue?: Promise<PgBoss> };

function startSender(): Promise<PgBoss> {
  const boss = new PgBoss({
    db: { executeSql: (text, values) => pool.query(text, values) },
    supervise: false,
    schedule: false,
    migrate: false,
    registerInstance: false,
  });
  boss.on('error', (error) => console.error('pg-boss error:', error.message));
  return boss.start();
}

async function sender(): Promise<PgBoss> {
  globalForQueue.jobQueue ??= startSender();
  try {
    return await globalForQueue.jobQueue;
  } catch (error) {
    // Try again on the next call (database restarting, for instance).
    globalForQueue.jobQueue = undefined;
    throw error;
  }
}

/** Stops the sender, for the tests that sent a job. */
export async function stopJobQueue(): Promise<void> {
  const boss = globalForQueue.jobQueue;
  globalForQueue.jobQueue = undefined;
  await (await boss)?.stop({ graceful: false, close: false });
}

export async function enqueueEmail(job: EmailJob): Promise<void> {
  await (await sender()).send(queues.email.name, job);
}

export interface PushJob {
  notificationId: number;
  subscriptionId: number;
}

/** One push per device, inserted in the executor's transaction: none is sent if it rolls back. */
export async function enqueuePushes(executor: Database | Transaction, jobs: PushJob[]): Promise<void> {
  await (await sender()).insert(
    queues.push.name,
    jobs.map((data) => ({ data })),
    { db: fromDrizzle(executor, sql) },
  );
}
