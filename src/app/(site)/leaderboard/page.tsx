import { UserPlus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { SocialTabs } from '@/components/social/SocialTabs';
import { Button } from '@/components/ui/Button';
import { MoreInfo } from '@/components/ui/MoreInfo';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import { leaderboard, type LeaderboardRow } from '@/lib/game/leaderboard';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { friendStates, type FriendState } from '@/lib/social/friends';
import { getSession } from '@/lib/session';
import { requestFriendAction } from '../friends/actions';
import { FriendNotice } from '../friends/FriendNotice';
import styles from '../info.module.css';
import board from './page.module.css';

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

  // A list rather than a table: it fits a phone, the counts labelled on each row
  const row = (entry: LeaderboardRow) => {
    const me = entry.userId === session?.user.id;
    return (
      <li key={entry.userId} className={board.row} data-me={me || undefined}>
        <span className={board.rank} data-podium={entry.rank <= 3 || undefined}>
          <span className="sr-only">{t('rank')} </span>
          {format.number(entry.rank)}
        </span>
        <span className={board.who}>
          <span className={board.pseudo}>
            {entry.pseudo}
            {me && <span className={styles.me}> {t('you')}</span>}
          </span>
          <span className={board.rares}>{t('rares', { legendary: entry.legendary, ultra: entry.ultra })}</span>
        </span>
        <span className={board.score}>
          <strong>{format.number(entry.distinct)}</strong>
          <span>{t('cardsUnit', { count: entry.distinct })}</span>
        </span>
        {states && !me && <div className={board.action}>{friendCell(entry, states.get(entry.userId))}</div>}
      </li>
    );
  };

  return (
    <main className={styles.page}>
      {session && <SocialTabs current="leaderboard" userId={session.user.id} />}
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <MoreInfo summary={t('howItWorks')}>
          <p>{t('rule', { collection: collection.name })}</p>
        </MoreInfo>
      </header>
      {session && <FriendNotice params={query} />}
      {rows.length === 0 ? (
        <p className={styles.muted}>{t('empty')}</p>
      ) : (
        <>
          <ol className={board.board} aria-label={t('caption', { count: rows.length })}>
            {rows.map(row)}
          </ol>
          {/* The player, further down */}
          {player && !playerInTop && <ol className={board.board}>{row(player)}</ol>}
        </>
      )}
      {session && !player && <p className={styles.muted}>{t('notRanked')}</p>}
    </main>
  );
}
