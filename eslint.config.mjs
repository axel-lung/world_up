import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Playwright fixtures receive a `use` callback that is not React's use().
  { files: ['e2e/**'], rules: { 'react-hooks/rules-of-hooks': 'off' } },
  globalIgnores(['.next/**', 'dist/**', 'drizzle/**', 'next-env.d.ts']),
]);
