'use client';

import { Flame } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { StreakView } from '@/lib/game/streak';
import styles from './StreakButton.module.css';
import { StreakScreen } from './StreakScreen';

/** The flame and the streak's days (the home's head), which open the streak screen. */
export function StreakButton({ view, className }: { view: StreakView; className?: string }) {
  const t = useTranslations('Streak');
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={[styles.button, className].filter(Boolean).join(' ')}
        aria-haspopup="dialog"
        aria-label={t('button', { days: view.days })}
        data-off={view.days === 0 || undefined}
        onClick={() => setOpen(true)}
      >
        <Flame aria-hidden />
        {format.number(view.days)}
      </button>
      <StreakScreen view={view} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
