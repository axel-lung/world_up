'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db';
import { requireAdmin } from '@/lib/admin';
import { cancelAuctionAsAdmin } from '@/lib/game/auctions';
import { GameError } from '@/lib/game/game-error';

const cancelSchema = z.object({
  auctionId: z.coerce.number().int().positive(),
  note: z.string().trim().max(500),
});

/** Cancels a running auction: the card stays the seller's, the leader's coins are free again. */
export async function cancelAuctionAction(form: FormData): Promise<void> {
  const { user } = await requireAdmin();
  const input = cancelSchema.safeParse({ auctionId: form.get('auctionId'), note: form.get('note') ?? '' });
  if (!input.success) return;
  try {
    await cancelAuctionAsAdmin(db, { adminId: user.id, auctionId: input.data.auctionId, note: input.data.note || null, now: new Date() });
  } catch (error) {
    // Settled or cancelled meanwhile: the refreshed list shows it
    if (!(error instanceof GameError)) throw error;
  }
  refresh();
}
