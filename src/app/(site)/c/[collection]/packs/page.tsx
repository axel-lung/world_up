import { ChevronDown, ChevronRight, History, Percent } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { PackReserveDial } from '@/components/pack/PackReserve';
import { RarityDot } from '@/components/rarity/Rarity';
import { db } from '@/db';
import { PER_MILLION } from '@/lib/game/draw';
import { getReserve } from '@/lib/game/packs';
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
 * The packs of a collection: the reserve with its timer and the way to the
 * opening, the history of the player's openings, then the odds of each rarity. The phone's tab bar leads here; the
 * opening's close button comes back here. The shop joins it in lot 4.
 */
export default async function PacksPage({ params }: PageProps<'/c/[collection]/packs'>) {
  const collection = await getActiveCollection((await params).collection);
  if (!collection) notFound();
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.packs);
  const now = new Date();
  const [t, tRarity, format, reserve, odds] = await Promise.all([
    getTranslations('Packs'),
    getTranslations('Rarity'),
    getFormatter(),
    getReserve(user.id, collection.id, now),
    currentOdds(db, collection.id, now),
  ]);
  const percent = (perMillion: number) =>
    format.number(perMillion / PER_MILLION, { style: 'percent', maximumFractionDigits: 4 });

  return (
    <main className={`${styles.page} ${phone.page} ${own.page}`}>
      <header className={phone.head}>
        <h1>{t('title')}</h1>
      </header>

      <section className={`${phone.card} ${own.reserve}`} data-disc="none" aria-labelledby="reserve-heading">
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
      </section>

      <Link href={paths.history} className={own.historyLink}>
        <History aria-hidden className={own.oddsIcon} />
        <span>{t('history')}</span>
        <ChevronRight aria-hidden className={own.oddsChevron} />
      </Link>

      {odds && (
        <details className={own.odds}>
          <summary>
            <Percent aria-hidden className={own.oddsIcon} />
            <span>{t('odds')}</span>
            <ChevronDown aria-hidden className={own.oddsChevron} />
          </summary>
          <ul>
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
      )}
    </main>
  );
}
