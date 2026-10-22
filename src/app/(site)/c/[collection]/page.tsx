import { Check, Coins, PackageOpen, Trophy } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { PackReserve } from '@/components/pack/PackReserve';
import { ButtonLink } from '@/components/ui/Button';
import { Gauge } from '@/components/ui/Gauge';
import { db } from '@/db';
import { achievementTitle } from '@/lib/game/achievement-title';
import { listAchievements } from '@/lib/game/achievements';
import { coinBalance, duplicatesValue } from '@/lib/game/coins';
import { collectionCounts, seriesProgress, type SeriesProgress } from '@/lib/game/collection';
import { getReserve } from '@/lib/game/packs';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { requireSession } from '@/lib/session';
import styles from './game.module.css';

export async function generateMetadata({ params }: PageProps<'/c/[collection]'>): Promise<Metadata> {
  const collection = await getActiveCollection((await params).collection);
  return collection ? { title: collection.name } : {};
}

const SERIES_GROUPS: SeriesProgress['type'][] = ['region', 'family', 'unesco', 'endangered'];

/** The player's home in a collection: packs, progress, series, coins and achievements. */
export default async function GameHomePage({ params }: PageProps<'/c/[collection]'>) {
  const collection = await getActiveCollection((await params).collection);
  if (!collection) notFound();
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.home);
  const now = new Date();

  const [t, tAchievement, tRarity, format, reserve, counts, series, achievements, balance, duplicates] = await Promise.all([
    getTranslations('Game'),
    getTranslations('Achievements'),
    getTranslations('Rarity'),
    getFormatter(),
    getReserve(user.id, collection.id, now),
    collectionCounts({ userId: user.id, collectionId: collection.id }),
    seriesProgress(user.id, collection.id),
    listAchievements(user.id, collection.id),
    coinBalance(db, user.id),
    duplicatesValue(user.id, collection.id),
  ]);
  const number = (value: number) => format.number(value);
  const percent = (owned: number, total: number) =>
    format.number(total ? owned / total : 0, { style: 'percent', maximumFractionDigits: 1 });
  const obtained = achievements.filter((a) => a.obtainedAt).length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{collection.name}</p>
        <h1>{t('welcome', { pseudo: user.name })}</h1>
      </header>

      <div className={styles.columns}>
        <section className={styles.section} aria-labelledby="packs-heading">
          <h2 id="packs-heading">{t('packsHeading')}</h2>
          <PackReserve
            available={reserve.packs}
            max={reserve.maxReserve}
            nextPackAt={reserve.nextPackAt?.toISOString() ?? null}
            serverNow={now.toISOString()}
            refillMinutes={reserve.refillMinutes}
            shopHref={null}
          />
          <div className={styles.actions}>
            <ButtonLink href={paths.open} variant="primary" size="large" icon={<PackageOpen aria-hidden />}>
              {t('openPack')}
            </ButtonLink>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="collection-heading">
          <h2 id="collection-heading">{t('collectionHeading')}</h2>
          <Gauge
            label={t('myCollection')}
            value={counts.all ? counts.owned / counts.all : 0}
            valueText={`${number(counts.owned)} / ${number(counts.all)} · ${percent(counts.owned, counts.all)}`}
          />
          <p className={styles.balance}>
            <Coins aria-hidden />
            <span>{t.rich('balance', { count: balance, strong: (chunks) => <strong>{chunks}</strong> })}</span>
          </p>
          {duplicates.copies > 0 && (
            <p className={styles.muted}>
              {t('duplicates', { copies: duplicates.copies, coins: duplicates.coins })}
            </p>
          )}
          <div className={styles.actions}>
            <ButtonLink href={paths.collection}>{t('seeCollection')}</ButtonLink>
            {duplicates.copies > 0 && (
              <ButtonLink href={`${paths.collection}?tab=duplicates`} variant="ghost">
                {t('seeDuplicates')}
              </ButtonLink>
            )}
          </div>
        </section>
      </div>

      <section className={styles.section} aria-labelledby="series-heading">
        <h2 id="series-heading">{t('seriesHeading')}</h2>
        {SERIES_GROUPS.map((type) => {
          const group = series.filter((s) => s.type === type);
          if (group.length === 0) return null;
          return (
            <div key={type} className={styles.stack}>
              <h3 className={styles.groupTitle}>{t(`seriesTypes.${type}`)}</h3>
              <ul className={styles.gauges}>
                {group.map((s) => (
                  <li key={s.id}>
                    <Gauge
                      label={<Link href={paths.series(s.slug)}>{s.name}</Link>}
                      value={s.total ? s.owned / s.total : 0}
                      tone={type === 'unesco' ? 'sage' : 'accent'}
                      valueText={`${number(s.owned)} / ${number(s.total)}`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section className={styles.section} aria-labelledby="achievements-heading">
        <div className={styles.sectionHeader}>
          <h2 id="achievements-heading">{t('achievementsHeading')}</h2>
          <span className={styles.muted}>{t('achievementsCount', { obtained, total: achievements.length })}</span>
        </div>
        <ul className={styles.achievements}>
          {achievements.map((achievement) => (
            <li key={achievement.id} className={styles.achievement} data-done={achievement.obtainedAt ? true : undefined}>
              <span className={styles.achievementIcon} aria-hidden="true">
                {achievement.obtainedAt ? <Check /> : <Trophy />}
              </span>
              <span className={styles.achievementText}>
                <span>{achievementTitle(tAchievement, tRarity, achievement)}</span>
                <span className={styles.achievementMeta}>
                  {achievement.obtainedAt
                    ? t('obtainedOn', { date: format.dateTime(achievement.obtainedAt, { dateStyle: 'long', timeZone: 'Europe/Paris' }) })
                    : t('progress', { progress: number(achievement.progress), threshold: number(achievement.threshold) })}
                </span>
              </span>
              <span className={styles.reward}>{t('reward', { coins: achievement.rewardCoins })}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
