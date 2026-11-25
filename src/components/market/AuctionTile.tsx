import { Coins, Gavel, Timer } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card, type CardCollection, type CardData } from '@/components/card/Card';
import { displayName } from '@/components/card/card-format';
import { CardVignette } from '@/components/card/CardVignette';
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
 * sticker, the bids, the time left and the seller. On a phone, a row instead
 * (App Vitrail - Marche.dc.html): the card's vignette, its name and rarity,
 * the bids, the time left and the viewer's part, the price on the right,
 * edged in moss while they lead and in red once outbid. The leader's maximum
 * and the bidders never show.
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
  const tRarity = useTranslations('Rarity');
  const tag = viewerTag(viewer, state);
  const chip = tag ? t(`viewer.${tag}`) : state !== 'active' ? t(`states.${state}`) : null;
  return (
    <>
      <Link href={href} className={`${styles.row} phone-only`} data-viewer={tag ?? undefined} data-rarity={card.rarity}>
        <CardVignette rarity={card.rarity} photo={card.photo.src ? card.photo : null} emblem={collection.emblem} width={54} />
        <span className={styles.rowText}>
          <span className={styles.rowName}>{displayName(card.name)}</span>
          <span className={styles.rowMeta}>
            <span className={styles.rowRarity}>{tRarity(card.rarity)}</span> · {t('bids', { count: bidCount })}
          </span>
          <span className={styles.rowChips}>
            {state === 'active' && (
              <span className={styles.rowTime}>
                <Timer aria-hidden />
                <span className="sr-only">{t('timeLeftLabel')} </span>
                <AuctionCountdown endsAt={endsAt} serverNow={serverNow} />
              </span>
            )}
            {chip && (
              <span className={styles.rowState} data-state={tag ?? state}>
                {chip}
              </span>
            )}
          </span>
        </span>
        <span className={styles.rowPrice}>
          <span className={styles.rowAmount}>{price}</span>
          <span className={styles.rowUnit}>{bidCount > 0 ? t('priceUnit', { count: price }) : t('priceStart')}</span>
        </span>
      </Link>
      <div className={`${styles.tile} wide-only`}>
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
    </>
  );
}
