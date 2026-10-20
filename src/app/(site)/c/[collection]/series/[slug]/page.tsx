import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Gauge } from '@/components/ui/Gauge';
import { collectionCounts, getSeries } from '@/lib/game/collection';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { requireSession } from '@/lib/session';
import { CollectionGrid } from '../../CollectionGrid';
import { parseGridParams } from '../../filters';
import styles from '../../game.module.css';

async function load(params: PageProps<'/c/[collection]/series/[slug]'>['params']) {
  const { collection: collectionSlug, slug } = await params;
  const collection = await getActiveCollection(collectionSlug);
  const series = collection ? await getSeries(collection.id, slug) : null;
  return collection && series ? { collection, series } : null;
}

export async function generateMetadata({ params }: PageProps<'/c/[collection]/series/[slug]'>): Promise<Metadata> {
  const found = await load(params);
  return found ? { title: found.series.name } : {};
}

export default async function SeriesPage({ params, searchParams }: PageProps<'/c/[collection]/series/[slug]'>) {
  const found = await load(params);
  if (!found) notFound();
  const { collection, series } = found;
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.series(series.slug));
  const filters = parseGridParams(await searchParams);
  const [t, format, counts] = await Promise.all([
    getTranslations('Collection'),
    getFormatter(),
    collectionCounts({ userId: user.id, collectionId: collection.id, seriesId: series.id }),
  ]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          <Link href={paths.home}>{collection.name}</Link>
        </p>
        <h1>{series.name}</h1>
        <p className={styles.muted}>{t(`seriesTypes.${series.type}`)}</p>
      </header>
      <Gauge
        label={t('seriesProgress')}
        value={counts.all ? counts.owned / counts.all : 0}
        valueText={`${format.number(counts.owned)} / ${format.number(counts.all)}`}
        caption={counts.owned === counts.all && counts.all > 0 ? t('seriesComplete') : undefined}
      />
      <CollectionGrid
        collection={collection}
        userId={user.id}
        filters={filters}
        path={paths.series(series.slug)}
        series={series}
      />
    </main>
  );
}
