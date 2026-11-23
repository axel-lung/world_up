'use server';

import { eq } from 'drizzle-orm';
import { refresh } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { db } from '@/db';
import { cards } from '@/db/schema';
import { cardColumns, printedSeries } from '@/lib/catalog/cards';
import { requireSession } from '@/lib/session';
import { type CollectionCard, toCollectionCard } from './collection';
import { gamePath } from './paths';
import { getActiveCollection } from './rules';
import { type Visit, type VisitRefusal, visitMonument } from './visits';

// Called by "Je suis ici" on the map (VisitFlow). Every export of a 'use
// server' file is callable from the browser. The position is checked and
// forgotten: it is neither stored nor logged.

export type VisitResult =
  | { ok: true; visit: Visit & { card: CollectionCard } }
  | { ok: false; refusal: VisitRefusal }
  /** gone: the card can't be visited (hidden since, or without a point). */
  | { ok: false; error: 'gone' | 'server' };

const inputSchema = z.object({
  collection: z.string().max(64),
  cardId: z.number().int().positive(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(1_000_000),
});

/** Unlocks a monument's card from where the player stands; the page is then drawn again. */
export async function visitAction(input: {
  collection: string;
  cardId: number;
  lat: number;
  lon: number;
  accuracy: number;
}): Promise<VisitResult> {
  const parsed = inputSchema.safeParse(input);
  const collection = parsed.success ? await getActiveCollection(parsed.data.collection) : null;
  if (!parsed.success || !collection) return { ok: false, error: 'server' };
  const { user } = await requireSession(gamePath(collection.slug).map);
  const { cardId, lat, lon, accuracy } = parsed.data;

  let outcome;
  try {
    outcome = await visitMonument(db, {
      userId: user.id,
      collectionId: collection.id,
      cardId,
      position: { lat, lon, accuracy },
      now: new Date(),
    });
  } catch (error) {
    // Postgres's message only: Drizzle's own repeats the query's values (the player, the moment)
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    console.error('Visit failed:', cause instanceof Error ? cause.message : 'unknown error');
    return { ok: false, error: 'server' };
  }
  if (!outcome) return { ok: false, error: 'gone' };
  if (!outcome.ok) return outcome;

  // The map's pins, stamps and progress, and the header's figures
  refresh();
  const tCard = await getTranslations('Card');
  const [row] = await db.select(cardColumns).from(cards).where(eq(cards.id, cardId));
  const printed = await printedSeries([cardId]);
  const card = toCollectionCard(
    { ...row, quantity: outcome.visit.copies, visitedAt: outcome.visit.visitedAt },
    printed.get(cardId) ?? null,
    collection.slug,
    { publicDomain: tCard('publicDomain'), unknownLicense: tCard('unknownLicense') },
  );
  return { ok: true, visit: { ...outcome.visit, card } };
}
