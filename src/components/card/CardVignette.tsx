import type { CSSProperties } from 'react';
import { EmblemIcon } from '@/components/collection/Emblem';
import { RarityPips } from '@/components/rarity/Rarity';
import type { Emblem } from '@/lib/collection-theme';
import type { Rarity } from '@/lib/rarity';
import styles from './CardVignette.module.css';

/**
 * A card as a vignette (VitrailCarte.dc.html, "vignette"): a cream sticker with
 * the photo in its arched window and the rarity's dots below, for rows (the
 * list view, the market, the wishlist, the history). A missing card shows
 * striped glass and the collection's emblem, dashed on the stone. Decorative:
 * the row names the card and its rarity.
 */
export function CardVignette({
  rarity,
  photo,
  missing = false,
  emblem,
  width = 56,
  copies = 1,
}: {
  rarity: Rarity;
  /** The photo's address, already sized (400 px WebP); none for a missing card. */
  photo?: { src: string; srcSet?: string } | null;
  missing?: boolean;
  emblem?: Emblem;
  width?: number;
  /** Copies owned: a "×2" sticker on the corner. */
  copies?: number;
}) {
  return (
    <span
      className={styles.vignette}
      data-rarity={rarity}
      data-missing={missing || undefined}
      style={{ '--vignette': `${width}px` } as CSSProperties}
      aria-hidden="true"
    >
      <span className={`washed ${styles.window}`}>
        {photo && !missing ? (
          // Plain <img>, like the Card: the import already made 400 and 800 px WebP files
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.src} srcSet={photo.srcSet} sizes={`${width}px`} alt="" loading="lazy" decoding="async" />
        ) : (
          emblem && <EmblemIcon emblem={emblem} className={styles.emblem} />
        )}
      </span>
      <RarityPips rarity={rarity} size={Math.max(4, Math.round(width / 11))} tone={missing ? 'fill' : 'deep'} />
      {copies > 1 && <span className={styles.copies}>×{copies}</span>}
    </span>
  );
}
