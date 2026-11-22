'use server';

import { RedirectType, redirect } from 'next/navigation';
import { z } from 'zod';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import { setFeaturedBadge } from '@/lib/game/badges';
import { getActiveCollection } from '@/lib/game/rules';
import { requireSession } from '@/lib/session';

const choice = z.union([z.literal('none'), z.coerce.number().int().positive()]);

/** The badge the player shows beside their pseudo: one of theirs, or none. */
export async function featureBadgeAction(form: FormData): Promise<void> {
  const { user } = await requireSession('/account', { terms: false });
  const input = choice.safeParse(form.get('badge'));
  const collection = await getActiveCollection(DEFAULT_COLLECTION_SLUG);
  if (input.success && collection) {
    await setFeaturedBadge(user.id, collection.id, input.data === 'none' ? null : input.data);
  }
  // From the sheet: the profile takes its history entry
  redirect('/account', RedirectType.replace);
}
