import { Check, Coins, Gavel, Heart } from 'lucide-react';
import type { Metadata } from 'next';
import Form from 'next/form';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { displayName } from '@/components/card/card-format';
import { AuctionTile } from '@/components/market/AuctionTile';
import { RarityDot } from '@/components/rarity/Rarity';
import { Button, ButtonLink } from '@/components/ui/Button';
import { MoreInfo } from '@/components/ui/MoreInfo';
import { Notice } from '@/components/ui/Notice';
import { db } from '@/db';
import { coinBalance } from '@/lib/game/coins';
import { getSeries, seriesProgress } from '@/lib/game/collection';
import { heldCoins } from '@/lib/game/holds';
import { listMarket, MARKET_MAX_PAGES, MARKET_PAGE_SIZE, MARKET_SORTS, marketCard } from '@/lib/game/market';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection, getMarketRules } from '@/lib/game/rules';
import { RARITIES } from '@/lib/rarity';
import { requireSession } from '@/lib/session';
import { type MarketParams, parseMarketParams } from '../filters';
import styles from '../game.module.css';
import { AutoSubmitSelect, FocusBroughtCards, LoadMore } from '../GridControls';
import { auctionTileProps } from './auction-tile';
import { MarketNotice } from './MarketNotice';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Market');
  return { title: t('title') };
}

// The first auction of each page carries an id: "Voir plus" gives it the focus
const LIST_ID = 'auctions';
const pageStart = (index: number) => `${LIST_ID}-${index}`;

/**
 * The collection's running auctions, with filters (rarity, series, the cards
 * the player lacks or wishes for, one card) and a sort, which apply at once,
 * then "Voir plus". Links keep them in the address, so every view works
 * without JavaScript.
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
    wished: filters.wished,
    cardId: card?.id ?? null,
    sort: filters.sort,
    pages: filters.page,
    now,
  });
  const tiles = await auctionTileProps(market.auctions, collection.slug, {
    publicDomain: tCard('publicDomain'),
    unknownLicense: tCard('unknownLicense'),
    formerPlayer: t('formerPlayer'),
  });
  const shown = tiles.length;
  const more = shown < market.total && filters.page < MARKET_MAX_PAGES;

  const link = (changes: Partial<MarketParams>) => {
    const next = { ...filters, page: 1, ...changes };
    const search = new URLSearchParams();
    if (next.rarity) search.set('rarity', next.rarity);
    if (series) search.set('series', series.slug);
    if (card && next.card) search.set('card', card.slug);
    if (next.missing) search.set('missing', '1');
    if (next.wished) search.set('wished', '1');
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
        </div>
        <MoreInfo summary={t('howItWorks')}>
          <p>{t('intro')}</p>
          <p>{t.rich('sellHint', { collection: (chunks) => <Link href={paths.collection}>{chunks}</Link> })}</p>
        </MoreInfo>
      </header>

      {!rules.auctionsEnabled && (
        <Notice>
          <p>{t('closed')}</p>
        </Notice>
      )}
      <MarketNotice params={query} />

      {/* The series and the sort apply once picked (AutoSubmitSelect); the button is for browsers without JavaScript */}
      <Form action={paths.market} className={styles.selectRow}>
        {card && <input type="hidden" name="card" value={card.slug} />}
        {filters.rarity && <input type="hidden" name="rarity" value={filters.rarity} />}
        {filters.missing && <input type="hidden" name="missing" value="1" />}
        {filters.wished && <input type="hidden" name="wished" value="1" />}
        <label htmlFor="series" className="sr-only">
          {tCollection('series')}
        </label>
        <AutoSubmitSelect
          key={`series-${series?.slug ?? ''}`}
          id="series"
          name="series"
          className={`input ${styles.pillSelect}`}
          defaultValue={series?.slug ?? ''}
        >
          <option value="">{tCollection('allSeries')}</option>
          {allSeries.map((option) => (
            <option key={option.slug} value={option.slug}>
              {option.name}
            </option>
          ))}
        </AutoSubmitSelect>
        <label htmlFor="sort" className="sr-only">
          {t('sort')}
        </label>
        <AutoSubmitSelect
          key={`sort-${filters.sort}`}
          id="sort"
          name="sort"
          className={`input ${styles.pillSelect}`}
          defaultValue={filters.sort}
        >
          {MARKET_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {t(`sorts.${sort}`)}
            </option>
          ))}
        </AutoSubmitSelect>
        <noscript>
          <Button type="submit">{tCollection('filter')}</Button>
        </noscript>
      </Form>

      <div className={styles.filterRow}>
        <nav className={styles.chips} aria-label={t('filtersLabel')}>
          <ul>
            <li>
              <Link
                href={link({ missing: !filters.missing })}
                className={styles.chip}
                aria-current={filters.missing ? 'true' : undefined}
              >
                {filters.missing && <Check aria-hidden />}
                {t('missingOnly')}
              </Link>
            </li>
            <li>
              <Link
                href={link({ wished: !filters.wished })}
                className={styles.chip}
                aria-current={filters.wished ? 'true' : undefined}
              >
                {filters.wished ? <Check aria-hidden /> : <Heart aria-hidden />}
                {t('wishedOnly')}
              </Link>
            </li>
            <li>
              <Link href={link({ rarity: null })} className={styles.chip} aria-current={filters.rarity ? undefined : 'page'}>
                {tCollection('anyRarity')}
              </Link>
            </li>
            {RARITIES.map((rarity) => (
              <li key={rarity}>
                <Link
                  href={link({ rarity })}
                  className={styles.chip}
                  aria-current={filters.rarity === rarity ? 'page' : undefined}
                >
                  <RarityDot rarity={rarity} />
                  {tRarity(rarity)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

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
        <ul id={LIST_ID} className={styles.grid}>
          {tiles.map((tile, index) => (
            <li key={tile.href} {...(index % MARKET_PAGE_SIZE === 0 ? { id: pageStart(index), tabIndex: -1 } : {})}>
              <AuctionTile {...tile} collection={collection} serverNow={now.toISOString()} />
            </li>
          ))}
        </ul>
      )}

      <FocusBroughtCards shown={shown} />
      {shown > 0 && shown < market.total && (
        <LoadMore
          href={more ? link({ page: filters.page + 1 }) : null}
          next={pageStart(shown)}
          label={tCollection('more')}
          status={t('shown', { shown, total: market.total })}
          hint={more ? null : tCollection('narrow')}
        />
      )}
    </main>
  );
}
