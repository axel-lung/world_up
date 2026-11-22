import { ArrowLeftRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { BadgeSticker } from '@/components/badge/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Gauge } from '@/components/ui/Gauge';
import { achievementTitle } from '@/lib/game/achievement-title';
import { playerBadges } from '@/lib/game/badges';
import { collectionCounts, FRIEND_TABS, getSeries, seriesProgress } from '@/lib/game/collection';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { getFriend } from '@/lib/social/friends';
import { requireSession } from '@/lib/session';
import { CollectionGrid } from '../../CollectionGrid';
import { parseGridParams } from '../../filters';
import styles from '../../game.module.css';
import own from './page.module.css';

type Props = PageProps<'/c/[collection]/friends/[pseudo]'>;

/** The segment as typed: a pseudo can hold accented letters, never a "%". */
function pseudoParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations('FriendCollection');
  return { title: t('title', { pseudo: pseudoParam((await params).pseudo) }) };
}

/** A friend's cards and badges in a collection: only friends see each other's collection. */
export default async function FriendCollectionPage({ params, searchParams }: Props) {
  const { collection: slug, pseudo } = await params;
  const collection = await getActiveCollection(slug);
  if (!collection) notFound();
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.friend(pseudoParam(pseudo)));
  const friend = await getFriend(user.id, pseudoParam(pseudo));
  if (!friend) notFound();

  const query = await searchParams;
  const filters = parseGridParams(query, FRIEND_TABS);
  const [t, tAchievement, tRarity, format, allSeries, counts, series, badges] = await Promise.all([
    getTranslations('FriendCollection'),
    getTranslations('Achievements'),
    getTranslations('Rarity'),
    getFormatter(),
    seriesProgress(friend.id, collection.id),
    collectionCounts({ userId: friend.id, collectionId: collection.id }),
    filters.series ? getSeries(collection.id, filters.series) : null,
    playerBadges(friend.id, collection.id),
  ]);
  const obtained = badges.filter((badge) => badge.obtainedAt);
  const featured = badges.find((badge) => badge.featured);
  const title = (badge: (typeof badges)[number]) => achievementTitle(tAchievement, tRarity, badge);
  const path = paths.friend(friend.pseudo);
  const share = counts.all ? counts.owned / counts.all : 0;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          <Link href="/friends">{t('back')}</Link>
        </p>
        <h1>
          {t('title', { pseudo: friend.pseudo })}
          {featured && (
            <>
              {' '}
              <BadgeSticker badge={featured} label={title(featured)} />
            </>
          )}
        </h1>
        {obtained.length > 0 && (
          <ul className={own.badges} aria-label={t('badges', { pseudo: friend.pseudo, count: obtained.length })}>
            {obtained.map((badge) => (
              <li key={badge.id}>
                <BadgeSticker badge={badge} label={title(badge)} />
              </li>
            ))}
          </ul>
        )}
        <div className={styles.actions}>
          <ButtonLink href={paths.newTrade(friend.pseudo)} variant="sage" icon={<ArrowLeftRight aria-hidden />}>
            {t('proposeTrade')}
          </ButtonLink>
        </div>
      </header>
      <Gauge
        label={t('progress')}
        value={share}
        valueText={`${format.number(counts.owned)} / ${format.number(counts.all)} · ${format.number(share, {
          style: 'percent',
          maximumFractionDigits: 1,
        })}`}
      />
      <CollectionGrid
        collection={collection}
        userId={friend.id}
        viewerId={user.id}
        tabs={FRIEND_TABS}
        labels={{
          tabs: Object.fromEntries(FRIEND_TABS.map((tab) => [tab, t(`tabs.${tab}`)])),
          empty: Object.fromEntries(FRIEND_TABS.map((tab) => [tab, t(`empty.${tab}`, { pseudo: friend.pseudo })])),
        }}
        filters={filters}
        path={path}
        series={series}
        seriesOptions={allSeries}
      />
    </main>
  );
}
