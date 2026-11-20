import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { receivedOffers } from '@/lib/game/trades';
import { listFriendRequests } from '@/lib/social/friends';
import styles from './SocialTabs.module.css';

export type SocialTab = 'friends' | 'trades' | 'leaderboard';

/**
 * The tabs between the friends, the trades and the leaderboard, which the
 * phone's tab bar gathers under "Échanges": each shows how many requests or
 * offers wait for the player's answer. On a phone, three equal parts under the
 * page's title, the offers first. For a signed-in player only.
 */
export async function SocialTabs({
  current,
  userId,
  collection,
}: {
  current: SocialTab;
  userId: string;
  /** The trades' collection; the default one otherwise. */
  collection?: { id: number; slug: string };
}) {
  const tradesCollection = collection ?? (await getActiveCollection(DEFAULT_COLLECTION_SLUG));
  const [t, requests, offers] = await Promise.all([
    getTranslations('Social'),
    listFriendRequests(userId),
    tradesCollection ? receivedOffers(userId, tradesCollection.id, new Date()) : 0,
  ]);
  const tabs = [
    { key: 'friends', href: '/friends', label: t('friends'), waiting: requests.received.length },
    ...(tradesCollection
      ? [
          {
            key: 'trades',
            href: gamePath(tradesCollection.slug).trades,
            label: t('trades'),
            phoneLabel: t('offers'),
            waiting: offers,
          },
        ]
      : []),
    { key: 'leaderboard', href: '/leaderboard', label: t('leaderboard'), waiting: 0 },
  ];

  return (
    <nav aria-label={t('label')} className={styles.tabs}>
      <ul>
        {tabs.map((tab) => (
          <li key={tab.key} data-tab={tab.key}>
            <Link href={tab.href} className={styles.tab} aria-current={tab.key === current ? 'page' : undefined}>
              {'phoneLabel' in tab ? (
                <>
                  <span className="wide-only">{tab.label}</span>
                  <span className="phone-only">{tab.phoneLabel}</span>
                </>
              ) : (
                tab.label
              )}
              {tab.waiting > 0 && (
                <>
                  <span className={styles.count} aria-hidden="true">
                    {tab.waiting > 99 ? '99+' : tab.waiting}
                  </span>
                  <span className="sr-only">, {t('waiting', { count: tab.waiting })}</span>
                </>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
