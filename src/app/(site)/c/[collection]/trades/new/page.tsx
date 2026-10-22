import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Notice } from '@/components/ui/Notice';
import { db } from '@/db';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection, getMarketRules } from '@/lib/game/rules';
import { tradeableCards } from '@/lib/game/trades';
import { getFriend } from '@/lib/social/friends';
import { requireSession } from '@/lib/session';
import styles from '../../game.module.css';
import { proposeTradeAction } from '../actions';
import { TradeNotice } from '../TradeNotice';
import { TradeComposer } from './TradeComposer';

type Props = PageProps<'/c/[collection]/trades/new'>;

const many = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value ? [value] : []);

/** The cards chosen before a refusal, "<card ID>x<copies>", back from the address. */
function selection(entries: string[]): Record<number, number> {
  const chosen: Record<number, number> = {};
  for (const entry of entries) {
    const match = /^(\d{1,9})x(\d{1,3})$/.exec(entry);
    if (match) chosen[Number(match[1])] = Number(match[2]);
  }
  return chosen;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Trades');
  return { title: t('title') };
}

/** Composing an offer to a friend: ?with=<pseudo>. */
export default async function NewTradePage({ params, searchParams }: Props) {
  const collection = await getActiveCollection((await params).collection);
  if (!collection) notFound();
  const paths = gamePath(collection.slug);
  const query = await searchParams;
  const pseudo = many(query.with)[0] ?? '';
  const { user } = await requireSession(paths.newTrade(pseudo));
  const friend = pseudo ? await getFriend(user.id, pseudo) : null;
  if (!friend) notFound();

  const now = new Date();
  const [t, rules, mine, theirs] = await Promise.all([
    getTranslations('Trades'),
    getMarketRules(db, collection.id),
    tradeableCards(user.id, collection.id, now),
    tradeableCards(friend.id, collection.id, now, user.id),
  ]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          <Link href={paths.trades}>{t('back')}</Link>
        </p>
        <h1>{t('compose.title', { pseudo: friend.pseudo })}</h1>
        <p className={styles.muted}>
          {t('compose.intro', { max: rules.tradeMaxCards, pseudo: friend.pseudo, hours: rules.tradeExpiryHours })}
        </p>
      </header>
      <TradeNotice params={query} />
      {rules.tradesEnabled ? (
        <TradeComposer
          action={proposeTradeAction}
          collection={collection.slug}
          pseudo={friend.pseudo}
          tradeKey={randomUUID()}
          mine={mine}
          theirs={theirs}
          max={rules.tradeMaxCards}
          initialGive={selection(many(query.give))}
          initialWant={selection(many(query.want))}
        />
      ) : (
        <Notice tone="info">
          <p>{(await getTranslations('Game'))('errors.tradesClosed')}</p>
        </Notice>
      )}
    </main>
  );
}
