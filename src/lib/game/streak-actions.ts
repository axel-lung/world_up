'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db';
import { requireSession } from '@/lib/session';
import { GameError, type GameErrorCode } from './game-error';
import { gamePath } from './paths';
import { getActiveCollection } from './rules';
import type { StreakView } from './streak';
import { getStreak, repairPlayerStreak } from './streaks';

// Called by the streak screen (StreakScreen), on the home or at the end of a
// pack opening. Every export of a 'use server' file is callable from the browser.

export type RepairStreakResult = { ok: true; streak: StreakView } | { ok: false; error: GameErrorCode | 'server' };

const inputSchema = z.object({ collection: z.string().max(64) });

/** Repairs the streak that broke today, for coins; the screen then shows it again. */
export async function repairStreakAction(input: { collection: string }): Promise<RepairStreakResult> {
  const parsed = inputSchema.safeParse(input);
  const collection = parsed.success ? await getActiveCollection(parsed.data.collection) : null;
  if (!collection) return { ok: false, error: 'server' };
  const { user } = await requireSession(gamePath(collection.slug).home);
  const now = new Date();
  const before = await getStreak(user.id, collection.id, now);
  let repair;
  try {
    repair = await repairPlayerStreak(db, { userId: user.id, collectionId: collection.id, now });
  } catch (error) {
    if (error instanceof GameError) return { ok: false, error: error.code };
    console.error('Streak repair failed:', error instanceof Error ? error.message : error);
    return { ok: false, error: 'server' };
  }
  // The header's coins and reserve, and the home's flame
  refresh();
  // The screen rolls the number on from what it showed
  const streak = await getStreak(user.id, collection.id, now, {
    counted: !repair.repeated,
    before: before.days,
    bonusPacks: repair.bonusPacks,
  });
  return { ok: true, streak };
}
