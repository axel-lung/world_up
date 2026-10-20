import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { db } from '@/db';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import { type OddsSet, PER_MILLION } from '@/lib/game/draw';
import { currentOdds, getActiveCollection, getGameRules, oddsHistory, visibleCardsByRarity } from '@/lib/game/rules';
import { RARITIES } from '@/lib/rarity';
import styles from '../info.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Odds');
  return { title: t('title'), description: t('description') };
}

/** The odds in force and every change since launch, as the law of games of chance asks. */
export default async function OddsPage() {
  const collection = await getActiveCollection(DEFAULT_COLLECTION_SLUG);
  if (!collection) notFound();
  const now = new Date();
  const [t, tRarity, format, current, history, visible, rules] = await Promise.all([
    getTranslations('Odds'),
    getTranslations('Rarity'),
    getFormatter(),
    currentOdds(db, collection.id, now),
    oddsHistory(collection.id),
    visibleCardsByRarity(collection.id),
    getGameRules(db, collection.id),
  ]);
  const percent = (perMillion: number) =>
    format.number(perMillion / PER_MILLION, { style: 'percent', maximumFractionDigits: 4 });
  const date = (value: Date) => format.dateTime(value, { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });

  const oddsTable = (odds: OddsSet, caption: string, withCards: boolean) => (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t('rarity')}</th>
            <th scope="col" className={styles.number}>
              {t('probability')}
            </th>
            {withCards && (
              <th scope="col" className={styles.number}>
                {t('cards')}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {RARITIES.map((rarity) => (
            <tr key={rarity}>
              <th scope="row">{tRarity(rarity)}</th>
              <td className={styles.number}>{percent(odds[rarity])}</td>
              {withCards && <td className={styles.number}>{format.number(visible[rarity])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <p>{t('intro', { collection: collection.name, cards: rules.cardsPerPack })}</p>
      </header>

      <section className={styles.section} aria-labelledby="current-heading">
        <h2 id="current-heading">{t('currentHeading')}</h2>
        {current ? (
          <>
            <p className={styles.muted}>{t('since', { date: date(current.validFrom) })}</p>
            {oddsTable(current.odds, t('currentHeading'), true)}
          </>
        ) : (
          <p className={styles.muted}>{t('none')}</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="how-heading">
        <h2 id="how-heading">{t('howHeading')}</h2>
        <ul>
          <li>{t('howRarity')}</li>
          <li>{t('howCard')}</li>
          <li>{t('howHidden')}</li>
          <li>{t('howDuplicates')}</li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="history-heading">
        <h2 id="history-heading">{t('historyHeading')}</h2>
        <p className={styles.muted}>{t('historyIntro')}</p>
        <div className={styles.history}>
          {history.map((set, index) => {
            // The list is newest first: the set before this one in the list replaced it
            const replacedAt = index > 0 ? history[index - 1].validFrom : null;
            const label =
              set.validFrom > now
                ? t('upcoming', { date: date(set.validFrom) })
                : replacedAt && replacedAt <= now
                  ? t('period', { from: date(set.validFrom), to: date(replacedAt) })
                  : t('since', { date: date(set.validFrom) });
            return (
              <div key={set.validFrom.toISOString()}>
                <h3>{label}</h3>
                {oddsTable(set.odds, label, false)}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
