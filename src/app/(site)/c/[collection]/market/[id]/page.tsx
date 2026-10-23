import { randomUUID } from 'node:crypto';
import { Coins, Gavel, ShoppingBag, Timer } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Card } from '@/components/card/Card';
import { displayName } from '@/components/card/card-format';
import { AuctionCountdown } from '@/components/market/AuctionCountdown';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { db } from '@/db';
import { photoLicenseLabel, toCardData } from '@/lib/catalog/card-data';
import { cardPath, printedSeries } from '@/lib/catalog/cards';
import { settleAuction } from '@/lib/game/auctions';
import { availableCoins } from '@/lib/game/coins';
import { getAuction } from '@/lib/game/market';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection, getMarketRules } from '@/lib/game/rules';
import { requireSession } from '@/lib/session';
import styles from '../../game.module.css';
import { bidAction, cancelAuctionAction } from '../actions';
import { MarketNotice } from '../MarketNotice';
import own from '../page.module.css';
import { AuctionStateTag } from './AuctionStateTag';

type Props = PageProps<'/c/[collection]/market/[id]'>;

async function load(params: Props['params']) {
  const { collection: slug, id } = await params;
  const collection = await getActiveCollection(slug);
  const auctionId = /^\d{1,9}$/.test(id) ? Number(id) : null;
  return collection && auctionId ? { collection, auctionId } : null;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Market');
  return { title: t('title') };
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** One auction: the card, the price and the time left, and the bid form or the seller's withdrawal. */
export default async function AuctionPage({ params, searchParams }: Props) {
  const found = await load(params);
  if (!found) notFound();
  const { collection, auctionId } = found;
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.auction(auctionId));
  const now = new Date();
  let auction = await getAuction(collection.id, auctionId, user.id, now);
  if (!auction) notFound();
  // Over but not settled yet: settle it now rather than wait for the worker
  if (auction.state === 'ended') {
    await settleAuction(db, auctionId, now);
    auction = (await getAuction(collection.id, auctionId, user.id, now))!;
  }

  const [t, tCard, format, query, rules, available, printed] = await Promise.all([
    getTranslations('Market'),
    getTranslations('Card'),
    getFormatter(),
    searchParams,
    getMarketRules(db, collection.id),
    availableCoins(db, user.id),
    printedSeries([auction.card.id]),
  ]);
  const { card } = auction;
  if (!card.photoImage) notFound();
  const date = (value: Date) => format.dateTime(value, { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
  const name = displayName(card.name);
  const active = auction.state === 'active';
  // A leader raising their maximum may count the current one again
  const spendable = available + (auction.viewerMax ?? 0);
  const canBid = active && auction.viewer !== 'seller' && auction.auctionsEnabled;
  const typed = Number(one(query.max));
  const suggested = Number.isInteger(typed) && typed >= auction.minimumBid ? typed : auction.minimumBid;

  const closing = {
    sold: t('auction.sold', { count: auction.currentPrice, date: date(auction.settledAt ?? auction.endsAt) }),
    unsold: t('auction.unsold', { date: date(auction.settledAt ?? auction.endsAt) }),
    cancelled: t('auction.cancelled', { date: date(auction.settledAt ?? auction.endsAt) }),
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          <Link href={paths.market}>{t('title')}</Link>
        </p>
        <h1>{name}</h1>
        <div className={styles.actions}>
          <AuctionStateTag state={auction.state} />
          <span className={styles.muted}>{t('soldBy', { pseudo: auction.seller ?? t('formerPlayer') })}</span>
        </div>
      </header>

      <MarketNotice params={query} />

      <div className={own.auction}>
        <div className={own.cardColumn}>
          <Card
            card={toCardData({ ...card, photoImage: card.photoImage }, printed.get(card.id) ?? null, photoLicenseLabel(card.photoLicense, {
              publicDomain: tCard('publicDomain'),
              unknownLicense: tCard('unknownLicense'),
            }))}
            collection={collection}
            size="large"
            flippable
            priority
            sizes="(max-width: 392px) calc(100vw - 32px), 360px"
          />
          <Link href={cardPath(collection.slug, card.slug)}>{t('auction.cardPage')}</Link>
        </div>

        <section className={`${styles.section} ${own.panel}`} aria-labelledby="price-heading">
          <h2 id="price-heading" className={own.priceLabel}>
            {auction.bidCount > 0 ? t('currentBid') : t('startingBid')}
          </h2>
          <p className={own.bigPrice}>
            <Coins aria-hidden />
            {t('coins', { count: auction.currentPrice })}
          </p>
          <ul className={own.facts}>
            <li>
              <Gavel aria-hidden />
              {t('bids', { count: auction.bidCount })}
            </li>
            {active && (
              <li>
                <Timer aria-hidden />
                <span>
                  {t('timeLeftLabel')} <AuctionCountdown endsAt={auction.endsAt.toISOString()} serverNow={now.toISOString()} />
                  <span className={styles.muted}> · {t('endsOn', { date: date(auction.endsAt) })}</span>
                </span>
              </li>
            )}
            {auction.buyoutPrice !== null && active && (
              <li>
                <ShoppingBag aria-hidden />
                {t('buyoutAt', { count: auction.buyoutPrice })}
              </li>
            )}
          </ul>

          {!active && <p>{closing[auction.state as keyof typeof closing]}</p>}
          {auction.state === 'sold' && auction.viewer === 'leading' && (
            <Notice tone="success">
              <p>{t('auction.won')}</p>
            </Notice>
          )}
          {active && auction.viewer === 'leading' && (
            <Notice tone="success">
              <p>{t('auction.leading', { count: auction.viewerMax ?? 0 })}</p>
            </Notice>
          )}
          {active && auction.viewer === 'outbid' && (
            <Notice>
              <p>{t('auction.outbid')}</p>
            </Notice>
          )}
          {active && !auction.auctionsEnabled && auction.viewer !== 'seller' && (
            <Notice>
              <p>{t('closed')}</p>
            </Notice>
          )}

          {canBid && (
            <div className={styles.stack}>
              <form action={bidAction} className={own.bidForm}>
                <input type="hidden" name="collection" value={collection.slug} />
                <input type="hidden" name="auction" value={auction.id} />
                {/* A new key each time the page renders: sending the form twice bids once */}
                <input type="hidden" name="key" value={randomUUID()} />
                <TextField
                  label={t('auction.maxLabel')}
                  name="max"
                  type="number"
                  inputMode="numeric"
                  min={auction.minimumBid}
                  max={auction.buyoutPrice ?? auction.maximumBid}
                  step={1}
                  required
                  defaultValue={suggested}
                  hint={t('auction.maxHint', { min: auction.minimumBid, max: auction.buyoutPrice ?? auction.maximumBid })}
                />
                <Button type="submit" variant="primary" size="large" icon={<Gavel aria-hidden />}>
                  {auction.viewer === 'leading' ? t('auction.raise') : t('auction.bid')}
                </Button>
              </form>
              {/* The buyout price stays in the facts above; the button only when affordable */}
              {auction.buyoutPrice !== null && auction.buyoutPrice <= spendable && (
                <form action={bidAction}>
                  <input type="hidden" name="collection" value={collection.slug} />
                  <input type="hidden" name="auction" value={auction.id} />
                  <input type="hidden" name="key" value={randomUUID()} />
                  <input type="hidden" name="max" value={auction.buyoutPrice} />
                  <Button type="submit" icon={<ShoppingBag aria-hidden />}>
                    {t('auction.buyNow', { count: auction.buyoutPrice })}
                  </Button>
                </form>
              )}
              <p className={styles.muted}>{t('auction.available', { count: spendable })}</p>
              <p className={styles.muted}>
                {t('auction.howItWorks', { minutes: rules.auctionExtensionMinutes })}
              </p>
            </div>
          )}

          {active && auction.viewer === 'seller' &&
            (auction.bidCount === 0 ? (
              <form action={cancelAuctionAction} className={styles.stack}>
                <input type="hidden" name="collection" value={collection.slug} />
                <input type="hidden" name="auction" value={auction.id} />
                <p className={styles.muted}>{t('auction.cancelHint')}</p>
                <div className={styles.actions}>
                  <Button type="submit" variant="danger">
                    {t('auction.cancel')}
                  </Button>
                </div>
              </form>
            ) : (
              <p className={styles.muted}>{t('auction.sellerHasBids', { percent: rules.auctionFeePercent })}</p>
            ))}
        </section>
      </div>
    </main>
  );
}
