import { ChevronRight, MapPin, Stamp } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { RarityPips } from '@/components/rarity/Rarity';
import type { Emblem } from '@/lib/collection-theme';
import type { CardData } from './Card';
import { displayName, visitDay } from './card-format';
import { CardVignette } from './CardVignette';
import styles from './CardRow.module.css';

/**
 * A card as a row of the collection's list view, denser than the grid on a
 * phone: a vignette of the card (the photo in its arched window, the rarity's
 * dots), the name, the rarity sticker, the place, the photo's credit and the
 * copies owned. The whole
 * row leads to the card's page (with a chevron on a phone). Same states and
 * accessible name as the Card: a missing card shows its name and rarity only,
 * the collection's emblem in place of its photo, and leads nowhere. A card
 * whose monument the player visited wears a "Visité" chip.
 */
export function CardRow({
  card,
  state = 'owned',
  copies = 1,
  href,
  emblem,
  action,
  visitedAt = null,
}: {
  card: CardData;
  state?: 'owned' | 'missing';
  copies?: number;
  href?: string;
  /** The collection's emblem, on a missing card's empty thumbnail. */
  emblem?: Emblem;
  /** A control at the row's end, above its link: the wishlist's heart. */
  action?: ReactNode;
  /** When the player visited its monument, on their own card only. */
  visitedAt?: Date | null;
}) {
  const t = useTranslations('Card');
  const tRarity = useTranslations('Rarity');
  const missing = state === 'missing';
  const name = displayName(card.name);
  const rarityLabel = tRarity(card.rarity);
  const place = missing ? null : (card.department ?? card.region);
  const photo = !missing && card.photo.src ? card.photo : null;
  const link = missing ? undefined : href;
  const visited = missing ? null : visitedAt;
  const ariaLabel = [name, rarityLabel, missing && t('ariaMissing'), visited && t('ariaVisited', { date: visitDay(visited) })]
    .filter(Boolean)
    .join(', ');

  return (
    <article className={styles.row} data-state={state} data-rarity={card.rarity} aria-label={ariaLabel}>
      <CardVignette rarity={card.rarity} photo={photo} missing={missing} emblem={emblem} width={56} />
      <div className={styles.text}>
        <h3 className={styles.name}>
          {link ? (
            <Link href={link} className={styles.link}>
              {name}
            </Link>
          ) : (
            name
          )}
        </h3>
        <div className={styles.meta}>
          <span className={styles.sticker}>
            {rarityLabel}
            <RarityPips rarity={card.rarity} size={4} tone={missing ? 'line' : 'ink'} />
          </span>
          {place && (
            <span className={styles.place}>
              <MapPin aria-hidden />
              {place}
            </span>
          )}
          {visited && (
            <span className={styles.visited} aria-hidden="true">
              <Stamp />
              {t('visitedChip')}
            </span>
          )}
        </div>
        {photo && (
          // On one line: a long author (some Commons files hold a whole paragraph) is cut short, never the licence;
          // the card's page has the full credit
          <p className={styles.credit}>
            {t.rich('photoLine', {
              author: photo.author ?? t('unknownAuthor'),
              license: photo.license,
              name: (chunks) => <span className={styles.creditAuthor}>{chunks}</span>,
              licence: (chunks) => <span className={styles.creditLicense}>{chunks}</span>,
            })}
          </p>
        )}
      </div>
      {copies > 1 && !missing && (
        <span className={styles.copies}>
          <span aria-hidden="true">×{copies}</span>
          <span className="sr-only">{t('copiesBadge', { count: copies })}</span>
        </span>
      )}
      {action && <div className={styles.action}>{action}</div>}
      {link && <ChevronRight aria-hidden className={styles.chevron} />}
    </article>
  );
}
