import { MapPin } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { RarityPips } from '@/components/rarity/Rarity';
import type { CardData } from './Card';
import { displayName } from './card-format';
import styles from './CardRow.module.css';

/**
 * A card as a row of the collection's list view, denser than the grid on a
 * phone: a thumbnail of the photo, the name, the rarity sticker, the place, the
 * photo's credit and the copies owned. The whole row leads to the card's page.
 * Same states and accessible name as the Card; a masked card shows neither its
 * name nor a photo (the server sends neither).
 */
export function CardRow({
  card,
  state = 'owned',
  copies = 1,
  href,
}: {
  card: CardData;
  state?: 'owned' | 'missing' | 'masked';
  copies?: number;
  href?: string;
}) {
  const t = useTranslations('Card');
  const tRarity = useTranslations('Rarity');
  const masked = state === 'masked';
  const missing = state !== 'owned';
  const name = masked ? t('toDiscover') : displayName(card.name);
  const rarityLabel = tRarity(card.rarity);
  const place = card.department ?? card.region;
  const photo = !masked && card.photo.src ? card.photo : null;
  const ariaLabel = masked
    ? t('ariaMasked', { rarity: rarityLabel })
    : [name, rarityLabel, missing && t('ariaMissing')].filter(Boolean).join(', ');

  return (
    <article className={styles.row} data-state={state} data-rarity={card.rarity} aria-label={ariaLabel}>
      <div className={`washed ${styles.thumb}`}>
        {photo ? (
          // Plain <img>, like the Card: the import already made 400 and 800 px WebP files
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.src} srcSet={photo.srcSet} sizes="72px" alt="" loading="lazy" decoding="async" />
        ) : (
          <span className={styles.mystery} aria-hidden="true">
            ?
          </span>
        )}
      </div>
      <div className={styles.text}>
        <h3 className={styles.name}>
          {href ? (
            <Link href={href} className={styles.link}>
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
    </article>
  );
}
