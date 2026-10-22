import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { db } from '@/db';
import { achievements } from '@/db/schema';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import { achievementTitle } from '@/lib/game/achievement-title';
import { getActiveCollection, getGameRules, getMarketRules, getResaleValues } from '@/lib/game/rules';
import { RARITIES } from '@/lib/rarity';
import styles from '../info.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Rules');
  return { title: t('title'), description: t('description') };
}

/** The rules as the server applies them: every figure is read from the database. */
export default async function RulesPage() {
  const collection = await getActiveCollection(DEFAULT_COLLECTION_SLUG);
  if (!collection) notFound();
  const [t, tRarity, tAchievement, rules, resale, list, market] = await Promise.all([
    getTranslations('Rules'),
    getTranslations('Rarity'),
    getTranslations('Achievements'),
    getGameRules(db, collection.id),
    getResaleValues(db, collection.id),
    db.select().from(achievements).where(eq(achievements.collectionId, collection.id)).orderBy(asc(achievements.position)),
    getMarketRules(db, collection.id),
  ]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <p>{t('intro', { collection: collection.name })}</p>
      </header>

      <section className={styles.section} aria-labelledby="packs-heading">
        <h2 id="packs-heading">{t('packsHeading')}</h2>
        <ul>
          <li>{t('packsStart', { packs: rules.signupPacks, cards: rules.cardsPerPack })}</li>
          <li>{t('packsRefill', { minutes: rules.refillMinutes, max: rules.maxReserve })}</li>
          <li>{t('packsFull')}</li>
          <li>{t.rich('packsDraw', { odds: (chunks) => <Link href="/odds">{chunks}</Link> })}</li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="collection-heading">
        <h2 id="collection-heading">{t('collectionHeading')}</h2>
        <ul>
          <li>{t('collectionSeries')}</li>
          <li>{t('collectionMissing')}</li>
          <li>{t('collectionDuplicates')}</li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="coins-heading">
        <h2 id="coins-heading">{t('coinsHeading')}</h2>
        <p>{t('coinsIntro')}</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">{t('resaleCaption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('rarity')}</th>
                <th scope="col" className={styles.number}>
                  {t('resaleValue')}
                </th>
              </tr>
            </thead>
            <tbody>
              {RARITIES.map((rarity) => (
                <tr key={rarity}>
                  <th scope="row">{tRarity(rarity)}</th>
                  <td className={styles.number}>{t('coins', { count: resale[rarity] })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.muted}>{t('noMoneyValue')}</p>
      </section>

      {list.length > 0 && (
        <section className={styles.section} aria-labelledby="achievements-heading">
          <h2 id="achievements-heading">{t('achievementsHeading')}</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">{t('achievementsHeading')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('achievement')}</th>
                  <th scope="col" className={styles.number}>
                    {t('reward')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((achievement) => (
                  <tr key={achievement.id}>
                    <td>{achievementTitle(tAchievement, tRarity, achievement)}</td>
                    <td className={styles.number}>{t('coins', { count: achievement.rewardCoins })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className={styles.section} aria-labelledby="trades-heading">
        <h2 id="trades-heading">{t('tradesHeading')}</h2>
        <p>{t.rich('tradesFriends', { friends: (chunks) => <Link href="/friends">{chunks}</Link> })}</p>
        <p>{t('tradesHow', { max: market.tradeMaxCards })}</p>
        <p>{t('tradesReserved', { hours: market.tradeExpiryHours })}</p>
      </section>

      <section className={styles.section} aria-labelledby="leaderboard-heading">
        <h2 id="leaderboard-heading">{t('leaderboardHeading')}</h2>
        <p>{t.rich('leaderboardRule', { link: (chunks) => <Link href="/leaderboard">{chunks}</Link> })}</p>
      </section>

      <p className={styles.muted}>{t('serverDecides')}</p>
    </main>
  );
}
