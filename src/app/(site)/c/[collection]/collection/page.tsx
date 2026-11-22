import { ChevronRight, Gavel, Heart } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { CSSProperties } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { Gauge } from '@/components/ui/Gauge';
import { db } from '@/db';
import { collectionCounts, getSeries, type SeriesProgress, seriesProgress } from '@/lib/game/collection';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { wishCount } from '@/lib/game/wishlist';
import { requireSession } from '@/lib/session';
import phone from '../../../phone.module.css';
import { CollectionGrid } from '../CollectionGrid';
import { parseGridParams, parseResaleParams } from '../filters';
import styles from '../game.module.css';
import { ResaleNotice } from '../ResaleNotice';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Collection');
  return { title: t('title') };
}

const SERIES_GROUPS: SeriesProgress['type'][] = ['region', 'family', 'unesco', 'endangered'];

/**
 * The player's cards, with the filters in the address. A phone chooses
 * between the cards ("Toutes les cartes") and the series, one row each with
 * its progress ("Par série", ?by=series), and reaches the market from here.
 * Both lead to the wishlist.
 */
export default async function CollectionPage({ params, searchParams }: PageProps<'/c/[collection]/collection'>) {
  const collection = await getActiveCollection((await params).collection);
  if (!collection) notFound();
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.collection);
  const query = await searchParams;
  const filters = parseGridParams(query);
  const bySeries = query.by === 'series';

  const [t, tGame, tWishlist, format, allSeries, counts, series, wishes] = await Promise.all([
    getTranslations('Collection'),
    getTranslations('Game'),
    getTranslations('Wishlist'),
    getFormatter(),
    seriesProgress(user.id, collection.id),
    collectionCounts({ userId: user.id, collectionId: collection.id }),
    filters.series ? getSeries(collection.id, filters.series) : null,
    wishCount(db, user.id, collection.id),
  ]);
  const number = (value: number) => format.number(value);

  const seriesRow = (s: SeriesProgress) => {
    const part = s.total ? s.owned / s.total : 0;
    const style = {
      '--ring-fill': `${s.owned > 0 ? Math.max(10, Math.round(part * 360)) : 0}deg`,
      '--ring-color': s.type === 'unesco' ? 'var(--color-sage)' : undefined,
    } as CSSProperties;
    return (
      <li key={s.id}>
        <Link href={`${paths.collection}?series=${s.slug}`} className={phone.row}>
          <span className={phone.ring} data-size="large" style={style} aria-hidden="true">
            <span>{format.number(s.owned > 0 ? Math.max(0.01, part) : 0, { style: 'percent', maximumFractionDigits: 0 })}</span>
          </span>
          <span className={phone.rowText}>
            <span className={phone.rowTitle}>{s.name}</span>
            <span className={phone.rowMeta}>{t('seriesCards', { owned: number(s.owned), total: number(s.total) })}</span>
          </span>
          <ChevronRight aria-hidden className={phone.chevron} />
        </Link>
      </li>
    );
  };

  return (
    <main className={`${styles.page} ${phone.page}`} data-tight>
      <header className={`${phone.head} phone-only`}>
        <h1>{t('heading')}</h1>
        <span className={phone.headAside}>
          {number(counts.owned)} / {number(counts.all)}
        </span>
        <Link href={paths.market} className={phone.ghost}>
          <Gavel aria-hidden />
          {t('market')}
        </Link>
      </header>
      <header className={`${styles.header} wide-only`}>
        <p className={styles.eyebrow}>
          <Link href={paths.home}>{collection.name}</Link>
        </p>
        <h1>{t('title')}</h1>
      </header>
      <div className={`${styles.actions} wide-only`}>
        <ButtonLink href={paths.wishlist} icon={<Heart aria-hidden />}>
          {tWishlist('link', { count: wishes })}
        </ButtonLink>
      </div>
      <div className="wide-only">
        <Gauge
          label={t('progress')}
          value={counts.all ? counts.owned / counts.all : 0}
          valueText={`${number(counts.owned)} / ${number(counts.all)} · ${format.number(
            counts.all ? counts.owned / counts.all : 0,
            { style: 'percent', maximumFractionDigits: 1 },
          )}`}
        />
      </div>

      <nav className="phone-only" aria-label={t('show')}>
        <ul className={phone.switch}>
          <li>
            <Link href={`${paths.collection}?by=series`} className={phone.switchOption} aria-current={bySeries ? 'page' : undefined}>
              {t('bySeries')}
            </Link>
          </li>
          <li>
            <Link href={paths.collection} className={phone.switchOption} aria-current={bySeries ? undefined : 'page'}>
              {t('allCards')}
            </Link>
          </li>
        </ul>
      </nav>

      <ul className={`${phone.rows} phone-only`}>
        <li>
          <Link href={paths.wishlist} className={phone.row}>
            <span className={phone.disc} data-tone="accent" aria-hidden="true">
              <Heart />
            </span>
            <span className={phone.rowText}>
              <span className={phone.rowTitle}>{tWishlist('title')}</span>
              <span className={phone.rowMeta}>{tWishlist('cards', { count: wishes })}</span>
            </span>
            <ChevronRight aria-hidden className={phone.chevron} />
          </Link>
        </li>
      </ul>

      <ResaleNotice outcome={parseResaleParams(query)} />
      {bySeries ? (
        <div className={styles.seriesGroups}>
          {SERIES_GROUPS.map((type) => {
            const group = allSeries.filter((s) => s.type === type);
            if (group.length === 0) return null;
            return (
              <section key={type} className={styles.seriesGroup} aria-labelledby={`series-${type}`}>
                <h2 id={`series-${type}`} className={phone.groupTitle}>
                  {tGame(`seriesTypes.${type}`)}
                </h2>
                <ul className={`${phone.rows} ${styles.seriesRows}`}>{group.map(seriesRow)}</ul>
              </section>
            );
          })}
        </div>
      ) : (
        <CollectionGrid
          collection={collection}
          userId={user.id}
          filters={filters}
          path={paths.collection}
          series={series}
          seriesOptions={allSeries}
        />
      )}
    </main>
  );
}
