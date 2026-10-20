'use client';

import { PackageIcon, PauseIcon, TimerIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Tag } from '@/components/ui/Tag';
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
  shopHref?: string;
}

/** Packs in reserve, as a count and one mark per slot, with the next-pack timer. */
export function PackReserve({ available, max, nextPackAt, serverNow, refillMinutes, shopHref = '/shop' }: PackReserveProps) {
  const t = useTranslations('Pack');
  const remaining = useCountdown(nextPackAt, serverNow);
  const full = available >= max;

  return (
    <div className={styles.reserve}>
      <div className={styles.row}>
        <div className={styles.count}>
          <div className={styles.figure}>
            <span className={styles.number}>
              {available}/{max}
            </span>
            <span className={styles.unit}>{t('packs', { count: available })}</span>
          </div>
          <div className={styles.slots} aria-hidden="true">
            {Array.from({ length: max }, (_, index) => (
              <span key={index} className={styles.slot} data-filled={index < available} />
            ))}
          </div>
        </div>
        {full ? (
          <Tag variant="accent" icon={<PauseIcon aria-hidden />}>
            {t('full')}
          </Tag>
        ) : (
          <div className={styles.next}>
            <span className={styles.nextLabel}>{t('next')}</span>
            <span className={styles.timer}>
              <TimerIcon aria-hidden className={styles.icon} />
              {formatCountdown(remaining)}
            </span>
          </div>
        )}
      </div>
      <span className={styles.hint}>
        {full
          ? t('fullHint')
          : available === 0
            ? t.rich('emptyHint', { shop: (chunks) => <Link href={shopHref}>{chunks}</Link> })
            : t('running', { minutes: refillMinutes })}
      </span>
    </div>
  );
}

/** The header version: packs in reserve and the timer, side by side. */
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
        <PackageIcon className={styles.icon} />
        {available}
      </span>
      {!full && (
        <>
          <span className={styles.separator} aria-hidden="true" />
          <span className={styles.compactItem} aria-hidden="true">
            <TimerIcon className={styles.icon} />
            {time}
          </span>
        </>
      )}
    </div>
  );
}
