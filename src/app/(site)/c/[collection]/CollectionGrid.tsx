import { randomUUID } from 'node:crypto';
import { Coins } from 'lucide-react';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Card } from '@/components/card/Card';
import { Button } from '@/components/ui/Button';
import type { Emblem } from '@/lib/collection-theme';
import { duplicatesValue } from '@/lib/game/coins';
import {
  COLLECTION_PAGE_SIZE,
  COLLECTION_TABS,
  type CollectionTab,
  collectionCounts,
  listCollectionCards,
  toCollectionCards,
} from '@/lib/game/collection';
import { RARITIES, type Rarity } from '@/lib/rarity';
import { resellAction } from './collection/actions';
import styles from './game.module.css';

export interface GridFilters {
  tab: CollectionTab;
  rarity: Rarity | null;
  page: number;
}

export interface GridLabels {
  tabs: Partial<Record<CollectionTab, string>>;
  empty: Partial<Record<CollectionTab, string>>;
}

/**
 * The collection's tabs, filters and card grid, for the collection page, a
 * series page and a friend's collection. Links keep the filters in the
 * address, so every view can be bookmarked and works without JavaScript.
 */
export async function CollectionGrid({
  collection,
  userId,
  viewerId,
  tabs = COLLECTION_TABS,
  labels,
  filters,
  path,
  series,
  seriesOptions,
}: {
  collection: { id: number; slug: string; name: string; emblem: Emblem };
  /** Whose cards: the player's own, or a friend's. */
  userId: string;
  /** On a friend's collection, the player looking at it: no resale, a "you lack" tab. */
  viewerId?: string;
  /** The tabs shown, the first one being the default. */
  tabs?: readonly CollectionTab[];
  /** Tab names and empty-tab texts, when they aren't the player's own collection's. */
  labels?: GridLabels;
  filters: GridFilters;
  /** The page's address, without its query. */
  path: string;
  /** The series the grid is limited to (series page, or the collection's series filter). */
  series: { id: number; slug: string } | null;
  /** The collection page's series filter. */
  seriesOptions?: { slug: string; name: string }[];
}) {
  const query = { userId, viewerId, collectionId: collection.id, rarity: filters.rarity, seriesId: series?.id ?? null };
  const [t, tRarity, tCard, format, counts, rows] = await Promise.all([
    getTranslations('Collection'),
    getTranslations('Rarity'),
    getTranslations('Card'),
    getFormatter(),
    collectionCounts(query),
    listCollectionCards({ ...query, tab: filters.tab, page: filters.page }),
  ]);
  const cards = await toCollectionCards(rows, collection.slug, {
    publicDomain: tCard('publicDomain'),
    unknownLicense: tCard('unknownLicense'),
  });
  const text: GridLabels = labels ?? {
    tabs: Object.fromEntries(COLLECTION_TABS.map((tab) => [tab, t(`tabs.${tab}`)])),
    empty: Object.fromEntries(COLLECTION_TABS.map((tab) => [tab, t(`empty.${tab}`)])),
  };
  const resale = !viewerId && filters.tab === 'duplicates' && !filters.rarity && !series;
  const duplicates = resale ? await duplicatesValue(userId, collection.id, new Date()) : null;
  const total = counts[filters.tab];
  const pages = Math.max(1, Math.ceil(total / COLLECTION_PAGE_SIZE));

  const link = (changes: Partial<GridFilters>) => {
    const next = { ...filters, page: 1, ...changes };
    const params = new URLSearchParams();
    if (next.tab !== tabs[0]) params.set('tab', next.tab);
    if (next.rarity) params.set('rarity', next.rarity);
    if (seriesOptions && series) params.set('series', series.slug);
    if (next.page > 1) params.set('page', String(next.page));
    const search = params.toString();
    return search ? `${path}?${search}` : path;
  };

  return (
    <>
      <form method="get" action={path} className={styles.filters}>
        {filters.tab !== tabs[0] && <input type="hidden" name="tab" value={filters.tab} />}
        <div className="field">
          <label htmlFor="rarity">{t('rarity')}</label>
          <select id="rarity" name="rarity" className="input" defaultValue={filters.rarity ?? ''}>
            <option value="">{t('allRarities')}</option>
            {RARITIES.map((rarity) => (
              <option key={rarity} value={rarity}>
                {tRarity(rarity)}
              </option>
            ))}
          </select>
        </div>
        {seriesOptions && (
          <div className="field">
            <label htmlFor="series">{t('series')}</label>
            <select id="series" name="series" className="input" defaultValue={series?.slug ?? ''}>
              <option value="">{t('allSeries')}</option>
              {seriesOptions.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit">{t('filter')}</Button>
      </form>

      <nav className={styles.tabs} aria-label={t('tabsLabel')}>
        <ul>
          {tabs.map((tab) => (
            <li key={tab}>
              <Link href={link({ tab })} className={styles.tab} aria-current={tab === filters.tab ? 'page' : undefined}>
                {text.tabs[tab]}
                <span className={styles.tabCount}>{format.number(counts[tab])}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {duplicates && duplicates.copies > 0 && (
        <form action={resellAction} className={styles.actions}>
          <input type="hidden" name="collection" value={collection.slug} />
          {/* A new key each time the page renders: sending the form twice sells once */}
          <input type="hidden" name="key" value={randomUUID()} />
          <input type="hidden" name="back" value={link({})} />
          <Button type="submit" variant="primary" icon={<Coins aria-hidden />}>
            {t('resellAll', { copies: duplicates.copies, coins: duplicates.coins })}
          </Button>
          <span className={styles.muted}>{t('resellHint')}</span>
        </form>
      )}

      {cards.length === 0 ? (
        <p className={styles.empty}>{text.empty[filters.tab]}</p>
      ) : (
        <ul className={styles.grid}>
          {cards.map((card) => (
            <li key={card.id}>
              <Card
                card={card.data}
                collection={collection}
                state={card.state}
                copies={card.copies}
                href={card.href ?? undefined}
                sizes="(max-width: 520px) calc(50vw - 20px), 200px"
              />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className={styles.pagination} aria-label={t('pagination')}>
          {filters.page > 1 && <Link href={link({ page: filters.page - 1 })}>{t('previous')}</Link>}
          <span>{t('page', { page: filters.page, pages })}</span>
          {filters.page < pages && <Link href={link({ page: filters.page + 1 })}>{t('next')}</Link>}
        </nav>
      )}
    </>
  );
}
