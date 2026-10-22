import { UserPlus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import { leaderboard, type LeaderboardRow } from '@/lib/game/leaderboard';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { friendStates, type FriendState } from '@/lib/social/friends';
import { getSession } from '@/lib/session';
import { requestFriendAction } from '../friends/actions';
import { FriendNotice } from '../friends/FriendNotice';
import styles from '../info.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Leaderboard');
  return { title: t('title'), description: t('description') };
}

/** Public: the players' pseudos and counts, never anything else about them. */
export default async function LeaderboardPage({ searchParams }: PageProps<'/leaderboard'>) {
  const collection = await getActiveCollection(DEFAULT_COLLECTION_SLUG);
  if (!collection) notFound();
  const [t, tFriends, format, session, query] = await Promise.all([
    getTranslations('Leaderboard'),
    getTranslations('Friends'),
    getFormatter(),
    getSession(),
    searchParams,
  ]);
  const { rows, player } = await leaderboard(collection.id, session?.user.id);
  const playerInTop = player && rows.some((row) => row.userId === player.userId);
  // A signed-in player can ask the others to be friends from here
  const states = session ? await friendStates(session.user.id, rows.map((row) => row.userId)) : null;
  const game = gamePath(collection.slug);

  const friendCell = (entry: LeaderboardRow, state: FriendState | undefined) => {
    if (state === 'friends') return <Link href={game.friend(entry.pseudo)}>{tFriends('states.friends')}</Link>;
    if (state === 'received') return <Link href="/friends">{tFriends('states.received')}</Link>;
    if (state === 'sent') return <span className={styles.muted}>{tFriends('states.sent')}</span>;
    return (
      <form action={requestFriendAction}>
        <input type="hidden" name="back" value="/leaderboard" />
        <input type="hidden" name="pseudo" value={entry.pseudo} />
        <Button type="submit" variant="ghost" icon={<UserPlus aria-hidden />} aria-label={tFriends('addPseudo', { pseudo: entry.pseudo })}>
          {tFriends('add')}
        </Button>
      </form>
    );
  };

  const row = (entry: LeaderboardRow) => {
    const me = entry.userId === session?.user.id;
    return (
      <tr key={entry.userId} data-me={me || undefined}>
        <td className={styles.number}>{format.number(entry.rank)}</td>
        <td>
          {entry.pseudo}
          {me && <span className={styles.me}> {t('you')}</span>}
        </td>
        <td className={styles.number}>{format.number(entry.distinct)}</td>
        <td className={styles.number}>{format.number(entry.legendary)}</td>
        <td className={styles.number}>{format.number(entry.ultra)}</td>
        {states && <td>{me ? null : friendCell(entry, states.get(entry.userId))}</td>}
      </tr>
    );
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <p className={styles.muted}>{t('rule', { collection: collection.name })}</p>
      </header>
      {session && <FriendNotice params={query} />}
      {rows.length === 0 ? (
        <p className={styles.muted}>{t('empty')}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">{t('caption', { count: rows.length })}</caption>
            <thead>
              <tr>
                <th scope="col" className={styles.number}>
                  {t('rank')}
                </th>
                <th scope="col">{t('player')}</th>
                <th scope="col" className={styles.number}>
                  {t('distinct')}
                </th>
                <th scope="col" className={styles.number}>
                  {t('legendary')}
                </th>
                <th scope="col" className={styles.number}>
                  {t('ultra')}
                </th>
                {states && (
                  <th scope="col">
                    <span className="sr-only">{t('friends')}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(row)}
              {player && !playerInTop && row(player)}
            </tbody>
          </table>
        </div>
      )}
      {session && !player && <p className={styles.muted}>{t('notRanked')}</p>}
    </main>
  );
}
