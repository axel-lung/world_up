import { inArray } from 'drizzle-orm';
import { ArrowLeftRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Card } from '@/components/card/Card';
import { Button } from '@/components/ui/Button';
import { db } from '@/db';
import { cards } from '@/db/schema';
import { cardColumns, printedSeries } from '@/lib/catalog/cards';
import { toCollectionCard } from '@/lib/game/collection';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { getTrade, type TradeItem } from '@/lib/game/trades';
import { requireSession } from '@/lib/session';
import styles from '../../game.module.css';
import { answerTradeAction } from '../actions';
import own from '../page.module.css';
import { TradeNotice } from '../TradeNotice';
import { TradeStateTag } from '../TradeState';

type Props = PageProps<'/c/[collection]/trades/[id]'>;

async function load(params: Props['params']) {
  const { collection: slug, id } = await params;
  const collection = await getActiveCollection(slug);
  const tradeId = /^\d{1,9}$/.test(id) ? Number(id) : null;
  return collection && tradeId ? { collection, tradeId } : null;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Trades');
  return { title: t('title') };
}

/** One offer, seen by one of its two players, with the answer it waits for. */
export default async function TradePage({ params, searchParams }: Props) {
  const found = await load(params);
  if (!found) notFound();
  const { collection, tradeId } = found;
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.trade(tradeId));
  const now = new Date();
  const trade = await getTrade(user.id, collection.id, tradeId, now);
  if (!trade) notFound();

  const [t, tCard, format, query] = await Promise.all([
    getTranslations('Trades'),
    getTranslations('Card'),
    getFormatter(),
    searchParams,
  ]);
  const date = (value: Date) => format.dateTime(value, { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
  const other = trade.other ?? t('formerPlayer');

  // The cards as the collection shows them, with the copies that change hands
  const items = [...trade.gives, ...trade.gets];
  const rows = items.length ? await db.select(cardColumns).from(cards).where(inArray(cards.id, items.map((item) => item.cardId))) : [];
  const byId = new Map(rows.filter((row) => row.photoImage).map((row) => [row.id, row]));
  const printed = await printedSeries([...byId.keys()]);
  const labels = { publicDomain: tCard('publicDomain'), unknownLicense: tCard('unknownLicense') };
  const grid = (list: TradeItem[]) => (
    <ul className={styles.grid}>
      {list.map((item) => {
        const row = byId.get(item.cardId);
        if (!row) return null;
        const card = toCollectionCard({ ...row, quantity: item.quantity }, printed.get(row.id) ?? null, collection.slug, labels);
        return (
          <li key={item.cardId}>
            <Card
              card={card.data}
              collection={collection}
              copies={item.quantity}
              href={card.href ?? undefined}
              sizes="(max-width: 520px) calc(50vw - 20px), 200px"
            />
          </li>
        );
      })}
    </ul>
  );

  const answer = (value: 'accept' | 'decline' | 'cancel', label: string, variant: 'primary' | 'ghost' | 'danger') => (
    <form action={answerTradeAction}>
      <input type="hidden" name="collection" value={collection.slug} />
      <input type="hidden" name="trade" value={trade.id} />
      <input type="hidden" name="answer" value={value} />
      <Button type="submit" variant={variant} size={value === 'accept' ? 'large' : 'medium'} icon={value === 'accept' ? <ArrowLeftRight aria-hidden /> : undefined}>
        {label}
      </Button>
    </form>
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          <Link href={paths.trades}>{t('back')}</Link>
        </p>
        <h1>{trade.mine ? t('to', { pseudo: other }) : t('from', { pseudo: other })}</h1>
        <div className={styles.actions}>
          <TradeStateTag state={trade.state} />
          <span className={styles.muted}>
            {trade.state === 'pending'
              ? `${t('sentOn', { date: date(trade.createdAt) })} · ${t('expiresOn', { date: date(trade.expiresAt) })}`
              : t('closedOn', { date: date(trade.respondedAt ?? trade.expiresAt) })}
          </span>
        </div>
      </header>

      <TradeNotice params={query} pseudo={trade.other} />

      <div className={own.sides}>
        <section className={styles.section} aria-labelledby="gives-heading">
          <h2 id="gives-heading">{t('youGive')}</h2>
          {grid(trade.gives)}
        </section>
        <section className={styles.section} aria-labelledby="gets-heading">
          <h2 id="gets-heading">{t('youGet')}</h2>
          {grid(trade.gets)}
        </section>
      </div>

      {trade.state === 'pending' &&
        (trade.mine ? (
          <div className={own.answer}>{answer('cancel', t('cancel'), 'danger')}</div>
        ) : (
          <div className={styles.stack}>
            <p className={styles.muted}>{t('acceptHint')}</p>
            <div className={own.answer}>
              {answer('accept', t('accept'), 'primary')}
              {answer('decline', t('decline'), 'ghost')}
            </div>
          </div>
        ))}
    </main>
  );
}
