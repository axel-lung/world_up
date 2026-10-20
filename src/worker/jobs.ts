import type { WorkHandler } from 'pg-boss';
import { createEmailJob } from './send-email';

export interface JobDefinition {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each job types its own payload
  handler: WorkHandler<any>;
}

// Handlers of the queues declared in src/lib/queues.ts. Built at startup, so a
// missing setting stops the worker instead of failing every job. The catalogue
// import registers here in lot 2.
export function createJobs(): JobDefinition[] {
  return [createEmailJob()];
}
