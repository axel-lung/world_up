import { Landmark } from 'lucide-react';
import type { CSSProperties } from 'react';
import { RarityPips } from '@/components/rarity/Rarity';
import type { Rarity } from '@/lib/rarity';
import styles from './Pin.module.css';

// The map's stickers (Claude Design, "Carte - Monuments", 2b): a monument's
// pin, a group of monuments, the player's position. The rarity shows three
// times: its color, its 1 to 6 dots and its name (the sheet and the list).

/** A monument's pin: in its rarity's color when owned, greyed and dashed when lacking. */
export function PinFace({ rarity, owned, chosen = false, size = 'map' }: {
  rarity: Rarity;
  owned: boolean;
  chosen?: boolean;
  /** map: 46 × 54 px, the touch target; row: smaller, in a list. */
  size?: 'map' | 'row';
}) {
  return (
    <span className={styles.pin} data-rarity={rarity} data-owned={owned || undefined} data-chosen={chosen || undefined} data-size={size}>
      <span className={styles.disc}>
        <Landmark aria-hidden />
      </span>
      <span className={styles.pill}>
        <RarityPips rarity={rarity} size={size === 'map' ? 4 : 3.5} tone={owned ? 'ink' : 'line'} />
      </span>
    </span>
  );
}

/** A group of monuments: their number, ringed by the share already owned. */
export function ClusterFace({ count, owned }: { count: number; owned: number }) {
  const size = count >= 100 ? 'large' : count >= 40 ? 'medium' : 'small';
  const style = { '--owned': `${Math.round((owned / count) * 360)}deg` } as CSSProperties;
  return (
    <span className={styles.cluster} data-size={size} style={style}>
      <span className={styles.count}>{count}</span>
    </span>
  );
}

/** The player's position, ringed by its precision (`halo`, a diameter in pixels). */
export function PositionFace({ halo }: { halo: number }) {
  return (
    <span className={styles.position} style={{ '--halo': `${Math.max(halo, 24)}px` } as CSSProperties}>
      <span className={styles.halo} />
      <span className={styles.ping} />
      <span className={styles.dot} />
    </span>
  );
}
