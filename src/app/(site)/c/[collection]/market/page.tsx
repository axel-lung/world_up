import { Coins, Gavel } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { displayName } from '@/components/card/card-format';
import { AuctionTile } from '@/components/market/AuctionTile';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Notice } from '@/components/ui/Notice';
import { db } from '@/db';
import { coinBalance } from '@/lib/game/coins';
import { getSeries, seriesProgress } from '@/lib/game/collection';
import { heldCoins } from '@/lib/game/holds';
import { listMarket, MARKET_PAGE_SIZE, MARKET_SORTS, marketCard } from '@/lib/game/market';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection, getMarketRules } from '@/lib/game/rules';
import { RARITIES } from '@/lib/rarity';
import { requireSession } from '@/lib/session';
import { type MarketParams, parseMarketParams } from '../filters';
import styles from '../game.module.css';
import { auctionTileProps } from './auction-tile';
import { MarketNotice } from './MarketNotice';
import own from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Market');
  return { title: t('title') };
}

/**
 * The collection's running auctions, with filters (rarity, series, the cards
 * the player lacks, one card) and a sort. Links keep them in the address, so
 * every view works without JavaScript.
 */
export default async function MarketPage({ params, searchParams }: PageProps<'/c/[collection]/market'>) {
  const collection = await getActiveCollection((await params).collection);
  if (!collection) notFound();
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.market);
  const query = await searchParams;
  const filters = parseMarketParams(query);
  const now = new Date();

  const [t, tCollection, tRarity, tCard, allSeries, series, card, rules, balance, held] = await Promise.all([
    getTranslations('Market'),
    getTranslations('Collection'),
    getTranslations('Rarity'),
    getTranslations('Card'),
    seriesProgress(user.id, collection.id),
    filters.series ? getSeries(collection.id, filters.series) : null,
    filters.card ? marketCard(collection.id, filters.card) : null,
    getMarketRules(db, collection.id),
    coinBalance(db, user.id),
    heldCoins(db, user.id),
  ]);
  const market = await listMarket({
    collectionId: collection.id,
    viewerId: user.id,
    rarity: filters.rarity,
    seriesId: series?.id ?? null,
    missing: filters.missing,
    cardId: card?.id ?? null,
    sort: filters.sort,
    page: filters.page,
    now,
  });
  const tiles = await auctionTileProps(market.auctions, collection.slug, {
    publicDomain: tCard('publicDomain'),
    unknownLicense: tCard('unknownLicense'),
    formerPlayer: t('formerPlayer'),
  });
  const pages = Math.max(1, Math.ceil(market.total / MARKET_PAGE_SIZE));

  const link = (changes: Partial<MarketParams>) => {
    const next = { ...filters, page: 1, ...changes };
    const search = new URLSearchParams();
    if (next.rarity) search.set('rarity', next.rarity);
    if (series) search.set('series', series.slug);
    if (card && next.card) search.set('card', card.slug);
    if (next.missing) search.set('missing', '1');
    if (next.sort !== MARKET_SORTS[0]) search.set('sort', next.sort);
    if (next.page > 1) search.set('page', String(next.page));
    const value = search.toString();
    return value ? `${paths.market}?${value}` : paths.market;
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          <Link href={paths.home}>{collection.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <p className={styles.muted}>{t('intro')}</p>
        <p className={styles.balance}>
          <Coins aria-hidden />
          <span>
            {t.rich('balance', { count: balance, strong: (chunks) => <strong>{chunks}</strong> })}
            {held > 0 && <span className={styles.muted}>{t('held', { count: held })}</span>}
          </span>
        </p>
        <div className={styles.actions}>
          <ButtonLink href={paths.myAuctions} icon={<Gavel aria-hidden />}>
            {t('mine.title')}
          </ButtonLink>
          <span className={styles.muted}>
            {t.rich('sellHint', { collection: (chunks) => <Link href={paths.collection}>{chunks}</Link> })}
          </span>
        </div>
      </header>

      {!rules.auctionsEnabled && (
        <Notice>
          <p>{t('closed')}</p>
        </Notice>
      )}
      <MarketNotice params={query} />

      <form method="get" action={paths.market} className={styles.filters}>
        {card && <input type="hidden" name="card" value={card.slug} />}
        <div className="field">
          <label htmlFor="rarity">{tCollection('rarity')}</label>
          <select id="rarity" name="rarity" className="input" defaultValue={filters.rarity ?? ''}>
            <option value="">{tCollection('allRarities')}</option>
            {RARITIES.map((rarity) => (
              <option key={rarity} value={rarity}>
                {tRarity(rarity)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="series">{tCollection('series')}</label>
          <select id="series" name="series" className="input" defaultValue={series?.slug ?? ''}>
            <option value="">{tCollection('allSeries')}</option>
            {allSeries.map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sort">{t('sort')}</label>
          <select id="sort" name="sort" className="input" defaultValue={filters.sort}>
            {MARKET_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {t(`sorts.${sort}`)}
              </option>
            ))}
          </select>
        </div>
        <Checkbox name="missing" value="1" defaultChecked={filters.missing} className={own.missing}>
          {t('missingOnly')}
        </Checkbox>
        <Button type="submit">{tCollection('filter')}</Button>
      </form>

      {card && (
        <p className={styles.actions}>
          <span>{t('cardFilter', { name: displayName(card.name) })}</span>
          <Link href={link({ card: null })}>{t('allCards')}</Link>
        </p>
      )}
      <p className={styles.muted} role="status">
        {t('count', { count: market.total })}
      </p>

      {tiles.length === 0 ? (
        <p className={styles.empty}>{t('empty')}</p>
      ) : (
        <ul className={styles.grid}>
          {tiles.map((tile) => (
            <li key={tile.href}>
              <AuctionTile {...tile} collection={collection} serverNow={now.toISOString()} />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className={styles.pagination} aria-label={tCollection('pagination')}>
          {filters.page > 1 && <Link href={link({ page: filters.page - 1 })}>{tCollection('previous')}</Link>}
          <span>{tCollection('page', { page: filters.page, pages })}</span>
          {filters.page < pages && <Link href={link({ page: filters.page + 1 })}>{tCollection('next')}</Link>}
        </nav>
      )}
    </main>
  );
}
