import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuctionTile } from '@/components/market/AuctionTile';
import { db } from '@/db';
import { settleOver } from '@/lib/game/auctions';
import { listMyAuctions } from '@/lib/game/market';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { requireSession } from '@/lib/session';
import styles from '../../game.module.css';
import { auctionTileProps } from '../auction-tile';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Market.mine');
  return { title: t('title') };
}

/** The player's sales and bids: running, then finished. */
export default async function MyAuctionsPage({ params }: PageProps<'/c/[collection]/market/mine'>) {
  const collection = await getActiveCollection((await params).collection);
  if (!collection) notFound();
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.myAuctions);
  const now = new Date();
  let mine = await listMyAuctions(user.id, collection.id, now);
  // Those over but not settled yet: settle them now rather than wait for the worker
  if (await settleOver(db, [...mine.selling, ...mine.bidding], now)) mine = await listMyAuctions(user.id, collection.id, now);

  const [t, tMarket, tCard] = await Promise.all([
    getTranslations('Market.mine'),
    getTranslations('Market'),
    getTranslations('Card'),
  ]);
  const labels = {
    publicDomain: tCard('publicDomain'),
    unknownLicense: tCard('unknownLicense'),
    formerPlayer: tMarket('formerPlayer'),
  };

  const section = async (id: string, title: string, list: typeof mine.selling, empty: string) => {
    const tiles = await auctionTileProps(list, collection.slug, labels);
    return (
      <section className={styles.section} aria-labelledby={id}>
        <h2 id={id}>{title}</h2>
        {tiles.length === 0 ? (
          <p className={styles.muted}>{empty}</p>
        ) : (
          <ul className={styles.grid}>
            {tiles.map((tile) => (
              <li key={tile.href}>
                <AuctionTile {...tile} collection={collection} serverNow={now.toISOString()} />
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          <Link href={paths.market}>{tMarket('title')}</Link>
        </p>
        <h1>{t('title')}</h1>
        <p className={styles.muted}>
          {t.rich('intro', { collection: (chunks) => <Link href={paths.collection}>{chunks}</Link> })}
        </p>
      </header>
      {await section('selling-heading', t('selling'), mine.selling, t('noneSelling'))}
      {await section('bidding-heading', t('bidding'), mine.bidding, t('noneBidding'))}
      {await section('history-heading', t('history'), mine.history, t('noHistory'))}
    </main>
  );
}
