'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db';
import { requireAdmin } from '@/lib/admin';
import { requireEnv } from '@/lib/env';
import { enqueueEmail } from '@/lib/job-queue';
import { banPlayer, PlayerError, unbanPlayer } from '@/lib/players/admin';

// Server actions are public endpoints: each one checks the admin session again.

export type ErrorCode = 'invalid' | 'reasonRequired' | 'adminAccount' | 'alreadyBanned' | 'notBanned';
export type ActionState = { error: ErrorCode } | { done: 'banned' | 'unbanned' } | null;

// The ban's reason, or the note that lifts it
const banSchema = z.object({ intent: z.enum(['ban', 'unban']), userId: z.uuid(), text: z.string().trim().max(500) });

/**
 * Bans the player and e-mails them the reason, as the terms of use promise;
 * or lifts the ban and tells them. One action for both, so that the page shows
 * the latest result whichever form is up.
 */
export async function changeBan(_: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await requireAdmin();
  const input = banSchema.safeParse({ intent: form.get('intent'), userId: form.get('userId'), text: form.get('text') ?? '' });
  if (!input.success) return { error: 'invalid' };
  const { intent, userId, text } = input.data;
  if (intent === 'ban' && !text) return { error: 'reasonRequired' };
  const appUrl = requireEnv('APP_URL');
  try {
    if (intent === 'ban') {
      const { email } = await banPlayer(db, { adminId: user.id, userId, reason: text, now: new Date() });
      await enqueueEmail({ template: 'accountSuspended', to: email, url: `${appUrl}/terms`, reason: text });
    } else {
      const { email } = await unbanPlayer(db, { adminId: user.id, userId, note: text || null });
      await enqueueEmail({ template: 'accountRestored', to: email, url: `${appUrl}/login` });
    }
  } catch (error) {
    if (error instanceof PlayerError) return { error: error.code === 'notFound' ? 'invalid' : error.code };
    throw error;
  }
  refresh();
  return { done: intent === 'ban' ? 'banned' : 'unbanned' };
}
