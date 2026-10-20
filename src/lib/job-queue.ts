import { PgBoss } from 'pg-boss';
import { pool } from '@/db';
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

export async function enqueueEmail(job: EmailJob): Promise<void> {
  await (await sender()).send(queues.email.name, job);
}
