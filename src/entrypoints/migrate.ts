import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { requireEnv } from '@/lib/env';

// Run by the worldup-migrate container (`node migrate.js`) and by
// `npm run db:migrate`. Web and worker only start once it exits with code 0.
async function main() {
  const pool = new Pool({ connectionString: requireEnv('DATABASE_URL'), max: 1 });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: path.join(process.cwd(), 'drizzle'),
    });
    console.log('Migrations applied');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
