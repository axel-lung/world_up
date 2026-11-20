import { ArrowDownUp, ArrowLeftRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { RarityDot } from '@/components/rarity/Rarity';
import { SocialTabs } from '@/components/social/SocialTabs';
import { TradeSummary } from '@/components/trade/TradeSummary';
import { Button, ButtonLink } from '@/components/ui/Button';
import { MoreInfo } from '@/components/ui/MoreInfo';
import { Sheet } from '@/components/ui/Sheet';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { getTrade, listTrades, type TradeView } from '@/lib/game/trades';
import { requireSession } from '@/lib/session';
import phone from '../../../phone.module.css';
import styles from '../game.module.css';
import { answerTradeAction } from './actions';
import own from './page.module.css';
import { TradeNotice } from './TradeNotice';
import { tradeChips, TradeStateTag } from './TradeState';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Trades');
  return { title: t('title') };
}

/**
 * The player's trade offers in a collection: to answer, sent, and past. A
 * phone lists them like an inbox, and opens an offer in a sheet (?offer=12)
 * where it is answered.
 */
export default async function TradesPage({ params, searchParams }: PageProps<'/c/[collection]/trades'>) {
  const collection = await getActiveCollection((await params).collection);
  if (!collection) notFound();
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.trades);
  const now = new Date();
  const [t, tSocial, format, query, trades] = await Promise.all([
    getTranslations('Trades'),
    getTranslations('Social'),
    getFormatter(),
    searchParams,
    listTrades(user.id, collection.id, now),
  ]);
  const date = (value: Date) => format.dateTime(value, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' });
  const day = (value: Date) => format.dateTime(value, { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
  const all = [...trades.received, ...trades.sent, ...trades.history];

  // The offer the sheet shows: one of the lists', or an older one of the player's
  const offerId = typeof query.offer === 'string' && /^\d{1,9}$/.test(query.offer) ? Number(query.offer) : null;
  const offer = offerId ? (all.find((trade) => trade.id === offerId) ?? (await getTrade(user.id, collection.id, offerId, now))) : null;

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
    <section className={`${styles.section} wide-only`} aria-labelledby={id}>
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

  // A phone: an offer as a row, opening its sheet
  const count = (trade: TradeView) => ({
    give: trade.gives.reduce((sum, item) => sum + item.quantity, 0),
    get: trade.gets.reduce((sum, item) => sum + item.quantity, 0),
  });
  const headline = (trade: TradeView) => {
    const other = trade.other ?? t('formerPlayer');
    if (trade.state !== 'pending') return trade.mine ? t('to', { pseudo: other }) : t('from', { pseudo: other });
    return trade.mine ? t('headlineSent', { pseudo: other }) : t('headlineReceived', { pseudo: other });
  };
  const when = (trade: TradeView) =>
    trade.state === 'pending'
      ? t('expiresIn', { when: format.relativeTime(trade.expiresAt, now) })
      : t('closedOn', { date: day(trade.respondedAt ?? trade.expiresAt) });
  const initial = (trade: TradeView) => (trade.other ?? '?').charAt(0).toLocaleUpperCase('fr');
  const row = (trade: TradeView) => (
    <li key={trade.id}>
      <Link href={`${paths.trades}?offer=${trade.id}`} scroll={false} className={phone.row}>
        <span className={phone.avatar} aria-hidden="true">
          {initial(trade)}
          {trade.state === 'pending' && !trade.mine && <span className={own.waiting} />}
        </span>
        <span className={phone.rowText}>
          <span className={phone.rowTitle}>{headline(trade)}</span>
          <span className={phone.rowMeta}>
            {t('summary', count(trade))} · {when(trade)}
          </span>
        </span>
        <TradeStateTag state={trade.state} />
      </Link>
    </li>
  );
  const groups = [
    { id: 'answer', title: t('toAnswer'), list: trades.received },
    { id: 'waiting', title: t('waitingAnswer'), list: trades.sent },
    { id: 'history', title: t('history'), list: trades.history },
  ].filter((group) => group.list.length > 0);

  const answer = (trade: TradeView, value: 'accept' | 'decline' | 'cancel', label: string, variant: 'primary' | 'secondary') => (
    <form action={answerTradeAction}>
      <input type="hidden" name="collection" value={collection.slug} />
      <input type="hidden" name="trade" value={trade.id} />
      <input type="hidden" name="answer" value={value} />
      <input type="hidden" name="from" value="sheet" />
      <Button type="submit" variant={variant} size="large" block>
        {label}
      </Button>
    </form>
  );
  const sheetChips = async (trade: TradeView, side: 'gives' | 'gets') => (
    <ul className={own.chips} aria-label={side === 'gives' ? t('youGive') : t('youGet')}>
      {(await tradeChips(trade[side], collection.slug)).map((chip) => (
        <li key={chip.name} className={own.chip}>
          <RarityDot rarity={chip.rarity} />
          <Link href={chip.href!} className={own.chipName}>
            {chip.name}
          </Link>
          <span className="sr-only">({chip.rarityLabel})</span>
          <span className={own.chipCount}>{t('copies', { count: chip.quantity })}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <main className={`${styles.page} ${phone.page}`} data-tight>
      <header className={`${phone.head} phone-only`}>
        <h1>{tSocial('title')}</h1>
      </header>
      <SocialTabs current="trades" userId={user.id} collection={collection} />
      <header className={`${styles.header} wide-only`}>
        <p className={styles.eyebrow}>
          <Link href={paths.home}>{collection.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <p className={styles.muted}>
          {t.rich('newTrade', { friends: (chunks) => <Link href="/friends">{chunks}</Link> })}
        </p>
        <MoreInfo summary={t('howItWorks')}>
          <p>{t('intro')}</p>
        </MoreInfo>
      </header>
      {!offer && <TradeNotice params={query} />}
      {await section('received-heading', t('receivedHeading'), trades.received, t('noneReceived'))}
      {await section('sent-heading', t('sentHeading'), trades.sent, t('noneSent'))}
      {await section('history-heading', t('historyHeading'), trades.history, t('noHistory'))}

      <div className={`${own.inbox} phone-only`}>
        {groups.length === 0 && <p className={phone.muted}>{t('noneAtAll')}</p>}
        {groups.map((group) => (
          <section key={group.id} className={own.group} aria-labelledby={`group-${group.id}`}>
            <h2 id={`group-${group.id}`} className={phone.groupTitle}>
              {group.title}
            </h2>
            <ul className={phone.rows}>{group.list.map(row)}</ul>
          </section>
        ))}
        <p className={phone.muted}>
          {t.rich('newTradePhone', { friends: (chunks) => <Link href="/friends">{chunks}</Link> })}
        </p>
      </div>

      {offer && (
        <Sheet key={offer.id} title={t('offer')} closeHref={paths.trades}>
          <div className={own.sheetHead}>
            <span className={phone.avatar} data-size="large" aria-hidden="true">
              {initial(offer)}
            </span>
            <span className={phone.rowText}>
              <span className={phone.rowTitle}>{headline(offer)}</span>
              <span className={phone.rowMeta}>
                {t('summary', count(offer))} · {when(offer)}
              </span>
            </span>
            <TradeStateTag state={offer.state} />
          </div>
          <TradeNotice params={query} pseudo={offer.other} />
          <div className={own.sides}>
            <span className={own.sideLabel}>{t('youGive')}</span>
            {await sheetChips(offer, 'gives')}
            <span className={own.swap} aria-hidden="true">
              <ArrowDownUp />
            </span>
            <span className={own.sideLabel}>{t('youGet')}</span>
            {await sheetChips(offer, 'gets')}
          </div>
          {offer.state === 'pending' &&
            (offer.mine ? (
              answer(offer, 'cancel', t('cancel'), 'secondary')
            ) : (
              <>
                <p className={phone.muted}>{t('acceptHint')}</p>
                <div className={own.answers}>
                  {answer(offer, 'decline', t('decline'), 'secondary')}
                  {answer(offer, 'accept', t('acceptShort'), 'primary')}
                </div>
              </>
            ))}
          <Link href={paths.trade(offer.id)} className={own.sheetMore}>
            <ArrowLeftRight aria-hidden />
            {t('seeCards')}
          </Link>
        </Sheet>
      )}
    </main>
  );
}
