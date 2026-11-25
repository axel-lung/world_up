import { ChevronDown, ChevronRight, Coins, History, Percent } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { PackReserveDial } from '@/components/pack/PackReserve';
import { RarityDot } from '@/components/rarity/Rarity';
import { StreakWeek } from '@/components/streak/StreakWeek';
import { StoneArch } from '@/components/ui/StoneArch';
import { db } from '@/db';
import { coinBalance } from '@/lib/game/coins';
import { PER_MILLION } from '@/lib/game/draw';
import { getReserve } from '@/lib/game/packs';
import { getStreak } from '@/lib/game/streaks';
import { gamePath } from '@/lib/game/paths';
import { currentOdds, getActiveCollection } from '@/lib/game/rules';
import { RARITIES } from '@/lib/rarity';
import { requireSession } from '@/lib/session';
import phone from '../../../phone.module.css';
import styles from '../game.module.css';
import own from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Packs');
  return { title: t('title') };
}

/**
 * The packs of a collection (App Vitrail - Paquets.dc.html): the reserve
 * under its arch, with its timer and the way to the opening, the week's
 * streak, then the odds of each rarity and the history of the player's
 * openings. The phone's tab bar leads here; the opening's close button comes
 * back here. The shop joins it in lot 4.
 */
export default async function PacksPage({ params }: PageProps<'/c/[collection]/packs'>) {
  const collection = await getActiveCollection((await params).collection);
  if (!collection) notFound();
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.packs);
  const now = new Date();
  const [t, tRarity, format, reserve, odds, streak, balance] = await Promise.all([
    getTranslations('Packs'),
    getTranslations('Rarity'),
    getFormatter(),
    getReserve(user.id, collection.id, now),
    currentOdds(db, collection.id, now),
    getStreak(user.id, collection.id, now),
    coinBalance(db, user.id),
  ]);
  const percent = (perMillion: number) =>
    format.number(perMillion / PER_MILLION, { style: 'percent', maximumFractionDigits: 4 });

  return (
    <main className={`${styles.page} ${phone.page} ${own.page}`}>
      <header className={phone.head}>
        <h1>{t('title')}</h1>
        <Link href="/account" className={own.coins}>
          <Coins aria-hidden />
          <span className="sr-only">{t('balance', { count: balance })}</span>
          <span aria-hidden="true">{format.number(balance)}</span>
        </Link>
      </header>

      <StoneArch as="section" align="center" aria-labelledby="reserve-heading">
        <h2 id="reserve-heading" className="sr-only">
          {t('reserveHeading')}
        </h2>
        <PackReserveDial
          available={reserve.packs}
          max={reserve.maxReserve}
          nextPackAt={reserve.nextPackAt?.toISOString() ?? null}
          serverNow={now.toISOString()}
          refillMinutes={reserve.refillMinutes}
          openHref={paths.open}
        />
      </StoneArch>

      <StreakWeek view={streak} />

      <ul className={phone.rows}>
        {odds && (
          <li>
            <details className={own.odds}>
              <summary className={phone.row}>
                <span className={phone.disc} aria-hidden="true">
                  <Percent />
                </span>
                <span className={phone.rowText}>
                  <span className={phone.rowTitle}>{t('odds')}</span>
                </span>
                <ChevronDown aria-hidden className={`${phone.chevron} ${own.oddsChevron}`} />
              </summary>
              <ul className={own.oddsList}>
                {RARITIES.map((rarity) => (
                  <li key={rarity}>
                    <RarityDot rarity={rarity} />
                    <span className={own.oddsName}>{tRarity(rarity)}</span>
                    <span className={own.oddsValue}>{percent(odds.odds[rarity])}</span>
                  </li>
                ))}
              </ul>
              <Link href="/odds" className={own.oddsMore}>
                {t('oddsHistory')}
              </Link>
            </details>
          </li>
        )}
        <li>
          <Link href={paths.history} className={phone.row}>
            <span className={phone.disc} data-tone="accent" aria-hidden="true">
              <History />
            </span>
            <span className={phone.rowText}>
              <span className={phone.rowTitle}>{t('history')}</span>
            </span>
            <ChevronRight aria-hidden className={phone.chevron} />
          </Link>
        </li>
      </ul>
    </main>
  );
}
