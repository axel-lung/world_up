import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { PgBoss } from 'pg-boss';
import { requireEnv } from '@/lib/env';
import { createQueues } from '@/lib/queues';

// Run by the worldup-migrate container (`node migrate.js`) and by
// `npm run db:migrate`. Web and worker only start once it exits with code 0.
async function main() {
  const connectionString = requireEnv('DATABASE_URL');
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: path.join(process.cwd(), 'drizzle'),
    });
    console.log('Migrations applied');
  } finally {
    await pool.end();
  }

  // The pg-boss schema and the queues, which the web app sends jobs to.
  const boss = new PgBoss({ connectionString, max: 1, supervise: false, schedule: false, registerInstance: false });
  await boss.start();
  try {
    await createQueues(boss);
    console.log('Job queues ready');
  } finally {
    await boss.stop({ graceful: false });
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
