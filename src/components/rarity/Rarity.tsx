import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { RARITY_PIPS, type Rarity } from '@/lib/rarity';
import styles from './Rarity.module.css';

/** The 1 to 6 dots of a rarity. Decorative: always shown with the rarity name. */
export function RarityPips({ rarity, size = 6, tone = 'ink' }: {
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

/** The rarity sticker: its name and dots on the rarity fill, slightly tilted (filters, legends). */
export function RarityBadge({ rarity, tilted = true }: { rarity: Rarity; tilted?: boolean }) {
  const t = useTranslations('Rarity');
  return (
    <span className={styles.badge} data-rarity={rarity} data-tilted={tilted || undefined}>
      {t(rarity)}
      <RarityPips rarity={rarity} />
    </span>
  );
}

/** The rarity's fill as a small inked dot, before its name (odds tables). */
export function RarityDot({ rarity }: { rarity: Rarity }) {
  return <span className={styles.swatch} data-rarity={rarity} aria-hidden="true" />;
}
