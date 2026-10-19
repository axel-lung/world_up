import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Next.js reloads modules on every change in development: keep the pool on
// globalThis so each reload doesn't open a new set of connections.
const globalForDb = globalThis as typeof globalThis & { dbPool?: Pool };

function createPool() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Fail fast so /api/health answers within the Docker healthcheck timeout.
    connectionTimeoutMillis: 3000,
  });
  // An idle client losing its connection (database restart) must not crash the process.
  pool.on('error', (error) => console.error('Idle database client error:', error.message));
  return pool;
}

export const pool = globalForDb.dbPool ?? createPool();
if (process.env.NODE_ENV !== 'production') globalForDb.dbPool = pool;

export const db = drizzle({ client: pool, schema });
