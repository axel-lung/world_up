import { Stamp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import styles from './VisitStamp.module.css';

// The day in Paris, the same on the server and in the browser
const LONG = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' });

/**
 * The "Visité" stamp (Claude Design, VitrailCarte.dc.html): a round moss ink
 * stamp, tilted like a passport's, astride the card's window without hiding
 * its name or rarity, with the day of the visit on a large card. The player's
 * own cards only; decorative, the card's label says it.
 */
export function VisitStamp({ visitedAt, size = 'grid' }: { visitedAt: Date; size?: 'grid' | 'large' }) {
  const t = useTranslations('Card');
  const day = LONG.format(visitedAt);
  return (
    <span className={styles.stamp} data-size={size} data-stamp aria-hidden="true">
      {size === 'large' && <Stamp className={styles.icon} />}
      <span className={styles.word}>{t('visitedStamp')}</span>
      {size === 'large' && <span className={styles.day}>{day}</span>}
    </span>
  );
}
