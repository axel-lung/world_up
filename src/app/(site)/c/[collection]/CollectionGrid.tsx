import { randomUUID } from 'node:crypto';
import { CoinsIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Card } from '@/components/card/Card';
import { Button } from '@/components/ui/Button';
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

/**
 * The collection's tabs, filters and card grid, for the collection page and a
 * series page. Links keep the filters in the address, so every view can be
 * bookmarked and works without JavaScript.
 */
export async function CollectionGrid({
  collection,
  userId,
  filters,
  path,
  series,
  seriesOptions,
}: {
  collection: { id: number; slug: string };
  userId: string;
  filters: GridFilters;
  /** The page's address, without its query. */
  path: string;
  /** The series the grid is limited to (series page, or the collection's series filter). */
  series: { id: number; slug: string } | null;
  /** The collection page's series filter. */
  seriesOptions?: { slug: string; name: string }[];
}) {
  const query = { userId, collectionId: collection.id, rarity: filters.rarity, seriesId: series?.id ?? null };
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
  const duplicates = filters.tab === 'duplicates' && !filters.rarity && !series ? await duplicatesValue(userId, collection.id) : null;
  const total = counts[filters.tab];
  const pages = Math.max(1, Math.ceil(total / COLLECTION_PAGE_SIZE));

  const link = (changes: Partial<GridFilters>) => {
    const next = { ...filters, page: 1, ...changes };
    const params = new URLSearchParams();
    if (next.tab !== 'all') params.set('tab', next.tab);
    if (next.rarity) params.set('rarity', next.rarity);
    if (seriesOptions && series) params.set('series', series.slug);
    if (next.page > 1) params.set('page', String(next.page));
    const search = params.toString();
    return search ? `${path}?${search}` : path;
  };

  return (
    <>
      <form method="get" action={path} className={styles.filters}>
        {filters.tab !== 'all' && <input type="hidden" name="tab" value={filters.tab} />}
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
          {COLLECTION_TABS.map((tab) => (
            <li key={tab}>
              <Link href={link({ tab })} className={styles.tab} aria-current={tab === filters.tab ? 'page' : undefined}>
                {t(`tabs.${tab}`)}
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
          <Button type="submit" variant="primary" icon={<CoinsIcon size={18} aria-hidden />}>
            {t('resellAll', { copies: duplicates.copies, coins: duplicates.coins })}
          </Button>
          <span className={styles.muted}>{t('resellHint')}</span>
        </form>
      )}

      {cards.length === 0 ? (
        <p className={styles.empty}>{t(`empty.${filters.tab}`)}</p>
      ) : (
        <ul className={styles.grid}>
          {cards.map((card) => (
            <li key={card.id}>
              <Card
                card={card.data}
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
