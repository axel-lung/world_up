'use server';

import { z } from 'zod';
import { db } from '@/db';
import { MESSAGE_MAX, MESSAGE_MIN, REPORT_TYPES } from '@/lib/catalog/report-rules';
import { createReport, ReportError } from '@/lib/catalog/reports';
import { getSession } from '@/lib/session';

export type ReportState = { error: 'invalid' | 'tooMany' | 'notFound' | 'signedOut' } | { sent: true } | null;

const reportSchema = z.object({
  cardId: z.coerce.number().int().positive(),
  type: z.enum(REPORT_TYPES),
  message: z.string().trim().min(MESSAGE_MIN).max(MESSAGE_MAX),
});

/** A signed-in player reports a problem with a card's photo or text. */
export async function reportCard(_: ReportState, form: FormData): Promise<ReportState> {
  const session = await getSession();
  if (!session) return { error: 'signedOut' };
  const input = reportSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'invalid' };
  try {
    await createReport(db, session.user.id, input.data.cardId, input.data.type, input.data.message);
  } catch (error) {
    if (error instanceof ReportError && error.code !== 'closed') return { error: error.code };
    throw error;
  }
  return { sent: true };
}
