import type { Metadata } from 'next';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { displayName } from '@/components/card/card-format';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { db } from '@/db';
import { requireAdmin } from '@/lib/admin';
import { listMarketActivity } from '@/lib/game/admin';
import { findPlayer } from '@/lib/social/friends';
import { cancelAuctionAction } from './actions';
import styles from '../../admin.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin.market');
  return { title: t('title') };
}

const filtersSchema = z.object({ pseudo: z.string().trim().max(64).catch('') });

/** The latest auctions and trades, filtered by player: to spot accounts passing cards or coins on. */
export default async function AdminMarketPage({ searchParams }: PageProps<'/admin/market'>) {
  await requireAdmin();
  const params = await searchParams;
  const { pseudo } = filtersSchema.parse({ pseudo: (Array.isArray(params.pseudo) ? params.pseudo[0] : params.pseudo) ?? '' });
  const player = pseudo ? await findPlayer(db, pseudo) : null;
  const [t, tMarket, tTrades, format, activity] = await Promise.all([
    getTranslations('Admin.market'),
    getTranslations('Market'),
    getTranslations('Trades'),
    getFormatter(),
    // An unknown pseudo shows nothing rather than everything
    pseudo && !player ? { auctions: [], trades: [] } : listMarketActivity({ userId: player?.id }),
  ]);
  const date = (value: Date) => format.dateTime(value, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });
  // Players are set null once deleted
  const who = (name: string | null) => name ?? t('deletedPlayer');

  return (
    <main className={styles.stack}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <p className={styles.muted}>{t('intro')}</p>
      </header>

      <form method="get" action="/admin/market" className={styles.filters}>
        <TextField label={t('pseudo')} name="pseudo" defaultValue={pseudo} autoComplete="off" />
        <Button type="submit">{t('filter')}</Button>
        {pseudo && <Link href="/admin/market">{t('all')}</Link>}
      </form>
      {pseudo && !player && (
        <Notice>
          <p>{t('unknown')}</p>
        </Notice>
      )}

      <section className={styles.section} aria-labelledby="auctions-heading">
        <h2 id="auctions-heading">{t('auctionsHeading')}</h2>
        {activity.auctions.length === 0 ? (
          <p className={styles.muted}>{t('empty')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('when')}</th>
                  <th scope="col">{t('card')}</th>
                  <th scope="col">{t('seller')}</th>
                  <th scope="col">{t('leader')}</th>
                  <th scope="col">{t('price')}</th>
                  <th scope="col">{t('bids')}</th>
                  <th scope="col">{t('state')}</th>
                  <th scope="col">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {activity.auctions.map((auction) => (
                  <tr key={auction.id}>
                    <td>{date(auction.createdAt)}</td>
                    <td>
                      <Link href={`/admin/cards/${auction.cardId}`}>{displayName(auction.card)}</Link>
                    </td>
                    <td>{who(auction.seller)}</td>
                    <td>{auction.bidCount > 0 ? who(auction.leader) : t('nobody')}</td>
                    <td>{format.number(auction.price)}</td>
                    <td>{format.number(auction.bidCount)}</td>
                    <td>{tMarket(`states.${auction.state}`)}</td>
                    <td>
                      {auction.state === 'active' || auction.state === 'ended' ? (
                        <form action={cancelAuctionAction} className={styles.filters}>
                          <input type="hidden" name="auctionId" value={auction.id} />
                          <TextField label={t('note')} name="note" maxLength={500} />
                          <Button type="submit" variant="danger">
                            {t('cancel')}
                          </Button>
                        </form>
                      ) : (
                        t('nobody')
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="trades-heading">
        <h2 id="trades-heading">{t('tradesHeading')}</h2>
        {activity.trades.length === 0 ? (
          <p className={styles.muted}>{t('empty')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('when')}</th>
                  <th scope="col">{t('proposer')}</th>
                  <th scope="col">{t('gives')}</th>
                  <th scope="col">{t('recipient')}</th>
                  <th scope="col">{t('gets')}</th>
                  <th scope="col">{t('state')}</th>
                </tr>
              </thead>
              <tbody>
                {activity.trades.map((trade) => (
                  <tr key={trade.id}>
                    <td>{date(trade.createdAt)}</td>
                    <td>{who(trade.proposer)}</td>
                    <td>{trade.gives}</td>
                    <td>{who(trade.recipient)}</td>
                    <td>{trade.gets}</td>
                    <td>{tTrades(`states.${trade.state}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
