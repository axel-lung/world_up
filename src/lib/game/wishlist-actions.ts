'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db';
import { requireSession } from '@/lib/session';
import { GameError, type GameErrorCode } from './game-error';
import { gamePath } from './paths';
import { getActiveCollection } from './rules';
import { addWish, removeWish } from './wishlist';

// Called by the wishlist's heart (WishButton), on the collection's grids, a
// card's page and the wishlist. Every export of a 'use server' file is
// callable from the browser.

export type WishResult = { ok: true } | { ok: false; error: GameErrorCode | 'server' };

const inputSchema = z.object({
  collection: z.string().max(64),
  cardId: z.number().int().positive(),
  wished: z.boolean(),
});

/** Puts a card on the player's wishlist, or takes it off; the page is then drawn again. */
export async function setWishAction(input: { collection: string; cardId: number; wished: boolean }): Promise<WishResult> {
  const parsed = inputSchema.safeParse(input);
  const collection = parsed.success ? await getActiveCollection(parsed.data.collection) : null;
  if (!parsed.success || !collection) return { ok: false, error: 'server' };
  const { user } = await requireSession(gamePath(collection.slug).wishlist);
  const { cardId, wished } = parsed.data;
  try {
    if (wished) {
      await addWish(db, { userId: user.id, collectionId: collection.id, cardId, now: new Date() });
    } else {
      await removeWish(db, { userId: user.id, cardId });
    }
  } catch (error) {
    if (error instanceof GameError) return { ok: false, error: error.code };
    console.error('Wishlist change failed:', error instanceof Error ? error.message : error);
    return { ok: false, error: 'server' };
  }
  // The page's hearts and counts
  refresh();
  return { ok: true };
}
