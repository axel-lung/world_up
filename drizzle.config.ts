import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// `drizzle-kit generate` works offline; studio and push need DATABASE_URL.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
