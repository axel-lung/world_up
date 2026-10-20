import { PgBoss } from 'pg-boss';
import { requireEnv } from '@/lib/env';
import { createQueues } from '@/lib/queues';
import { createJobs } from '@/worker/jobs';

// Docker kills the container 30 s after SIGTERM (stop_grace_period): stop
// fetching jobs and give the running ones 25 s to finish.
const STOP_TIMEOUT_MS = 25_000;

// Run by the worldup-worker container (`node worker.js`) and by `npm run worker`.
async function main() {
  const jobs = createJobs();
  const boss = new PgBoss(requireEnv('DATABASE_URL'));
  boss.on('error', (error) => console.error('pg-boss error:', error));
  await boss.start();

  await createQueues(boss);
  for (const job of jobs) {
    await boss.work(job.name, job.handler);
  }
  console.log(`Worker ready, ${jobs.length} queue(s)`);

  let stopping = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal} received, finishing running jobs`);
    await boss.stop({ graceful: true, timeout: STOP_TIMEOUT_MS });
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  console.error('Worker failed to start:', error);
  process.exit(1);
});
