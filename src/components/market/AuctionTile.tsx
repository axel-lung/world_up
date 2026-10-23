import { Coins, Gavel, Timer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, type CardCollection, type CardData } from '@/components/card/Card';
import { Tag } from '@/components/ui/Tag';
import { AuctionCountdown } from './AuctionCountdown';
import styles from './AuctionTile.module.css';

export type AuctionViewer = 'seller' | 'leading' | 'outbid' | null;
export type AuctionTileState = 'active' | 'ended' | 'sold' | 'unsold' | 'cancelled';

const VIEWER_TAGS = { seller: 'subtle', leading: 'success', outbid: 'danger', won: 'success', lost: 'subtle' } as const;
const STATE_TAGS = { ended: 'warning', sold: 'success', unsold: 'subtle', cancelled: 'subtle' } as const;

/** The viewer's tag: their part while it runs; once sold, whether they won it; nothing for a bidder otherwise. */
function viewerTag(viewer: AuctionViewer, state: AuctionTileState): keyof typeof VIEWER_TAGS | null {
  if (!viewer || viewer === 'seller' || state === 'active' || state === 'ended') return viewer;
  if (state !== 'sold') return null;
  return viewer === 'leading' ? 'won' : 'lost';
}

export interface AuctionTileProps {
  card: CardData;
  collection: CardCollection;
  /** The auction's page: the card links to it. */
  href: string;
  price: number;
  bidCount: number;
  buyoutPrice: number | null;
  /** ISO dates: the end, and the server time at render (see useCountdown). */
  endsAt: string;
  serverNow: string;
  /** The seller's pseudo, or "un ancien joueur". */
  seller: string;
  /** The viewer's part in it: their own sale, ahead, or outbid. */
  viewer?: AuctionViewer;
  /** Running auctions show the time left; finished ones, how they ended. */
  state?: AuctionTileState;
  sizes?: string;
}

/**
 * An auction in the market's grid: the card, then the price as an inked
 * sticker, the bids, the time left and the seller. The leader's maximum and
 * the bidders never show.
 */
export function AuctionTile({
  card,
  collection,
  href,
  price,
  bidCount,
  buyoutPrice,
  endsAt,
  serverNow,
  seller,
  viewer = null,
  state = 'active',
  sizes = '(max-width: 520px) calc(50vw - 20px), 200px',
}: AuctionTileProps) {
  const t = useTranslations('Market');
  const tag = viewerTag(viewer, state);
  return (
    <div className={styles.tile}>
      <Card card={card} collection={collection} href={href} sizes={sizes} />
      <div className={styles.info}>
        <p className={styles.price}>
          <Coins aria-hidden />
          <span className={styles.amount}>{t('coins', { count: price })}</span>
          <span className="sr-only">, {bidCount > 0 ? t('currentBid') : t('startingBid')}</span>
        </p>
        <p className={styles.meta}>
          <span className={styles.metaItem}>
            <Gavel aria-hidden />
            {t('bids', { count: bidCount })}
          </span>
          {state === 'active' && (
            <span className={styles.metaItem}>
              <Timer aria-hidden />
              <span className="sr-only">{t('timeLeftLabel')} </span>
              <AuctionCountdown endsAt={endsAt} serverNow={serverNow} />
            </span>
          )}
        </p>
        {buyoutPrice !== null && state === 'active' && (
          <p className={styles.meta}>{t('buyoutAt', { count: buyoutPrice })}</p>
        )}
        <p className={styles.seller}>{t('soldBy', { pseudo: seller })}</p>
        {(tag || state !== 'active') && (
          <div className={styles.tags}>
            {state !== 'active' && <Tag variant={STATE_TAGS[state]}>{t(`states.${state}`)}</Tag>}
            {tag && <Tag variant={VIEWER_TAGS[tag]}>{t(`viewer.${tag}`)}</Tag>}
          </div>
        )}
      </div>
    </div>
  );
}
