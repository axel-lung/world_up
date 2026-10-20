import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests against the database (src/**/*.db.test.ts): `npm run test:db`, after
// `npm run db:up` and `npm run db:migrate`.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env in CI: the workflow sets the variables.
}

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.db.test.ts'],
    environment: 'node',
    // The files share one database
    fileParallelism: false,
  },
});
