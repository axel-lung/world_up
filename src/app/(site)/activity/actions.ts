'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { markRead } from '@/lib/notifications/notifications';
import { requireSession } from '@/lib/session';

const upTo = z.coerce.number().int().positive();

/** Marks the notifications the page showed as read: called by the page once displayed. */
export async function markReadAction(upToId: number): Promise<void> {
  const id = upTo.safeParse(upToId);
  if (!id.success) return;
  const { user } = await requireSession('/activity');
  await markRead(user.id, id.data, new Date());
}

/** The same, from the "Tout marquer comme lu" button, which works without JavaScript. */
export async function markReadFormAction(form: FormData): Promise<void> {
  const id = upTo.safeParse(form.get('upTo'));
  const { user } = await requireSession('/activity');
  if (id.success) await markRead(user.id, id.data, new Date());
  redirect('/activity');
}
