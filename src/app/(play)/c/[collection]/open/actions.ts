'use server';

import { refresh } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { db } from '@/db';
import type { AwardedAchievement } from '@/lib/game/achievements';
import { type OpenedCard, openingCards } from '@/lib/game/collection';
import { GameError, type GameErrorCode } from '@/lib/game/game-error';
import { getReserve, openPack } from '@/lib/game/packs';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { requireSession } from '@/lib/session';

/** PackReserve's props, as plain values the browser can receive. */
export interface ReserveView {
  available: number;
  max: number;
  nextPackAt: string | null;
  serverNow: string;
  refillMinutes: number;
}

export type OpenPackResult =
  | {
      ok: true;
      openingId: number;
      cards: OpenedCard[];
      coins: number;
      achievements: AwardedAchievement[];
      reserve: ReserveView;
    }
  | { ok: false; error: GameErrorCode | 'server'; reserve: ReserveView | null };

const inputSchema = z.object({ collection: z.string().max(64), key: z.uuid() });

// Not exported: every export of a 'use server' file is callable from the browser
async function reserveView(userId: string, collectionId: number): Promise<ReserveView> {
  const now = new Date();
  const reserve = await getReserve(userId, collectionId, now);
  return {
    available: reserve.packs,
    max: reserve.maxReserve,
    nextPackAt: reserve.nextPackAt?.toISOString() ?? null,
    serverNow: now.toISOString(),
    refillMinutes: reserve.refillMinutes,
  };
}

/**
 * Opens one free pack. The page sends the same key until a pack has opened,
 * so a double click or a retry after a lost answer opens one pack only.
 */
export async function openPackAction(input: { collection: string; key: string }): Promise<OpenPackResult> {
  const parsed = inputSchema.safeParse(input);
  const collection = parsed.success ? await getActiveCollection(parsed.data.collection) : null;
  if (!parsed.success || !collection) return { ok: false, error: 'server', reserve: null };
  const { user } = await requireSession(gamePath(collection.slug).open);

  let opened;
  try {
    opened = await openPack(db, {
      userId: user.id,
      collectionId: collection.id,
      idempotencyKey: parsed.data.key,
      now: new Date(),
    });
  } catch (error) {
    if (!(error instanceof GameError)) {
      console.error('Pack opening failed:', error instanceof Error ? error.message : error);
      return { ok: false, error: 'server', reserve: null };
    }
    return { ok: false, error: error.code, reserve: await reserveView(user.id, collection.id) };
  }

  const t = await getTranslations('Card');
  const cards = await openingCards(user.id, opened.openingId, collection.slug, {
    publicDomain: t('publicDomain'),
    unknownLicense: t('unknownLicense'),
  });
  // The header's reserve and coins
  refresh();
  return {
    ok: true,
    openingId: opened.openingId,
    cards,
    coins: opened.coins,
    achievements: opened.achievements,
    reserve: await reserveView(user.id, collection.id),
  };
}
