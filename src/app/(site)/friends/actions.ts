'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db';
import { acceptFriend, endFriendship, FriendError, requestFriend } from '@/lib/social/friends';
import { requireSession } from '@/lib/session';

// The friends page's forms. Each goes back to the page it came from (the
// friends page or the leaderboard) with its outcome in the address.

const back = z.enum(['/friends', '/leaderboard']).catch('/friends');

function backTo(path: string, outcome: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams(outcome)}`);
}

async function attempt(path: string, run: () => Promise<Record<string, string>>): Promise<never> {
  let outcome: Record<string, string>;
  try {
    outcome = await run();
  } catch (error) {
    if (!(error instanceof FriendError)) throw error;
    outcome = { error: error.code };
  }
  backTo(path, outcome);
}

export async function requestFriendAction(form: FormData): Promise<void> {
  const path = back.parse(form.get('back'));
  const { user } = await requireSession(path);
  const pseudo = z.string().trim().min(1).max(64).safeParse(form.get('pseudo'));
  if (!pseudo.success) backTo(path, { error: 'unknownPlayer' });
  await attempt(path, async () => {
    const result = await requestFriend(db, { userId: user.id, pseudo: pseudo.data, now: new Date() });
    return { done: result.outcome, pseudo: result.pseudo };
  });
}

const other = z.object({ id: z.uuid(), pseudo: z.string().max(64) });

export async function acceptFriendAction(form: FormData): Promise<void> {
  const { user } = await requireSession('/friends');
  const input = other.safeParse({ id: form.get('id'), pseudo: form.get('pseudo') });
  if (!input.success) redirect('/friends');
  await attempt('/friends', async () => {
    await acceptFriend(db, { userId: user.id, requesterId: input.data.id, now: new Date() });
    return { done: 'accepted', pseudo: input.data.pseudo };
  });
}

/** Refuses a request, withdraws one, or removes a friend: the same deletion, told apart for the message. */
export async function endFriendshipAction(form: FormData): Promise<void> {
  const { user } = await requireSession('/friends');
  const input = other.extend({ done: z.enum(['declined', 'cancelled', 'removed']) }).safeParse({
    id: form.get('id'),
    pseudo: form.get('pseudo'),
    done: form.get('done'),
  });
  if (!input.success) redirect('/friends');
  await endFriendship(db, { userId: user.id, otherId: input.data.id, now: new Date() });
  backTo('/friends', { done: input.data.done, pseudo: input.data.pseudo });
}
