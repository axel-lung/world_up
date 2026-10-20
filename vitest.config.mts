import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    // Database tests run apart, with `npm run test:db` (vitest.db.config.mts)
    exclude: [...configDefaults.exclude, 'src/**/*.db.test.ts'],
    environment: 'node',
  },
});
