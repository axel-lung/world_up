'use client';

import { Package, Pause, Timer } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import styles from './PackReserve.module.css';
import { formatCountdown, useCountdown } from './useCountdown';

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
