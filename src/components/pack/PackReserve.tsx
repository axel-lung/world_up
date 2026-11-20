'use client';

import { Package, PackageOpen, Pause, Timer } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { EmblemIcon } from '@/components/collection/Emblem';
import { Button, ButtonLink } from '@/components/ui/Button';
import type { Emblem } from '@/lib/collection-theme';
import styles from './PackReserve.module.css';
import { formatCountdown, useCountdown, useRefreshWhenDue } from './useCountdown';

export interface PackReserveProps {
  available: number;
  max: number;
  /** When the next free pack arrives (ISO date), or null while the reserve is full. */
  nextPackAt: string | null;
  /** Server time at render (ISO date): see useCountdown. */
  serverNow: string;
  refillMinutes: number;
  /** The empty reserve's hint points to the shop; null until the shop opens (lot 4). */
  shopHref?: string | null;
}

/** Packs in reserve, as a ring filling up to the maximum, with the next-pack timer. */
export function PackReserve({ available, max, nextPackAt, serverNow, refillMinutes, shopHref = '/shop' }: PackReserveProps) {
  const t = useTranslations('Pack');
  const remaining = useCountdown(nextPackAt, serverNow);
  useRefreshWhenDue(nextPackAt, remaining);
  const full = available >= max;
  const filled = max > 0 ? Math.min(1, available / max) : 0;

  return (
    <div className={styles.reserve}>
      <div className={styles.row}>
        <span className={styles.ring} style={{ '--filled': `${filled * 360}deg` } as CSSProperties} aria-hidden="true">
          <span>{available}</span>
        </span>
        <span className="sr-only">{t('reserve', { count: available, max })}</span>
        <div className={styles.status}>
          <span className={styles.label}>{full ? t('full') : t('nextPack')}</span>
          <span className={styles.value}>
            {full ? <Pause aria-hidden /> : <Timer aria-hidden />}
            {full ? t('paused') : formatCountdown(remaining)}
          </span>
        </div>
      </div>
      <span className={styles.hint}>
        {full
          ? t('fullHint')
          : available === 0
            ? shopHref
              ? t.rich('emptyHint', { shop: (chunks) => <Link href={shopHref}>{chunks}</Link> })
              : t('emptyHintNoShop')
            : t('running', { minutes: refillMinutes, max })}
      </span>
    </div>
  );
}

/** The header version: packs in reserve and the timer, side by side in a pill. */
export function PackReserveCompact({ available, max, nextPackAt, serverNow }: Omit<PackReserveProps, 'refillMinutes' | 'shopHref'>) {
  const t = useTranslations('Pack');
  const remaining = useCountdown(nextPackAt, serverNow);
  useRefreshWhenDue(nextPackAt, remaining);
  const full = available >= max;
  const time = formatCountdown(remaining);
  const label = full ? t('compact', { count: available }) : `${t('compact', { count: available })}, ${t('compactNext', { time })}`;

  // The visible figures are hidden from screen readers in favor of one sentence;
  // no live region, so the ticking timer isn't announced every second.
  return (
    <div className={styles.compact}>
      <span className="sr-only">{label}</span>
      <span className={styles.compactItem} aria-hidden="true">
        <Package />
        {available}
      </span>
      {!full && (
        <>
          <span className={styles.separator} aria-hidden="true" />
          <span className={styles.compactItem} aria-hidden="true">
            <Timer />
            {time}
          </span>
        </>
      )}
    </div>
  );
}

/** "Ouvrir un paquet" as an inked sticker, turned off while the reserve is empty. */
function OpenButton({ href, available }: { href: string; available: number }) {
  const t = useTranslations('Pack');
  return available > 0 ? (
    <ButtonLink href={href} variant="sticker" block icon={<PackageOpen aria-hidden />}>
      {t('open')}
    </ButtonLink>
  ) : (
    <Button variant="sticker" block disabled icon={<PackageOpen aria-hidden />}>
      {t('open')}
    </Button>
  );
}

type PhoneReserveProps = Omit<PackReserveProps, 'refillMinutes' | 'shopHref'> & {
  /** The opening. */
  openHref: string;
};

/**
 * The phone home's reserve: a small pack in the collection's skin, the packs
 * waiting, the timer, and the way to the opening. The figures are read out as
 * one sentence; no live region, so the ticking timer isn't announced.
 */
export function PackReserveHero({
  available,
  max,
  nextPackAt,
  serverNow,
  openHref,
  emblem,
}: PhoneReserveProps & { emblem: Emblem }) {
  const t = useTranslations('Pack');
  const remaining = useCountdown(nextPackAt, serverNow);
  useRefreshWhenDue(nextPackAt, remaining);
  const full = available >= max;
  const time = formatCountdown(remaining);
  const sentence = t('reserve', { count: available, max });

  return (
    <div className={styles.hero}>
      <div className={styles.heroRow}>
        <span className={styles.miniPack} aria-hidden="true">
          <span className={styles.miniBand} />
          <span className={styles.miniEmblem}>
            <EmblemIcon emblem={emblem} />
          </span>
        </span>
        <span className="sr-only">{full ? sentence : `${sentence}, ${t('compactNext', { time })}`}</span>
        <div className={styles.heroText} aria-hidden="true">
          <span className={styles.heroCount}>{t('count', { count: available })}</span>
          <span className={styles.heroMax}>{t('outOf', { max })}</span>
          <span className={styles.heroNext}>
            {full ? <Pause /> : <Timer />}
            {full ? t('full') : t('nextIn', { time })}
          </span>
        </div>
      </div>
      <OpenButton href={openHref} available={available} />
    </div>
  );
}

/** The packs page's reserve: a large ring filling up to the maximum, the timer, the rule and the opening. */
export function PackReserveDial({
  available,
  max,
  nextPackAt,
  serverNow,
  refillMinutes,
  openHref,
}: PhoneReserveProps & { refillMinutes: number }) {
  const t = useTranslations('Pack');
  const remaining = useCountdown(nextPackAt, serverNow);
  useRefreshWhenDue(nextPackAt, remaining);
  const full = available >= max;
  const filled = max > 0 ? Math.min(1, available / max) : 0;

  return (
    <div className={styles.dial}>
      <span className={styles.dialRing} style={{ '--filled': `${filled * 360}deg` } as CSSProperties} aria-hidden="true">
        <span>
          <span className={styles.dialCount}>{available}</span>
          <span className={styles.dialMax}>{t('of', { max })}</span>
        </span>
      </span>
      <span className="sr-only">{t('reserve', { count: available, max })}</span>
      <span className={styles.dialNext}>
        {full ? <Pause aria-hidden /> : <Timer aria-hidden />}
        {full ? `${t('full')} · ${t('paused')}` : t('nextPackIn', { time: formatCountdown(remaining) })}
      </span>
      <span className={styles.dialHint}>
        {full ? t('fullHint') : available === 0 ? t('emptyHintNoShop') : t('running', { minutes: refillMinutes, max })}
      </span>
      <OpenButton href={openHref} available={available} />
    </div>
  );
}
