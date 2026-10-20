'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db';
import { requireAdmin } from '@/lib/admin';
import { CatalogError, PAGE_SIZE, setCardVisibility } from '@/lib/catalog/admin';

const bulkSchema = z.object({
  cardIds: z.array(z.coerce.number().int().positive()).min(1).max(PAGE_SIZE),
  note: z.string().trim().max(500),
  back: z.string().regex(/^\/admin\/cards(\?[^#]*)?$/),
});

/**
 * Shows the checked cards, one transaction and one log entry each, then goes
 * back to the list with the counts. A card without a usable photo stays hidden.
 */
export async function showCards(form: FormData): Promise<void> {
  const { user } = await requireAdmin();
  const input = bulkSchema.safeParse({
    cardIds: form.getAll('cardId'),
    note: form.get('note') ?? '',
    back: form.get('back'),
  });
  if (!input.success) redirect('/admin/cards');
  let shown = 0;
  let skipped = 0;
  for (const cardId of input.data.cardIds) {
    try {
      await setCardVisibility(db, user.id, cardId, null, input.data.note || null);
      shown += 1;
    } catch (error) {
      if (!(error instanceof CatalogError)) throw error;
      skipped += 1;
    }
  }
  const back = new URL(input.data.back, 'http://admin');
  back.searchParams.set('shown', String(shown));
  back.searchParams.set('skipped', String(skipped));
  redirect(`${back.pathname}${back.search}`);
}
