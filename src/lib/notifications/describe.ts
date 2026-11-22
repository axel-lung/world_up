import { displayName } from '@/components/card/card-format';
import { gamePath } from '@/lib/game/paths';
import type { NotificationData, NotificationKind } from './notifications';

// What a notification says and where it leads: /activity and Web Push render
// the same messages (messages/fr.json, Notifications.<kind>).

export interface NotificationView {
  kind: NotificationKind;
  data: NotificationData;
  /** The other player's pseudo; null once their account is deleted. */
  pseudo: string | null;
  /** The card's name, as stored (lowercase). */
  card: string | null;
  /** The collection's slug, for trades, auctions and the full reserve. */
  collection: string | null;
}

/** The page a notification opens. */
export function notificationHref({ kind, data, collection }: NotificationView): string {
  if (collection && data.tradeId && kind.startsWith('trade_')) return gamePath(collection).trade(data.tradeId);
  if (collection && data.auctionId && kind.startsWith('auction_')) return gamePath(collection).auction(data.auctionId);
  if (collection && (kind === 'packs_full' || kind === 'streak_reminder')) return gamePath(collection).open;
  return kind.startsWith('friend_') ? '/friends' : '/activity';
}

/** The values of the notification's message: the pseudo, the card's name, the streak's days. */
export function notificationValues(
  { pseudo, card, data }: Pick<NotificationView, 'pseudo' | 'card'> & { data?: NotificationData },
  fallback: { formerPlayer: string; aCard: string },
): { pseudo: string; card: string; days: number } {
  return {
    pseudo: pseudo ?? fallback.formerPlayer,
    card: card ? displayName(card) : fallback.aCard,
    days: data?.days ?? 0,
  };
}
