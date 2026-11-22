'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db';
import { requireAdmin } from '@/lib/admin';
import { ANNOUNCEMENT_MAX_LENGTH } from '@/lib/announcement-shared';
import { AnnouncementError, endAnnouncement, publishAnnouncement } from '@/lib/announcements';
import { fromParisDateTime } from '@/lib/paris-time';

// Server actions are public endpoints: each one checks the admin session again.

export type AnnouncementState = { error: AnnouncementError['code'] | 'invalid' } | { saved: true } | null;

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

// A datetime-local value, as a time in Paris; empty when optional
const parisDate = z.string().transform((value, context) => {
  if (!value) return null;
  const date = fromParisDateTime(value);
  if (!date) context.addIssue({ code: 'custom', message: 'date' });
  return date;
});

const publishSchema = z.object({
  message: z.string().trim().min(1).max(ANNOUNCEMENT_MAX_LENGTH),
  linkUrl: optional(500),
  linkLabel: optional(60),
  tone: z.enum(['info', 'important']),
  startsAt: parisDate,
  endsAt: parisDate,
});

export async function publishAnnouncementAction(_: AnnouncementState, form: FormData): Promise<AnnouncementState> {
  const { user } = await requireAdmin();
  const input = publishSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'invalid' };
  const now = new Date();
  // A start in the past (the field's default, a minute old) starts now
  const startsAt = input.data.startsAt && input.data.startsAt > now ? input.data.startsAt : now;
  try {
    await publishAnnouncement(db, user.id, { ...input.data, startsAt });
  } catch (error) {
    if (error instanceof AnnouncementError) return { error: error.code };
    throw error;
  }
  refresh();
  return { saved: true };
}

/** Withdraws an announcement, shown or to come. */
export async function endAnnouncementAction(form: FormData): Promise<void> {
  const { user } = await requireAdmin();
  const id = z.coerce.number().int().positive().safeParse(form.get('id'));
  if (!id.success) return;
  try {
    await endAnnouncement(db, user.id, id.data, new Date());
  } catch (error) {
    // Over meanwhile: the refreshed list shows it
    if (!(error instanceof AnnouncementError)) throw error;
  }
  refresh();
}
