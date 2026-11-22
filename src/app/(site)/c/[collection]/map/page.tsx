import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { MapExplorer } from '@/components/map/MapExplorer';
import { getVisibleCard } from '@/lib/catalog/cards';
import { collectionCounts } from '@/lib/game/collection';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { DEPARTMENT_CODE, departmentShape } from '@/lib/map/departments';
import { departmentProgress, monumentsVersion, ownedCardIds } from '@/lib/map/monuments';
import { currentTileset } from '@/lib/map/tiles';
import { requireSession } from '@/lib/session';
import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Map');
  return { title: t('metaTitle') };
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * The map of the collection's monuments: France by department, filled by the
 * player's progress, then every visible card with a point as a pin. Opened
 * on a card (?card=<slug>, from its page) or a department (?dept=21, from a
 * link).
 */
export default async function MapPage({ params, searchParams }: PageProps<'/c/[collection]/map'>) {
  const collection = await getActiveCollection((await params).collection);
  if (!collection) notFound();
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.map);
  const query = await searchParams;
  const cardSlug = one(query.card);
  const department = one(query.dept);

  const [counts, departments, owned, version, tileset, card] = await Promise.all([
    collectionCounts({ userId: user.id, collectionId: collection.id }),
    departmentProgress(user.id, collection.id),
    ownedCardIds(user.id, collection.id),
    monumentsVersion(collection.id),
    currentTileset(),
    cardSlug ? getVisibleCard(collection.slug, cardSlug) : null,
  ]);
  const focus =
    card && card.latitude !== null && card.longitude !== null ? { id: card.id, lat: card.latitude, lon: card.longitude } : null;

  return (
    <main className={styles.page}>
      <MapExplorer
        paths={{ collection: paths.collection, monuments: paths.mapMonuments(version) }}
        totals={{ owned: counts.owned, all: counts.all }}
        departments={departments}
        owned={owned}
        tileset={tileset}
        focus={focus}
        department={department && DEPARTMENT_CODE.test(department) && departmentShape(department) ? department : null}
      />
    </main>
  );
}
