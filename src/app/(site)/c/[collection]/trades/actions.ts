'use server';

import { RedirectType, redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db';
import { GameError } from '@/lib/game/game-error';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { acceptTrade, cancelTrade, declineTrade, proposeTrade, type TradeCard } from '@/lib/game/trades';
import { getFriend } from '@/lib/social/friends';
import { requireSession } from '@/lib/session';

// The trade forms. Each goes back to a page with its outcome in the address:
// the offer's page once sent or answered, the composer (with the cards chosen)
// when refused. An answer from a phone's sheet goes back to the list instead,
// or to the sheet when refused.

/** "<card ID>x<copies>", as the composer sends them. */
const cardEntry = z.string().regex(/^\d{1,9}x\d{1,3}$/);

function toCards(entries: string[]): TradeCard[] {
  return entries.map((entry) => {
    const [cardId, quantity] = entry.split('x').map(Number);
    return { cardId, quantity };
  });
}

const proposeSchema = z.object({
  collection: z.string().max(64),
  with: z.string().min(1).max(64),
  key: z.uuid(),
  give: z.array(cardEntry).max(50),
  want: z.array(cardEntry).max(50),
});

export async function proposeTradeAction(form: FormData): Promise<void> {
  const input = proposeSchema.safeParse({
    collection: form.get('collection'),
    with: form.get('with'),
    key: form.get('key'),
    give: form.getAll('give'),
    want: form.getAll('want'),
  });
  if (!input.success) redirect('/friends');
  const collection = await getActiveCollection(input.data.collection);
  if (!collection) redirect('/friends');
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.newTrade(input.data.with));

  let outcome: { tradeId: number } | GameError;
  try {
    const friend = await getFriend(user.id, input.data.with);
    if (!friend) throw new GameError('notFriends');
    outcome = await proposeTrade(db, {
      userId: user.id,
      recipientId: friend.id,
      collectionId: collection.id,
      gives: toCards(input.data.give),
      wants: toCards(input.data.want),
      idempotencyKey: input.data.key,
      now: new Date(),
    });
  } catch (error) {
    if (!(error instanceof GameError)) throw error;
    outcome = error;
  }
  if (outcome instanceof GameError) {
    // Back to the composer, with the cards chosen
    const params = new URLSearchParams({ with: input.data.with, error: outcome.code });
    for (const entry of input.data.give) params.append('give', entry);
    for (const entry of input.data.want) params.append('want', entry);
    redirect(`${paths.trades}/new?${params}`);
  }
  redirect(`${paths.trade(outcome.tradeId)}?done=sent`);
}

const answerSchema = z.object({
  collection: z.string().max(64),
  trade: z.coerce.number().int().positive(),
  answer: z.enum(['accept', 'decline', 'cancel']),
  // Sent from the trades list's sheet (?offer=12)
  from: z.literal('sheet').optional().catch(undefined),
});

const answers = { accept: acceptTrade, decline: declineTrade, cancel: cancelTrade };
const done = { accept: 'accepted', decline: 'declined', cancel: 'cancelled' } as const;

/** Accepts or refuses an offer received, or withdraws one sent. */
export async function answerTradeAction(form: FormData): Promise<void> {
  const input = answerSchema.safeParse({
    collection: form.get('collection'),
    trade: form.get('trade'),
    answer: form.get('answer'),
    from: form.get('from') ?? undefined,
  });
  if (!input.success) redirect('/friends');
  const collection = await getActiveCollection(input.data.collection);
  if (!collection) redirect('/friends');
  const paths = gamePath(collection.slug);
  const page = paths.trade(input.data.trade);
  const { user } = await requireSession(page);

  let outcome: { done: string } | { error: string };
  try {
    await answers[input.data.answer](db, { userId: user.id, tradeId: input.data.trade, now: new Date() });
    outcome = { done: done[input.data.answer] };
  } catch (error) {
    if (!(error instanceof GameError)) throw error;
    outcome = { error: error.code };
  }
  if (input.data.from === 'sheet') {
    // In place of the sheet's address: Back leaves the list rather than reopen the offer
    const back = 'error' in outcome ? { offer: String(input.data.trade), ...outcome } : outcome;
    redirect(`${paths.trades}?${new URLSearchParams(back)}`, RedirectType.replace);
  }
  redirect(`${page}?${new URLSearchParams(outcome)}`);
}
