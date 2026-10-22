import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { TradeSummary } from '@/components/trade/TradeSummary';
import { ButtonLink } from '@/components/ui/Button';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { listTrades, type TradeView } from '@/lib/game/trades';
import { requireSession } from '@/lib/session';
import styles from '../game.module.css';
import own from './page.module.css';
import { tradeChips, TradeStateTag } from './TradeState';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Trades');
  return { title: t('title') };
}

/** The player's trade offers in a collection: to answer, sent, and past. */
export default async function TradesPage({ params }: PageProps<'/c/[collection]/trades'>) {
  const collection = await getActiveCollection((await params).collection);
  if (!collection) notFound();
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.trades);
  const now = new Date();
  const [t, format, trades] = await Promise.all([
    getTranslations('Trades'),
    getFormatter(),
    listTrades(user.id, collection.id, now),
  ]);
  const date = (value: Date) => format.dateTime(value, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' });

  const summary = async (trade: TradeView) => {
    const other = trade.other ?? t('formerPlayer');
    const open = trade.state === 'pending';
    return (
      <li key={trade.id}>
        <TradeSummary
          title={trade.mine ? t('to', { pseudo: other }) : t('from', { pseudo: other })}
          state={<TradeStateTag state={trade.state} />}
          meta={
            open
              ? t('expiresOn', { date: date(trade.expiresAt) })
              : t('closedOn', { date: date(trade.respondedAt ?? trade.expiresAt) })
          }
          gives={await tradeChips(trade.gives, collection.slug)}
          gets={await tradeChips(trade.gets, collection.slug)}
          labels={{ youGive: t('youGive'), youGet: t('youGet') }}
        >
          <ButtonLink href={paths.trade(trade.id)} variant={open && !trade.mine ? 'primary' : 'secondary'}>
            {t('see')}
          </ButtonLink>
        </TradeSummary>
      </li>
    );
  };

  const section = async (id: string, title: string, list: TradeView[], empty: string) => (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {list.length === 0 ? (
        <p className={styles.muted}>{empty}</p>
      ) : (
        <ul className={own.offers}>
          {await Promise.all(list.map(summary))}
        </ul>
      )}
    </section>
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          <Link href={paths.home}>{collection.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <p className={styles.muted}>{t('intro')}</p>
        <p className={styles.muted}>
          {t.rich('newTrade', { friends: (chunks) => <Link href="/friends">{chunks}</Link> })}
        </p>
      </header>
      {await section('received-heading', t('receivedHeading'), trades.received, t('noneReceived'))}
      {await section('sent-heading', t('sentHeading'), trades.sent, t('noneSent'))}
      {await section('history-heading', t('historyHeading'), trades.history, t('noHistory'))}
    </main>
  );
}
