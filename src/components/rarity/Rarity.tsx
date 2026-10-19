import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { RARITY_PIPS, type Rarity } from '@/lib/rarity';
import styles from './Rarity.module.css';

/** The 1 to 6 diamond marks of a rarity. Decorative: always shown with the rarity name. */
export function RarityPips({ rarity, size = 5, tone = 'ink' }: {
  rarity: Rarity;
  size?: number;
  /** ink: on the rarity fill; line: the rarity stroke color, on the page ground. */
  tone?: 'ink' | 'line';
}) {
  return (
    <span
      className={styles.pips}
      data-rarity={rarity}
      data-tone={tone}
      aria-hidden="true"
      style={{ '--pip': `${size}px` } as CSSProperties}
    >
      {Array.from({ length: RARITY_PIPS[rarity] }, (_, index) => (
        <span key={index} className={styles.pip} />
      ))}
    </span>
  );
}

/** The rarity name and its marks on the rarity fill (filters, legends). */
export function RarityBadge({ rarity }: { rarity: Rarity }) {
  const t = useTranslations('Rarity');
  return (
    <span className={styles.badge} data-rarity={rarity}>
      {t(rarity)}
      <RarityPips rarity={rarity} />
    </span>
  );
}
