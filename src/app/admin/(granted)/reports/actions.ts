'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db';
import { requireAdmin } from '@/lib/admin';
import { closeReport, ReportError } from '@/lib/catalog/reports';

const closeSchema = z.object({
  reportId: z.coerce.number().int().positive(),
  status: z.enum(['resolved', 'dismissed']),
});

/** "Traité" or "Écarté": the clicked button sends the status. */
export async function closeReportAction(form: FormData): Promise<void> {
  const { user } = await requireAdmin();
  const input = closeSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return;
  try {
    await closeReport(db, user.id, input.data.reportId, input.data.status);
  } catch (error) {
    // Already handled in another tab: the refreshed list shows it
    if (!(error instanceof ReportError)) throw error;
  }
  refresh();
}
