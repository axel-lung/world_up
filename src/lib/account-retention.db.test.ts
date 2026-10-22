import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { db, pool } from '@/db';
import { users } from '@/db/schema';
import { applyRetention, markActive } from './account-retention';
import type { EmailJob } from './email';

// The real clock: the dates of the test accounts are set around it, so the
// run leaves the other accounts of the development database alone.
const DAY_MS = 24 * 60 * 60 * 1000;
const APP_URL = 'https://jeu.example';
const ids: string[] = [];
const emails = new Map<string, string>();

async function newAccount(values: Partial<typeof users.$inferInsert> = {}): Promise<string> {
  const tag = randomUUID().slice(0, 12);
  const [{ id }] = await db
    .insert(users)
    .values({ name: `retention-${tag}`, email: `${tag}@example.test`, emailVerified: true, birthDate: '1990-01-01', ...values })
    .returning({ id: users.id });
  ids.push(id);
  emails.set(id, `${tag}@example.test`);
  return id;
}

async function account(id: string) {
  const [row] = await db
    .select({ lastActiveAt: users.lastActiveAt, inactivityNoticeAt: users.inactivityNoticeAt })
    .from(users)
    .where(eq(users.id, id));
  return row ?? null;
}

/** Runs the clean-up, and keeps the e-mails sent to this file's accounts. */
async function run(now: Date): Promise<EmailJob[]> {
  const sent: EmailJob[] = [];
  await applyRetention(now, async (job) => void sent.push(job), APP_URL);
  const mine = new Set(emails.values());
  return sent.filter((job) => mine.has(job.to));
}

/** 3 years before `now`, moved by `days`. */
function threeYearsBefore(now: Date, days: number): Date {
  const date = new Date(now);
  date.setUTCFullYear(date.getUTCFullYear() - 3);
  return new Date(date.getTime() + days * DAY_MS);
}

afterAll(async () => {
  await db.delete(users).where(inArray(users.id, ids));
  await pool.end();
});

describe('account retention', () => {
  it('drops a signup whose address was not confirmed within 30 days', async () => {
    const now = new Date();
    const stale = await newAccount({ emailVerified: false, createdAt: new Date(now.getTime() - 31 * DAY_MS) });
    const recent = await newAccount({ emailVerified: false, createdAt: new Date(now.getTime() - 29 * DAY_MS) });
    await run(now);
    expect(await account(stale)).toBeNull();
    expect(await account(recent)).not.toBeNull();
  });

  it('warns once an account nearing 3 years without activity', async () => {
    const now = new Date();
    const dormant = await newAccount({ lastActiveAt: threeYearsBefore(now, 29) });
    await newAccount({ lastActiveAt: threeYearsBefore(now, 31) });
    expect(await run(now)).toEqual([{ template: 'inactiveAccount', to: emails.get(dormant), url: `${APP_URL}/login` }]);
    expect((await account(dormant))?.inactivityNoticeAt).toEqual(now);
    expect(await run(now)).toEqual([]);
  });

  it('deletes it 30 days after the warning, unless the player came back', async () => {
    const now = new Date();
    const warnedAt = new Date(now.getTime() - 31 * DAY_MS);
    const gone = await newAccount({ lastActiveAt: threeYearsBefore(now, -2), inactivityNoticeAt: warnedAt });
    const back = await newAccount({ lastActiveAt: threeYearsBefore(now, -2), inactivityNoticeAt: warnedAt });
    const waiting = await newAccount({ lastActiveAt: threeYearsBefore(now, 10), inactivityNoticeAt: new Date(now.getTime() - 20 * DAY_MS) });
    await markActive(back);
    expect((await account(back))?.inactivityNoticeAt).toBeNull();

    await run(now);
    expect(await account(gone)).toBeNull();
    expect(await account(back)).not.toBeNull();
    expect(await account(waiting)).not.toBeNull();
  });
});
