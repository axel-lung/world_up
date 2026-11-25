import { randomUUID } from 'node:crypto';
import { Check, Coins, MapPin, PackageOpen, SlidersHorizontal, X } from 'lucide-react';
import Form from 'next/form';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Card } from '@/components/card/Card';
import { CardRow } from '@/components/card/CardRow';
import { RarityDot } from '@/components/rarity/Rarity';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { WishButton } from '@/components/wishlist/WishButton';
import type { Emblem } from '@/lib/collection-theme';
import { collectionView } from '@/lib/collection-view';
import { duplicatesValue } from '@/lib/game/coins';
import {
  COLLECTION_MAX_PAGES,
  COLLECTION_PAGE_SIZE,
  COLLECTION_TABS,
  type CollectionTab,
  collectionCounts,
  listCollectionCards,
  ownedByRarity,
  toCollectionCards,
} from '@/lib/game/collection';
import { gamePath } from '@/lib/game/paths';
import { departmentName } from '@/lib/map/departments';
import { RARITIES, type Rarity } from '@/lib/rarity';
import phone from '../../phone.module.css';
import { resellAction } from './collection/actions';
import styles from './game.module.css';
import { AutoSubmitSelect, FocusBroughtCards, LoadMore, ViewSwitch } from './GridControls';

export interface GridFilters {
  tab: CollectionTab;
  rarity: Rarity | null;
  /** A department's cards, by its code (the map's "Voir les cartes"). */
  department: string | null;
  /** How many pages are shown, from the first. */
  page: number;
}

export interface GridLabels {
  tabs: Partial<Record<CollectionTab, string>>;
  empty: Partial<Record<CollectionTab, string>>;
}

// The first card of each page carries an id: "Voir plus" gives it the focus
const LIST_ID = 'cards';
const pageStart = (index: number) => `${LIST_ID}-${index}`;

interface FilterOption {
  key: string;
  href: string;
  label: string;
  count?: string;
  rarity?: Rarity;
  current: boolean;
}

/**
 * The collection's tabs, filters and cards, for the collection page, a series
 * page and a friend's collection: the tabs, the rarity chips and the series
 * list (which apply at once), the cards as a grid or a denser list (the
 * player's choice, ViewSwitch), then "Voir plus". Links keep the filters in
 * the address, so every view can be bookmarked and works without JavaScript.
 * A phone gets the tabs as chips that scroll sideways, and the rarity and the
 * series in a "Filtres" sheet (App Vitrail - Collection.dc.html), and on the
 * player's own collection a banner offering to resell their duplicates. A
 * card the player looking lacks wears the wishlist's heart.
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
  const query = {
    userId,
    viewerId,
    collectionId: collection.id,
    rarity: filters.rarity,
    seriesId: series?.id ?? null,
    departmentCode: filters.department,
  };
  const [t, tRarity, tCard, tGame, format, counts, rows, byRarity, cookieStore] = await Promise.all([
    getTranslations('Collection'),
    getTranslations('Rarity'),
    getTranslations('Card'),
    getTranslations('Game'),
    getFormatter(),
    collectionCounts(query),
    listCollectionCards({ ...query, tab: filters.tab, pages: filters.page }),
    ownedByRarity(query),
    cookies(),
  ]);
  const cards = await toCollectionCards(rows, collection.slug, {
    publicDomain: tCard('publicDomain'),
    unknownLicense: tCard('unknownLicense'),
  });
  const text: GridLabels = labels ?? {
    tabs: Object.fromEntries(COLLECTION_TABS.map((tab) => [tab, t(`tabs.${tab}`)])),
    empty: Object.fromEntries(COLLECTION_TABS.map((tab) => [tab, t(`empty.${tab}`)])),
  };
  const view = collectionView(cookieStore);
  const resale = !viewerId && filters.tab === 'duplicates' && !filters.rarity && !series;
  // The phone's banner: the player's own collection page (the series page has no series list)
  const banner = !viewerId && Boolean(seriesOptions);
  const duplicates = resale || banner ? await duplicatesValue(userId, collection.id, new Date()) : null;
  const total = counts[filters.tab];
  const shown = cards.length;
  const more = shown < total && filters.page < COLLECTION_MAX_PAGES;
  const seriesFiltered = Boolean(seriesOptions && series);
  const filtered = filters.tab !== tabs[0] || Boolean(filters.rarity) || seriesFiltered || Boolean(filters.department);

  const link = (changes: Partial<GridFilters> & { series?: string | null }) => {
    const next = { ...filters, page: 1, ...changes };
    const seriesSlug = changes.series === undefined ? (series?.slug ?? null) : changes.series;
    const params = new URLSearchParams();
    if (next.tab !== tabs[0]) params.set('tab', next.tab);
    if (next.rarity) params.set('rarity', next.rarity);
    if (seriesOptions && seriesSlug) params.set('series', seriesSlug);
    if (next.department) params.set('dept', next.department);
    if (next.page > 1) params.set('page', String(next.page));
    const search = params.toString();
    return search ? `${path}?${search}` : path;
  };
  // The player's own cards lead to their pages with this list in the address:
  // the card's page goes from card to card of it, and back to it
  const list = link({ page: filters.page });
  const cardHref = (href: string | null) => (href && !viewerId ? `${href}?from=${encodeURIComponent(list)}` : (href ?? undefined));
  // The wishlist's heart, on the cards the player looking lacks
  const wishButton = (card: (typeof cards)[number]) =>
    card.wish === null ? undefined : (
      <WishButton collection={collection.slug} cardId={card.id} name={card.data.name} wished={card.wish} />
    );

  // A sheet's list of choices: a tap applies one and closes the sheet
  const choices = (options: FilterOption[]) => (
    <ul className={styles.choices}>
      {options.map((option) => (
        <li key={option.key}>
          <Link href={option.href} replace className={styles.choice} aria-current={option.current ? 'page' : undefined}>
            {option.rarity && <RarityDot rarity={option.rarity} />}
            <span className={styles.choiceLabel}>{option.label}</span>
            {option.count && <span className={styles.choiceCount}>{option.count}</span>}
            <span className={styles.choiceMark} aria-hidden="true">
              {option.current && <Check />}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
  const chosenSeries = seriesOptions?.find((option) => option.slug === series?.slug);
  const chosen = [filters.rarity && tRarity(filters.rarity), chosenSeries?.name].filter(Boolean).join(', ');
  // The tabs whose count is worth a sticker: what to resell, what was visited
  const counted = new Set<CollectionTab>(['duplicates', 'visited']);
  const phoneFilters = (
    <div className={`${styles.phoneFilters} phone-only`}>
      <nav className={styles.chipStrip} aria-label={t('tabsLabel')}>
        <ul>
          {tabs.map((tab) => (
            <li key={tab}>
              <Link href={link({ tab })} className={styles.chip} aria-current={tab === filters.tab ? 'page' : undefined}>
                {text.tabs[tab]}
                {counted.has(tab) && counts[tab] > 0 && <span className={styles.chipCount}>{format.number(counts[tab])}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Sheet
        title={t('filters')}
        trigger={{
          className: styles.filterButton,
          // Once a rarity or a series is chosen, the button names them
          label: chosen ? `${t('filters')} : ${chosen}` : t('filters'),
          content: (
            <>
              <SlidersHorizontal aria-hidden />
              {chosen && <span className={styles.filterDot} aria-hidden="true" />}
            </>
          ),
        }}
      >
        <h3 className={phone.groupTitle}>{t('rarity')}</h3>
        {choices([
          { key: 'all', href: link({ rarity: null }), label: t('allRarities'), current: !filters.rarity },
          ...RARITIES.map((rarity) => ({
            key: rarity,
            href: link({ rarity }),
            label: tRarity(rarity),
            rarity,
            count: t('ownedCount', { count: byRarity[rarity] }),
            current: filters.rarity === rarity,
          })),
        ])}
        {seriesOptions && (
          <>
            <h3 className={phone.groupTitle}>{t('series')}</h3>
            {choices([
              { key: '', href: link({ series: null }), label: t('allSeries'), current: !series },
              ...seriesOptions.map((option) => ({
                key: option.slug,
                href: link({ series: option.slug }),
                label: option.name,
                current: option.slug === series?.slug,
              })),
            ])}
          </>
        )}
      </Sheet>
    </div>
  );

  return (
    <>
      <nav className={`${styles.tabs} wide-only`} aria-label={t('tabsLabel')}>
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

      <div className={`${styles.filterRow} wide-only`}>
        {seriesOptions && (
          // Applies once a series is picked (AutoSubmitSelect); the button is for browsers without JavaScript
          <Form action={path} className={styles.seriesFilter}>
            {filters.tab !== tabs[0] && <input type="hidden" name="tab" value={filters.tab} />}
            {filters.rarity && <input type="hidden" name="rarity" value={filters.rarity} />}
            {filters.department && <input type="hidden" name="dept" value={filters.department} />}
            <label htmlFor="series" className="sr-only">
              {t('series')}
            </label>
            {/* Keyed on the series shown: back in the history, the list shows the page's series again */}
            <AutoSubmitSelect
              key={series?.slug ?? ''}
              id="series"
              name="series"
              className={`input ${styles.pillSelect}`}
              defaultValue={series?.slug ?? ''}
            >
              <option value="">{t('allSeries')}</option>
              {seriesOptions.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.name}
                </option>
              ))}
            </AutoSubmitSelect>
            <noscript>
              <Button type="submit">{t('filter')}</Button>
            </noscript>
          </Form>
        )}
        <nav className={styles.chips} aria-label={t('rarity')}>
          <ul>
            <li>
              <Link href={link({ rarity: null })} className={styles.chip} aria-current={filters.rarity ? undefined : 'page'}>
                {t('anyRarity')}
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

      {phoneFilters}

      {banner && duplicates && duplicates.copies > 0 && (
        <div className={`${styles.resaleBanner} phone-only`}>
          <span className={styles.resaleIcon} aria-hidden="true">
            <Coins />
          </span>
          <span className={styles.resaleText}>
            <span className={styles.resaleTitle}>{tGame('todoDuplicates', { copies: duplicates.copies })}</span>
            <span className={styles.resaleMeta}>{tGame('todoDuplicatesFor', { coins: duplicates.coins })}</span>
          </span>
          <Sheet title={tGame('resellTitle')} closeOnSubmit trigger={{ className: styles.resaleButton, content: t('resell') }}>
            <form action={resellAction} className={styles.resaleForm}>
              <p>{tGame('resellAllQuestion', { copies: duplicates.copies, coins: duplicates.coins })}</p>
              <p className={phone.muted}>{tGame('resellHint')}</p>
              <input type="hidden" name="collection" value={collection.slug} />
              {/* A new key each time the page renders: sending the form twice sells once */}
              <input type="hidden" name="key" value={randomUUID()} />
              <input type="hidden" name="back" value={link({})} />
              <Button type="submit" variant="primary" size="large" block icon={<Coins aria-hidden />}>
                {tGame('resellAllSubmit', { copies: duplicates.copies })}
              </Button>
            </form>
          </Sheet>
        </div>
      )}

      {filters.department && (
        <p className={styles.department}>
          <MapPin aria-hidden />
          <span>{t('departmentFilter', { name: departmentName(filters.department) ?? filters.department })}</span>
          <Link
            href={link({ department: null })}
            className={styles.departmentClear}
            aria-label={t('departmentClear', { name: departmentName(filters.department) ?? filters.department })}
          >
            <X aria-hidden />
          </Link>
        </p>
      )}

      <div className={styles.resultsBar}>
        <p className={styles.resultsCount}>{t('count', { count: total })}</p>
        {filtered && (
          <Link href={path} className={`${phone.ghost} ${styles.clear} phone-only`}>
            {t('clear')}
          </Link>
        )}
        <ViewSwitch initial={view} labels={{ label: t('view.label'), grid: t('view.grid'), list: t('view.list') }} />
      </div>

      {resale && duplicates && duplicates.copies > 0 && (
        <form action={resellAction} className={`${styles.actions} ${banner ? 'wide-only' : ''}`}>
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
        <div className={styles.empty}>
          <p>{text.empty[filters.tab]}</p>
          {!viewerId && filters.tab === 'owned' && (
            <ButtonLink href={gamePath(collection.slug).open} variant="primary" icon={<PackageOpen aria-hidden />}>
              {t('openPack')}
            </ButtonLink>
          )}
        </div>
      ) : (
        <ul id={LIST_ID} className={view === 'list' ? styles.list : styles.grid}>
          {cards.map((card, index) => (
            <li
              key={card.id}
              {...(index % COLLECTION_PAGE_SIZE === 0 ? { id: pageStart(index), tabIndex: -1 } : {})}
            >
              {view === 'list' ? (
                <CardRow
                  card={card.data}
                  state={card.state}
                  copies={card.copies}
                  href={cardHref(card.href)}
                  emblem={collection.emblem}
                  action={wishButton(card)}
                  visitedAt={card.visitedAt}
                />
              ) : (
                <Card
                  card={card.data}
                  collection={collection}
                  state={card.state}
                  copies={card.copies}
                  href={cardHref(card.href)}
                  sizes="(max-width: 719px) calc(33vw - 16px), 200px"
                  action={wishButton(card)}
                  visitedAt={card.visitedAt}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <FocusBroughtCards shown={shown} />
      {shown > 0 && shown < total && (
        <LoadMore
          href={more ? link({ page: filters.page + 1 }) : null}
          next={pageStart(shown)}
          label={t('more')}
          status={t('shown', { shown, total })}
          hint={more ? null : t('narrow')}
        />
      )}
    </>
  );
}
