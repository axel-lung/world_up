import { defineConfig, devices } from '@playwright/test';

// End-to-end tests (e2e/). They need Postgres and Mailpit (`npm run db:up`)
// and migrated tables (`npm run db:migrate`). Locally they reuse a running
// `npm run dev`; in CI they run against the production build (`npm run build`
// first), where the auth rate limits are on.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env in CI: the workflow sets the variables.
}

const production = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: production,
  retries: production ? 1 : 0,
  reporter: production ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: production ? 'npx next start' : 'npm run dev',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: !production,
      timeout: 120_000,
    },
    // Sends the e-mails the tests read from Mailpit.
    { command: 'npm run worker', wait: { stdout: /Worker ready/ }, timeout: 60_000 },
  ],
});
