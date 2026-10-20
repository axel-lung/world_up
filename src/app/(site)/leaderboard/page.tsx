import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import { leaderboard, type LeaderboardRow } from '@/lib/game/leaderboard';
import { getActiveCollection } from '@/lib/game/rules';
import { getSession } from '@/lib/session';
import styles from '../info.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Leaderboard');
  return { title: t('title'), description: t('description') };
}

/** Public: the players' pseudos and counts, never anything else about them. */
export default async function LeaderboardPage() {
  const collection = await getActiveCollection(DEFAULT_COLLECTION_SLUG);
  if (!collection) notFound();
  const [t, format, session] = await Promise.all([
    getTranslations('Leaderboard'),
    getFormatter(),
    getSession(),
  ]);
  const { rows, player } = await leaderboard(collection.id, session?.user.id);
  const playerInTop = player && rows.some((row) => row.userId === player.userId);

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
      </tr>
    );
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <p className={styles.muted}>{t('rule', { collection: collection.name })}</p>
      </header>
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
