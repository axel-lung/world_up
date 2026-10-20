'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db';
import { resellDuplicates, type Resale } from '@/lib/game/coins';
import { GameError } from '@/lib/game/game-error';
import { getActiveCollection } from '@/lib/game/rules';
import { requireSession } from '@/lib/session';

const resellSchema = z.object({
  collection: z.string().max(64),
  key: z.uuid(),
  // Absent: every duplicate of the collection
  cardId: z.coerce.number().int().positive().optional(),
  // Back to the collection or the card page the form was on
  back: z.string().regex(/^\/c\/[a-z0-9-]+\/(collection|series\/[a-z0-9-]+|cards\/[a-z0-9-]+)(\?[^#]*)?$/),
});

/**
 * Resells one duplicate of a card, or every duplicate, then goes back to the
 * page with the outcome in its address. The form carries a key generated when
 * the page was rendered: sent twice, it sells once.
 */
export async function resellAction(form: FormData): Promise<void> {
  const input = resellSchema.safeParse({
    collection: form.get('collection'),
    key: form.get('key'),
    cardId: form.get('cardId') || undefined,
    back: form.get('back'),
  });
  if (!input.success) redirect('/');
  const { user } = await requireSession(input.data.back);
  const collection = await getActiveCollection(input.data.collection);
  if (!collection) redirect('/');

  let outcome: Resale | GameError;
  try {
    outcome = await resellDuplicates(db, {
      userId: user.id,
      collectionId: collection.id,
      idempotencyKey: input.data.key,
      now: new Date(),
      cardId: input.data.cardId,
    });
  } catch (error) {
    if (!(error instanceof GameError)) throw error;
    outcome = error;
  }

  const back = new URL(input.data.back, 'http://game');
  for (const name of ['sold', 'coins', 'error']) back.searchParams.delete(name);
  if (outcome instanceof GameError) {
    back.searchParams.set('error', outcome.code);
  } else {
    back.searchParams.set('sold', String(outcome.copies));
    back.searchParams.set('coins', String(outcome.coins));
  }
  redirect(`${back.pathname}${back.search}`);
}
