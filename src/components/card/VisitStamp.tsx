import { Stamp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import styles from './VisitStamp.module.css';

// The day in Paris, the same on the server and in the browser
const SHORT = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' });
const LONG = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' });

/**
 * The "Visité" stamp (Claude Design, "Carte - Tampon profil acces", 6a): a
 * round sage ink stamp, tilted like a passport's, set on a card's photo
 * without hiding its name or rarity, with the day of the visit. The player's
 * own cards only; decorative, the card's label says it.
 */
export function VisitStamp({ visitedAt, size = 'grid' }: { visitedAt: Date; size?: 'grid' | 'large' }) {
  const t = useTranslations('Card');
  const day = size === 'large' ? LONG.format(visitedAt) : SHORT.format(visitedAt).split('/').join('.');
  return (
    <span className={styles.stamp} data-size={size} data-stamp aria-hidden="true">
      {size === 'large' && <Stamp className={styles.icon} />}
      <span className={styles.word}>{t('visitedStamp')}</span>
      <span className={styles.day}>{day}</span>
    </span>
  );
}
