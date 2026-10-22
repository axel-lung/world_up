import { applyRetention } from '@/lib/account-retention';
import type { EmailJob } from '@/lib/email';
import { requireEnv } from '@/lib/env';
import { queues } from '@/lib/queues';
import type { JobDefinition } from './jobs';

/** The daily account clean-up; the warning e-mails go through the e-mail queue. */
export function createRetentionJob(sendEmail: (job: EmailJob) => Promise<void>): JobDefinition {
  const appUrl = requireEnv('APP_URL');
  return {
    name: queues.accountRetention.name,
    handler: async () => {
      const report = await applyRetention(new Date(), sendEmail, appUrl);
      // Counts only: no address in the logs
      console.log('Account retention:', JSON.stringify(report));
    },
  };
}
