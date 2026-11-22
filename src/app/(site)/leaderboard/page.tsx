import { Clock, UserCheck, UserPlus, UserRoundPlus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { CSSProperties } from 'react';
import { BadgeSticker } from '@/components/badge/Badge';
import { SocialTabs } from '@/components/social/SocialTabs';
import { Button } from '@/components/ui/Button';
import { MoreInfo } from '@/components/ui/MoreInfo';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import { achievementTitle } from '@/lib/game/achievement-title';
import { featuredBadgesOf } from '@/lib/game/badges';
import { leaderboard, type LeaderboardRow } from '@/lib/game/leaderboard';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { friendStates, type FriendState } from '@/lib/social/friends';
import { getSession } from '@/lib/session';
import { requestFriendAction } from '../friends/actions';
import { FriendNotice } from '../friends/FriendNotice';
import styles from '../info.module.css';
import phone from '../phone.module.css';
import board from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Leaderboard');
  return { title: t('title'), description: t('description') };
}

// The podium, first in the middle: each place's column, avatar and step
const PODIUM = [
  { column: 2, avatar: '78px', step: '96px' },
  { column: 1, avatar: '64px', step: '72px' },
  { column: 3, avatar: '58px', step: '56px' },
];

/**
 * Public: the players' pseudos and counts, never anything else about them. A
 * player's phone shows the first three on a podium, the others below, and
 * their own row pinned to the bottom of the screen.
 */
export default async function LeaderboardPage({ searchParams }: PageProps<'/leaderboard'>) {
  const collection = await getActiveCollection(DEFAULT_COLLECTION_SLUG);
  if (!collection) notFound();
  const [t, tFriends, tSocial, tAchievement, tRarity, format, session, query] = await Promise.all([
    getTranslations('Leaderboard'),
    getTranslations('Friends'),
    getTranslations('Social'),
    getTranslations('Achievements'),
    getTranslations('Rarity'),
    getFormatter(),
    getSession(),
    searchParams,
  ]);
  const { rows, player } = await leaderboard(collection.id, session?.user.id);
  // The badge each player shows beside their pseudo
  const badges = await featuredBadgesOf(collection.id, [...rows, ...(player ? [player] : [])].map((entry) => entry.userId));
  const badgeOf = (entry: LeaderboardRow) => {
    const badge = badges.get(entry.userId);
    return badge ? (
      <>
        {' '}
        <BadgeSticker badge={badge} label={achievementTitle(tAchievement, tRarity, badge)} />
      </>
    ) : null;
  };
  const playerInTop = player && rows.some((row) => row.userId === player.userId);
  // A signed-in player can ask the others to be friends from here
  const states = session ? await friendStates(session.user.id, rows.map((row) => row.userId)) : null;
  const game = gamePath(collection.slug);
  // A player's phone has its own layout; a visitor's keeps this one
  const wide = session ? 'wide-only' : '';
  const initial = (entry: LeaderboardRow) => entry.pseudo.charAt(0).toLocaleUpperCase('fr');
  const isMe = (entry: LeaderboardRow) => entry.userId === session?.user.id;

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
    const me = isMe(entry);
    return (
      <li key={entry.userId} className={board.row} data-me={me || undefined}>
        <span className={board.rank} data-podium={entry.rank <= 3 || undefined}>
          <span className="sr-only">{t('rank')} </span>
          {format.number(entry.rank)}
        </span>
        <span className={board.who}>
          <span className={board.pseudo}>
            {entry.pseudo}
            {badgeOf(entry)}
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

  // A phone: the friend link as one round icon
  const friendIcon = (entry: LeaderboardRow) => {
    if (isMe(entry) || !states) return <span aria-hidden="true" />;
    const state = states.get(entry.userId);
    if (state === 'friends')
      return (
        <Link href={game.friend(entry.pseudo)} className={board.icon} aria-label={tFriends('seeCollectionOf', { pseudo: entry.pseudo })}>
          <UserCheck aria-hidden />
        </Link>
      );
    if (state === 'received')
      return (
        <Link href="/friends" className={board.icon} data-tone="received" aria-label={tFriends('askedYou', { pseudo: entry.pseudo })}>
          <UserRoundPlus aria-hidden />
        </Link>
      );
    if (state === 'sent')
      return (
        <span className={board.icon} data-tone="muted" role="img" aria-label={tFriends('sentTo', { pseudo: entry.pseudo })}>
          <Clock aria-hidden />
        </span>
      );
    return (
      <form action={requestFriendAction}>
        <input type="hidden" name="back" value="/leaderboard" />
        <input type="hidden" name="pseudo" value={entry.pseudo} />
        <button type="submit" className={board.icon} data-tone="add" aria-label={tFriends('addPseudo', { pseudo: entry.pseudo })}>
          <UserPlus aria-hidden />
        </button>
      </form>
    );
  };
  const phoneRow = (entry: LeaderboardRow) => (
    <li key={entry.userId} className={board.line}>
      <span className={board.lineRank}>
        <span className="sr-only">{t('rank')} </span>
        {format.number(entry.rank)}
      </span>
      <span className={board.lineWho}>
        <span className={board.linePseudo}>
          {entry.pseudo}
          {badgeOf(entry)}
          {isMe(entry) && <span className={board.you}> {t('you')}</span>}
        </span>
        <span className={board.lineRares}>{t('rares', { legendary: entry.legendary, ultra: entry.ultra })}</span>
      </span>
      <span className={board.lineScore}>
        {format.number(entry.distinct)}
        <span className="sr-only"> {t('cardsUnit', { count: entry.distinct })}</span>
      </span>
      {friendIcon(entry)}
    </li>
  );

  return (
    <main className={`${styles.page} ${session ? phone.page : ''}`} data-tight>
      {session && (
        <header className={`${phone.head} phone-only`}>
          <h1>{tSocial('title')}</h1>
        </header>
      )}
      {session && <SocialTabs current="leaderboard" userId={session.user.id} />}
      <header className={`${styles.header} ${wide}`}>
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
          <ol className={`${board.board} ${wide}`} aria-label={t('caption', { count: rows.length })}>
            {rows.map(row)}
          </ol>
          {/* The player, further down */}
          {player && !playerInTop && <ol className={`${board.board} ${wide}`}>{row(player)}</ol>}

          {session && (
            <div className={`${board.phone} phone-only`}>
              <ol className={board.podium} aria-label={t('podium')}>
                {rows.slice(0, 3).map((entry, index) => (
                  <li
                    key={entry.userId}
                    style={
                      {
                        gridColumn: PODIUM[index].column,
                        '--avatar': PODIUM[index].avatar,
                        '--step': PODIUM[index].step,
                      } as CSSProperties
                    }
                  >
                    <span className={board.podiumAvatar} aria-hidden="true">
                      {initial(entry)}
                      <span className={board.podiumRank}>{entry.rank}</span>
                    </span>
                    <span className={board.podiumPseudo}>
                      <span className="sr-only">
                        {t('rank')} {format.number(entry.rank)} :{' '}
                      </span>
                      {entry.pseudo}
                      {badgeOf(entry)}
                      {isMe(entry) && <span className="sr-only"> {t('you')}</span>}
                    </span>
                    <span className={board.step}>
                      <strong>{format.number(entry.distinct)}</strong>
                      <span>{t('cardsUnit', { count: entry.distinct })}</span>
                    </span>
                  </li>
                ))}
              </ol>
              {rows.length > 3 && (
                <ol className={board.lines} aria-label={t('others')}>
                  {rows.slice(3).map(phoneRow)}
                </ol>
              )}
              {player && (
                <div className={board.mine}>
                  <span className={board.lineRank}>
                    <span className="sr-only">{t('rank')} </span>
                    {format.number(player.rank)}
                  </span>
                  <span className={board.lineWho}>
                    <span className={board.linePseudo}>
                      {player.pseudo}
                      {badgeOf(player)}
                      <span className={board.you}> {t('you')}</span>
                    </span>
                    <span className={board.lineRares}>{t('rares', { legendary: player.legendary, ultra: player.ultra })}</span>
                  </span>
                  <span className={board.lineScore}>
                    {format.number(player.distinct)}
                    <span className="sr-only"> {t('cardsUnit', { count: player.distinct })}</span>
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {session && !player && <p className={styles.muted}>{t('notRanked')}</p>}
    </main>
  );
}
