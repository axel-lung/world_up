'use client';

import { useTranslations } from 'next-intl';
import { formatCountdown, useCountdown } from '@/components/pack/useCountdown';

const HOUR = 60 * 60 * 1000;

/**
 * The time left before an auction ends: "2 j 4 h", "3 h 12 min", then the
 * minutes and seconds of the last hour. Display only: the server decides when
 * the auction is over, and a late bid pushes the end back.
 */
export function AuctionCountdown({ endsAt, serverNow }: { endsAt: string; serverNow: string }) {
  const t = useTranslations('Market.timeLeft');
  const remaining = useCountdown(endsAt, serverNow);
  const hours = Math.floor(remaining / HOUR);
  const text =
    remaining <= 0
      ? t('ended')
      : hours >= 24
        ? t('days', { days: Math.floor(hours / 24), hours: hours % 24 })
        : hours >= 1
          ? t('hours', { hours, minutes: Math.floor((remaining % HOUR) / 60_000) })
          : formatCountdown(remaining);
  return <time dateTime={endsAt}>{text}</time>;
}
