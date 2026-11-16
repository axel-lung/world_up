import { cache } from 'react';
import { db } from '@/db';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import { coinBalance } from '@/lib/game/coins';
import { getReserve } from '@/lib/game/packs';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { unreadCount } from '@/lib/notifications/notifications';
import { getSession } from '@/lib/session';

/**
 * What the site's chrome shows of the signed-in player (the header, the tab
 * bar, the footer): read once per request, whichever of them asks first.
 * `player` is null for a visitor, or when the default collection is inactive.
 */
export const getPlayerStatus = cache(async () => {
  const [session, collection] = await Promise.all([getSession(), getActiveCollection(DEFAULT_COLLECTION_SLUG)]);
  const now = new Date();
  if (!session || !collection) return { session, now, game: collection ? gamePath(collection.slug) : null, player: null };
  const [reserve, coins, unread] = await Promise.all([
    getReserve(session.user.id, collection.id, now),
    coinBalance(db, session.user.id),
    unreadCount(session.user.id),
  ]);
  return { session, now, game: gamePath(collection.slug), player: { reserve, coins, unread } };
});
