import type { WorkHandler } from 'pg-boss';

export interface JobDefinition {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each job types its own payload
  handler: WorkHandler<any>;
}

// Queues the worker consumes. E-mail sending and the catalogue import register here.
export const jobs: JobDefinition[] = [];
