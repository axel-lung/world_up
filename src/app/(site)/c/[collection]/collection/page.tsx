import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Gauge } from '@/components/ui/Gauge';
import { collectionCounts, getSeries, seriesProgress } from '@/lib/game/collection';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { requireSession } from '@/lib/session';
import { CollectionGrid } from '../CollectionGrid';
import { parseGridParams, parseResaleParams } from '../filters';
import styles from '../game.module.css';
import { ResaleNotice } from '../ResaleNotice';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Collection');
  return { title: t('title') };
}

export default async function CollectionPage({ params, searchParams }: PageProps<'/c/[collection]/collection'>) {
  const collection = await getActiveCollection((await params).collection);
  if (!collection) notFound();
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.collection);
  const query = await searchParams;
  const filters = parseGridParams(query);

  const [t, format, allSeries, counts, series] = await Promise.all([
    getTranslations('Collection'),
    getFormatter(),
    seriesProgress(user.id, collection.id),
    collectionCounts({ userId: user.id, collectionId: collection.id }),
    filters.series ? getSeries(collection.id, filters.series) : null,
  ]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          <Link href={paths.home}>{collection.name}</Link>
        </p>
        <h1>{t('title')}</h1>
      </header>
      <Gauge
        label={t('progress')}
        value={counts.all ? counts.owned / counts.all : 0}
        valueText={`${format.number(counts.owned)} / ${format.number(counts.all)} · ${format.number(
          counts.all ? counts.owned / counts.all : 0,
          { style: 'percent', maximumFractionDigits: 1 },
        )}`}
      />
      <ResaleNotice outcome={parseResaleParams(query)} />
      <CollectionGrid
        collection={collection}
        userId={user.id}
        filters={filters}
        path={paths.collection}
        series={series}
        seriesOptions={allSeries}
      />
    </main>
  );
}
