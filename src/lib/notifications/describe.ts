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
  /** The collection's slug, for trades and auctions. */
  collection: string | null;
}

/** The page a notification opens. */
export function notificationHref({ kind, data, collection }: NotificationView): string {
  if (collection && data.tradeId && kind.startsWith('trade_')) return gamePath(collection).trade(data.tradeId);
  if (collection && data.auctionId && kind.startsWith('auction_')) return gamePath(collection).auction(data.auctionId);
  return kind.startsWith('friend_') ? '/friends' : '/activity';
}

/** The values of the notification's message: the pseudo and the card's name. */
export function notificationValues(
  { pseudo, card }: Pick<NotificationView, 'pseudo' | 'card'>,
  fallback: { formerPlayer: string; aCard: string },
): { pseudo: string; card: string } {
  return { pseudo: pseudo ?? fallback.formerPlayer, card: card ? displayName(card) : fallback.aCard };
}
