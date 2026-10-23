'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db';
import { cancelAuction, createAuction, placeBid } from '@/lib/game/auctions';
import { GameError } from '@/lib/game/game-error';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { requireSession } from '@/lib/session';

// The auction forms. Each goes back to a page with its outcome in the address:
// the auction's page once done, the sale form (with the values typed) when
// refused. Every form carries a key generated when the page was rendered:
// sent twice, it acts once.

const coins = z.coerce.number().int().min(1).max(100_000_000);

const sellSchema = z.object({
  collection: z.string().max(64),
  card: z.coerce.number().int().positive(),
  slug: z.string().max(200),
  key: z.uuid(),
  start: coins,
  // Empty: no buyout price
  buyout: z.union([z.literal(''), coins]),
  duration: z.coerce.number().int().min(1).max(24 * 30),
});

export async function sellAction(form: FormData): Promise<void> {
  const fields = Object.fromEntries(['collection', 'card', 'slug', 'key', 'start', 'buyout', 'duration'].map((name) => [name, form.get(name) ?? '']));
  const collection = await getActiveCollection(String(fields.collection));
  if (!collection) redirect('/');
  const paths = gamePath(collection.slug);
  const back = paths.sell(String(fields.slug));
  const { user } = await requireSession(back);
  const input = sellSchema.safeParse(fields);

  let outcome: { auctionId: number } | GameError;
  try {
    if (!input.success) throw new GameError('auctionPrice');
    outcome = await createAuction(db, {
      userId: user.id,
      collectionId: collection.id,
      cardId: input.data.card,
      startPrice: input.data.start,
      buyoutPrice: input.data.buyout === '' ? null : input.data.buyout,
      durationHours: input.data.duration,
      idempotencyKey: input.data.key,
      now: new Date(),
    });
  } catch (error) {
    if (!(error instanceof GameError)) throw error;
    outcome = error;
  }
  if (outcome instanceof GameError) {
    // Back to the form, with the values typed
    const params = new URLSearchParams({ error: outcome.code });
    for (const name of ['start', 'buyout', 'duration']) params.set(name, String(fields[name]).slice(0, 12));
    redirect(`${back}&${params}`);
  }
  redirect(`${paths.auction(outcome.auctionId)}?done=created`);
}

const auctionSchema = z.object({
  collection: z.string().max(64),
  auction: z.coerce.number().int().positive(),
});

const bidSchema = z.object({ key: z.uuid(), max: coins });

/** A bid, or a buyout: the "buy now" form sends the buyout price as its maximum. */
export async function bidAction(form: FormData): Promise<void> {
  const target = auctionSchema.safeParse({ collection: form.get('collection'), auction: form.get('auction') });
  if (!target.success) redirect('/');
  const collection = await getActiveCollection(target.data.collection);
  if (!collection) redirect('/');
  const page = gamePath(collection.slug).auction(target.data.auction);
  const { user } = await requireSession(page);
  const input = bidSchema.safeParse({ key: form.get('key'), max: form.get('max') });

  let outcome: string;
  try {
    if (!input.success) throw new GameError('bidTooLow');
    const { result } = await placeBid(db, {
      userId: user.id,
      collectionId: collection.id,
      auctionId: target.data.auction,
      maxAmount: input.data.max,
      idempotencyKey: input.data.key,
      now: new Date(),
    });
    outcome = `done=${result}`;
  } catch (error) {
    if (!(error instanceof GameError)) throw error;
    outcome = `error=${error.code}&max=${encodeURIComponent(String(form.get('max') ?? '').slice(0, 12))}`;
  }
  redirect(`${page}?${outcome}`);
}

/** The seller withdraws a sale nobody has bid on. */
export async function cancelAuctionAction(form: FormData): Promise<void> {
  const input = auctionSchema.safeParse({ collection: form.get('collection'), auction: form.get('auction') });
  if (!input.success) redirect('/');
  const collection = await getActiveCollection(input.data.collection);
  if (!collection) redirect('/');
  const page = gamePath(collection.slug).auction(input.data.auction);
  const { user } = await requireSession(page);

  let outcome = 'done=cancelled';
  try {
    await cancelAuction(db, { userId: user.id, collectionId: collection.id, auctionId: input.data.auction, now: new Date() });
  } catch (error) {
    if (!(error instanceof GameError)) throw error;
    outcome = `error=${error.code}`;
  }
  redirect(`${page}?${outcome}`);
}
